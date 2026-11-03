import { describe, expect, it } from 'vitest';
import { fitsComfort, placeTray, planePolygonToHead, poseToWorld, type Head, type Placement, type Plane } from '../../src/anchor';
import { EDGE_INSET, footprint, snapToEdge, type Pt } from '../../src/edge';
import { anchoredAt, parseTray, restoreAt, savedFrom, serializeTray } from '../../src/persist';
import { TRAY_POSE } from '../../src/seat';

const deg = Math.PI / 180;
const Y = -0.22;

/** A w x d rectangle centred at (cx, cz) and turned by `yaw` about its centre (plane yaw: x axis -> (cos, -sin)). */
function rect(cx: number, cz: number, w: number, d: number, yaw = 0): Pt[] {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x! * c + z! * s, cz - x! * s + z! * c] as Pt);
}

/** True if p is inside the polygon (even-odd). */
function inside(poly: readonly Pt[], [x, z]: Pt): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

const plane = (polygon: Pt[]): Plane => ({ orientation: 'horizontal', position: [0, -0.45, -0.4], polygon });

describe('snapToEdge', () => {
  it('sits flush with the near edge of a rectangle, unturned, inset from it', () => {
    const poly = rect(0, -0.4, 0.8, 0.6);
    const pose = snapToEdge(poly, Y, fitsComfort)!;
    expect(pose).not.toBeNull();
    expect(pose.yaw ?? 0).toBeCloseTo(0, 6);
    expect(fitsComfort(pose)).toBe(true);
    const front = Math.max(...footprint(pose).map((p) => p[1]));
    expect(front).toBeLessThanOrEqual(-0.1 - EDGE_INSET + 1e-9);
    expect(footprint(pose).every((p) => inside(poly, p))).toBe(true);
  });

  it('turns parallel to a table turned 12 degrees', () => {
    const poly = rect(0, -0.45, 0.8, 0.6, 12 * deg);
    const pose = snapToEdge(poly, Y, fitsComfort)!;
    expect(pose).not.toBeNull();
    expect(pose.yaw!).toBeCloseTo(12 * deg, 6);
    expect(fitsComfort(pose)).toBe(true);
    expect(footprint(pose).every((p) => inside(poly, p))).toBe(true);
  });

  it('turns the other way for a table turned -12 degrees', () => {
    const pose = snapToEdge(rect(0, -0.45, 0.8, 0.6, -12 * deg), Y, fitsComfort)!;
    expect(pose.yaw!).toBeCloseTo(-12 * deg, 6);
  });

  it('clamps a 30 degree table to a yaw that stays comfortable and inside the table', () => {
    const poly = rect(0, -0.45, 0.8, 0.6, 30 * deg);
    const pose = snapToEdge(poly, Y, fitsComfort)!;
    expect(pose).not.toBeNull();
    expect(Math.abs(pose.yaw ?? 0)).toBeLessThanOrEqual(30 * deg + 1e-9);
    expect(fitsComfort(pose)).toBe(true);
    expect(fitsComfort({ ...pose, yaw: 30 * deg })).toBe(false);
    expect(footprint(pose).every((p) => inside(poly, p))).toBe(true);
  });

  it('gives up on a table that cannot hold the tray', () => {
    expect(snapToEdge(rect(0, -0.4, 0.3, 0.3), Y, fitsComfort)).toBeNull();
  });

  it('never puts the tray across the notch of an L-shaped table', () => {
    // An L: 0.9 wide, with the far right cut out beyond z = -0.36. Comfort asks the tray to sit a little back from
    // the near edge, which would put its far right corner in the notch.
    const poly: Pt[] = [[-0.45, -0.9], [0.18, -0.9], [0.18, -0.36], [0.45, -0.36], [0.45, -0.1], [-0.45, -0.1]];
    const inNotch = (p: Pt) => p[0] > 0.18 && p[1] < -0.36;
    // without the notch the same search lands a corner in it, so the notch really changes the answer
    expect(footprint(snapToEdge(rect(0, -0.5, 0.9, 0.8), Y, fitsComfort)!).some(inNotch)).toBe(true);
    const pose = snapToEdge(poly, Y, fitsComfort);
    expect(pose).not.toBeNull();
    const fp = footprint(pose!);
    expect(fp.every((p) => inside(poly, p))).toBe(true);
    // the notch corner (0.18, -0.36) must not poke into the footprint's area
    const xs = fp.map((p) => p[0]);
    const zs = fp.map((p) => p[1]);
    const pokes = Math.min(...xs) < 0.18 && Math.max(...xs) > 0.18 && Math.min(...zs) < -0.36 && Math.max(...zs) > -0.36;
    expect(pokes).toBe(false);
    expect(fitsComfort(pose!)).toBe(true);
  });

  it('works with either winding', () => {
    const poly = rect(0, -0.4, 0.8, 0.6);
    const a = snapToEdge(poly, Y, fitsComfort)!;
    const b = snapToEdge([...poly].reverse(), Y, fitsComfort)!;
    a.position.forEach((v, i) => expect(b.position[i]).toBeCloseTo(v, 9));
  });

  it('has no edge to snap to when the head is over the table', () => {
    expect(snapToEdge(rect(0, 0, 1, 1), Y, fitsComfort)).toBeNull();
  });
});

describe('placeTray with a polygon', () => {
  it("tags a snapped placement 'edge' and keeps the riser logic", () => {
    const r = placeTray([plane(rect(0, -0.4, 0.8, 0.6, 12 * deg))]);
    expect(r.fit).toBe('edge');
    expect(r.source).toBe('plane');
    expect(r.pose.yaw!).toBeCloseTo(12 * deg, 6);
    expect(r.stand).toBeCloseTo(r.pose.position[1] - -0.45, 9);
    expect(fitsComfort(r.pose)).toBe(true);
    expect(r.table).toBeDefined();
  });

  it("keeps the comfort default spot and says 'small' when the table is too small", () => {
    const r = placeTray([plane(rect(0, -0.4, 0.3, 0.3))]);
    expect(r.fit).toBe('small');
    expect(r.pose).toEqual(TRAY_POSE);
    expect(r.source).toBe('default');
  });

  it("never says 'small' for a big table the head sits over; it places without snapping", () => {
    const r = placeTray([{ orientation: 'horizontal', position: [0, -0.45, -0.4], polygon: rect(0, 0, 3, 3) }]);
    expect(r.fit).toBe('default');
    expect(r.source).toBe('plane');
    expect(fitsComfort(r.pose)).toBe(true);
  });

  it("is 'default' without a polygon", () => {
    expect(placeTray([{ orientation: 'horizontal', position: [0, -0.45, -0.4] }]).fit).toBe('default');
    expect(placeTray([]).fit).toBe('default');
  });
});

describe('saving an edge-snapped tray', () => {
  it('keeps the yaw and the fit through save, restore for a turned head, and the anchor path', () => {
    const snapped = placeTray([plane(rect(0, -0.4, 0.8, 0.6, 12 * deg))]);
    const head: Head = { position: [0.3, 1.1, -0.2], yaw: 0.5 };
    const world: Placement = { ...snapped, pose: poseToWorld(snapped.pose, head) };
    const saved = parseTray(serializeTray(savedFrom(world, head)))!;
    expect(saved.pose.yaw!).toBeCloseTo(12 * deg, 9);
    expect(saved.fit).toBe('edge');
    const next: Head = { position: [-1, 0.9, 2], yaw: -0.8 };
    const back = restoreAt(saved, next);
    expect(back.fit).toBe('edge');
    expect(back.pose.yaw!).toBeCloseTo(12 * deg + next.yaw, 9);
    const at = anchoredAt(saved, { position: back.pose.position, yaw: back.pose.yaw! }, next)!;
    expect(at.pose.yaw).toBeCloseTo(back.pose.yaw!, 9);
    expect(at.fit).toBe('edge');
  });

  it("keeps a 'small' fit through save and load, as a recenter on a too-small table saves it", () => {
    const small = placeTray([plane(rect(0, -0.4, 0.3, 0.3))]);
    expect(small.fit).toBe('small');
    const head: Head = { position: [0, 1.1, 0], yaw: 0.2 };
    const saved = parseTray(serializeTray(savedFrom({ ...small, pose: poseToWorld(small.pose, head) }, head)));
    expect(saved).not.toBeNull();
    expect(restoreAt(saved!, head).fit).toBe('small');
  });

  it('reads an old save without a fit as default, and refuses a fit it does not know', () => {
    const good = { v: 1, pose: { position: [0, -0.22, -0.33], tilt: 0.8727 }, source: 'plane', stand: 0.09 };
    expect(restoreAt(parseTray(JSON.stringify(good))!, { position: [0, 0, 0], yaw: 0 }).fit).toBe('default');
    expect(parseTray(JSON.stringify({ ...good, fit: 'wide' }))).toBeNull();
  });
});

describe('planePolygonToHead', () => {
  const square = [{ x: -1, y: 0, z: -1 }, { x: 1, y: 0, z: -1 }, { x: 1, y: 0, z: 1 }, { x: -1, y: 0, z: 1 }];

  it('moves a plane-space polygon by position alone', () => {
    const pts = planePolygonToHead(square, { position: [0.5, -0.4, -0.5], orientation: { x: 0, y: 0, z: 0, w: 1 } }, { position: [0, 0, 0], yaw: 0 });
    expect(pts[0]![0]).toBeCloseTo(-0.5, 9);
    expect(pts[0]![1]).toBeCloseTo(-1.5, 9);
  });

  it('turns the polygon by the plane orientation', () => {
    const a = 30 * deg;
    const q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
    const pts = planePolygonToHead([{ x: 1, y: 0, z: 0 }], { position: [0, -0.4, -0.5], orientation: q }, { position: [0, 0, 0], yaw: 0 });
    expect(pts[0]![0]).toBeCloseTo(Math.cos(a), 9);
    expect(pts[0]![1]).toBeCloseTo(-0.5 - Math.sin(a), 9);
  });

  it('is relative to the head position and yaw', () => {
    const id = { x: 0, y: 0, z: 0, w: 1 };
    const pts = planePolygonToHead([{ x: 0, y: 0, z: 0 }], { position: [1, -0.4, -2], orientation: id }, { position: [1, 0, 0], yaw: Math.PI / 2 });
    // head turned 90 degrees left: the point 2 m ahead of the old heading is now off to its right
    expect(pts[0]![0]).toBeCloseTo(2, 9);
    expect(pts[0]![1]).toBeCloseTo(0, 9);
  });
});
