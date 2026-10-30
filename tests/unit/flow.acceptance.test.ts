import { describe, expect, it } from 'vitest';
import { TITLE, reloads, step, type Flow, type FlowEvent } from '../../src/flow';
import { LEVELS, checkLevel } from '../../src/levels';

/** The game loop as main.ts runs it: flow events, a board of placements, solve on every drop. */
function game() {
  let flow: Flow = TITLE;
  let placements: Record<string, string> = {};
  const send = (e: FlowEvent) => {
    const next = step(flow, e);
    if (reloads(flow, e, next)) placements = {};
    flow = next;
  };
  return {
    send,
    place(gear: string, axle: string) {
      if (flow.name === 'title') send({ type: 'start' });
      if (flow.name !== 'playing') return;
      placements = { ...placements, [gear]: axle };
      if (checkLevel(LEVELS[flow.level]!, placements).solved) send({ type: 'solve' });
    },
    get flow() {
      return flow;
    },
    get placements() {
      return placements;
    },
  };
}

describe('Given level 1 is loaded', () => {
  it('When the intended solution is placed, Then the level is complete; When Next, Then level 2 is loaded with an empty board', () => {
    const g = game();
    expect(g.flow).toEqual({ name: 'title', level: 0 });
    for (const [gear, axle] of Object.entries(LEVELS[0]!.solution)) g.place(gear, axle);
    expect(g.flow.name).toBe('complete');
    g.send({ type: 'next' });
    expect(g.flow).toEqual({ name: 'playing', level: 1 });
    expect(g.placements).toEqual({});
  });

  it('When every level is solved in turn, Then Next after level 5 returns to level select', () => {
    const g = game();
    for (let i = 0; i < LEVELS.length; i++) {
      for (const [gear, axle] of Object.entries(LEVELS[i]!.solution)) g.place(gear, axle);
      expect(g.flow).toEqual({ name: 'complete', level: i });
      g.send({ type: 'next' });
    }
    expect(g.flow.name).toBe('select');
  });

  it('When paused mid-level, Then the board is kept and placing does nothing until resume', () => {
    const g = game();
    g.send({ type: 'select', level: 1 });
    g.place('i1', 'a1');
    g.send({ type: 'pause' });
    g.place('i2', 'a2');
    expect(g.placements).toEqual({ i1: 'a1' });
    g.send({ type: 'resume' });
    expect(g.placements).toEqual({ i1: 'a1' });
    g.place('i2', 'a2');
    expect(g.flow.name).toBe('complete');
  });
});
