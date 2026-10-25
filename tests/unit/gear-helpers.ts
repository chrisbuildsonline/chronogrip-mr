import type { BufferGeometry } from 'three';
import { gearGeometry, gearProfile, gearRadii } from '../../src/gear';

export type Pt = { x: number; y: number };
export type GearCase = { module: number; teeth: number; pressureAngle: number };

/** Segments i and j cross strictly (proper crossing). */
function cross(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Orientation of c relative to a->b: -1, 0 (collinear within float noise) or 1. */
function side(a: Pt, b: Pt, c: Pt): number {
  const scale = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - a.x, c.y - a.y);
  const v = cross(a, b, c);
  return Math.abs(v) <= 1e-9 * scale ? 0 : Math.sign(v);
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** O(n^2) check over every pair of non-adjacent segments of the closed outline. */
export function findSelfIntersection(closed: Pt[]): [number, number] | null {
  const n = closed.length - 1; // segment i runs closed[i] -> closed[i + 1]
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing point
      const a = closed[i]!;
      const b = closed[i + 1]!;
      const c = closed[j]!;
      const d = closed[j + 1]!;
      // cheap bounding-box reject keeps the O(n^2) loop fast
      if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x)) continue;
      if (Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue;
      if (segmentsCross(a, b, c, d)) return [i, j];
    }
  }
  return null;
}

/** Collects every property violation for a case; empty array means the gear is good. */
export function checkProfile(c: GearCase): string[] {
  const errors: string[] = [];
  const { module: m, teeth: z, pressureAngle } = c;
  const pts = gearProfile(c);
  const radii = gearRadii(c);

  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) errors.push('non-finite point');
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (first.x !== last.x || first.y !== last.y) errors.push('first point != last point');

  const rs = pts.map((p) => Math.hypot(p.x, p.y));
  if (Math.abs(Math.max(...rs) - (m * z) / 2 - m) > 1e-6) errors.push('max radius != tip radius');
  if (Math.abs(Math.min(...rs) - ((m * z) / 2 - 1.25 * m)) > 1e-6) errors.push('min radius != root radius');
  if (Math.abs(radii.pitch - (m * z) / 2) > 1e-6) errors.push('pitch radius');
  if (Math.abs(radii.base - radii.pitch * Math.cos((pressureAngle * Math.PI) / 180)) > 1e-9) errors.push('base radius');

  // z-fold rotational symmetry: point i + perTooth is point i rotated by 2*pi/z
  const open = pts.slice(0, -1);
  if (open.length % z !== 0) errors.push('point count not a multiple of teeth');
  const per = open.length / z;
  const a = (2 * Math.PI) / z;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  for (let i = 0; i < open.length; i++) {
    const p = open[i]!;
    const q = open[(i + per) % open.length]!;
    if (Math.hypot(p.x * cs - p.y * sn - q.x, p.x * sn + p.y * cs - q.y) > 1e-9) {
      errors.push(`not ${z}-fold symmetric at point ${i}`);
      break;
    }
  }

  // counter-clockwise: positive signed area
  let area = 0;
  for (let i = 0; i < pts.length - 1; i++) area += pts[i]!.x * pts[i + 1]!.y - pts[i + 1]!.x * pts[i]!.y;
  if (area <= 0) errors.push('not counter-clockwise');

  const hit = findSelfIntersection(pts);
  if (hit) errors.push(`self-intersection between segments ${hit[0]} and ${hit[1]}`);
  return errors;
}

export function checkGeometry(c: GearCase, thickness: number, holeRadius: number): string[] {
  const errors: string[] = [];
  const g: BufferGeometry = gearGeometry({ ...c, thickness, holeRadius });
  const pos = g.getAttribute('position');
  if (!pos || pos.count === 0) return ['no position attribute'];
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const tip = (c.module * c.teeth) / 2 + c.module;
  const eps = 1e-6; // positions are stored as float32
  let minR = Infinity;
  let maxR = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      errors.push('NaN/Infinity vertex');
      break;
    }
    const r = Math.hypot(x, y);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
  }
  if (Math.abs(maxR - tip) > 1e-6) errors.push(`max vertex radius ${maxR} != tip ${tip}`);
  if (minR < holeRadius - eps) errors.push(`vertex inside the hole (r=${minR})`);
  if (Math.abs(minR - holeRadius) > 1e-6) errors.push(`no vertex at hole radius (min r=${minR})`);
  if (Math.abs(box.max.z - box.min.z - thickness) > eps) errors.push('depth != thickness');
  const reach = Math.max(box.max.x, -box.min.x, box.max.y, -box.min.y);
  if (reach > tip + eps || reach < tip * Math.cos(Math.PI / c.teeth) - eps) {
    errors.push(`bounding box reach ${reach} does not match tip radius ${tip}`);
  }
  g.dispose();
  return errors;
}
