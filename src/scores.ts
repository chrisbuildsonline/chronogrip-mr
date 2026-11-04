import { LEVELS } from './levels';
import { MAX_STEP } from './random';

/**
 * High score boards: one per hand-made level (by level id) and one for Random. Daily and shared puzzles change every day or
 * are one-offs, so they get none. A level entry is ranked by time, a Random entry by the step solved and then the time;
 * either way the earlier date wins a tie, and each board keeps its top ten. Everything here is pure.
 */
export const BOARDS: readonly string[] = [...LEVELS.map((l) => l.id), 'random'];
export const TOP = 10;
export const DEFAULT_INITIALS = 'AAA';

/** `step` is only on a Random entry: the step that was solved. `date` is the local day, YYYY-MM-DD. */
export type Entry = { name: string; ms: number; date: string; step?: number };
export type Scores = { initials: string; boards: Record<string, Entry[]> };

export const emptyScores = (): Scores => ({ initials: DEFAULT_INITIALS, boards: Object.fromEntries(BOARDS.map((id) => [id, []])) });

/** The board a level plays for: l1-l8 by id; the daily, a shared puzzle and anything else get none. */
export const boardOf = (levelId: string): string | null => (LEVELS.some((l) => l.id === levelId) ? levelId : null);

/** Exactly three letters A-Z: anything else is dropped and a short name is padded with A. */
export function sanitiseName(name: unknown): string {
  const letters = typeof name === 'string' ? name.toUpperCase().replace(/[^A-Z]/g, '') : '';
  return letters.padEnd(3, 'A').slice(0, 3);
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const validDate = (d: unknown): d is string => typeof d === 'string' && DATE.test(d) && Number(d.slice(5, 7)) >= 1 && Number(d.slice(5, 7)) <= 12 && Number(d.slice(8)) >= 1 && Number(d.slice(8)) <= 31;

/** The local day as YYYY-MM-DD. */
export const todayISO = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A day as "4 Nov"; empty for anything that is not a date. */
export function formatDate(date: string): string {
  return validDate(date) ? `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}` : '';
}

/** Whether an entry is fit for a board: a positive finite time, a day, and for Random a whole step in range. */
function valid(board: string, e: Entry): boolean {
  if (!BOARDS.includes(board) || !Number.isFinite(e.ms) || e.ms <= 0 || !validDate(e.date)) return false;
  if (board === 'random') return typeof e.step === 'number' && Number.isInteger(e.step) && e.step >= 1 && e.step <= MAX_STEP;
  return true;
}

/** Negative when `a` ranks above `b`: levels by time; Random by step (higher first), then time; the earlier date breaks a tie. */
function order(board: string, a: Entry, b: Entry): number {
  const byTime = a.ms - b.ms;
  const byDate = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  return board === 'random' ? b.step! - a.step! || byTime || byDate : byTime || byDate;
}

/** Whether an entry would make the board's top ten, and the rank it would take (a later tie ranks after the entry already there). */
export function qualifies(s: Scores, board: string, e: Entry): { ok: boolean; rank: number } {
  if (!valid(board, e)) return { ok: false, rank: 0 };
  const rank = 1 + (s.boards[board] ?? []).filter((x) => order(board, x, e) <= 0).length;
  return { ok: rank <= TOP, rank };
}

/** The scores with the entry in its place and the board trimmed to ten; the same object back if it does not qualify. The name is remembered as the last initials. */
export function addEntry(s: Scores, board: string, e: Entry): Scores {
  if (!qualifies(s, board, e).ok) return s;
  const entry: Entry = { name: sanitiseName(e.name), ms: e.ms, date: e.date, ...(board === 'random' ? { step: e.step } : {}) };
  const rows = [...s.boards[board]!, entry].sort((a, b) => order(board, a, b)).slice(0, TOP);
  return { initials: entry.name, boards: { ...s.boards, [board]: rows } };
}

const KEY = 'chronogrip.scores.v1';
const VERSION = 1;

const isObject = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o);

/** The saved boards. Anything missing, corrupt, from another version or unreadable gives empty; bad entries are dropped, names sanitised. Never throws. */
export function loadScores(storage: Pick<Storage, 'getItem'> | null | undefined): Scores {
  const s = emptyScores();
  try {
    const raw = storage?.getItem(KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    if (!isObject(o) || o.version !== VERSION || !isObject(o.boards)) return s;
    if (typeof o.initials === 'string') s.initials = sanitiseName(o.initials);
    for (const board of BOARDS) {
      const rows = Object.hasOwn(o.boards, board) ? o.boards[board] : null;
      if (!Array.isArray(rows)) continue;
      const kept: Entry[] = [];
      for (const r of rows) {
        if (!isObject(r)) continue;
        const e: Entry = { name: sanitiseName(r.name), ms: r.ms as number, date: r.date as string, ...(board === 'random' ? { step: r.step as number } : {}) };
        if (valid(board, e)) kept.push(e);
      }
      s.boards[board] = kept.sort((a, b) => order(board, a, b)).slice(0, TOP);
    }
  } catch {
    // storage disabled or JSON corrupt: start fresh
  }
  return s;
}

export function saveScores(storage: Pick<Storage, 'setItem'> | null | undefined, s: Scores): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ version: VERSION, ...s }));
  } catch {
    // quota or security error: the scores just will not persist
  }
}

/** The three letters being chosen, and the slot typing fills next (0-2; 3 once all three are in). */
export type Initials = { letters: string; cursor: number };

const A = 'A'.charCodeAt(0);
const setLetter = (letters: string, slot: number, letter: string) => letters.slice(0, slot) + letter + letters.slice(slot + 1);

/** A typed key fills the slot at the cursor and moves on; anything but a letter, or a full set, changes nothing. */
export function typeInitial(i: Initials, key: string): Initials {
  if (!/^[a-z]$/i.test(key) || i.cursor >= 3) return i;
  return { letters: setLetter(i.letters, i.cursor, key.toUpperCase()), cursor: i.cursor + 1 };
}

/** Backspace goes back one slot, so the next letter typed replaces it. */
export const backInitial = (i: Initials): Initials => ({ letters: i.letters, cursor: Math.max(0, i.cursor - 1) });

/** Up (+1) or down (-1) on one slot cycles its letter round the alphabet, and makes that slot the one typing fills. */
export function stepInitial(i: Initials, slot: number, dir: 1 | -1): Initials {
  const next = String.fromCharCode(A + ((i.letters.charCodeAt(slot) - A + dir + 26) % 26));
  return { letters: setLetter(i.letters, slot, next), cursor: slot };
}
