
/**
 * STATE: high score boards, one per stage. A campaign run on a timer that ends with at least one level cleared is scored, whether
 * it was finished, ran out of time or was given up: its levels cleared, total time and three initials. Relaxed and Random are not.
 * Ranked more levels cleared first, then less total time, then the earlier date; the board keeps its top ten.
 * An entry with no `cleared` is from before partial runs and counts as all 20 (a 20 entry is stored without it).
 * `posted` marks an entry the global board has accepted (the outbox in src/outbox.ts sends the rest); `dev` marks a cheated run, never sent.
 * Everything here is pure.
 */
export const BOARDS: readonly string[] = ['campaign-easy', 'campaign-medium', 'campaign-hard'];
/** The board a stage's finished runs go on. The single campaign board of before the stages is dropped (its times were for a different ramp). */
export const boardOf = (stage: string): string => `campaign-${stage}`;
export const TOP = 10;
export const DEFAULT_INITIALS = 'AAA';

/** `ms`: the run's total time; `date`: the local day, YYYY-MM-DD; `cleared`: levels cleared, 1..20 (missing: 20); `posted`: the outbox is done with it (the global board has it, or `rejected`: it never will); `dev`: a cheated run, never sent. */
export type Entry = { name: string; ms: number; date: string; cleared?: number; posted?: boolean; rejected?: boolean; dev?: boolean };
/** A finished run has cleared all 20 levels. */
export const RUN_STEP = 20;
/** The levels an entry cleared: an entry from before partial runs is a finished run. */
export const clearedOf = (e: Pick<Entry, 'cleared'>): number => e.cleared ?? RUN_STEP;
export type Scores = { initials: string; boards: Record<string, Entry[]> };

export const emptyScores = (): Scores => ({ initials: DEFAULT_INITIALS, boards: Object.fromEntries(BOARDS.map((id) => [id, []])) });

export const BLOCKED_INITIALS: readonly string[] = [
  'ASS', 'BCH', 'CNT', 'COK', 'CUK', 'CUM', 'DIC', 'DIK', 'DYK', 'FAG', 'FCK', 'FUC', 'FUK', 'FUQ', 'FUX', 'HOE', 'JIZ', 'KKK', 'KYS', 'NAZ', 'NGR', 'NIG', 'PUS', 'SEX', 'SHT', 'SUK', 'TIT', 'TWA', 'TWT', 'VAG', 'WNK', 'WTF', 'XXX',
];
/** Whether three letters are on the blocklist (crude, rude or hateful); such initials are never kept or shown. */
export const isBlockedInitials = (s: string): boolean => BLOCKED_INITIALS.includes(s.toUpperCase());

/** Exactly three letters A-Z: anything else is dropped and a short name is padded with A; a blocked result becomes the default AAA. */
export function sanitiseName(name: unknown): string {
  const letters = typeof name === 'string' ? name.toUpperCase().replace(/[^A-Z]/g, '') : '';
  const out = letters.padEnd(3, 'A').slice(0, 3);
  return isBlockedInitials(out) ? DEFAULT_INITIALS : out;
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

/** Whether an entry is fit for a board: a positive finite time under a day, and a day. */
function valid(board: string, e: Entry): boolean {
  const c = e.cleared;
  if (c !== undefined && !(typeof c === 'number' && Number.isInteger(c) && c >= 1 && c <= RUN_STEP)) return false;
  return BOARDS.includes(board) && Number.isFinite(e.ms) && e.ms > 0 && e.ms < 86_400_000 && validDate(e.date);
}

/** Negative when `a` ranks above `b`: more levels cleared first, then less time; the earlier date breaks a tie. */
function order(_board: string, a: Entry, b: Entry): number {
  return clearedOf(b) - clearedOf(a) || a.ms - b.ms || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

/** The entry as stored: a sanitised name, `cleared` only below 20, `posted` and `dev` only when true. */
function clean(e: Entry): Entry {
  const out: Entry = { name: sanitiseName(e.name), ms: e.ms, date: e.date };
  if (e.cleared !== undefined && e.cleared < RUN_STEP) out.cleared = e.cleared;
  if (e.posted === true) out.posted = true;
  if (e.rejected === true) out.rejected = true;
  if (e.dev === true) out.dev = true;
  return out;
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
  const entry = clean(e);
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
        const raw: Entry = { name: sanitiseName(r.name), ms: r.ms as number, date: r.date as string, ...(r.cleared === undefined ? {} : { cleared: r.cleared as number }), posted: r.posted === true, rejected: r.rejected === true, dev: r.dev === true };
        if (valid(board, raw)) kept.push(clean(raw));
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

/** The scores with the first unposted entry equal to `e` (same name, time, date and levels) marked posted (and `rejected` when the server refused it for good); the same object back if there is none. */
export function markPosted(s: Scores, board: string, e: Entry, rejected = false): Scores {
  const rows = s.boards[board] ?? [];
  const i = rows.findIndex((x) => !x.posted && x.name === e.name && x.ms === e.ms && x.date === e.date && clearedOf(x) === clearedOf(e));
  if (i < 0) return s;
  return { ...s, boards: { ...s.boards, [board]: rows.map((x, k) => (k === i ? { ...x, posted: true, ...(rejected ? { rejected: true } : {}) } : x)) } };
}

/** The entries still to send to the global board, in board order: not posted, not a cheated run. */
export const unposted = (s: Scores): { board: string; entry: Entry }[] =>
  BOARDS.flatMap((board) => (s.boards[board] ?? []).filter((e) => !e.posted && !e.dev).map((entry) => ({ board, entry })));
