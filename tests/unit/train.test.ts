import { describe, expect, it } from 'vitest';
import { solveTrain, type Axle, type PlacedGear, type TrainInput } from '../../src/train';

const M = 0.005;
const d = (z1: number, z2: number) => (M * (z1 + z2)) / 2;

const g = (id: string, axle: string, teeth: number, layer = 0): PlacedGear => ({ id, axle, teeth, layer });
const ax = (id: string, x: number, y = 0): Axle => ({ id, x, y });
const make = (over: Partial<TrainInput> & Pick<TrainInput, 'axles' | 'gears'>): TrainInput => ({
  module: M,
  driver: over.gears[0]!.id,
  rpm: 60,
  ...over,
});

describe('solveTrain', () => {
  it('a meshing pair: ratio and opposite direction', () => {
    const r = solveTrain(make({ axles: [ax('a', 0), ax('b', d(20, 40))], gears: [g('g1', 'a', 20), g('g2', 'b', 40)] }));
    expect(r.g1).toBe(60);
    expect(r.g2).toBeCloseTo(-30, 9);
  });

  it('a negative driver rpm flips every direction', () => {
    const r = solveTrain(make({ rpm: -60, axles: [ax('a', 0), ax('b', d(20, 40))], gears: [g('g1', 'a', 20), g('g2', 'b', 40)] }));
    expect(r.g1).toBe(-60);
    expect(r.g2).toBeCloseTo(30, 9);
  });

  it('an idler does not change the ratio and keeps the driver direction', () => {
    const r = solveTrain(
      make({
        axles: [ax('a', 0), ax('b', d(20, 10)), ax('c', d(20, 10) + d(10, 40))],
        gears: [g('g1', 'a', 20), g('g2', 'b', 10), g('g3', 'c', 40)],
      }),
    );
    expect(r.g2).toBeCloseTo(-120, 9);
    expect(r.g3).toBeCloseTo(30, 9);
  });

  it('compound gears share an axle rpm and drive a second pair', () => {
    const r = solveTrain(
      make({
        axles: [ax('x', 0), ax('a', d(10, 20)), ax('b', d(10, 20) + d(10, 40))],
        gears: [g('d', 'x', 10, 0), g('a1', 'a', 20, 0), g('a2', 'a', 10, 1), g('b', 'b', 40, 1)],
      }),
    );
    expect(r.a1).toBeCloseTo(-30, 9);
    expect(r.a2).toBeCloseTo(-30, 9);
    expect(r.b).toBeCloseTo(7.5, 9);
  });

  it('three mutually meshing gears jam', () => {
    const s = M * 20;
    const r = solveTrain(
      make({
        axles: [ax('a', 0, 0), ax('b', s, 0), ax('c', s / 2, (s * Math.sqrt(3)) / 2)],
        gears: [g('g1', 'a', 20), g('g2', 'b', 20), g('g3', 'c', 20)],
      }),
    );
    expect(r).toEqual({ g1: 'jammed', g2: 'jammed', g3: 'jammed' });
  });

  it('a gear not connected to the driver stands still', () => {
    const r = solveTrain(
      make({ axles: [ax('a', 0), ax('b', d(20, 20)), ax('c', 5)], gears: [g('g1', 'a', 20), g('g2', 'b', 20), g('far', 'c', 30)] }),
    );
    expect(r.far).toBe(0);
    expect(r.g2).toBeCloseTo(-60, 9);
  });

  it('gears on the same layer but too far apart do not mesh', () => {
    const r = solveTrain(make({ axles: [ax('a', 0), ax('b', d(20, 20) * 1.2)], gears: [g('g1', 'a', 20), g('g2', 'b', 20)] }));
    expect(r.g2).toBe(0);
  });

  it('gears on different layers do not mesh even at mesh distance', () => {
    const r = solveTrain(make({ axles: [ax('a', 0), ax('b', d(20, 20))], gears: [g('g1', 'a', 20, 0), g('g2', 'b', 20, 1)] }));
    expect(r.g2).toBe(0);
  });

  it('a mesh within the tolerance works, outside it does not', () => {
    const axles = (e: number) => [ax('a', 0), ax('b', d(20, 20) + e)];
    const gears = [g('g1', 'a', 20), g('g2', 'b', 20)];
    expect(solveTrain(make({ axles: axles(0.04 * M), gears })).g2).toBeCloseTo(-60, 9);
    expect(solveTrain(make({ axles: axles(0.06 * M), gears })).g2).toBe('jammed'); // not meshing, tips still overlap
    expect(solveTrain(make({ axles: axles(3 * M), gears })).g2).toBe(0);
    expect(solveTrain(make({ axles: axles(0.06 * M), gears, tolerance: 0.1 * M })).g2).toBeCloseTo(-60, 9);
  });

  it('two gears on one axle and one layer collide and jam their train', () => {
    const r = solveTrain(make({ axles: [ax('a', 0), ax('b', d(20, 20))], gears: [g('g1', 'a', 20), g('g2', 'b', 20), g('g3', 'b', 30)] }));
    expect(r).toEqual({ g1: 'jammed', g2: 'jammed', g3: 'jammed' });
  });

  it('overlapping non-meshing gears on one layer jam', () => {
    const r = solveTrain(make({ axles: [ax('a', 0), ax('b', d(20, 20) * 0.7)], gears: [g('g1', 'a', 20), g('g2', 'b', 20)] }));
    expect(r).toEqual({ g1: 'jammed', g2: 'jammed' });
  });

  it('a gear overlapping the train from outside jams the whole train', () => {
    const r = solveTrain(
      make({
        axles: [ax('a', 0), ax('b', d(20, 20)), ax('c', d(20, 20) + 0.3 * M * 20, 0.6 * M * 20)],
        gears: [g('g1', 'a', 20), g('g2', 'b', 20), g('g3', 'c', 20)],
      }),
    );
    expect(Object.values(r)).toEqual(['jammed', 'jammed', 'jammed']);
  });

  it('a jam in a separate undriven component does not jam the driver train', () => {
    const s = M * 20;
    const r = solveTrain(
      make({
        axles: [ax('a', 0), ax('b', d(20, 20)), ax('t1', 1, 1), ax('t2', 1 + s, 1), ax('t3', 1 + s / 2, 1 + (s * Math.sqrt(3)) / 2)],
        gears: [g('g1', 'a', 20), g('g2', 'b', 20), g('t1', 't1', 20), g('t2', 't2', 20), g('t3', 't3', 20)],
      }),
    );
    expect(r.g2).toBeCloseTo(-60, 9);
    expect([r.t1, r.t2, r.t3]).toEqual([0, 0, 0]);
  });

  it('a ratio conflict through compound links jams', () => {
    // a1 (20) meshes b1 (40) on layer 0, so axle b turns at -1/2 of axle a; a2 (30) meshing b2 (30) on layer 1 needs -1
    const r = solveTrain(
      make({
        axles: [ax('a', 0), ax('b', d(20, 40))],
        gears: [g('a1', 'a', 20, 0), g('b1', 'b', 40, 0), g('a2', 'a', 30, 1), g('b2', 'b', 30, 1)],
      }),
    );
    expect(Object.values(r)).toEqual(['jammed', 'jammed', 'jammed', 'jammed']);
  });

  it('is independent of gear and axle order', () => {
    const axles = [ax('x', 0), ax('a', d(10, 20)), ax('b', d(10, 20) + d(10, 40))];
    const gears = [g('d', 'x', 10, 0), g('a1', 'a', 20, 0), g('a2', 'a', 10, 1), g('b', 'b', 40, 1)];
    const base = solveTrain(make({ axles, gears, driver: 'd' }));
    const other = solveTrain(make({ axles: [...axles].reverse(), gears: [...gears].reverse(), driver: 'd' }));
    expect(other).toEqual(base);
    expect(Object.keys(base)).toEqual(['d', 'a1', 'a2', 'b']);
    expect(Object.keys(other)).toEqual(['b', 'a2', 'a1', 'd']);
  });

  describe('validation', () => {
    const ok = () => make({ axles: [ax('a', 0), ax('b', d(20, 20))], gears: [g('g1', 'a', 20), g('g2', 'b', 20)] });
    const bad = (patch: Partial<TrainInput>, msg: RegExp) => expect(() => solveTrain({ ...ok(), ...patch })).toThrow(msg);

    it('accepts the baseline', () => expect(() => solveTrain(ok())).not.toThrow());
    it('unknown driver', () => bad({ driver: 'nope' }, /driver/));
    it('gear on unknown axle', () => bad({ gears: [g('g1', 'zzz', 20)], driver: 'g1' }, /axle/));
    it('duplicate gear ids', () => bad({ gears: [g('g1', 'a', 20), g('g1', 'b', 20)] }, /duplicate/i));
    it('duplicate axle ids', () => bad({ axles: [ax('a', 0), ax('a', 1)] }, /duplicate/i));
    it('non-integer teeth', () => bad({ gears: [g('g1', 'a', 20.5)] }, /teeth/));
    it('too few teeth', () => bad({ gears: [g('g1', 'a', 5)] }, /teeth/));
    it('NaN rpm', () => bad({ rpm: NaN }, /rpm/));
    it('infinite rpm', () => bad({ rpm: Infinity }, /rpm/));
    it('non-finite axle coordinate', () => bad({ axles: [ax('a', NaN), ax('b', 0)] }, /axle/));
    it('zero module', () => bad({ module: 0 }, /module/));
    it('negative module', () => bad({ module: -1 }, /module/));
    it('non-finite layer', () => bad({ gears: [g('g1', 'a', 20, NaN)] }, /layer/));
  });
});
