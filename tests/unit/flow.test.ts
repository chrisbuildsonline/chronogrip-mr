import { describe, expect, it } from 'vitest';
import { LEVEL_COUNT, TITLE, createClock, reloads, screenOf, step, type Flow, type FlowEvent } from '../../src/flow';
import { CAMPAIGN } from '../../src/random';

const run = (events: FlowEvent[], from: Flow = TITLE) => events.reduce((f, e) => step(f, e), from);

describe('flow state machine', () => {
  it('starts on the title at level 1', () => {
    expect(TITLE).toEqual({ name: 'title', level: 0 });
  });

  it('start plays the current level; solve moves on to calibrating the escapement; calibrated completes it', () => {
    expect(run([{ type: 'start' }])).toEqual({ name: 'playing', level: 0 });
    expect(run([{ type: 'start' }, { type: 'solve' }])).toEqual({ name: 'calibrate', level: 0 });
    expect(run([{ type: 'start' }, { type: 'solve' }, { type: 'calibrated' }])).toEqual({ name: 'complete', level: 0 });
  });

  it('calibrated only applies while calibrating; solve does nothing there', () => {
    const playing: Flow = { name: 'playing', level: 2 };
    expect(step(playing, { type: 'calibrated' })).toBe(playing);
    const cal: Flow = { name: 'calibrate', level: 2 };
    expect(step(cal, { type: 'solve' })).toBe(cal);
    expect(step(cal, { type: 'next' })).toBe(cal);
    expect(step(cal, { type: 'start' })).toBe(cal);
    expect(step(cal, { type: 'play', level: 2 })).toEqual({ name: 'playing', level: 2 });
  });

  it('pause while calibrating resumes back to calibrating, not to playing', () => {
    const paused = step({ name: 'calibrate', level: 1 }, { type: 'pause' });
    expect(paused.name).toBe('paused');
    expect(paused.level).toBe(1);
    expect(step(paused, { type: 'resume' })).toEqual({ name: 'calibrate', level: 1 });
    expect(reloads(paused, { type: 'resume' }, step(paused, { type: 'resume' }))).toBe(false);
    expect(step(paused, { type: 'restart' })).toEqual({ name: 'playing', level: 1 });
  });

  it('restart from calibrating replays the level on a fresh board', () => {
    const cal: Flow = { name: 'calibrate', level: 3 };
    const next = step(cal, { type: 'restart' });
    expect(next).toEqual({ name: 'playing', level: 3 });
    expect(reloads(cal, { type: 'restart' }, next)).toBe(true);
  });

  it('counts the 20 campaign levels and one extra slot (a Random level or a shared puzzle)', () => {
    expect(LEVEL_COUNT).toBe(CAMPAIGN + 1);
    expect(LEVEL_COUNT).toBe(21);
  });

  it('next moves to the following level; after level 20 and after the extra slot it does nothing here (the game picks the menu or another Random level)', () => {
    expect(run([{ type: 'start' }, { type: 'solve' }, { type: 'calibrated' }, { type: 'next' }])).toEqual({ name: 'playing', level: 1 });
    expect(run([{ type: 'solve' }, { type: 'calibrated' }, { type: 'next' }], { name: 'playing', level: 4 })).toEqual({ name: 'playing', level: 5 });
    expect(run([{ type: 'solve' }, { type: 'calibrated' }, { type: 'next' }], { name: 'playing', level: 18 })).toEqual({ name: 'playing', level: 19 });
    const last: Flow = { name: 'complete', level: 19 };
    expect(step(last, { type: 'next' })).toBe(last);
    const extra: Flow = { name: 'complete', level: 20 };
    expect(step(extra, { type: 'next' })).toBe(extra);
  });

  it('back leaves a pause or a complete card for the title, on a fresh board at the given level', () => {
    for (const name of ['paused', 'complete'] as const) {
      const s: Flow = { name, level: 3 };
      const back = step(s, { type: 'back', level: 1 });
      expect(back).toEqual({ name: 'title', level: 1 });
      expect(reloads(s, { type: 'back', level: 1 }, back)).toBe(true);
      expect(step(back, { type: 'start' })).toEqual({ name: 'playing', level: 1 });
      expect(step(s, { type: 'back', level: 99 })).toBe(s);
    }
    // From a level too (the run ends: time out, Give up); only the title has nowhere to go back to.
    for (const name of ['playing', 'calibrate'] as const) expect(step({ name, level: 2 }, { type: 'back', level: 0 })).toEqual({ name: 'title', level: 0 });
    expect(step(TITLE, { type: 'back', level: 0 })).toBe(TITLE);
  });

  it('play starts the level it names, from anywhere', () => {
    expect(run([{ type: 'play', level: 2 }])).toEqual({ name: 'playing', level: 2 });
    expect(run([{ type: 'play', level: 4 }], { name: 'complete', level: 1 })).toEqual({ name: 'playing', level: 4 });
    expect(run([{ type: 'play', level: 20 }])).toEqual({ name: 'playing', level: 20 });
  });

  it('ignores level numbers out of range', () => {
    expect(step(TITLE, { type: 'play', level: LEVEL_COUNT })).toBe(TITLE);
    expect(step(TITLE, { type: 'play', level: -1 })).toBe(TITLE);
  });

  it('pause only from playing; resume goes back to playing', () => {
    expect(step(TITLE, { type: 'pause' })).toBe(TITLE);
    const paused = run([{ type: 'start' }, { type: 'pause' }]);
    expect(paused).toEqual({ name: 'paused', level: 0 });
    expect(step(paused, { type: 'resume' })).toEqual({ name: 'playing', level: 0 });
    expect(step(paused, { type: 'solve' })).toBe(paused);
  });

  it('restart replays the same level from playing, paused or complete', () => {
    for (const name of ['playing', 'paused', 'complete'] as const) {
      expect(step({ name, level: 3 }, { type: 'restart' })).toEqual({ name: 'playing', level: 3 });
    }
    expect(step(TITLE, { type: 'restart' })).toBe(TITLE);
  });

  it('ignores events that do not apply', () => {
    const playing: Flow = { name: 'playing', level: 1 };
    expect(step(playing, { type: 'next' })).toBe(playing);
    expect(step(playing, { type: 'start' })).toBe(playing);
    expect(step({ name: 'complete', level: 1 }, { type: 'solve' })).toEqual({ name: 'complete', level: 1 });
  });

  it('reloads the board only when a level (re)starts fresh', () => {
    expect(reloads(TITLE, { type: 'start' }, step(TITLE, { type: 'start' }))).toBe(false);
    const paused: Flow = { name: 'paused', level: 2 };
    expect(reloads(paused, { type: 'resume' }, step(paused, { type: 'resume' }))).toBe(false);
    expect(reloads(paused, { type: 'restart' }, step(paused, { type: 'restart' }))).toBe(true);
    const done: Flow = { name: 'complete', level: 0 };
    expect(reloads(done, { type: 'next' }, step(done, { type: 'next' }))).toBe(true);
    expect(reloads(done, { type: 'play', level: 3 }, step(done, { type: 'play', level: 3 }))).toBe(true);
  });

  it('maps every state to the panel it shows', () => {
    expect(screenOf(TITLE)).toBe('title');
    expect(screenOf({ name: 'playing', level: 0 })).toBe('hud');
    expect(screenOf({ name: 'calibrate', level: 0 })).toBe('hud');
    expect(screenOf({ name: 'complete', level: 0 })).toBe('complete');
    expect(screenOf({ name: 'paused', level: 0 })).toBe('paused');
  });
});

describe('level clock', () => {
  it('counts seconds only while running, and never the gap across a stop', () => {
    const c = createClock();
    c.tick(1000, true);
    c.tick(2500, true);
    expect(c.seconds).toBeCloseTo(1.5);
    c.tick(3000, false);
    c.tick(9000, false);
    c.tick(10_000, true);
    expect(c.seconds).toBeCloseTo(1.5);
    c.tick(10_500, true);
    expect(c.seconds).toBeCloseTo(2);
    c.reset();
    expect(c.seconds).toBe(0);
    c.tick(11_000, true);
    expect(c.seconds).toBe(0);
  });
});
