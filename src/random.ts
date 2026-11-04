import type { Level } from './levels';
import { build, fallbackLevel, int, mulberry32, valid, type Spec } from './tinker';
import { outcomeOf } from './timer';

/**
 * Random mode: an endless run of generated puzzles that climbs with the player. A step names a recipe (how many axles to
 * fill, how many of them are compound pairs, how many decoys); the seed picks the gears, sizes and speeds within it.
 * Everything here is pure: the same (step, seed) is always the same level.
 */

/** [axles to fill, of which compound pairs, decoys]. Par (src/timer.ts) never drops from one step to the next. */
const LADDER: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [1, 0, 2], [2, 0, 1], [2, 0, 2], [2, 1, 1], [2, 1, 2], [3, 1, 1], [3, 1, 2], [3, 2, 1], [3, 2, 2], [3, 3, 1], [3, 3, 2],
];
/** The hardest step: more would not fit the tray and the comfort zone. Past it the puzzles stay as hard as this. */
export const MAX_STEP = LADDER.length;

/** A step as a whole number in 1..MAX_STEP; anything else (NaN, a fraction, past the cap) is pulled in. */
export const clampStep = (step: number): number => (Number.isFinite(step) ? Math.min(MAX_STEP, Math.max(1, Math.round(step))) : 1);

function attempt(step: number, id: string, r: () => number): Level | null {
  const [n, compounds, decoys] = LADDER[step - 1]!;
  // Small gears are likelier, so longer chains still fit the tray and the parts strip.
  const z = () => Math.min(int(r, 10, 40), int(r, 10, 40));
  const compound = new Set<number>();
  while (compound.size < compounds) compound.add(int(r, 0, n - 1));
  const mids = Array.from({ length: n }, (_, i) => ({ z: z(), out: compound.has(i) ? z() : undefined }));
  const spec: Spec = {
    drv: z(), tgt: z(), mids, y: (r() - 0.5) * 0.1,
    rpm: [40, 60, 80, 90, 120][int(r, 0, 4)]! * (r() < 0.25 ? -1 : 1),
    decoys: Array.from({ length: decoys }, () => ({ teeth: z(), layer: int(r, 0, 1) })),
  };
  const level = build(id, spec, r);
  return valid(level) ? { ...level, name: 'Random puzzle' } : null;
}

const known = new Map<number, Level>();
/** A level of exactly this step that passes `valid`, found by a fixed search the first time it is needed. */
function knownGood(step: number): Level | null {
  for (let seed = 1; seed < 400 && !known.has(step); seed++) {
    const r = mulberry32(seed);
    for (let tries = 0; tries < 200 && !known.has(step); tries++) {
      const level = attempt(step, 'known', r);
      if (level) known.set(step, level);
    }
  }
  return known.get(step) ?? null;
}

/** The puzzle for a step and seed. Every one passes `valid`; if the tries run out it is a known-good level of that step, or the step below. */
export function randomLevel(step: number, seed: number): Level {
  const s = clampStep(step);
  const id = `t${seed >>> 0}`;
  const r = mulberry32(seed);
  r();
  for (let tries = 0; tries < 200; tries++) {
    const level = attempt(s, id, r);
    if (level) return level;
  }
  const good = knownGood(s);
  if (good) return { ...good, id };
  return s > 1 ? randomLevel(s - 1, seed) : fallbackLevel(id);
}

/** A puzzle seed carries its step in the top 4 bits (1..15) and 28 random bits below; top bits 0 is a plain tinker seed (a daily or an old shared code). */
const LOW_BITS = 28;
const LOW_MASK = 2 ** LOW_BITS - 1;

export const packSeed = (step: number, low: number): number => ((clampStep(step) << LOW_BITS) | (low & LOW_MASK)) >>> 0;

/** The step a seed carries (0 for a plain tinker seed) and its 28 low bits. */
export const unpackSeed = (seed: number): { step: number; low: number } => ({ step: Math.floor((seed >>> 0) / 2 ** LOW_BITS), low: (seed >>> 0) & LOW_MASK });

/** A fresh seed for a Random puzzle of `step`; `rnd` is Math.random at run time. */
export const freshSeed = (step: number, rnd: () => number = Math.random): number => packSeed(step, Math.floor(rnd() * 2 ** LOW_BITS));

/** Opens a puzzle code's seed: a Random puzzle when it carries a step, else the plain tinker puzzle it always was. */
export function puzzleFor(seed: number, plain: (seed: number) => Level): Level {
  const { step } = unpackSeed(seed);
  return step === 0 ? plain(seed) : randomLevel(step, seed);
}

/** Where a run stands: the step of the next puzzle, and whether the last solve was over par (two in a row ease the step). */
export type RandomState = { step: number; slow: boolean };
export const START: RandomState = { step: 1, slow: false };

/** Solved at or under this share of par: well under, so the step jumps by two. */
export const FAST = 0.5;

/**
 * The state after a solve. `seconds` is null with the timer off (nothing to judge by): step +1. Within half of par: +2.
 * Under par: +1. Over par: hold, and a second over-par solve in a row eases one step (never below 1) and starts the count again.
 */
export function adapt(s: RandomState, seconds: number | null, par: number): RandomState {
  if (seconds === null) return { step: clampStep(s.step + 1), slow: false };
  if (outcomeOf(seconds, par) === 'over') return s.slow ? { step: clampStep(s.step - 1), slow: false } : { step: s.step, slow: true };
  return { step: clampStep(s.step + (seconds <= par * FAST ? 2 : 1)), slow: false };
}

const KEY = 'chronogrip.random.v1';

/** The saved run, or the start for anything missing, corrupt or out of range. Never throws. */
export function loadRandom(storage: Pick<Storage, 'getItem'> | null | undefined): RandomState {
  try {
    const raw = storage?.getItem(KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return START;
    const { step, slow } = o as { step?: unknown; slow?: unknown };
    if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > MAX_STEP) return START;
    return { step, slow: slow === true };
  } catch {
    return START;
  }
}

export function saveRandom(storage: Pick<Storage, 'setItem'> | null | undefined, s: RandomState): void {
  try {
    storage?.setItem(KEY, JSON.stringify(s));
  } catch {
    // quota or security error: the run just will not persist
  }
}
