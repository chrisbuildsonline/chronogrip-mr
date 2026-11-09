import { BOARDS, RUN_STEP, formatDate, sanitiseName, TOP, type Entry } from './scores';

/**
 * STATE: the global high scores: a public Supabase table anyone can read and add to. Only a board (campaign), three
 * initials, the levels cleared (the step, 1 to 20 here; the table allows 1 to 1000) and the total time go up. The top ten is read
 * most levels first, then fastest. The range (step 1 to 20) is in the query, so the limit only counts rows that can be shown (the table
 * allows up to 1000, and a row above 20 would otherwise take a place in the ten and then be dropped here); the parse checks it again. The key below is the publishable one, safe in a frontend by design; the table's own checks and
 * policies are what guard it. Everything that comes back is untrusted and is re-checked here before it is drawn.
 */
export const GLOBAL_BASE = 'https://xsidhlyprisxfnverwdk.supabase.co/rest/v1/chronogrip_scores';
export const GLOBAL_KEY = 'sb_publishable_Jy8ytY7s0_ifaWOSznEScg_seDnXsrR';
export const GLOBAL_ORIGIN = new URL(GLOBAL_BASE).origin;
const TIMEOUT_MS = 4000;
const MAX_SECONDS = 86400;

type Fetch = typeof fetch;
export type Payload = { level: string; initials: string; seconds: number; step: number };

const isStep = (s: unknown): s is number => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 1000;
const isSeconds = (s: unknown): s is number => typeof s === 'number' && Number.isFinite(s) && s > 0 && s < MAX_SECONDS;

/** The body to post for a score, or null when anything about it is off (then nothing is sent). */
export function scorePayload(level: string, initials: string, seconds: number, step: number): Payload | null {
  if (typeof level !== 'string' || !BOARDS.includes(level) || typeof initials !== 'string' || !/^[A-Z]{3}$/.test(initials)) return null;
  if (typeof seconds !== 'number') return null;
  const s = Math.round(seconds * 100) / 100;
  if (!isSeconds(s)) return null;
  return isStep(step) ? { level, initials, seconds: s, step } : null;
}

/** The query for a board's top ten: steps 1 to 20 only, most levels cleared first, then fastest. */
export const boardUrl = (board: string): string =>
  `${GLOBAL_BASE}?select=initials,seconds,step,created_at&level=eq.${board}&step=gte.1&step=lte.20&order=step.desc,seconds.asc&limit=${TOP}`;

/** Rows off the wire as entries; every row that is not fit for the board is dropped. */
export function parseRows(body: unknown, board: string): Entry[] {
  if (!Array.isArray(body) || !BOARDS.includes(board)) return [];
  const out: Entry[] = [];
  for (const r of body) {
    if (out.length >= TOP) break;
    if (typeof r !== 'object' || r === null) continue;
    const { initials, seconds, step, created_at } = r as Record<string, unknown>;
    const secs = typeof seconds === 'string' && seconds.trim() !== '' ? Number(seconds) : seconds;
    const date = typeof created_at === 'string' ? created_at.slice(0, 10) : '';
    if (typeof initials !== 'string' || !/^[A-Z]{3}$/.test(initials) || !isSeconds(secs) || !formatDate(date)) continue;
    if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > RUN_STEP) continue;
    out.push({ name: sanitiseName(initials), ms: Math.round(secs * 1000), date, ...(step < RUN_STEP ? { cleared: step } : {}) });
  }
  return out;
}

/** Runs a request with a time limit; whatever goes wrong (offline, aborted, thrown) comes back as null, any answer as its Response. */
async function request(f: Fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await f(url, { ...init, signal: ctl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Like `request`, but only a success comes back as a Response. */
async function send(f: Fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const res = await request(f, url, init, timeoutMs);
  return res?.ok ? res : null;
}

/** A board's global top ten, or null when it cannot be had (offline, an error, a timeout, rubbish back). */
export async function fetchGlobal(board: string, f: Fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<Entry[] | null> {
  if (!BOARDS.includes(board)) return null;
  const res = await send(f, boardUrl(board), { headers: { apikey: GLOBAL_KEY } }, timeoutMs);
  if (!res) return null;
  try {
    const body: unknown = await res.json();
    return Array.isArray(body) ? parseRows(body, board) : null;
  } catch {
    return null;
  }
}

/** What posting a score came to: `ok` (accepted), `retry` (offline, a timeout, a 5xx: try again later) or `reject` (the server will never take it). */
export type SubmitResult = 'ok' | 'retry' | 'reject';

/**
 * Posts a score (time in ms). A score that is invalid by our own rules, or an answer in the 4xx (a CHECK violation, a bad request),
 * is a `reject`: sending it again cannot help. A request timeout (408) or too many requests (429) is a `retry` like the 5xx.
 * Never throws.
 */
export async function submitGlobal(board: string, initials: string, ms: number, cleared: number, f: Fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<SubmitResult> {
  const body = scorePayload(board, initials, ms / 1000, cleared);
  if (!body) return 'reject';
  const headers = { apikey: GLOBAL_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  const res = await request(f, GLOBAL_BASE, { method: 'POST', headers, body: JSON.stringify(body) }, timeoutMs);
  if (!res) return 'retry';
  if (res.ok) return 'ok';
  return res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? 'reject' : 'retry';
}
