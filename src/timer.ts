import type { Level } from './levels';
import { difficultyOf } from './random';

/** Whether a solve beat the level's par time. */
export type Outcome = 'pass' | 'over';

/** Par never drops below this, so the first levels are generous to learn the controls on. */
const PAR_FLOOR = 120;
/** Seconds added per point of measured difficulty (src/random.ts difficultyOf), on top of PAR_BASE. */
const PER_POINT = 9;
const PAR_BASE = 60;

/**
 * The par time in seconds, a multiple of five: 60 s plus 9 s per point of measured difficulty (the ways to place the parts,
 * near-miss decoys, compound pairs, a turn against the driver, a tight target), never under 120 s. Level 1 gets the floor;
 * it only reads the level, so a generated level, a shared ?seed= puzzle and a Random level get the par of their own difficulty,
 * and par climbs with the level number as the measured difficulty does.
 */
export function parFor(level: Level): number {
  return Math.ceil(Math.max(PAR_FLOOR, PAR_BASE + PER_POINT * difficultyOf(level)) / 5) * 5;
}

/** A solve at exactly par passes. */
export const outcomeOf = (seconds: number, par: number): Outcome => (seconds <= par ? 'pass' : 'over');

/** The ring's numbers: whole seconds left (0 once out), whole seconds over par, and the share of par left (0..1). */
export function timerView(seconds: number, par: number): { left: number; over: number; fraction: number } {
  const left = Math.max(0, Math.ceil(par - seconds));
  return { left, over: Math.max(0, Math.floor(seconds - par)), fraction: left / par };
}

const KEY = 'chronogrip.relaxed.v1';

/** Whether the player turned the timer off; the timer is on unless the saved value is exactly '1'. Never throws. */
export function loadRelaxed(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveRelaxed(storage: Pick<Storage, 'setItem'> | null | undefined, relaxed: boolean): void {
  try {
    storage?.setItem(KEY, relaxed ? '1' : '0');
  } catch {
    // quota or security error: the choice just will not persist
  }
}
