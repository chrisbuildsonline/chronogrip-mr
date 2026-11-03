import { describe, expect, it } from 'vitest';
import { PROPS } from '../../src/clockwork';
import { gearRadii } from '../../src/gear';
import { LEVELS, checkLevel, parseLevel, type Level } from '../../src/levels';
import { PIN_RADIUS } from '../../src/seat';

const clone = (l: Level): any => JSON.parse(JSON.stringify(l));
const [L1, L2, L3, L4, L5, L6, L7, L8] = LEVELS as [Level, Level, Level, Level, Level, Level, Level, Level];

/**
 * The fewest tray gears that solve a level, up to `max`: every subset of the tray of that size, each gear on every axle
 * that has nothing on its layer yet (as the board allows). Returns the first solving placement found, or null.
 */
function solveWithin(level: Level, max: number): Record<string, string> | null {
  const taken = new Set(level.fixed.map((f) => `${f.axle}/${f.layer}`));
  const chosen: Record<string, string> = {};
  const search = (from: number, left: number): Record<string, string> | null => {
    if (Object.keys(chosen).length > 0 && checkLevel(level, chosen).solved) return { ...chosen };
    if (left === 0) return null;
    for (let i = from; i < level.tray.length; i++) {
      const gear = level.tray[i]!;
      for (const a of level.axles) {
        const key = `${a.id}/${gear.layer}`;
        if (taken.has(key)) continue;
        taken.add(key);
        chosen[gear.id] = a.id;
        const found = search(i + 1, left - 1);
        delete chosen[gear.id];
        taken.delete(key);
        if (found) return found;
      }
    }
    return null;
  };
  return search(0, max);
}

/** Whether every pair of gears on one layer in a placement is either far apart or exactly in mesh: no tooth collisions. */
function meshesCleanly(level: Level, placements: Record<string, string>): boolean {
  const at = new Map(level.axles.map((a) => [a.id, a]));
  const gears = [
    ...level.fixed,
    ...Object.entries(placements).map(([id, axle]) => ({ ...level.tray.find((t) => t.id === id)!, axle })),
  ];
  return gears.every((a) =>
    gears.every((b) => {
      if (a === b || a.layer !== b.layer || a.axle === b.axle) return a === b || a.layer !== b.layer;
      const d = Math.hypot(at.get(a.axle)!.x - at.get(b.axle)!.x, at.get(a.axle)!.y - at.get(b.axle)!.y);
      const meshAt = (level.module * (a.teeth + b.teeth)) / 2;
      const tips = gearRadii({ module: level.module, teeth: a.teeth }).tip + gearRadii({ module: level.module, teeth: b.teeth }).tip;
      return Math.abs(d - meshAt) < 1e-6 || d >= tips;
    }),
  );
}

describe('LEVELS', () => {
  it('has eight levels with unique ids, the first five unchanged so saved progress still matches', () => {
    expect(LEVELS).toHaveLength(8);
    expect(LEVELS.map((l) => l.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8']);
    expect(LEVELS.slice(0, 5).map((l) => l.name)).toEqual(['Mind the gap', 'Against the grain', 'Gearing up', 'Odd one out', 'Full movement']);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(8);
  });

  it('level 1 has exactly one tray gear', () => {
    expect(L1.tray).toHaveLength(1);
  });

  for (const level of LEVELS) {
    describe(`${level.id} ${level.name}`, () => {
      it('passes parseLevel and round-trips through JSON', () => {
        expect(parseLevel(JSON.parse(JSON.stringify(level)))).toEqual(level);
      });

      it('the intended solution solves it and nothing jams', () => {
        const r = checkLevel(level, level.solution);
        expect(r.solved).toBe(true);
        expect(Object.values(r.spins)).not.toContain('jammed');
      });

      it('an empty tray does not solve it', () => {
        expect(checkLevel(level, {}).solved).toBe(false);
      });

      it('every axle and every solved gear tip circle fits in the tray', () => {
        const pos = new Map(level.axles.map((a) => [a.id, a]));
        for (const a of level.axles) {
          expect(Math.abs(a.x), `axle ${a.id}`).toBeLessThanOrEqual(0.2);
          expect(Math.abs(a.y), `axle ${a.id}`).toBeLessThanOrEqual(0.15);
        }
        const placed = [
          ...level.fixed,
          ...Object.entries(level.solution).map(([id, axle]) => ({ id, axle, teeth: level.tray.find((t) => t.id === id)!.teeth })),
        ];
        for (const g of placed) {
          const { tip } = gearRadii({ module: level.module, teeth: g.teeth });
          const p = pos.get(g.axle)!;
          expect(Math.abs(p.x) + tip, `gear ${g.id}`).toBeLessThanOrEqual(0.2);
          expect(Math.abs(p.y) + tip, `gear ${g.id}`).toBeLessThanOrEqual(0.15);
        }
      });

      it('the module is hand sized', () => {
        expect(level.module).toBeGreaterThanOrEqual(0.003);
        expect(level.module).toBeLessThanOrEqual(0.005);
      });
    });
  }

  it('level 2: the big idler bridges in one step and turns the target the wrong way', () => {
    const r = checkLevel(L2, { big: 'mid' });
    expect(r.solved).toBe(false);
    expect(r.spins.tgt).toBeGreaterThan(0);
    expect(L2.target.rpm).toBeLessThan(0);
  });

  it('level 2: one idler on the way is not enough', () => {
    expect(checkLevel(L2, { i1: 'a1' }).solved).toBe(false);
  });

  it('level 3: a decoy instead of the compound pair misses the speed', () => {
    expect(checkLevel(L3, { x: 'b', y: 'b' }).solved).toBe(false);
    expect(checkLevel(L3, { p: 'b' }).solved).toBe(false);
  });

  it('level 4: the trap gear jams the train, with or without the solution', () => {
    const both = checkLevel(L4, { ...L4.solution, t2: 'tr' });
    expect(both.solved).toBe(false);
    expect(both.spins.tgt).toBe('jammed');
    const alone = checkLevel(L4, { t2: 'tr' });
    expect(alone.solved).toBe(false);
    expect(alone.spins.t2).toBe('jammed');
  });

  it('level 5: the trap gear jams, and dropping the idler flips the direction', () => {
    expect(checkLevel(L5, { ...L5.solution, x: 's' }).spins.tgt).toBe('jammed');
    expect(checkLevel(L5, { p: 'b', q: 'b' }).solved).toBe(false);
  });
});

describe('the deep levels (6-8)', () => {
  const deep = [L6, L7, L8];

  for (const level of deep) {
    describe(`${level.id} ${level.name}`, () => {
      it('needs at least four placements: no set of three or fewer tray gears on any free axles solves it', () => {
        expect(Object.keys(level.solution).length).toBeGreaterThanOrEqual(4);
        expect(solveWithin(level, 3)).toBeNull();
        expect(solveWithin(level, Object.keys(level.solution).length)).not.toBeNull(); // the search does find real solutions
      });

      it('keeps every placed gear clear of the dial, the balance wheel, the bird and the other pins', () => {
        const at = new Map(level.axles.map((a) => [a.id, a]));
        const placed = [
          ...level.fixed,
          ...Object.entries(level.solution).map(([id, axle]) => ({ id, axle, teeth: level.tray.find((t) => t.id === id)!.teeth })),
        ];
        for (const g of placed) {
          const { tip } = gearRadii({ module: level.module, teeth: g.teeth });
          const p = at.get(g.axle)!;
          for (const q of PROPS) expect(Math.hypot(q.x - p.x, q.y - p.y), `${g.id} vs prop at ${q.x}`).toBeGreaterThan(q.r + tip);
          for (const a of level.axles) {
            if (a.id !== g.axle) expect(Math.hypot(a.x - p.x, a.y - p.y), `${g.id} over pin ${a.id}`).toBeGreaterThan(tip + PIN_RADIUS);
          }
        }
      });

      it('has a tray gear left over: the solution never uses the whole tray', () => {
        expect(level.tray.length).toBeGreaterThan(Object.keys(level.solution).length);
      });
    });
  }

  it('level 6: the 24 on the shortcut pin meshes cleanly and turns the target, but the wrong way', () => {
    const shortcut = { sk: 's', i3: 'a3', i4: 'a4' };
    expect(meshesCleanly(L6, shortcut)).toBe(true);
    const r = checkLevel(L6, shortcut);
    expect(r.solved).toBe(false);
    expect(r.spins.tgt).toBeCloseTo(-L6.target.rpm, 6);
  });

  it('level 7: two compound pairs, each two gears on one axle on different layers', () => {
    const byAxle = new Map<string, number[]>();
    for (const [id, axle] of Object.entries(L7.solution)) byAxle.set(axle, [...(byAxle.get(axle) ?? []), L7.tray.find((t) => t.id === id)!.layer]);
    const compound = [...byAxle.values()].filter((layers) => new Set(layers).size === 2);
    expect(compound).toHaveLength(2);
    // The decoy 24 in place of the first stage's 16 collides with the driver.
    const { p: _, ...rest } = L7.solution;
    expect(checkLevel(L7, { ...rest, x: 'b' }).spins.tgt).toBe('jammed');
  });

  it('level 8: the spare 20 fits the trap pin and meshes cleanly, but with the idler it closes an odd loop and jams', () => {
    const both = { ...L8.solution, i2: 'tr' };
    expect(meshesCleanly(L8, both)).toBe(true);
    const r = checkLevel(L8, both);
    expect(r.solved).toBe(false);
    expect(r.spins.tgt).toBe('jammed');
  });

  it('between them they use a plausible distractor, a compound pair and an odd-loop jam', () => {
    const compound = (l: Level) => {
      const layers = new Map<string, Set<number>>();
      for (const [id, axle] of Object.entries(l.solution)) layers.set(axle, (layers.get(axle) ?? new Set()).add(l.tray.find((t) => t.id === id)!.layer));
      return [...layers.values()].some((s) => s.size === 2);
    };
    /** An odd-loop jam: a leftover gear added to the solution on a free axle meshes every neighbour cleanly, yet the train jams. */
    const oddLoop = (l: Level) => {
      const used = new Set([
        ...l.fixed.map((f) => `${f.axle}/${f.layer}`),
        ...Object.entries(l.solution).map(([id, axle]) => `${axle}/${l.tray.find((t) => t.id === id)!.layer}`),
      ]);
      return l.tray
        .filter((t) => !(t.id in l.solution))
        .some((spare) =>
          l.axles.some((a) => {
            const p = { ...l.solution, [spare.id]: a.id };
            return !used.has(`${a.id}/${spare.layer}`) && meshesCleanly(l, p) && checkLevel(l, p).spins[l.target.gear] === 'jammed';
          }),
        );
    };
    /**
     * A plausible distractor: a leftover gear that, with some of the solution's gears, meshes cleanly into a train that
     * turns the target, just not to the goal.
     */
    const distractor = (l: Level) => {
      const sol = Object.entries(l.solution);
      const subsets = Array.from({ length: 2 ** sol.length }, (_, mask) => Object.fromEntries(sol.filter((_, i) => mask & (1 << i))));
      return l.tray
        .filter((t) => !(t.id in l.solution))
        .some((spare) =>
          l.axles.some((a) =>
            subsets.some((part) => {
              const p = { ...part, [spare.id]: a.id };
              const clash = Object.entries(part).some(([id, ax]) => ax === a.id && l.tray.find((t) => t.id === id)!.layer === spare.layer);
              if (clash || l.fixed.some((f) => f.axle === a.id && f.layer === spare.layer) || !meshesCleanly(l, p)) return false;
              const r = checkLevel(l, p);
              const spin = r.spins[l.target.gear];
              return typeof spin === 'number' && spin !== 0 && !r.solved;
            }),
          ),
        );
    };
    expect(deep.some(compound)).toBe(true);
    expect(deep.some(oddLoop)).toBe(true);
    expect(deep.some(distractor)).toBe(true);
  });
});

describe('checkLevel errors', () => {
  it('rejects an unknown tray gear', () => {
    expect(() => checkLevel(L1, { nope: 'a1' })).toThrow(/nope/);
  });
  it('rejects an unknown axle', () => {
    expect(() => checkLevel(L1, { br: 'nowhere' })).toThrow(/nowhere/);
  });
});

describe('parseLevel', () => {
  const cases: [string, (l: any) => unknown, string][] = [
    ['id missing', (l) => delete l.id, 'level.id'],
    ['id not a string', (l) => (l.id = 5), 'level.id'],
    ['id empty', (l) => (l.id = ''), 'level.id'],
    ['id too long', (l) => (l.id = 'x'.repeat(65)), 'level.id'],
    ['name too long', (l) => (l.name = 'x'.repeat(81)), 'level.name'],
    ['name not a string', (l) => (l.name = null), 'level.name'],
    ['module too small', (l) => (l.module = 0.001), 'level.module'],
    ['module too big', (l) => (l.module = 0.5), 'level.module'],
    ['module a string', (l) => (l.module = '0.004'), 'level.module'],
    ['axles not an array', (l) => (l.axles = {}), 'level.axles'],
    ['axles too many', (l) => (l.axles = Array.from({ length: 31 }, (_, i) => ({ id: `z${i}`, x: 0, y: 0 }))), 'level.axles'],
    ['axle not an object', (l) => (l.axles[2] = []), 'level.axles[2]'],
    ['axle x not a number', (l) => (l.axles[2].x = '1'), 'level.axles[2].x must be a finite number'],
    ['axle y missing', (l) => delete l.axles[1].y, 'level.axles[1].y'],
    ['axle id empty', (l) => (l.axles[0].id = ''), 'level.axles[0].id'],
    ['axle id duplicate', (l) => (l.axles[3].id = l.axles[0].id), 'level.axles[3].id'],
    ['fixed not an array', (l) => (l.fixed = null), 'level.fixed'],
    ['fixed teeth too small', (l) => (l.fixed[0].teeth = 5), 'level.fixed[0].teeth'],
    ['fixed teeth too big', (l) => (l.fixed[0].teeth = 81), 'level.fixed[0].teeth'],
    ['fixed teeth fractional', (l) => (l.fixed[1].teeth = 20.5), 'level.fixed[1].teeth'],
    ['fixed layer fractional', (l) => (l.fixed[0].layer = 0.5), 'level.fixed[0].layer'],
    ['fixed layer a string', (l) => (l.fixed[0].layer = '0'), 'level.fixed[0].layer'],
    ['fixed on a dangling axle', (l) => (l.fixed[1].axle = 'nowhere'), 'level.fixed[1].axle'],
    ['fixed id duplicate', (l) => (l.fixed[1].id = l.fixed[0].id), 'level.fixed[1].id'],
    ['tray id duplicates a fixed id', (l) => (l.tray[0].id = l.fixed[0].id), 'level.tray[0].id'],
    ['tray not an array', (l) => (l.tray = 'x'), 'level.tray'],
    ['tray teeth missing', (l) => delete l.tray[1].teeth, 'level.tray[1].teeth'],
    ['tray layer missing', (l) => delete l.tray[1].layer, 'level.tray[1].layer'],
    [
      'too many gears',
      (l) => (l.tray = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}x`, teeth: 10, layer: 0 }))),
      'level.tray',
    ],
    ['driver not fixed', (l) => (l.driver = l.tray[0].id), 'level.driver'],
    ['driver dangling', (l) => (l.driver = 'ghost'), 'level.driver'],
    ['rpm zero', (l) => (l.rpm = 0), 'level.rpm'],
    ['rpm a string', (l) => (l.rpm = '60'), 'level.rpm'],
    ['target not an object', (l) => (l.target = 3), 'level.target'],
    ['target gear dangling', (l) => (l.target.gear = 'ghost'), 'level.target.gear'],
    ['target rpm zero', (l) => (l.target.rpm = 0), 'level.target.rpm'],
    ['target rpm missing', (l) => delete l.target.rpm, 'level.target.rpm'],
    ['tolerance zero', (l) => (l.target.tolerance = 0), 'level.target.tolerance'],
    ['tolerance negative', (l) => (l.target.tolerance = -1), 'level.target.tolerance'],
    ['escapement missing', (l) => delete l.escapement, 'level.escapement'],
    ['escapement gear dangling', (l) => (l.escapement.gear = 'ghost'), 'level.escapement.gear'],
    ['solution not an object', (l) => (l.solution = []), 'level.solution'],
    ['solution key not a tray gear', (l) => (l.solution.drv = 'a1'), 'level.solution["drv"]'],
    ['solution value dangling', (l) => (l.solution.t1 = 'ghost'), 'level.solution["t1"]'],
    ['solution value not a string', (l) => (l.solution.t1 = 4), 'level.solution["t1"]'],
  ];

  it('accepts the unmodified base', () => {
    expect(parseLevel(clone(L4))).toEqual(L4);
  });

  const reject = (input: unknown, path: string) => {
    let err: unknown;
    try {
      parseLevel(input);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).constructor).toBe(Error);
    expect((err as Error).message).toContain(path);
  };

  for (const [name, root] of [['null', null], ['an array', []], ['a string', 'x'], ['a number', 4]] as const) {
    it(`rejects ${name} as the level`, () => reject(root, 'level must be an object'));
  }

  for (const [name, mutate, path] of cases) {
    it(`rejects ${name}`, () => {
      const l = clone(L4);
      mutate(l);
      reject(l, path);
    });
  }

  it('accepts a target in the tray', () => {
    const l = clone(L1);
    l.target.gear = l.tray[0].id;
    expect(parseLevel(l).target.gear).toBe(l.tray[0].id);
  });

  it('never returns or keeps the input, and a __proto__ key cannot leak', () => {
    const l = JSON.parse(JSON.stringify(L4).replace(/\}$/, ',"__proto__":{"polluted":1}}'));
    const out = parseLevel(l);
    expect(out).not.toBe(l);
    expect(out.axles[0]).not.toBe(l.axles[0]);
    expect(({} as any).polluted).toBeUndefined();
    expect((out as any).polluted).toBeUndefined();
    l.axles[0].x = 99;
    expect(out.axles[0]!.x).toBe(L4.axles[0]!.x);
  });

  const kinds: [string, string, (l: any, id: string) => void, string][] = [
    ['level id', 'l1', (l, id) => (l.id = id), 'level.id'],
    ['axle id', 'a0', (l, id) => (l.axles[0].id = id), 'level.axles[0].id'],
    ['fixed gear id', 'drv', (l, id) => (l.fixed[0].id = id), 'level.fixed[0].id'],
    ['tray gear id', 'br', (l, id) => (l.tray[0].id = id), 'level.tray[0].id'],
  ];
  for (const [kind, old, set, path] of kinds) {
    for (const bad of ['__proto__', 'constructor', 'toString', '1abc', 'a b', 'a.b', '\u{1F642}']) {
      it(`rejects ${JSON.stringify(bad)} as a ${kind}`, () => {
        const l = clone(L1);
        set(l, bad);
        reject(l, `${path} must start with a letter`);
      });
    }
    it(`accepts gear_2-b as a ${kind}`, () => {
      const renamed = JSON.parse(JSON.stringify(L1).split(`"${old}"`).join('"gear_2-b"'));
      expect(checkLevel(parseLevel(renamed), parseLevel(renamed).solution).solved).toBe(true);
    });
  }
});
