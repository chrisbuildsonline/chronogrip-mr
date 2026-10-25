import { describe, expect, it } from 'vitest';
import { gearGeometry, gearProfile, gearRadii } from '../../src/gear';
import { checkGeometry, checkProfile, findSelfIntersection } from './gear-helpers';

const base = { module: 0.01, teeth: 20, pressureAngle: 20 };

describe('gearRadii', () => {
  it('pitch, tip, root and base radii follow the module', () => {
    const r = gearRadii(base);
    expect(r.pitch).toBeCloseTo(0.1, 6);
    expect(r.tip).toBeCloseTo(0.11, 6);
    expect(r.root).toBeCloseTo(0.1 - 0.0125, 6);
    expect(r.base).toBeCloseTo(0.1 * Math.cos(Math.PI / 9), 9);
  });
});

describe('gearProfile', () => {
  it('has max radius = tip and min radius = root within 1e-6', () => {
    const rs = gearProfile(base).map((p) => Math.hypot(p.x, p.y));
    expect(Math.max(...rs)).toBeCloseTo(0.11, 6);
    expect(Math.min(...rs)).toBeCloseTo(0.0875, 6);
  });

  it('is explicitly closed: the last point equals the first', () => {
    const pts = gearProfile(base);
    expect(pts[pts.length - 1]).toEqual(pts[0]);
  });

  it('repeats exactly `teeth` times', () => {
    const pts = gearProfile({ ...base, teeth: 13 }).slice(0, -1);
    expect(pts.length % 13).toBe(0);
    const set = pts;
    const a = (2 * Math.PI) / 13;
    for (const p of set) {
      const rx = p.x * Math.cos(a) - p.y * Math.sin(a);
      const ry = p.x * Math.sin(a) + p.y * Math.cos(a);
      expect(set.some((q) => Math.hypot(q.x - rx, q.y - ry) < 1e-9)).toBe(true);
    }
    // and not a smaller symmetry: rotating by half a pitch angle must not map onto itself
    const h = a / 2;
    const p0 = set[0]!;
    const rx = p0.x * Math.cos(h) - p0.y * Math.sin(h);
    const ry = p0.x * Math.sin(h) + p0.y * Math.cos(h);
    expect(set.some((q) => Math.hypot(q.x - rx, q.y - ry) < 1e-9)).toBe(false);
  });

  it('has no NaN/Infinity and is counter-clockwise', () => {
    const pts = gearProfile(base);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    let area = 0;
    for (let i = 0; i < pts.length - 1; i++) area += pts[i]!.x * pts[i + 1]!.y - pts[i + 1]!.x * pts[i]!.y;
    expect(area).toBeGreaterThan(0);
  });

  it('does not intersect itself', () => {
    expect(findSelfIntersection(gearProfile(base))).toBeNull();
  });

  it('the self-intersection helper does catch a bow tie', () => {
    const bow = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ];
    expect(findSelfIntersection(bow)).not.toBeNull();
  });

  it('uses a true involute: flank points lie on the involute of the base circle', () => {
    const { base: rb } = gearRadii(base);
    const pts = gearProfile(base).slice(0, -1);
    const per = pts.length / base.teeth;
    // all points of the first tooth's rising flank sit between base and tip radius, with
    // the polar angle following inv(acos(rb / r)) up to a constant offset
    const flank = pts.slice(0, per).filter((p) => Math.hypot(p.x, p.y) >= rb - 1e-12);
    const invOf = (p: { x: number; y: number }) => {
      const r = Math.hypot(p.x, p.y);
      const al = Math.acos(Math.min(1, rb / r));
      return Math.atan2(p.y, p.x) - (Math.tan(al) - al);
    };
    const risingFlank = flank.slice(0, 8);
    const ref = invOf(risingFlank[0]!);
    for (const p of risingFlank) expect(invOf(p)).toBeCloseTo(ref, 9);
  });

  it('handles a low tooth count where the root circle is inside the base circle', () => {
    expect(checkProfile({ module: 0.01, teeth: 6, pressureAngle: 20 })).toEqual([]);
  });

  it('handles a high tooth count where the root circle is outside the base circle', () => {
    expect(checkProfile({ module: 0.002, teeth: 80, pressureAngle: 14.5 })).toEqual([]);
  });

  it('defaults the pressure angle to 20 degrees', () => {
    expect(gearProfile({ module: 0.01, teeth: 20 })).toEqual(gearProfile(base));
  });
});

describe('gearProfile validation', () => {
  const bad: [string, Partial<typeof base>][] = [
    ['teeth below 6', { teeth: 5 }],
    ['non-integer teeth', { teeth: 12.5 }],
    ['zero module', { module: 0 }],
    ['negative module', { module: -0.01 }],
    ['NaN module', { module: NaN }],
    ['Infinity module', { module: Infinity }],
    ['NaN teeth', { teeth: NaN }],
    ['zero pressure angle', { pressureAngle: 0 }],
    ['pressure angle of 35', { pressureAngle: 35 }],
    ['negative pressure angle', { pressureAngle: -5 }],
    ['NaN pressure angle', { pressureAngle: NaN }],
  ];
  for (const [name, patch] of bad) {
    it(`throws on ${name}`, () => {
      expect(() => gearProfile({ ...base, ...patch })).toThrow(Error);
    });
  }

  it('says why when teeth are too few', () => {
    expect(() => gearProfile({ ...base, teeth: 3 })).toThrow(/teeth/);
  });

  it('throws when the teeth would come to a point', () => {
    expect(() => gearProfile({ module: 0.01, teeth: 6, pressureAngle: 34 })).toThrow(/pointed|undercut|tooth/i);
  });
});

describe('gearGeometry', () => {
  it('builds a mesh with an axle hole, the right depth and the tip radius', () => {
    expect(checkGeometry(base, 0.02, 0.01)).toEqual([]);
  });

  it('uses sensible defaults whose hole is inside the root circle', () => {
    const g = gearGeometry({ module: 0.01, teeth: 20 });
    g.computeBoundingBox();
    const depth = g.boundingBox!.max.z - g.boundingBox!.min.z;
    expect(depth).toBeGreaterThan(0);
    const pos = g.getAttribute('position');
    let minR = Infinity;
    for (let i = 0; i < pos.count; i++) minR = Math.min(minR, Math.hypot(pos.getX(i), pos.getY(i)));
    expect(minR).toBeGreaterThan(0);
    expect(minR).toBeLessThan(gearRadii(base).root);
  });

  it('throws when the hole is as big as the root circle', () => {
    const root = gearRadii(base).root;
    expect(() => gearGeometry({ ...base, holeRadius: root })).toThrow(/hole/i);
    expect(() => gearGeometry({ ...base, holeRadius: root + 0.001 })).toThrow(/hole/i);
  });

  it('throws on a bad hole radius or thickness', () => {
    expect(() => gearGeometry({ ...base, holeRadius: NaN })).toThrow(Error);
    expect(() => gearGeometry({ ...base, holeRadius: -0.001 })).toThrow(Error);
    expect(() => gearGeometry({ ...base, thickness: 0 })).toThrow(Error);
    expect(() => gearGeometry({ ...base, thickness: Infinity })).toThrow(Error);
  });

  it('throws on invalid gear inputs too', () => {
    expect(() => gearGeometry({ ...base, teeth: 4 })).toThrow(Error);
    expect(() => gearGeometry({ ...base, module: 0 })).toThrow(Error);
  });
});
