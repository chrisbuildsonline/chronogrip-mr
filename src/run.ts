import { CAMPAIGN } from './random';
import { STAGE_IDS, type StageId } from './stages';

/**
 * A run is one go at a stage, from New Game to its level 20. Only a completed run is scored (its total time, with a name
 * entered once); Give up and running out of time end the run with a short result card and score nothing. Pure state; main.ts
 * owns the clock and the storage. `cleared` is the levels solved so far; `ms` is their time plus any time carried over from a
 * puzzle that was restarted or left on the Main menu.
 */
export type Run = { stage: StageId; cleared: number; ms: number; /** Manual pauses taken so far: each adds PAUSE_PENALTY_S to the total. */ pauses: number };

/** Seconds each manual pause (the pause button, Esc or P) adds to the run's total time. A system pause (tab hidden, headset off) adds nothing. */
export const PAUSE_PENALTY_S = 5;
export const PAUSE_PENALTY_MS = PAUSE_PENALTY_S * 1000;

export const startRun = (stage: StageId): Run => ({ stage, cleared: 0, ms: 0, pauses: 0 });

/** A manual pause was taken. */
export const pausedOnce = (r: Run): Run => ({ ...r, pauses: r.pauses + 1 });

/** What the pauses have added so far, ms. */
export const penaltyMs = (r: Run): number => r.pauses * PAUSE_PENALTY_MS;

/** The run's total: the time on its levels plus the pauses' penalty. This is the score. */
export const totalMs = (r: Run): number => r.ms + penaltyMs(r);

const mmss = (ms: number): string => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;
/** Minutes and seconds, 12:34: the penalty and the total always read the same way. */
export const timeText = mmss;

/** "Total 12:34 · 3 pauses (+0:15)", or just "Total 12:34" when none was taken. */
export function totalLine(ms: number, pauses: number): string {
  const total = `Total ${mmss(ms)}`;
  return pauses > 0 ? `${total} · ${pauses} ${pauses === 1 ? 'pause' : 'pauses'} (+${mmss(pauses * PAUSE_PENALTY_MS)})` : total;
}

/** A level was solved in `seconds`. */
export const solvedLevel = (r: Run, seconds: number): Run => ({ ...r, cleared: r.cleared + 1, ms: r.ms + Math.round(Math.max(0, seconds) * 1000) });

/** The time spent on a puzzle that did not finish (restarted, or left on the Main menu) still counts towards the run. */
export const carried = (r: Run, seconds: number): Run => ({ ...r, ms: r.ms + Math.round(Math.max(0, seconds) * 1000) });

/** The run is complete at level 20. */
export const won = (r: Run): boolean => r.cleared >= CAMPAIGN;

/** The level index the run plays next. */
export const nextIndex = (r: Run): number => Math.min(r.cleared, CAMPAIGN - 1);

/** How a run ended that was not won: the level it reached (1-based) and its total time, `seconds` being the time on that level. */
export const reached = (r: Run, seconds: number): { level: number; ms: number; pauses: number } => ({ level: Math.min(r.cleared + 1, CAMPAIGN), ms: totalMs(carried(r, seconds)), pauses: r.pauses });

const KEY = 'chronogrip.run.v1';

/** The saved run, or null for anything missing, corrupt or out of range. Never throws. */
export function loadRun(storage: Pick<Storage, 'getItem'> | null | undefined): Run | null {
  try {
    const raw = storage?.getItem(KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
    const { stage, cleared, ms, pauses = 0 } = o as Record<string, unknown>;
    if (typeof stage !== 'string' || !(STAGE_IDS as readonly string[]).includes(stage)) return null; // a run saved before the stages is dropped
    if (typeof cleared !== 'number' || !Number.isInteger(cleared) || cleared < 0 || cleared >= CAMPAIGN) return null;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
    if (typeof pauses !== 'number' || !Number.isInteger(pauses) || pauses < 0) return null;
    return { stage: stage as StageId, cleared, ms, pauses };
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
