import { BOARD_MARGIN, TRAY_HALF, TRAY_POSE, trayToWorld, type TrayPose } from './seat';

/** A point on the table plane in the head frame: [x right, z forward = -Z]. */
export type Pt = readonly [number, number];

/** The tray's front edge stops this far inside the table edge, metres. */
export const EDGE_INSET = 0.02;
/** The tray is turned to the table edge by at most this much (the comfort check can ask for less). */
const MAX_YAW = (35 * Math.PI) / 180;
const YAW_STEP = Math.PI / 180;
/** The search slides the tray this far along the edge and back from it, in these steps, metres. */
const SLIDE = { step: 0.02, max: 0.2 } as const;
const DEPTH = { step: 0.01, max: 0.25 } as const;
/** Half depth of the tilted board on the table, from its front edge to its centre. */
const FRONT_HALF = (TRAY_HALF.y + BOARD_MARGIN) * Math.cos(TRAY_POSE.tilt);

/** Corners of the board on the table (the tilted board seen from above) for a pose, as [x, z] in the pose's frame. */
export function footprint(pose: TrayPose): Pt[] {
  const [hx, hy] = [TRAY_HALF.x + BOARD_MARGIN, TRAY_HALF.y + BOARD_MARGIN];
  return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([x, y]) => {
    const p = trayToWorld(x!, y!, 0, pose);
    return [p[0], p[2]] as Pt;
  });
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** True if the segments cross at a point inside both (touching ends do not count). */
const crosses = (a: Pt, b: Pt, c: Pt, d: Pt) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

/** Even-odd test, any winding, convex or concave. */
function contains(poly: readonly Pt[], [x, z]: Pt): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** True if the quad lies inside the polygon: every corner in it and no polygon edge cutting across a side (a notch). */
function holds(poly: readonly Pt[], quad: readonly Pt[]): boolean {
  if (!quad.every((q) => contains(poly, q))) return false;
  return quad.every((q, i) => {
    const r = quad[(i + 1) % quad.length]!;
    return poly.every((p, j) => !crosses(q, r, p, poly[(j + 1) % poly.length]!));
  });
}

/** The edge nearest the head (the origin) that has the head on its outer side: its foot point and outward unit normal. */
function nearEdge(poly: readonly Pt[]): { foot: Pt; normal: Pt } | null {
  const area = poly.reduce((sum, [x, z], i) => sum + (x * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * z), 0);
  let best: { foot: Pt; normal: Pt; dist: number } | null = null;
  poly.forEach(([ax, az], i) => {
    const [bx, bz] = poly[(i + 1) % poly.length]!;
    const [dx, dz] = [bx - ax, bz - az];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6 || Math.abs(area) < 1e-12) return;
    const sign = area > 0 ? 1 : -1;
    const normal: Pt = [(sign * dz) / len, (-sign * dx) / len];
    if (-(normal[0] * ax + normal[1] * az) <= 0) return; // the head is not on the outer side
    const t = Math.min(len, Math.max(0, -(ax * dx + az * dz) / len));
    const foot: Pt = [ax + (dx / len) * t, az + (dz / len) * t];
    const dist = Math.hypot(foot[0], foot[1]);
    if (!best || dist < best.dist) best = { foot, normal, dist };
  });
  return best;
}

/** True if some edge of the table has the head on its outer side; false when the head is over the table, so there is nothing to snap to. */
export const hasEdge = (polygon: readonly Pt[]): boolean => nearEdge(polygon) !== null;

/**
 * The tray pose at height `y` that sits flush with the table edge nearest the head, or null if there is none.
 * The table polygon is in the head frame. The tray is turned parallel to that edge, but at most MAX_YAW, and
 * less if `fits` (the comfort check) says so; it sits EDGE_INSET inside the edge, slid along it and pushed
 * further in only as far as comfort needs, with the whole board on the table (a concave polygon included).
 * Null also when no such pose exists: the table is too small, or too far from the comfort zone.
 */
export function snapToEdge(polygon: readonly Pt[], y: number, fits: (pose: TrayPose) => boolean): TrayPose | null {
  const edge = nearEdge(polygon);
  if (!edge) return null;
  const [nx, nz] = edge.normal;
  const sign = Math.atan2(nx, nz) < 0 ? -1 : 1;
  const start = Math.min(Math.abs(Math.atan2(nx, nz)), MAX_YAW);
  // 0, +step, -step, +2 step, ...: the spot nearest the foot of the head first
  const slides = Array.from({ length: 2 * Math.round(SLIDE.max / SLIDE.step) + 1 }, (_, i) => (i % 2 ? 1 : -1) * Math.ceil(i / 2) * SLIDE.step);
  for (let a = start; ; a = Math.max(0, a - YAW_STEP)) {
    const yaw = sign * a;
    for (let depth = 0; depth <= DEPTH.max + 1e-9; depth += DEPTH.step) {
      for (const slide of slides) {
        const inward = EDGE_INSET + FRONT_HALF + depth;
        const x = edge.foot[0] - nx * inward - nz * slide;
        const z = edge.foot[1] - nz * inward + nx * slide;
        const pose: TrayPose = { position: [x, y, z], tilt: TRAY_POSE.tilt, yaw };
        if (holds(polygon, footprint(pose)) && fits(pose)) return pose;
      }
    }
    if (a === 0) return null;
  }
}
