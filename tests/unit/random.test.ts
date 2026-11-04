import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/levels';
import { inComfortZone, interactables } from '../../src/seat';
import { valid } from '../../src/tinker';
import { parFor } from '../../src/timer';
import { encodeSeed, decodeSeed } from '../../src/seed';
import { CAMPAIGN, DIFFICULTIES, DIFFICULTY_LEVEL, clampLevel, difficultyOf, freshSeed, kindOfDifficulty, levelOfKind, packSeed, puzzleFor, randomLevel, targetScore, unpackSeed } from '../../src/random';
import { tinkerLevel } from '../../src/tinker';

const SEEDS = Array.from({ length: 50 }, (_, i) => (i + 1) * 7919);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const layoutOf = (l: ReturnType<typeof randomLevel>) => JSON.stringify([l.axles, l.fixed, l.tray, l.target]);

/** One batch per level number, built once: 20 levels x 50 seeds. */
const batch = Array.from({ length: CAMPAIGN }, (_, i) => SEEDS.map((s) => randomLevel(i + 1, s)));

describe('the generated campaign', () => {
  it('every level of every seed passes the level rules, valid() and the XR comfort cone, within the part budget', () => {
    batch.forEach((levels, i) => {
      for (const l of levels) {
        expect(() => parseLevel(l), `l${i + 1} ${l.id}`).not.toThrow();
        expect(valid(l), `l${i + 1} ${l.id} valid`).toBe(true);
        expect(interactables(l).every(inComfortZone), `l${i + 1} ${l.id} comfort`).toBe(true);
        // The render budget (src/budget.ts: ~100 calls, ~60k triangles) holds at 47-52 calls for 8 gears; 12 gears is the ceiling.
        expect(l.fixed.length + l.tray.length, `l${i + 1} ${l.id} gears`).toBeLessThanOrEqual(12);
      }
    });
  });

  it('the mean measured difficulty rises strictly with the level number', () => {
    const means = batch.map((levels) => mean(levels.map(difficultyOf)));
    means.forEach((m, i) => i && expect(m, `l${i + 1} over l${i}`).toBeGreaterThan(means[i - 1]!));
  });

  it('every l1-l5 sample is easier than the l10 mean', () => {
    const l10 = mean(batch[9]!.map(difficultyOf));
    for (let i = 0; i < 5; i++) for (const l of batch[i]!) expect(difficultyOf(l), `l${i + 1}`).toBeLessThan(l10);
  });

  it('is easier at l1 than at l20 on average, and each level lands near its target score', () => {
    for (let n = 1; n <= CAMPAIGN; n++) expect(Math.abs(mean(batch[n - 1]!.map(difficultyOf)) - targetScore(n)), `l${n}`).toBeLessThan(3);
  });

  it('par never drops as the level number rises (on the mean of the samples)', () => {
    const pars = batch.map((levels) => mean(levels.map(parFor)));
    pars.forEach((p, i) => i && expect(p, `l${i + 1} par`).toBeGreaterThanOrEqual(pars[i - 1]!));
  });

  it('the same (level, seed) is the same level; two seeds give different layouts', () => {
    for (const n of [1, 5, 10, 20]) {
      expect(layoutOf(randomLevel(n, 4242))).toBe(layoutOf(randomLevel(n, 4242)));
      const layouts = new Set(SEEDS.map((s) => layoutOf(randomLevel(n, s))));
      expect(layouts.size, `l${n}`).toBeGreaterThan(40);
    }
  });

  it('pulls a level number in range', () => {
    expect([clampLevel(0), clampLevel(21), clampLevel(NaN), clampLevel(3.4)]).toEqual([1, 20, 1, 3]);
    expect(randomLevel(99, 5).id).toBe('t5');
  });
});

describe('seeds', () => {
  it('pack the kind in the top 5 bits and 27 bits below; plain tinker seeds stay plain', () => {
    for (const kind of [1, 7, 20, 21, 24]) {
      const seed = packSeed(kind, 123456);
      expect(unpackSeed(seed)).toEqual({ kind, low: 123456 });
      expect(decodeSeed(encodeSeed(seed))).toBe(seed);
    }
    expect(unpackSeed(20261104)).toMatchObject({ kind: 0 }); // a daily seed
    expect(unpackSeed(freshSeed(20, () => 0.999999)).kind).toBe(20);
  });

  it('a code reopens the exact puzzle it came from', () => {
    for (const kind of [1, 9, 20]) {
      const seed = freshSeed(kind, () => 0.37);
      const a = randomLevel(levelOfKind(kind), seed);
      const b = puzzleFor(decodeSeed(encodeSeed(seed))!, tinkerLevel);
      expect(layoutOf(b)).toBe(layoutOf(a));
    }
    // A plain seed is the tinker puzzle it always was.
    expect(layoutOf(puzzleFor(20261104, tinkerLevel))).toBe(layoutOf(tinkerLevel(20261104)));
  });
});

describe('the Random level difficulty picker', () => {
  it('has Easy, Medium, Hard and Expert, climbing, each with its own seed kind and level', () => {
    expect([...DIFFICULTIES]).toEqual(['easy', 'medium', 'hard', 'expert']);
    const levels = DIFFICULTIES.map((d) => DIFFICULTY_LEVEL[d]);
    levels.forEach((n, i) => i && expect(n).toBeGreaterThan(levels[i - 1]!));
    expect(DIFFICULTIES.map(kindOfDifficulty)).toEqual([21, 22, 23, 24]);
    DIFFICULTIES.forEach((d) => expect(levelOfKind(kindOfDifficulty(d))).toBe(DIFFICULTY_LEVEL[d]));
  });

  it('each difficulty measures harder than the one below it', () => {
    const means = DIFFICULTIES.map((d) => mean(SEEDS.map((s) => difficultyOf(puzzleFor(packSeed(kindOfDifficulty(d), s), tinkerLevel)))));
    means.forEach((m, i) => i && expect(m).toBeGreaterThan(means[i - 1]!));
  });
});
