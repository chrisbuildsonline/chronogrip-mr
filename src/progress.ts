import { isIdent } from './levels';
import type { Outcome } from './timer';

/**
 * Best time in seconds per level id; a level is solved iff it has an entry. `outcome` is whether the level was ever solved
 * under its par time ('pass') or only over it ('over'); absent in saves from before the timer and while empty.
 */
export type Progress = { best: Record<string, number>; outcome?: Record<string, Outcome> };

const KEY = 'chronogrip.progress.v1';
const empty = (): Progress => ({ best: {} });

/** Reads saved progress; anything missing, corrupt or unreadable gives empty, bad entries are dropped. */
export function loadProgress(storage: Pick<Storage, 'getItem'> | null | undefined): Progress {
  const progress = empty();
  try {
    const raw = storage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const best = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as { best?: unknown }).best : null;
    if (typeof best !== 'object' || best === null || Array.isArray(best)) return progress;
    for (const [id, s] of Object.entries(best)) {
      if (isIdent(id) && typeof s === 'number' && Number.isFinite(s) && s > 0) progress.best[id] = s;
    }
    const outcome = (parsed as { outcome?: unknown }).outcome;
    if (typeof outcome === 'object' && outcome !== null && !Array.isArray(outcome)) {
      const kept: Record<string, Outcome> = {};
      for (const [id, o] of Object.entries(outcome)) if (isIdent(id) && (o === 'pass' || o === 'over')) kept[id] = o;
      if (Object.keys(kept).length) progress.outcome = kept;
    }
  } catch {
    // storage disabled or JSON corrupt: start fresh
  }
  return progress;
}

/** Keeps the lower time; ignores a time that is not a finite positive number. */
export function recordSolve(p: Progress, levelId: string, seconds: number): { progress: Progress; newBest: boolean } {
  if (!Number.isFinite(seconds) || seconds <= 0) return { progress: p, newBest: false };
  const old = Object.hasOwn(p.best, levelId) ? p.best[levelId]! : Infinity;
  if (seconds >= old) return { progress: p, newBest: false };
  return { progress: { ...p, best: { ...p.best, [levelId]: seconds } }, newBest: true };
}

/** Marks a level passed or over par; a pass stays a pass, however slow a later run is. */
export function recordOutcome(p: Progress, levelId: string, outcome: Outcome): Progress {
  if (p.outcome?.[levelId] === 'pass' || p.outcome?.[levelId] === outcome) return p;
  return { ...p, outcome: { ...p.outcome, [levelId]: outcome } };
}

/** Index of the first level id with no best time; 0 once every one is solved. Pass today's daily id, so older dailies never count. */
export function firstUnsolved(p: Progress, ids: readonly string[]): number {
  return Math.max(0, ids.findIndex((id) => !Object.hasOwn(p.best, id)));
}

export function saveProgress(storage: Pick<Storage, 'setItem'> | null | undefined, p: Progress): void {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
  } catch {
    // quota or security error: progress just will not persist
  }
}
