import { MAX_STEP } from './random';
import { BOARDS, formatDate, sanitiseName, TOP, type Entry } from './scores';

/**
 * The global high scores: a public Supabase table anyone can read and add to. Only a level, three initials and a time go up
 * (and the step on Random). The key below is the publishable one, safe in a frontend by design; the table's own checks and
 * policies are what guard it. Everything that comes back is untrusted and is re-checked here before it is drawn.
 */
export const GLOBAL_BASE = 'https://xsidhlyprisxfnverwdk.supabase.co/rest/v1/chronogrip_scores';
export const GLOBAL_KEY = 'sb_publishable_Jy8ytY7s0_ifaWOSznEScg_seDnXsrR';
export const GLOBAL_ORIGIN = new URL(GLOBAL_BASE).origin;
const TIMEOUT_MS = 4000;
const MAX_SECONDS = 3600;

type Fetch = typeof fetch;
export type Payload = { level: string; initials: string; seconds: number; step?: number };

const isStep = (s: unknown): s is number => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= MAX_STEP;
const isSeconds = (s: unknown): s is number => typeof s === 'number' && Number.isFinite(s) && s > 0 && s < MAX_SECONDS;

/** The body to post for a score, or null when anything about it is off (then nothing is sent). */
export function scorePayload(level: string, initials: string, seconds: number, step?: number): Payload | null {
  if (typeof level !== 'string' || !BOARDS.includes(level) || typeof initials !== 'string' || !/^[A-Z]{3}$/.test(initials)) return null;
  if (typeof seconds !== 'number') return null;
  const s = Math.round(seconds * 100) / 100;
  if (!isSeconds(s)) return null;
  if (level !== 'random') return { level, initials, seconds: s };
  return isStep(step) ? { level, initials, seconds: s, step } : null;
}

/** The query for a board's top ten: a level by time; Random by step (higher first), then time. */
export const boardUrl = (board: string): string =>
  `${GLOBAL_BASE}?select=initials,seconds,step,created_at&level=eq.${board}&order=${board === 'random' ? 'step.desc,seconds.asc' : 'seconds.asc'}&limit=${TOP}`;

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
    if (board === 'random') {
      if (!isStep(step)) continue;
      out.push({ name: sanitiseName(initials), ms: Math.round(secs * 1000), date, step });
    } else out.push({ name: sanitiseName(initials), ms: Math.round(secs * 1000), date });
  }
  return out;
}

/** Runs a request with a time limit; whatever goes wrong (offline, aborted, thrown) comes back as null. */
async function send(f: Fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await f(url, { ...init, signal: ctl.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

/** Posts a score (time in ms) if it is valid; true when it was accepted. Never throws. */
export async function submitGlobal(board: string, initials: string, ms: number, step?: number, f: Fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  const body = scorePayload(board, initials, ms / 1000, step);
  if (!body) return false;
  const headers = { apikey: GLOBAL_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  return (await send(f, GLOBAL_BASE, { method: 'POST', headers, body: JSON.stringify(body) }, timeoutMs)) !== null;
}
