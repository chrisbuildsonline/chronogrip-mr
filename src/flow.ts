import type { Screen } from './ui';

export type FlowName = 'title' | 'select' | 'playing' | 'calibrate' | 'complete' | 'paused';
/** `resumeTo` is set only on a pause taken while calibrating. */
export type Flow = { readonly name: FlowName; readonly level: number; readonly resumeTo?: 'calibrate' };
export type FlowEvent =
  | { type: 'start' | 'solve' | 'calibrated' | 'next' | 'restart' | 'pause' | 'resume' }
  | { type: 'select'; level?: number }
  | { type: 'back'; level: number };

export const TITLE: Flow = { name: 'title', level: 0 };
export const LEVEL_COUNT = 5;

const to = (name: FlowName, level: number): Flow => ({ name, level });
/** Mid-level: the board is in play or its escapement is being regulated. */
const inLevel = (f: Flow) => f.name === 'playing' || f.name === 'calibrate';

/**
 * One transition of the level flow; events that do not apply return the same state object.
 * A solved train goes to `calibrate` (regulate the escapement), and `calibrated` completes the level.
 */
export function step(f: Flow, e: FlowEvent, levels = LEVEL_COUNT): Flow {
  switch (e.type) {
    case 'start':
      return f.name === 'title' ? to('playing', f.level) : f;
    case 'solve':
      return f.name === 'playing' ? to('calibrate', f.level) : f;
    case 'calibrated':
      return f.name === 'calibrate' ? to('complete', f.level) : f;
    case 'next':
      if (f.name !== 'complete') return f;
      return f.level + 1 < levels ? to('playing', f.level + 1) : to('select', f.level);
    case 'restart':
      return inLevel(f) || f.name === 'paused' || f.name === 'complete' ? to('playing', f.level) : f;
    case 'pause':
      if (f.name === 'calibrate') return { name: 'paused', level: f.level, resumeTo: 'calibrate' };
      return f.name === 'playing' ? to('paused', f.level) : f;
    case 'resume':
      return f.name === 'paused' ? to(f.resumeTo ?? 'playing', f.level) : f;
    case 'select':
      if (e.level === undefined) return inLevel(f) ? f : to('select', f.level);
      return inRange(e.level, levels) ? to('playing', e.level) : f;
    case 'back':
      return f.name === 'select' && inRange(e.level, levels) ? to('title', e.level) : f;
  }
}

const inRange = (level: number, levels: number) => Number.isInteger(level) && level >= 0 && level < levels;

/** Whether a transition puts a fresh board up: a level (re)starting, or back to the title on the level Continue plays. */
export const reloads = (prev: Flow, e: FlowEvent, next: Flow) =>
  next !== prev && (e.type === 'back' || (next.name === 'playing' && (e.type === 'restart' || e.type === 'next' || e.type === 'select')));

const SCREEN: Record<FlowName, Screen> = { title: 'title', select: 'select', playing: 'hud', calibrate: 'hud', complete: 'complete', paused: 'paused' };
export const screenOf = (f: Flow): Screen => SCREEN[f.name];

/** Level time in seconds: feed it every frame; only frames that run back to back while running count. */
export function createClock() {
  let ms = 0;
  let last: number | null = null;
  return {
    tick(now: number, running: boolean) {
      if (running && last !== null) ms += now - last;
      last = running ? now : null;
    },
    reset() {
      ms = 0;
      last = null;
    },
    get seconds() {
      return ms / 1000;
    },
  };
}
