import { describe, expect, it } from 'vitest';
import { LEVELS, checkLevel, parseLevel } from '../../src/levels';

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

const SEEDS = [20261025, 77031];
const CASES = 400;

type Rand = () => number;
const pick = <T>(a: readonly T[], rand: Rand): T => a[Math.floor(rand() * a.length)]!;

const NUMBERS = [0, -1, 1, 0.5, 5, 6, 80, 81, 1e308, -1e308, 1e-9, 0.001, 0.02, 0.021, 31, 2 ** 53, 123456.789];
const STRINGS = ['', 'x', 'a0', 'drv', 'tgt', 't1', 'ghost', '__proto__', 'constructor', 'x'.repeat(65), 'x'.repeat(100), '🙂'];

function json(rand: Rand, depth = 0): unknown {
  const k = Math.floor(rand() * (depth > 3 ? 5 : 7));
  switch (k) {
    case 0: return null;
    case 1: return rand() < 0.5;
    case 2: return rand() < 0.5 ? pick(NUMBERS, rand) : (rand() - 0.5) * 1000;
    case 3:
    case 4: return pick(STRINGS, rand);
    case 5: return Array.from({ length: Math.floor(rand() * 4) }, () => json(rand, depth + 1));
    default: {
      const o: Record<string, unknown> = {};
      for (let i = Math.floor(rand() * 4); i > 0; i--) {
        Object.defineProperty(o, pick(['id', 'x', 'teeth', 'layer', 'gear', '__proto__', 'k'], rand), {
          value: json(rand, depth + 1), enumerable: true, writable: true, configurable: true,
        });
      }
      return o;
    }
  }
}

function nest(rand: Rand): unknown {
  let v: unknown = pick([null, 1, 'x'], rand);
  for (let i = 50 + Math.floor(rand() * 400); i > 0; i--) v = rand() < 0.5 ? [v] : { [pick(['id', 'axles', 'fixed', 'x'], rand)]: v };
  return v;
}

/** Every [parent, key] slot in the tree, so one can be picked at random. */
function slots(v: unknown, out: [any, string | number][] = []): [any, string | number][] {
  if (Array.isArray(v)) v.forEach((c, i) => { out.push([v, i]); slots(c, out); });
  else if (typeof v === 'object' && v !== null) {
    for (const [k, c] of Object.entries(v)) { out.push([v, k]); slots(c, out); }
  }
  return out;
}

function mutate(rand: Rand): unknown {
  const level = JSON.parse(JSON.stringify(pick(LEVELS, rand)));
  for (let n = 1 + Math.floor(rand() * 3); n > 0; n--) {
    const all = slots(level);
    const [parent, key] = pick(all, rand);
    const op = Math.floor(rand() * 5);
    if (op === 0) {
      if (Array.isArray(parent)) parent.splice(key as number, 1);
      else delete parent[key];
    } else if (op === 1) parent[key] = json(rand);
    else if (op === 2) parent[key] = pick(NUMBERS, rand);
    else if (op === 3) parent[key] = pick(STRINGS, rand);
    else parent[key] = nest(rand);
  }
  return level;
}

function holds(input: unknown, why: string) {
  let level;
  try {
    level = parseLevel(input);
  } catch (err) {
    expect(err, why).toBeInstanceOf(Error);
    expect((err as Error).constructor, why).toBe(Error);
    expect((err as Error).message.startsWith('level'), `${why}: ${(err as Error).message}`).toBe(true);
    return false;
  }
  expect(() => checkLevel(level, level.solution), why).not.toThrow();
  return true;
}

describe('levels fuzz', () => {
  it('has levels to mutate', () => {
    expect(LEVELS).toHaveLength(5);
  });

  for (const seed of SEEDS) {
    it(`mutated levels parse or throw a clear Error (seed ${seed}, ${CASES} cases)`, () => {
      const rand = mulberry32(seed);
      let accepted = 0;
      for (let n = 0; n < CASES; n++) {
        const input = mutate(rand);
        if (holds(input, `seed ${seed}, case ${n}: ${JSON.stringify(input).slice(0, 400)}`)) accepted++;
      }
      expect(accepted).toBeGreaterThan(0);
      expect(accepted).toBeLessThan(CASES);
    });

    it(`arbitrary JSON parses or throws a clear Error (seed ${seed}, ${CASES} cases)`, () => {
      const rand = mulberry32(seed + 1);
      for (let n = 0; n < CASES; n++) {
        const input = rand() < 0.1 ? nest(rand) : json(rand);
        holds(input, `seed ${seed + 1}, case ${n}: ${JSON.stringify(input)?.slice(0, 400)}`);
      }
    });
  }
});
