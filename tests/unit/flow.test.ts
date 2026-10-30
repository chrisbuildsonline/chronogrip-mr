import { describe, expect, it } from 'vitest';
import { TITLE, createClock, reloads, screenOf, step, type Flow, type FlowEvent } from '../../src/flow';

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
    expect(step(cal, { type: 'select' })).toBe(cal);
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

  it('next moves to the following level, and from the last level back to level select', () => {
    expect(run([{ type: 'start' }, { type: 'solve' }, { type: 'calibrated' }, { type: 'next' }])).toEqual({ name: 'playing', level: 1 });
    expect(run([{ type: 'solve' }, { type: 'calibrated' }, { type: 'next' }], { name: 'playing', level: 4 })).toEqual({ name: 'select', level: 4 });
  });

  it('select opens level select; select with a level plays it', () => {
    expect(run([{ type: 'select' }])).toEqual({ name: 'select', level: 0 });
    expect(run([{ type: 'select' }, { type: 'select', level: 2 }])).toEqual({ name: 'playing', level: 2 });
    expect(run([{ type: 'select', level: 4 }], { name: 'complete', level: 1 })).toEqual({ name: 'playing', level: 4 });
  });

  it('ignores level numbers out of range', () => {
    const s: Flow = { name: 'select', level: 0 };
    expect(step(s, { type: 'select', level: 5 })).toBe(s);
    expect(step(s, { type: 'select', level: -1 })).toBe(s);
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
    expect(reloads(done, { type: 'select' }, step(done, { type: 'select' }))).toBe(false);
  });

  it('maps every state to the panel it shows', () => {
    expect(screenOf(TITLE)).toBe('title');
    expect(screenOf({ name: 'select', level: 0 })).toBe('select');
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
