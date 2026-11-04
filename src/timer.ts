import type { Level } from './levels';

/** Whether a solve beat the level's par time. */
export type Outcome = 'pass' | 'over';

/** Par never drops below this, so the first levels are generous to learn the controls on. */
const PAR_FLOOR = 120;
/** Seconds added per gear to place, per compound pair (two gears sharing an axle) and per decoy left in the tray. */
const PER_PLACED = 25;
const PER_COMPOUND = 20;
const PER_DECOY = 10;
const PAR_BASE = 60;

/**
 * The par time in seconds, a multiple of five: 60 s plus 25 s per gear to place, 20 s per compound pair and 10 s per decoy,
 * never under 120 s. Level 1 (one gear, no decoys) gets the floor; it only reads the level, so the daily and a shared
 * ?seed= puzzle get the par of their own difficulty.
 */
export function parFor(level: Level): number {
  const onAxle = new Map<string, number>();
  for (const axle of Object.values(level.solution)) onAxle.set(axle, (onAxle.get(axle) ?? 0) + 1);
  const placed = Object.keys(level.solution).length;
  const compound = [...onAxle.values()].filter((n) => n > 1).length;
  const decoys = level.tray.filter((g) => !(g.id in level.solution)).length;
  const raw = PAR_BASE + PER_PLACED * placed + PER_COMPOUND * compound + PER_DECOY * decoys;
  return Math.ceil(Math.max(PAR_FLOOR, raw) / 5) * 5;
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
