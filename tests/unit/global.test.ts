import { describe, expect, it, vi } from 'vitest';
import { GLOBAL_BASE, GLOBAL_KEY, boardUrl, fetchGlobal, parseRows, scorePayload, submitGlobal } from '../../src/global';

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const hang = () => vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));

describe('scorePayload', () => {
  it('builds the body for a finished run: the campaign board, initials, total time rounded to 2 dp, and 20 levels as the step', () => {
    expect(scorePayload('campaign', 'ABC', 612.3456, 20)).toEqual({ level: 'campaign', initials: 'ABC', seconds: 612.35, step: 20 });
  });
  it('takes a run of up to a day, and the step from 1 to 1000', () => {
    expect(scorePayload('campaign', 'ABC', 86399, 1)).not.toBeNull();
    expect(scorePayload('campaign', 'ABC', 5, 1000)).not.toBeNull();
  });
  it.each([
    ['the old per-level board', 'l1', 'ABC', 5, 1],
    ['the old random board', 'random', 'ABC', 5, 1],
    ['a Random level board (practice: no scores)', 'random-hard', 'ABC', 5, 20],
    ['a shared puzzle id', 't123456', 'ABC', 5, 1],
    ['injection board', 'campaign&x=1', 'ABC', 5, 1],
    ['prototype board', 'constructor', 'ABC', 5, 1],
    ['lowercase initials', 'campaign', 'abc', 5, 1],
    ['short initials', 'campaign', 'AB', 5, 1],
    ['digit initials', 'campaign', 'A1C', 5, 1],
    ['newline initials', 'campaign', 'ABC\n', 5, 1],
    ['zero seconds', 'campaign', 'ABC', 0, 1],
    ['negative seconds', 'campaign', 'ABC', -3, 1],
    ['NaN seconds', 'campaign', 'ABC', NaN, 1],
    ['Infinity seconds', 'campaign', 'ABC', Infinity, 1],
    ['a day', 'campaign', 'ABC', 86400, 1],
    ['rounds to zero', 'campaign', 'ABC', 0.001, 1],
    ['step 0 (nothing cleared: nothing is sent)', 'campaign', 'ABC', 5, 0],
    ['step 1001', 'campaign', 'ABC', 5, 1001],
    ['fractional step', 'campaign', 'ABC', 5, 2.5],
    ['NaN step', 'campaign', 'ABC', 5, NaN],
  ])('rejects %s', (_n, level, initials, seconds, step) => {
    expect(scorePayload(level, initials, seconds, step)).toBeNull();
  });
  it('rejects non-string and non-number inputs', () => {
    for (const bad of [null, undefined, 5, {}, []]) {
      expect(scorePayload(bad as never, 'ABC', 5, 1)).toBeNull();
      expect(scorePayload('campaign', bad as never, 5, 1)).toBeNull();
    }
    for (const bad of [null, undefined, '5', {}, []]) expect(scorePayload('campaign', 'ABC', bad as never, 1)).toBeNull();
  });
});

describe('boardUrl', () => {
  it('asks for the completed runs (step 20), fastest first, ten rows', () => {
    expect(boardUrl('campaign')).toBe(`${GLOBAL_BASE}?select=initials,seconds,step,created_at&level=eq.campaign&step=eq.20&order=seconds.asc&limit=10`);
  });
  it('carries only the publishable key', () => {
    expect(GLOBAL_KEY).toMatch(/^sb_publishable_/);
  });
});

describe('parseRows', () => {
  const row = { initials: 'ABC', seconds: 612.34, step: 20, created_at: '2026-11-04T10:11:12.000Z' };
  const entry = { name: 'ABC', ms: 612340, date: '2026-11-04' };
  it('turns good rows into entries', () => {
    expect(parseRows([row], 'campaign')).toEqual([entry]);
  });
  it('accepts numeric strings from numeric columns', () => {
    expect(parseRows([{ ...row, seconds: '612.34' }], 'campaign')[0]?.ms).toBe(612340);
  });
  it('drops junk rows and keeps the good ones', () => {
    const junk: unknown[] = [
      null, 7, 'x', [], {},
      { ...row, initials: 'abc' },
      { ...row, initials: 'ABCD' },
      { ...row, initials: '<script>' },
      { ...row, initials: 5 },
      { ...row, seconds: 0 },
      { ...row, seconds: -1 },
      { ...row, seconds: 86400 },
      { ...row, seconds: 'NaN' },
      { ...row, seconds: null },
      { ...row, step: null },
      { ...row, step: 0 },
      { ...row, step: 19 },
      { ...row, step: 1001 },
      { ...row, step: 2.5 },
      { ...row, created_at: 'yesterday' },
      { ...row, created_at: 5 },
    ];
    expect(parseRows([...junk, row], 'campaign')).toEqual([entry]);
  });
  it('shows only completed runs (step 20), and gives nothing for a board that does not exist', () => {
    expect(parseRows([{ ...row, step: 7 }], 'campaign')).toEqual([]);
    expect(parseRows([{ ...row, step: 21 }], 'campaign')).toEqual([]);
    expect(parseRows([row], 'random-expert')).toEqual([]);
    expect(parseRows([row], 'l1')).toEqual([]);
    expect(parseRows([row], 'random')).toEqual([]);
  });
  it('returns nothing for a body that is not a list, and at most ten rows', () => {
    for (const bad of [null, undefined, {}, 'oops', 4, { message: 'no' }]) expect(parseRows(bad, 'campaign')).toEqual([]);
    expect(parseRows(Array.from({ length: 30 }, () => row), 'campaign')).toHaveLength(10);
  });
});

describe('fetchGlobal', () => {
  it('sends the key and returns parsed rows', async () => {
    const f = ok([{ initials: 'ZED', seconds: 509.5, step: 20, created_at: '2026-01-02T00:00:00Z' }]);
    expect(await fetchGlobal('campaign', f)).toEqual([{ name: 'ZED', ms: 509500, date: '2026-01-02' }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(boardUrl('campaign'));
    expect((init.headers as Record<string, string>).apikey).toBe(GLOBAL_KEY);
  });
  it('gives null (offline) for a 500, a throw, a bad body and a timeout', async () => {
    expect(await fetchGlobal('campaign', ok({ message: 'boom' }, 500))).toBeNull();
    expect(await fetchGlobal('campaign', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))).toBeNull();
    expect(await fetchGlobal('campaign', vi.fn(async () => new Response('<html>', { status: 200 })))).toBeNull();
    expect(await fetchGlobal('campaign', hang() as never, 20)).toBeNull();
  });
  it('does not ask at all for a board it does not know', async () => {
    const f = ok([]);
    expect(await fetchGlobal('l1', f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('submitGlobal', () => {
  it('posts the JSON with the key and a minimal return', async () => {
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await submitGlobal('campaign', 'ABC', 641234, 20, f)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GLOBAL_BASE);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ apikey: GLOBAL_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' });
    expect(JSON.parse(init.body as string)).toEqual({ level: 'campaign', initials: 'ABC', seconds: 641.23, step: 20 });
  });
  it('sends nothing for an invalid score, or for a run that cleared nothing', async () => {
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await submitGlobal('campaign', 'ab', 5000, 1, f)).toBe(false);
    expect(await submitGlobal('campaign', 'ABC', 0, 1, f)).toBe(false);
    expect(await submitGlobal('campaign', 'ABC', 5000, 0, f)).toBe(false);
    expect(await submitGlobal('t1', 'ABC', 5000, 1, f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('never throws on a 500, a throw or a timeout', async () => {
    expect(await submitGlobal('campaign', 'ABC', 5000, 2, ok({}, 500))).toBe(false);
    expect(await submitGlobal('campaign', 'ABC', 5000, 2, vi.fn(async () => Promise.reject(new Error('x'))))).toBe(false);
    expect(await submitGlobal('campaign', 'ABC', 5000, 2, hang() as never, 20)).toBe(false);
  });
});
