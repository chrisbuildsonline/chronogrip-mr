import { CAMPAIGN } from './random';
import { BOARDS } from './scores';

/**
 * A run is one go at the campaign (from New Game to level 20) or at a Random level difficulty (endless). A score is entered once
 * per run, when it ends: the levels or puzzles it cleared and its total time. Pure state; main.ts owns the clock and the storage.
 * `kind` is the board the run scores on: 'campaign' or 'random-<band>'. `ms` is the time of the levels cleared plus any time carried over
 * from a puzzle that was restarted or left on the Main menu.
 */
export type Run = { kind: string; cleared: number; ms: number };

export const startRun = (kind: string): Run => ({ kind, cleared: 0, ms: 0 });

/** A level or puzzle was solved in `seconds`. */
export const solvedLevel = (r: Run, seconds: number): Run => ({ ...r, cleared: r.cleared + 1, ms: r.ms + Math.round(Math.max(0, seconds) * 1000) });

/** The time spent on a puzzle that did not finish (restarted, or left on the Main menu) still counts towards the run. */
export const carried = (r: Run, seconds: number): Run => ({ ...r, ms: r.ms + Math.round(Math.max(0, seconds) * 1000) });

/** The campaign run is won at level 20; a Random run has no end but a loss. */
export const won = (r: Run): boolean => r.kind === 'campaign' && r.cleared >= CAMPAIGN;

/** The level index the run plays next (campaign); a Random run plays puzzle after puzzle. */
export const nextIndex = (r: Run): number => Math.min(r.cleared, CAMPAIGN - 1);

/**
 * The score a run ends with, `seconds` being the time on the puzzle it ended on (the time ran out, or Give up). A run that
 * cleared nothing scores nothing: null, so no initials are asked for.
 */
export function resultOf(r: Run, seconds: number): { board: string; cleared: number; ms: number } | null {
  if (r.cleared < 1) return null;
  return { board: r.kind, cleared: r.cleared, ms: carried(r, seconds).ms };
}

/** The words for a run's result: "1 level", "3 levels", "1 puzzle", "7 puzzles". */
export const clearedWords = (kind: string, n: number): string => `${n} ${kind === 'campaign' ? 'level' : 'puzzle'}${n === 1 ? '' : 's'}`;

const KEY = 'chronogrip.run.v1';

/** The saved run, or null for anything missing, corrupt or out of range. Never throws. */
export function loadRun(storage: Pick<Storage, 'getItem'> | null | undefined): Run | null {
  try {
    const raw = storage?.getItem(KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
    const { kind, cleared, ms } = o as Record<string, unknown>;
    if (typeof kind !== 'string' || !BOARDS.includes(kind)) return null;
    if (typeof cleared !== 'number' || !Number.isInteger(cleared) || cleared < 0 || (kind === 'campaign' && cleared >= CAMPAIGN)) return null;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
    return { kind, cleared, ms };
  } catch {
    return null;
  }
}

/** Saves the run, or forgets it with null. */
export function saveRun(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, r: Run | null): void {
  try {
    if (r) storage?.setItem(KEY, JSON.stringify(r));
    else storage?.removeItem(KEY);
  } catch {
    // quota or security error: the run just will not persist
  }
}
