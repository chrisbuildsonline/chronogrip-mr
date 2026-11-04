import { describe, expect, it } from 'vitest';
import { checkLevel, parseLevel } from '../../src/levels';
import { decodeSeed, encodeSeed } from '../../src/seed';
import { dailySeed, tinkerLevel, valid } from '../../src/tinker';
import { parFor } from '../../src/timer';
import { occupiedAt, pickGear, snapAxle } from '../../src/grab';
import { layerLift, partsStrip } from '../../src/seat';
import { MAX_STEP, START, adapt, clampStep, freshSeed, loadRandom, packSeed, puzzleFor, randomLevel, saveRandom, unpackSeed } from '../../src/random';

const steps = Array.from({ length: MAX_STEP }, (_, i) => i + 1);
const seeds = Array.from({ length: 50 }, (_, i) => packSeed(1, i * 7919 + 13));
const decoysOf = (l: ReturnType<typeof randomLevel>) => l.tray.filter((g) => !(g.id in l.solution)).length;
const compoundsOf = (l: ReturnType<typeof randomLevel>) => {
  const per = new Map<string, number>();
  for (const a of Object.values(l.solution)) per.set(a, (per.get(a) ?? 0) + 1);
  return [...per.values()].filter((n) => n > 1).length;
};

describe('randomLevel', () => {
  it('every puzzle for every step and 50 seeds is valid and solves with its own solution', () => {
    for (const step of steps) {
      for (const low of seeds) {
        const level = randomLevel(step, low);
        const why = `step ${step} seed ${low}`;
        expect(() => parseLevel(level), why).not.toThrow();
        expect(valid(level), why).toBe(true);
        expect(checkLevel(level, level.solution).solved, why).toBe(true);
        expect(checkLevel(level, {}).solved, why).toBe(false);
        expect(Object.values(checkLevel(level, level.solution).spins), why).not.toContain('jammed');
      }
    }
  });

  it('can be played by hand: every part is the nearest to its own slot, and the solution drops onto its axles one by one', () => {
    for (const step of steps) {
      for (const low of seeds.slice(0, 20)) {
        const level = randomLevel(step, low);
        const why = `step ${step} seed ${low}`;
        const slots = partsStrip(level);
        const parts = slots.map((s) => ({ id: s.id, x: s.x, y: s.y, lift: layerLift(0) }));
        for (const s of slots) expect(pickGear([s.x, s.y, layerLift(0)], parts), `${why} ${s.id}`).toBe(s.id);
        const placed: Record<string, string> = {};
        for (const [id, axle] of Object.entries(level.solution)) {
          const at = level.axles.find((a) => a.id === axle)!;
          const layer = level.tray.find((t) => t.id === id)!.layer;
          expect(snapAxle([at.x, at.y], level.axles, occupiedAt(level, placed, id), layer), `${why} ${id}`).toBe(axle);
          placed[id] = axle;
        }
      }
    }
  });

  it('gives each step the recipe it names: step 1 is one idler, at most one decoy and no compound pair', () => {
    for (const low of seeds) {
      const l = randomLevel(1, low);
      expect(Object.keys(l.solution)).toHaveLength(1);
      expect(decoysOf(l)).toBeLessThanOrEqual(1);
      expect(compoundsOf(l)).toBe(0);
    }
    const hardest = randomLevel(MAX_STEP, 5);
    expect(Object.keys(hardest.solution).length).toBeGreaterThanOrEqual(5);
    expect(compoundsOf(hardest)).toBe(3);
  });

  it('is never easier at a higher step: par does not drop from one step to the next, for any seed', () => {
    for (const low of seeds) {
      let last = 0;
      for (const step of steps) {
        const par = parFor(randomLevel(step, low));
        expect(par, `seed ${low} step ${step}`).toBeGreaterThanOrEqual(last);
        last = par;
      }
    }
  });

  it('gets harder overall: the last step has a longer par than the first', () => {
    expect(parFor(randomLevel(MAX_STEP, 9))).toBeGreaterThan(parFor(randomLevel(1, 9)));
  });

  it('stays at the cap past it, and pulls odd steps in', () => {
    expect(randomLevel(MAX_STEP + 5, 77)).toEqual(randomLevel(MAX_STEP, 77));
    expect(randomLevel(0, 77)).toEqual(randomLevel(1, 77));
    expect(randomLevel(NaN, 77)).toEqual(randomLevel(1, 77));
    expect([clampStep(-3), clampStep(2.4), clampStep(99)]).toEqual([1, 2, MAX_STEP]);
  });

  it('is deterministic: the same step and seed give the same level', () => {
    for (const step of [1, 5, MAX_STEP]) expect(randomLevel(step, 123456)).toEqual(randomLevel(step, 123456));
    expect(randomLevel(4, 1)).not.toEqual(randomLevel(4, 2));
  });

  it('names the level after its seed, so the puzzle code is the seed', () => {
    const seed = packSeed(3, 4242);
    expect(randomLevel(3, seed).id).toBe(`t${seed}`);
  });
});

describe('seed packing', () => {
  it('puts the step in the top 4 bits and keeps 28 low bits', () => {
    expect(packSeed(1, 5)).toBe(2 ** 28 + 5);
    expect(packSeed(12, 0xfffffff)).toBe(12 * 2 ** 28 + 0xfffffff);
    expect(unpackSeed(packSeed(9, 123456789))).toEqual({ step: 9, low: 123456789 });
  });

  it('round trips every step through the code and back', () => {
    for (const step of steps) {
      for (const low of [0, 1, 20261104, 2 ** 28 - 1, 123456789]) {
        const seed = packSeed(step, low);
        expect(Number.isInteger(seed) && seed >= 0 && seed <= 2 ** 32 - 1).toBe(true);
        expect(unpackSeed(seed)).toEqual({ step, low });
        const code = encodeSeed(seed);
        expect(decodeSeed(code)).toBe(seed);
        expect(puzzleFor(decodeSeed(code)!, tinkerLevel)).toEqual(randomLevel(step, seed));
      }
    }
  });

  it('a seed with top bits 0 is still the plain tinker puzzle: old dailies and shared codes are unchanged', () => {
    for (const seed of [dailySeed(new Date(2026, 10, 4)), 424242, 1, 0, 2 ** 28 - 1]) {
      expect(unpackSeed(seed).step).toBe(0);
      expect(puzzleFor(seed, tinkerLevel)).toEqual(tinkerLevel(seed));
      expect(puzzleFor(decodeSeed(encodeSeed(seed))!, tinkerLevel).id).toBe(`t${seed}`);
    }
  });

  it('a fresh seed carries its step and spreads over the low bits', () => {
    expect(unpackSeed(freshSeed(4, () => 0)).step).toBe(4);
    expect(unpackSeed(freshSeed(4, () => 0.999999)).low).toBeGreaterThan(2 ** 27);
    expect(unpackSeed(freshSeed(99)).step).toBe(MAX_STEP);
  });
});

describe('adapt', () => {
  const at = (step: number, slow = false) => ({ step, slow });
  const PAR = 120;
  it.each([
    ['well under par (half) jumps two', at(3), 60, at(5)],
    ['just inside half still jumps two', at(3), 1, at(5)],
    ['just over half but under par is one up', at(3), 61, at(4)],
    ['exactly par is a pass: one up', at(3), 120, at(4)],
    ['a pass clears the slow mark', at(3, true), 100, at(4)],
    ['a fast solve clears the slow mark', at(3, true), 10, at(5)],
    ['over par holds and marks it slow', at(3), 121, at(3, true)],
    ['over par twice in a row eases one step', at(3, true), 200, at(2)],
    ['easing never goes below step 1', at(1, true), 200, at(1)],
    ['over par at step 1 once just holds', at(1), 200, at(1, true)],
    ['a jump stops at the cap', at(MAX_STEP - 1), 10, at(MAX_STEP)],
    ['a pass at the cap stays', at(MAX_STEP), 100, at(MAX_STEP)],
    ['no timer: one up', at(3), null, at(4)],
    ['no timer clears the slow mark', at(3, true), null, at(4)],
    ['no timer stops at the cap', at(MAX_STEP), null, at(MAX_STEP)],
  ])('%s', (_, from, seconds, to) => {
    expect(adapt(from, seconds, PAR)).toEqual(to);
  });
});

describe('saved run', () => {
  const store = (raw: string | null) => ({ getItem: () => raw });
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('starts at step 1 with nothing saved', () => {
    expect(loadRandom(store(null))).toEqual(START);
    expect(loadRandom(null)).toEqual(START);
    expect(loadRandom(undefined)).toEqual(START);
  });

  it('saves and reads back under one versioned key', () => {
    const s = mem();
    saveRandom(s, { step: 6, slow: true });
    expect([...s.m.keys()]).toEqual(['chronogrip.random.v1']);
    expect(loadRandom(s)).toEqual({ step: 6, slow: true });
  });

  it('corrupt, odd or out-of-range storage reads as the start and never throws', () => {
    for (const raw of ['', '{', 'null', '[]', '"x"', '7', '{}', '{"step":0}', `{"step":${MAX_STEP + 1}}`, '{"step":2.5}', '{"step":"3"}', '{"step":null}', '{"step":-1}']) {
      expect(loadRandom(store(raw)), raw).toEqual(START);
    }
    expect(loadRandom({ getItem: () => { throw new Error('blocked'); } })).toEqual(START);
    expect(loadRandom(store('{"step":4,"slow":"yes"}'))).toEqual({ step: 4, slow: false });
  });

  it('a blocked store does not throw on save', () => {
    expect(() => saveRandom({ setItem: () => { throw new Error('quota'); } }, START)).not.toThrow();
    expect(() => saveRandom(null, START)).not.toThrow();
  });
});
