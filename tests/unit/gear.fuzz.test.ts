import { describe, expect, it } from 'vitest';
import { checkGeometry, checkProfile, type GearCase } from './gear-helpers';

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

const SEED = 20260925;
const CASES = 250;

describe(`gear fuzz (seed ${SEED}, ${CASES} cases)`, () => {
  it('every random gear is a valid, closed, symmetric, non-self-intersecting outline', () => {
    const rand = mulberry32(SEED);
    for (let n = 0; n < CASES; n++) {
      const c: GearCase = {
        module: 0.002 + rand() * 0.018,
        teeth: 6 + Math.floor(rand() * 75),
        pressureAngle: 14.5 + rand() * 10.5,
      };
      const errors = checkProfile(c);
      expect(errors, `seed ${SEED}, case ${n}: ${JSON.stringify(c)}`).toEqual([]);
    }
  }, 60_000);

  it('every random gear extrudes to a clean mesh with an axle hole', () => {
    const rand = mulberry32(SEED + 1);
    for (let n = 0; n < CASES; n++) {
      const c: GearCase = {
        module: 0.002 + rand() * 0.018,
        teeth: 6 + Math.floor(rand() * 75),
        pressureAngle: 14.5 + rand() * 10.5,
      };
      const root = (c.module * c.teeth) / 2 - 1.25 * c.module;
      const holeRadius = root * (0.1 + rand() * 0.6);
      const thickness = c.module * (1 + rand() * 4);
      const errors = checkGeometry(c, thickness, holeRadius);
      expect(errors, `seed ${SEED + 1}, case ${n}: ${JSON.stringify({ ...c, thickness, holeRadius })}`).toEqual([]);
    }
  });
});
