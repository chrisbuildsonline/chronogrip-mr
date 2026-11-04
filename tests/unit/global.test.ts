import { describe, expect, it, vi } from 'vitest';
import { GLOBAL_BASE, GLOBAL_KEY, boardUrl, fetchGlobal, parseRows, scorePayload, submitGlobal } from '../../src/global';

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const hang = () => vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));

describe('scorePayload', () => {
  it('builds the body for a level time, rounded to 2 dp', () => {
    expect(scorePayload('l3', 'ABC', 12.3456)).toEqual({ level: 'l3', initials: 'ABC', seconds: 12.35 });
  });
  it('takes every campaign board and every Random level difficulty board, and nothing else', () => {
    for (const board of ['l1', 'l9', 'l20', 'random-easy', 'random-medium', 'random-hard', 'random-expert']) expect(scorePayload(board, 'XYZ', 40)).toEqual({ level: board, initials: 'XYZ', seconds: 40 });
    for (const board of ['l0', 'l21', 'random', 'random-', 'random-insane']) expect(scorePayload(board, 'XYZ', 40), board).toBeNull();
  });
  it.each([
    ['unknown level', 'l21', 'ABC', 5, undefined],
    ['daily id', 't123456', 'ABC', 5, undefined],
    ['injection level', 'l1&x=1', 'ABC', 5, undefined],
    ['prototype level', 'constructor', 'ABC', 5, undefined],
    ['lowercase initials', 'l1', 'abc', 5, undefined],
    ['short initials', 'l1', 'AB', 5, undefined],
    ['long initials', 'l1', 'ABCD', 5, undefined],
    ['digit initials', 'l1', 'A1C', 5, undefined],
    ['newline initials', 'l1', 'ABC\n', 5, undefined],
    ['zero seconds', 'l1', 'ABC', 0, undefined],
    ['negative seconds', 'l1', 'ABC', -3, undefined],
    ['NaN seconds', 'l1', 'ABC', NaN, undefined],
    ['Infinity seconds', 'l1', 'ABC', Infinity, undefined],
    ['an hour', 'l1', 'ABC', 3600, undefined],
    ['rounds to zero', 'l1', 'ABC', 0.001, undefined],
  ])('rejects %s', (_n, level, initials, seconds) => {
    expect(scorePayload(level, initials, seconds)).toBeNull();
  });
  it('rejects non-string and non-number inputs', () => {
    for (const bad of [null, undefined, 5, {}, []]) {
      expect(scorePayload(bad as never, 'ABC', 5)).toBeNull();
      expect(scorePayload('l1', bad as never, 5)).toBeNull();
    }
    expect(scorePayload('l1', 'ABC', '5' as never)).toBeNull();
  });
});

describe('boardUrl', () => {
  it('asks a board by time, ten rows', () => {
    expect(boardUrl('l1')).toBe(`${GLOBAL_BASE}?select=initials,seconds,created_at&level=eq.l1&order=seconds.asc&limit=10`);
    expect(boardUrl('random-hard')).toBe(`${GLOBAL_BASE}?select=initials,seconds,created_at&level=eq.random-hard&order=seconds.asc&limit=10`);
  });
  it('carries only the publishable key', () => {
    expect(GLOBAL_KEY).toMatch(/^sb_publishable_/);
  });
});

describe('parseRows', () => {
  const row = { initials: 'ABC', seconds: 12.34, created_at: '2026-11-04T10:11:12.000Z' };
  it('turns good rows into entries', () => {
    expect(parseRows([row], 'l1')).toEqual([{ name: 'ABC', ms: 12340, date: '2026-11-04' }]);
    expect(parseRows([row], 'random-hard')).toEqual([{ name: 'ABC', ms: 12340, date: '2026-11-04' }]);
  });
  it('accepts numeric strings from numeric columns', () => {
    expect(parseRows([{ ...row, seconds: '12.34' }], 'l1')[0]?.ms).toBe(12340);
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
      { ...row, seconds: 3600 },
      { ...row, seconds: 'NaN' },
      { ...row, seconds: null },
      { ...row, created_at: 'yesterday' },
      { ...row, created_at: 5 },
    ];
    expect(parseRows([...junk, row], 'l1')).toEqual([{ name: 'ABC', ms: 12340, date: '2026-11-04' }]);
  });
  it('ignores a stray step column on any row, and gives nothing for a board that does not exist', () => {
    expect(parseRows([{ ...row, step: 4 }], 'l2')).toEqual([{ name: 'ABC', ms: 12340, date: '2026-11-04' }]);
    expect(parseRows([row], 'random')).toEqual([]);
  });
  it('returns nothing for a body that is not a list, and at most ten rows', () => {
    for (const bad of [null, undefined, {}, 'oops', 4, { message: 'no' }]) expect(parseRows(bad, 'l1')).toEqual([]);
    expect(parseRows(Array.from({ length: 30 }, () => row), 'l1')).toHaveLength(10);
  });
  it('knows no board it was not asked for', () => {
    expect(parseRows([row], 'l21')).toEqual([]);
  });
});

describe('fetchGlobal', () => {
  it('sends the key and returns parsed rows', async () => {
    const f = ok([{ initials: 'ZED', seconds: 9.5, created_at: '2026-01-02T00:00:00Z' }]);
    expect(await fetchGlobal('l1', f)).toEqual([{ name: 'ZED', ms: 9500, date: '2026-01-02' }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(boardUrl('l1'));
    expect((init.headers as Record<string, string>).apikey).toBe(GLOBAL_KEY);
  });
  it('gives null (offline) for a 500, a throw, a bad body and a timeout', async () => {
    expect(await fetchGlobal('l1', ok({ message: 'boom' }, 500))).toBeNull();
    expect(await fetchGlobal('l1', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))).toBeNull();
    expect(await fetchGlobal('l1', vi.fn(async () => new Response('<html>', { status: 200 })))).toBeNull();
    expect(await fetchGlobal('l1', hang() as never, 20)).toBeNull();
  });
  it('does not ask at all for a board it does not know', async () => {
    const f = ok([]);
    expect(await fetchGlobal('l21', f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('submitGlobal', () => {
  it('posts the JSON with the key and a minimal return', async () => {
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await submitGlobal('random-hard', 'ABC', 41234, f)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GLOBAL_BASE);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ apikey: GLOBAL_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' });
    expect(JSON.parse(init.body as string)).toEqual({ level: 'random-hard', initials: 'ABC', seconds: 41.23 });
  });
  it('sends nothing for an invalid score', async () => {
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await submitGlobal('l1', 'ab', 5000, f)).toBe(false);
    expect(await submitGlobal('l1', 'ABC', 0, f)).toBe(false);
    expect(await submitGlobal('t1', 'ABC', 5000, f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('never throws on a 500, a throw or a timeout', async () => {
    expect(await submitGlobal('l1', 'ABC', 5000, ok({}, 500))).toBe(false);
    expect(await submitGlobal('l1', 'ABC', 5000, vi.fn(async () => Promise.reject(new Error('x'))))).toBe(false);
    expect(await submitGlobal('l1', 'ABC', 5000, hang() as never, 20)).toBe(false);
  });
});
