import { describe, expect, it, vi } from 'vitest';
import { addEntry, emptyScores, type Entry, type Scores } from '../../src/scores';
import { createOutbox } from '../../src/outbox';

const e = (ms: number, extra: Partial<Entry> = {}): Entry => ({ name: 'ABC', ms, date: '2026-11-04', ...extra });
const make = (s: Scores, post: (board: string, name: string, ms: number, cleared: number) => Promise<boolean>) => {
  const box = { s };
  const done = vi.fn();
  const outbox = createOutbox(() => box.s, (n) => void (box.s = n), post, done);
  return { box, outbox, done };
};
const withRows = (rows: [string, Entry][]) => rows.reduce((s, [b, x]) => addEntry(s, b, x), emptyScores());

describe('outbox', () => {
  it('posts an unposted entry with its levels, then marks it posted and tells the board', async () => {
    const post = vi.fn(async () => true);
    const { box, outbox, done } = make(withRows([['campaign-hard', e(5000, { cleared: 7 })]]), post);
    await outbox.flush();
    expect(post).toHaveBeenCalledWith('campaign-hard', 'ABC', 5000, 7);
    expect(box.s.boards['campaign-hard']![0]!.posted).toBe(true);
    expect(done).toHaveBeenCalledWith('campaign-hard');
  });
  it('retries after a failure, and posts once after success', async () => {
    const post = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { box, outbox } = make(withRows([['campaign-easy', e(5000)]]), post);
    await outbox.flush();
    expect(box.s.boards['campaign-easy']![0]!.posted).toBeUndefined();
    await outbox.flush();
    expect(box.s.boards['campaign-easy']![0]!.posted).toBe(true);
    await outbox.flush();
    await outbox.flush();
    expect(post).toHaveBeenCalledTimes(2);
  });
  it('backfills old flagless entries once, a finished one with 20', async () => {
    const post = vi.fn(async () => true);
    const { outbox } = make(withRows([['campaign-easy', e(5000)], ['campaign-medium', e(6000, { cleared: 3 })]]), post);
    await outbox.flush();
    await outbox.flush();
    expect(post.mock.calls).toEqual([['campaign-easy', 'ABC', 5000, 20], ['campaign-medium', 'ABC', 6000, 3]]);
  });
  it('never posts a dev entry, or one already posted', async () => {
    const post = vi.fn(async () => true);
    const { outbox } = make(withRows([['campaign-easy', e(5000, { dev: true })], ['campaign-easy', e(6000, { posted: true })]]), post);
    await outbox.flush();
    expect(post).not.toHaveBeenCalled();
  });
  it('does not run two passes at once: a second flush while one is in flight posts nothing twice', async () => {
    let release!: (v: boolean) => void;
    const post = vi.fn(() => new Promise<boolean>((r) => (release = r)));
    const { box, outbox } = make(withRows([['campaign-easy', e(5000)]]), post);
    const a = outbox.flush();
    const b = outbox.flush();
    release(true);
    await Promise.all([a, b]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(box.s.boards['campaign-easy']![0]!.posted).toBe(true);
  });
  it('picks up an entry saved while a pass was in flight', async () => {
    const waits: ((v: boolean) => void)[] = [];
    const post = vi.fn(() => new Promise<boolean>((r) => waits.push(r)));
    const { box, outbox } = make(withRows([['campaign-easy', e(5000)]]), post);
    const a = outbox.flush();
    box.s = addEntry(box.s, 'campaign-easy', e(4000, { name: 'NEW' }));
    const b = outbox.flush();
    waits[0]!(true);
    await vi.waitFor(() => expect(waits).toHaveLength(2));
    waits[1]!(true);
    await Promise.all([a, b]);
    expect(post.mock.calls.map((c) => (c as unknown[])[2]).sort()).toEqual([4000, 5000]);
    expect(box.s.boards['campaign-easy']!.every((x) => x.posted)).toBe(true);
  });
  it('stops a pass at the first failure and never throws', async () => {
    const post = vi.fn(async () => { throw new Error('boom'); });
    const { outbox } = make(withRows([['campaign-easy', e(5000)], ['campaign-easy', e(6000)]]), post);
    await expect(outbox.flush()).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
