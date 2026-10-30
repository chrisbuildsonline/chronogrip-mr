import type { Screen } from './ui';

export type FlowName = 'title' | 'select' | 'playing' | 'complete' | 'paused';
export type Flow = { readonly name: FlowName; readonly level: number };
export type FlowEvent =
  | { type: 'start' | 'solve' | 'next' | 'restart' | 'pause' | 'resume' }
  | { type: 'select'; level?: number };

export const TITLE: Flow = { name: 'title', level: 0 };
export const LEVEL_COUNT = 5;

const to = (name: FlowName, level: number): Flow => ({ name, level });

/**
 * One transition of the level flow; events that do not apply return the same state object.
 * A later step (escapement calibration) slots in by sending `solve` to it and `complete` from it.
 */
export function step(f: Flow, e: FlowEvent, levels = LEVEL_COUNT): Flow {
  switch (e.type) {
    case 'start':
      return f.name === 'title' ? to('playing', f.level) : f;
    case 'solve':
      return f.name === 'playing' ? to('complete', f.level) : f;
    case 'next':
      if (f.name !== 'complete') return f;
      return f.level + 1 < levels ? to('playing', f.level + 1) : to('select', f.level);
    case 'restart':
      return f.name === 'playing' || f.name === 'paused' || f.name === 'complete' ? to('playing', f.level) : f;
    case 'pause':
      return f.name === 'playing' ? to('paused', f.level) : f;
    case 'resume':
      return f.name === 'paused' ? to('playing', f.level) : f;
    case 'select':
      if (e.level === undefined) return f.name === 'playing' ? f : to('select', f.level);
      return Number.isInteger(e.level) && e.level >= 0 && e.level < levels ? to('playing', e.level) : f;
  }
}

/** Whether a transition starts a level on a fresh board. */
export const reloads = (prev: Flow, e: FlowEvent, next: Flow) =>
  next !== prev && next.name === 'playing' && (e.type === 'restart' || e.type === 'next' || e.type === 'select');

const SCREEN: Record<FlowName, Screen> = { title: 'title', select: 'select', playing: 'hud', complete: 'complete', paused: 'paused' };
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
