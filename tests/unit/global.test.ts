import { describe, expect, it, vi } from 'vitest';
import { GLOBAL_BASE, GLOBAL_KEY, boardUrl, fetchGlobal, parseRows, scorePayload, submitGlobal } from '../../src/global';

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const hang = () => vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));

describe('scorePayload', () => {
  it('builds the body for a finished run: the campaign board, initials, total time rounded to 2 dp, and 20 levels as the step', () => {
    expect(scorePayload('campaign-medium', 'ABC', 612.3456, 20)).toEqual({ level: 'campaign-medium', initials: 'ABC', seconds: 612.35, step: 20 });
  });
  it('takes a run of up to a day, and the step from 1 to 1000', () => {
    expect(scorePayload('campaign-medium', 'ABC', 86399, 1)).not.toBeNull();
    expect(scorePayload('campaign-medium', 'ABC', 5, 1000)).not.toBeNull();
  });
  it.each([
    ['the old per-level board', 'l1', 'ABC', 5, 1],
    ['the old random board', 'random', 'ABC', 5, 1],
    ['a Random level board (practice: no scores)', 'random-hard', 'ABC', 5, 20],
    ['a shared puzzle id', 't123456', 'ABC', 5, 1],
    ['injection board', 'campaign-medium&x=1', 'ABC', 5, 1],
    ['prototype board', 'constructor', 'ABC', 5, 1],
    ['lowercase initials', 'campaign-medium', 'abc', 5, 1],
    ['short initials', 'campaign-medium', 'AB', 5, 1],
    ['digit initials', 'campaign-medium', 'A1C', 5, 1],
    ['newline initials', 'campaign-medium', 'ABC\n', 5, 1],
    ['zero seconds', 'campaign-medium', 'ABC', 0, 1],
    ['negative seconds', 'campaign-medium', 'ABC', -3, 1],
    ['NaN seconds', 'campaign-medium', 'ABC', NaN, 1],
    ['Infinity seconds', 'campaign-medium', 'ABC', Infinity, 1],
    ['a day', 'campaign-medium', 'ABC', 86400, 1],
    ['rounds to zero', 'campaign-medium', 'ABC', 0.001, 1],
    ['step 0 (nothing cleared: nothing is sent)', 'campaign-medium', 'ABC', 5, 0],
    ['step 1001', 'campaign-medium', 'ABC', 5, 1001],
    ['fractional step', 'campaign-medium', 'ABC', 5, 2.5],
    ['NaN step', 'campaign-medium', 'ABC', 5, NaN],
  ])('rejects %s', (_n, level, initials, seconds, step) => {
    expect(scorePayload(level, initials, seconds, step)).toBeNull();
  });
  it('rejects non-string and non-number inputs', () => {
    for (const bad of [null, undefined, 5, {}, []]) {
      expect(scorePayload(bad as never, 'ABC', 5, 1)).toBeNull();
      expect(scorePayload('campaign-medium', bad as never, 5, 1)).toBeNull();
    }
    for (const bad of [null, undefined, '5', {}, []]) expect(scorePayload('campaign-medium', 'ABC', bad as never, 1)).toBeNull();
  });
});

describe('boardUrl', () => {
  it('asks for the completed runs (step 20), fastest first, ten rows', () => {
    expect(boardUrl('campaign-medium')).toBe(`${GLOBAL_BASE}?select=initials,seconds,step,created_at&level=eq.campaign-medium&step=eq.20&order=seconds.asc&limit=10`);
  });
  it('carries only the publishable key', () => {
    expect(GLOBAL_KEY).toMatch(/^sb_publishable_/);
  });
});

describe('parseRows', () => {
  const row = { initials: 'ABC', seconds: 612.34, step: 20, created_at: '2026-11-04T10:11:12.000Z' };
  const entry = { name: 'ABC', ms: 612340, date: '2026-11-04' };
  it('turns good rows into entries', () => {
    expect(parseRows([row], 'campaign-medium')).toEqual([entry]);
  });
  it('accepts numeric strings from numeric columns', () => {
    expect(parseRows([{ ...row, seconds: '612.34' }], 'campaign-medium')[0]?.ms).toBe(612340);
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
    expect(parseRows([...junk, row], 'campaign-medium')).toEqual([entry]);
  });
  it('shows only completed runs (step 20), and gives nothing for a board that does not exist', () => {
    expect(parseRows([{ ...row, step: 7 }], 'campaign-medium')).toEqual([]);
    expect(parseRows([{ ...row, step: 21 }], 'campaign-medium')).toEqual([]);
    expect(parseRows([row], 'random-expert')).toEqual([]);
    expect(parseRows([row], 'l1')).toEqual([]);
    expect(parseRows([row], 'random')).toEqual([]);
  });
  it('returns nothing for a body that is not a list, and at most ten rows', () => {
    for (const bad of [null, undefined, {}, 'oops', 4, { message: 'no' }]) expect(parseRows(bad, 'campaign-medium')).toEqual([]);
    expect(parseRows(Array.from({ length: 30 }, () => row), 'campaign-medium')).toHaveLength(10);
  });
});

describe('fetchGlobal', () => {
  it('sends the key and returns parsed rows', async () => {
    const f = ok([{ initials: 'ZED', seconds: 509.5, step: 20, created_at: '2026-01-02T00:00:00Z' }]);
    expect(await fetchGlobal('campaign-medium', f)).toEqual([{ name: 'ZED', ms: 509500, date: '2026-01-02' }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(boardUrl('campaign-medium'));
    expect((init.headers as Record<string, string>).apikey).toBe(GLOBAL_KEY);
  });
  it('gives null (offline) for a 500, a throw, a bad body and a timeout', async () => {
    expect(await fetchGlobal('campaign-medium', ok({ message: 'boom' }, 500))).toBeNull();
    expect(await fetchGlobal('campaign-medium', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))).toBeNull();
    expect(await fetchGlobal('campaign-medium', vi.fn(async () => new Response('<html>', { status: 200 })))).toBeNull();
    expect(await fetchGlobal('campaign-medium', hang() as never, 20)).toBeNull();
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
    expect(await submitGlobal('campaign-medium', 'ABC', 641234, 20, f)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GLOBAL_BASE);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ apikey: GLOBAL_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' });
    expect(JSON.parse(init.body as string)).toEqual({ level: 'campaign-medium', initials: 'ABC', seconds: 641.23, step: 20 });
  });
  it('sends nothing for an invalid score, or for a run that cleared nothing', async () => {
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await submitGlobal('campaign-medium', 'ab', 5000, 1, f)).toBe(false);
    expect(await submitGlobal('campaign-medium', 'ABC', 0, 1, f)).toBe(false);
    expect(await submitGlobal('campaign-medium', 'ABC', 5000, 0, f)).toBe(false);
    expect(await submitGlobal('t1', 'ABC', 5000, 1, f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('never throws on a 500, a throw or a timeout', async () => {
    expect(await submitGlobal('campaign-medium', 'ABC', 5000, 2, ok({}, 500))).toBe(false);
    expect(await submitGlobal('campaign-medium', 'ABC', 5000, 2, vi.fn(async () => Promise.reject(new Error('x'))))).toBe(false);
    expect(await submitGlobal('campaign-medium', 'ABC', 5000, 2, hang() as never, 20)).toBe(false);
  });
});
