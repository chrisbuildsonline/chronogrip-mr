import { describe, expect, it } from 'vitest';
import { solveTrain, type Axle, type PlacedGear, type TrainInput } from '../../src/train';

/** Small seeded PRNG so a failing case reproduces from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20261025;
const CASES = 300;

/**
 * A straight chain along one random direction. Each step either meshes the next gear on a new axle
 * at the exact mesh distance, or (compound) puts it on the same axle one layer up, after which the
 * chain continues by meshing on that layer. Gears only move forward, and every gear in the middle of
 * the chain has at least 8 teeth, so non-adjacent gears on one layer never overlap.
 */
function chain(rand: () => number) {
  const m = 0.002 + rand() * 0.018;
  const angle = rand() * 2 * Math.PI;
  const n = 2 + Math.floor(rand() * 9);
  const axles: Axle[] = [{ id: 'a0', x: 0, y: 0 }];
  const gears: PlacedGear[] = [{ id: 'g0', axle: 'a0', teeth: 8 + Math.floor(rand() * 53), layer: 0 }];
  let along = 0;
  let expected = 1;
  let prevCompound = false;
  for (let i = 1; i < n; i++) {
    const prev = gears[i - 1]!;
    const teeth = 8 + Math.floor(rand() * 53);
    // never two compound steps in a row: the previous gear must have meshed to something first
    if (!prevCompound && rand() < 0.3) {
      gears.push({ id: `g${i}`, axle: prev.axle, teeth, layer: prev.layer + 1 });
      prevCompound = true;
    } else {
      along += (m * (prev.teeth + teeth)) / 2;
      const axle = { id: `a${i}`, x: along * Math.cos(angle), y: along * Math.sin(angle) };
      axles.push(axle);
      gears.push({ id: `g${i}`, axle: axle.id, teeth, layer: prev.layer });
      expected *= -prev.teeth / teeth;
      prevCompound = false;
    }
  }
  const rpm = (rand() < 0.5 ? -1 : 1) * (1 + rand() * 200);
  const input: TrainInput = { module: m, axles, gears, driver: 'g0', rpm };
  return { input, last: gears[n - 1]!.id, expected: rpm * expected };
}

function shuffle<T>(a: T[], rand: () => number): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

describe(`train fuzz (seed ${SEED}, ${CASES} chains)`, () => {
  it('end rpm matches the product of ratios, nothing is NaN or jammed', () => {
    const rand = mulberry32(SEED);
    for (let n = 0; n < CASES; n++) {
      const { input, last, expected } = chain(rand);
      const r = solveTrain(input);
      const why = `seed ${SEED}, case ${n}: ${JSON.stringify(input)}`;
      for (const v of Object.values(r)) {
        expect(v, why).not.toBe('jammed');
        expect(Number.isNaN(v), why).toBe(false);
      }
      const got = r[last] as number;
      expect(Math.abs(got - expected), why).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(expected), 1e-300));
    }
  });

  it('shuffling gear and axle order gives identical results', () => {
    const rand = mulberry32(SEED + 1);
    for (let n = 0; n < CASES; n++) {
      const { input } = chain(rand);
      const a = solveTrain(input);
      const b = solveTrain({ ...input, gears: shuffle(input.gears, rand), axles: shuffle(input.axles, rand) });
      const why = `seed ${SEED + 1}, case ${n}: ${JSON.stringify(input)}`;
      expect(b, why).toEqual(a);
    }
  });
});
