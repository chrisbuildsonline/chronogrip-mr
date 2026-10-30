import { describe, expect, it } from 'vitest';
import { loadProgress, recordSolve, saveProgress } from '../../src/progress';

const KEY = 'chronogrip.progress.v1';
const store = (raw: string | null) => ({ getItem: (k: string) => (k === KEY ? raw : null) });

describe('loadProgress', () => {
  it('round trips through saveProgress', () => {
    const data: Record<string, string> = {};
    saveProgress({ setItem: (k, v) => void (data[k] = v) }, { best: { l1: 12.5, t20260101: 40 } });
    expect(loadProgress({ getItem: (k) => data[k] ?? null })).toEqual({ best: { l1: 12.5, t20260101: 40 } });
  });

  it('is empty without storage or without the key', () => {
    expect(loadProgress(null)).toEqual({ best: {} });
    expect(loadProgress(undefined)).toEqual({ best: {} });
    expect(loadProgress(store(null))).toEqual({ best: {} });
  });

  for (const [name, raw] of [
    ['garbage', 'not json{'],
    ['null', 'null'],
    ['an array', '[1,2]'],
    ['a string best', '{"best":"x"}'],
    ['an array best', '{"best":[3]}'],
    ['a number', '7'],
    ['no best', '{}'],
  ] as const) {
    it(`is empty for ${name}`, () => expect(loadProgress(store(raw))).toEqual({ best: {} }));
  }

  it('keeps only the valid entries', () => {
    const raw = '{"best":{"l1":-3,"l2":"9","l3":12,"l4":0,"5bad":4,"a b":4,"l6":null}}';
    expect(loadProgress(store(raw))).toEqual({ best: { l3: 12 } });
  });

  it('drops non-finite numbers', () => {
    expect(loadProgress(store('{"best":{"l1":1e999,"l2":2}}'))).toEqual({ best: { l2: 2 } });
  });

  it('survives storage that throws', () => {
    const boom = { getItem: () => { throw new Error('SecurityError'); } };
    expect(loadProgress(boom)).toEqual({ best: {} });
  });

  it('does not leak a __proto__ key', () => {
    const p = loadProgress(store('{"best":{"__proto__":5,"constructor":6,"l1":7},"__proto__":{"polluted":1}}'));
    expect(p).toEqual({ best: { l1: 7 } });
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(p.best)).toBe(Object.prototype);
    expect(Object.hasOwn(p.best, '__proto__')).toBe(false);
  });
});

describe('recordSolve', () => {
  it('stores a first solve as a new best', () => {
    const p = { best: {} };
    const r = recordSolve(p, 'l1', 30);
    expect(r).toEqual({ progress: { best: { l1: 30 } }, newBest: true });
    expect(p).toEqual({ best: {} });
  });

  it('keeps the minimum and flags newBest only when beaten', () => {
    let p = recordSolve({ best: {} }, 'l1', 30).progress;
    const slower = recordSolve(p, 'l1', 45);
    expect(slower).toEqual({ progress: { best: { l1: 30 } }, newBest: false });
    const same = recordSolve(p, 'l1', 30);
    expect(same.newBest).toBe(false);
    const faster = recordSolve(p, 'l1', 20);
    expect(faster).toEqual({ progress: { best: { l1: 20 } }, newBest: true });
    p = faster.progress;
    expect(p.best.l1).toBe(20);
  });

  it('leaves other levels alone', () => {
    expect(recordSolve({ best: { l1: 9 } }, 'l2', 5).progress).toEqual({ best: { l1: 9, l2: 5 } });
  });

  for (const bad of [0, -2, NaN, Infinity, -Infinity]) {
    it(`ignores ${bad} seconds`, () => {
      const p = { best: { l1: 9 } };
      const r = recordSolve(p, 'l1', bad);
      expect(r.progress).toBe(p);
      expect(r.newBest).toBe(false);
    });
  }
});

describe('saveProgress', () => {
  it('writes JSON under the versioned key', () => {
    let wrote: [string, string] | undefined;
    saveProgress({ setItem: (k, v) => void (wrote = [k, v]) }, { best: { l1: 3 } });
    expect(wrote).toEqual([KEY, '{"best":{"l1":3}}']);
  });

  it('swallows quota and security errors and absent storage', () => {
    const boom = { setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => saveProgress(boom, { best: {} })).not.toThrow();
    expect(() => saveProgress(null, { best: {} })).not.toThrow();
    expect(() => saveProgress(undefined, { best: {} })).not.toThrow();
  });
});
