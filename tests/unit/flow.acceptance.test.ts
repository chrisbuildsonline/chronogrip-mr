import { describe, expect, it } from 'vitest';
import { TITLE, reloads, step, type Flow, type FlowEvent } from '../../src/flow';
import { LEVELS, checkLevel } from '../../src/levels';
import { TWIST_FULL, createRegulator, settingOf, startSetting, targetRate } from '../../src/escapement';

const FRAME = 1 / 72;

/** The game loop as main.ts runs it: flow events, a board of placements, solve on every drop, then the escapement. */
function game() {
  let flow: Flow = TITLE;
  let placements: Record<string, string> = {};
  let regulator = createRegulator(targetRate(LEVELS[0]!), startSetting(LEVELS[0]!));
  const send = (e: FlowEvent) => {
    const next = step(flow, e);
    if (reloads(flow, e, next)) {
      placements = {};
      regulator = createRegulator(targetRate(LEVELS[next.level]!), startSetting(LEVELS[next.level]!));
    }
    flow = next;
  };
  /** One rendered frame: the escapement ticks while it is calibrating or done. */
  const frame = () => {
    if (flow.name !== 'calibrate' && flow.name !== 'complete') return;
    if (regulator.tick(FRAME) && flow.name === 'calibrate') send({ type: 'calibrated' });
  };
  return {
    send,
    place(gear: string, axle: string) {
      if (flow.name === 'title') send({ type: 'start' });
      if (flow.name !== 'playing') return;
      placements = { ...placements, [gear]: axle };
      if (checkLevel(LEVELS[flow.level]!, placements).solved) send({ type: 'solve' });
    },
    /** A wrist twist split over a few frames, as a hand turns the regulator. */
    twist(radians: number, frames = 20) {
      for (let i = 0; i < frames; i++) {
        if (flow.name === 'calibrate') regulator.turn(radians / frames);
        frame();
      }
    },
    wait(seconds: number) {
      for (let t = 0; t < seconds; t += FRAME) frame();
    },
    get flow() {
      return flow;
    },
    get placements() {
      return placements;
    },
    get regulator() {
      return regulator;
    },
    /** The automaton runs once the escapement is calibrated. */
    get automatonRunning() {
      return regulator.calibrated;
    },
  };
}

const solve = (g: ReturnType<typeof game>, i: number) => {
  for (const [gear, axle] of Object.entries(LEVELS[i]!.solution)) g.place(gear, axle);
};
/** Twists the regulator from wherever it is onto the level's target. */
const calibrate = (g: ReturnType<typeof game>, i: number) => g.twist((settingOf(targetRate(LEVELS[i]!)) - g.regulator.setting) * TWIST_FULL);

describe('Given level 1 is loaded', () => {
  it('When the intended solution is placed, Then the escapement waits for calibration; When calibrated, Then the level is complete; When Next, Then level 2 has an empty board', () => {
    const g = game();
    expect(g.flow).toEqual({ name: 'title', level: 0 });
    solve(g, 0);
    expect(g.flow.name).toBe('calibrate');
    expect(g.regulator.inBand).toBe(false);
    expect(g.automatonRunning).toBe(false);
    g.wait(3);
    expect(g.flow.name).toBe('calibrate'); // waiting does not calibrate it
    calibrate(g, 0);
    g.wait(1.2);
    expect(g.automatonRunning).toBe(true);
    expect(g.flow.name).toBe('complete');
    g.send({ type: 'next' });
    expect(g.flow).toEqual({ name: 'playing', level: 1 });
    expect(g.placements).toEqual({});
    expect(g.automatonRunning).toBe(false);
  });

  it('When every level is solved and calibrated in turn, Then the automaton runs and each level completes; Next after level 5 returns to level select', () => {
    const g = game();
    for (let i = 0; i < LEVELS.length; i++) {
      solve(g, i);
      expect(g.flow).toEqual({ name: 'calibrate', level: i });
      expect(g.automatonRunning).toBe(false);
      calibrate(g, i);
      g.wait(1.2);
      expect(g.automatonRunning).toBe(true);
      expect(g.flow).toEqual({ name: 'complete', level: i });
      g.send({ type: 'next' });
    }
    expect(g.flow.name).toBe('select');
  });

  it('When the twist overshoots straight through the band, Then it does not calibrate until held in band', () => {
    const g = game();
    solve(g, 0);
    const toTarget = (settingOf(targetRate(LEVELS[0]!)) - g.regulator.setting) * TWIST_FULL;
    g.twist(2 * toTarget, 10); // sweeps across the band in a few frames
    g.wait(2);
    expect(g.flow.name).toBe('calibrate');
    g.twist(-toTarget, 10);
    g.wait(1.2);
    expect(g.flow.name).toBe('complete');
  });

  it('When paused while calibrating, Then the setting is kept and resume returns to calibrating', () => {
    const g = game();
    solve(g, 0);
    g.twist(0.2);
    const setting = g.regulator.setting;
    g.send({ type: 'pause' });
    g.twist(0.5);
    expect(g.regulator.setting).toBe(setting);
    g.send({ type: 'resume' });
    expect(g.flow.name).toBe('calibrate');
    expect(g.regulator.setting).toBe(setting);
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
    expect(g.flow.name).toBe('calibrate');
  });
});
