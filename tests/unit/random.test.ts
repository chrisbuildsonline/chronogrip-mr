import { describe, expect, it } from 'vitest';
import { valid } from '../../src/tinker';
import { encodeSeed, decodeSeed } from '../../src/seed';
import { CAMPAIGN, DIFFICULTIES, difficultyOf, freshSeed, packSeed, puzzleFor, randomLevel, unpackSeed } from '../../src/random';
import { KIND_MAX, RANDOM_PICK, dOf, dOfKind, kindOf, scoreAt, stageLevelOfKind } from '../../src/stages';
import { tinkerLevel } from '../../src/tinker';

const SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const layoutOf = (l: ReturnType<typeof randomLevel>) => JSON.stringify([l.axles, l.fixed, l.tray, l.target]);

describe('the generator on the global scale', () => {
  it('the same (difficulty, seed) is the same level; two seeds give different layouts', () => {
    for (const d of [0, 0.4, 0.8, 1]) {
      expect(layoutOf(randomLevel(d, 4242))).toBe(layoutOf(randomLevel(d, 4242)));
      expect(new Set(SEEDS.map((s) => layoutOf(randomLevel(d, s)))).size, `d ${d}`).toBeGreaterThan(15);
    }
  }, 120_000);

  it('pulls a difficulty into 0..1, and always returns a valid level', () => {
    expect(randomLevel(99, 5).id).toBe('t5');
    expect(randomLevel(NaN, 5).id).toBe('t5');
    for (const d of [-1, 0, 0.5, 1, 7]) expect(valid(randomLevel(d, 31337)), `d ${d}`).toBe(true);
  }, 120_000);

  it('measures harder the higher the difficulty, and the top end beats everything the old campaign reached', () => {
    const at = (d: number) => mean(SEEDS.map((s) => difficultyOf(randomLevel(d, s))));
    const ds = [0, 0.25, 0.5, 0.75, 1];
    const ms = ds.map(at);
    ms.forEach((m, i) => i && expect(m, `d ${ds[i]}`).toBeGreaterThan(ms[i - 1]!));
    expect(ms[4]!, 'the old campaign stopped at a score of 25').toBeGreaterThan(30);
  }, 120_000);

  it('the top end uses the extra knobs: forced direction flips, tight windows, near-miss decoys, compounds', () => {
    const top = SEEDS.map((s) => randomLevel(1, s));
    const flips = top.filter((l) => Math.sign(l.target.rpm) !== Math.sign(l.rpm)).length;
    expect(flips, 'most turn against the driver').toBeGreaterThan(top.length * 0.6);
    expect(top.every((l) => l.target.tolerance <= 0.5)).toBe(true);
    expect(mean(top.map((l) => l.tray.length - Object.keys(l.solution).length))).toBeGreaterThanOrEqual(1);
    expect(top.some((l) => new Set(Object.values(l.solution)).size < Object.keys(l.solution).length), 'a compound pair').toBe(true);
  }, 120_000);
});

describe('seeds', () => {
  it('pack the stage level in the top 6 bits and 26 bits below; plain tinker seeds stay plain', () => {
    for (const kind of [1, 7, 20, 21, 40, 60]) {
      const seed = packSeed(kind, 123456);
      expect(unpackSeed(seed)).toEqual({ kind, low: 123456 });
      expect(decodeSeed(encodeSeed(seed))).toBe(seed);
    }
    expect(unpackSeed(20261104)).toMatchObject({ kind: 0 }); // a daily seed
    expect(unpackSeed(freshSeed(KIND_MAX, () => 0.999999)).kind).toBe(KIND_MAX);
  });

  it('a code reopens the exact puzzle it came from', () => {
    for (const kind of [1, 29, 45, 60]) {
      const seed = freshSeed(kind, () => 0.37);
      const a = randomLevel(dOfKind(kind), seed);
      const b = puzzleFor(decodeSeed(encodeSeed(seed))!, tinkerLevel);
      expect(layoutOf(b)).toBe(layoutOf(a));
    }
    // A plain seed is the tinker puzzle it always was.
    expect(layoutOf(puzzleFor(20261104, tinkerLevel))).toBe(layoutOf(tinkerLevel(20261104)));
  });

  it('a kind names a stage level and back', () => {
    expect(stageLevelOfKind(kindOf('easy', 1))).toEqual({ stage: 'easy', level: 1 });
    expect(stageLevelOfKind(kindOf('medium', 7))).toEqual({ stage: 'medium', level: 7 });
    expect(stageLevelOfKind(kindOf('hard', CAMPAIGN))).toEqual({ stage: 'hard', level: CAMPAIGN });
    expect(KIND_MAX).toBe(60);
  });
});

describe('the Random level difficulty picker', () => {
  it('has Easy, Medium, Hard and Expert, reusing the stage table, each harder than the one below', () => {
    expect([...DIFFICULTIES]).toEqual(['easy', 'medium', 'hard', 'expert']);
    const ds = DIFFICULTIES.map((d) => dOf(RANDOM_PICK[d].stage, RANDOM_PICK[d].level));
    ds.forEach((d, i) => i && expect(d).toBeGreaterThan(ds[i - 1]!));
    const means = DIFFICULTIES.map((d) => mean(SEEDS.map((s) => difficultyOf(randomLevel(dOf(RANDOM_PICK[d].stage, RANDOM_PICK[d].level), s)))));
    means.forEach((m, i) => i && expect(m).toBeGreaterThan(means[i - 1]!));
    expect(scoreAt(0)).toBeLessThan(scoreAt(1));
  }, 120_000);
});
