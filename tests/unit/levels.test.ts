import { describe, expect, it } from 'vitest';
import { gearRadii } from '../../src/gear';
import { LEVELS, checkLevel, parseLevel, type Level } from '../../src/levels';

const clone = (l: Level): any => JSON.parse(JSON.stringify(l));
const [L1, L2, L3, L4, L5] = LEVELS as [Level, Level, Level, Level, Level];

describe('LEVELS', () => {
  it('has five levels with unique ids', () => {
    expect(LEVELS).toHaveLength(5);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(5);
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

  it('a tray gear called __proto__ stays an own property of the solution', () => {
    const l = clone(L1);
    l.tray[0].id = '__proto__';
    l.solution = JSON.parse('{"__proto__":"a1"}');
    const out = parseLevel(l);
    expect(Object.keys(out.solution)).toEqual(['__proto__']);
    expect(checkLevel(out, out.solution).spins).toBeDefined();
  });
});
