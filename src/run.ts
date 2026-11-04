import { CAMPAIGN } from './random';

/**
 * A run is one go at the campaign, from New Game to level 20. Only a completed run is scored (its total time, with a name
 * entered once); Give up and running out of time end the run with a short result card and score nothing. Pure state; main.ts
 * owns the clock and the storage. `cleared` is the levels solved so far; `ms` is their time plus any time carried over from a
 * puzzle that was restarted or left on the Main menu.
 */
export type Run = { cleared: number; ms: number };

export const startRun = (): Run => ({ cleared: 0, ms: 0 });

/** A level was solved in `seconds`. */
export const solvedLevel = (r: Run, seconds: number): Run => ({ cleared: r.cleared + 1, ms: r.ms + Math.round(Math.max(0, seconds) * 1000) });

/** The time spent on a puzzle that did not finish (restarted, or left on the Main menu) still counts towards the run. */
export const carried = (r: Run, seconds: number): Run => ({ ...r, ms: r.ms + Math.round(Math.max(0, seconds) * 1000) });

/** The run is complete at level 20. */
export const won = (r: Run): boolean => r.cleared >= CAMPAIGN;

/** The level index the run plays next. */
export const nextIndex = (r: Run): number => Math.min(r.cleared, CAMPAIGN - 1);

/** How a run ended that was not won: the level it reached (1-based) and its total time, `seconds` being the time on that level. */
export const reached = (r: Run, seconds: number): { level: number; ms: number } => ({ level: Math.min(r.cleared + 1, CAMPAIGN), ms: carried(r, seconds).ms });

const KEY = 'chronogrip.run.v1';

/** The saved run, or null for anything missing, corrupt or out of range. Never throws. */
export function loadRun(storage: Pick<Storage, 'getItem'> | null | undefined): Run | null {
  try {
    const raw = storage?.getItem(KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
    const { cleared, ms } = o as Record<string, unknown>;
    if (typeof cleared !== 'number' || !Number.isInteger(cleared) || cleared < 0 || cleared >= CAMPAIGN) return null;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
    return { cleared, ms };
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
