import { LEVELS } from './levels';
import { hasEdge, snapToEdge, type Pt } from './edge';
import { TRAY_POSE, inComfortZone, interactables, type TrayPose, type Vec3 } from './seat';

/** A detected surface in local space (head at the origin, -Z forward, +Y up). */
export type Plane = {
  orientation: 'horizontal' | 'vertical';
  /** Centre of the plane. */
  position: Vec3;
  extents?: { width: number; depth: number };
  /** The surface outline as [x, z] points in the same frame (see planePolygonToHead); the tray snaps to its near edge. */
  polygon?: readonly Pt[];
};

/** How the tray sits: snapped to a table edge, kept at the default spot because the table is too small, or placed without an outline. */
export type Fit = 'edge' | 'small' | 'default';

export type Placement = {
  pose: TrayPose;
  source: 'plane' | 'default';
  /** Height of the tray centre above the plane surface; the scene draws a riser for it. 0 by default. */
  stand: number;
  fit: Fit;
  /** The table outline the pose was chosen on, always in the head frame it was chosen for (even when `pose` is moved to local space); absent without one. */
  table?: readonly Pt[];
};

export const DEFAULT_PLACEMENT: Placement = { pose: TRAY_POSE, source: 'default', stand: 0, fit: 'default' };

/** A plane must be this far below the head, ahead, and at least this big to hold the tray. */
const REACH = { minBelow: 0.25, maxBelow: 0.7, maxForward: 0.7, maxYaw: 35, minSize: 0.25 } as const;
/** The tray stays near the default spot: lateral and depth clamps, and the band for its centre height. */
const TRAY_SPOT = { maxX: 0.04, minZ: -0.35, maxZ: -0.31, minY: -0.22, maxY: -0.17, lift: 0.14 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function usable({ orientation, position: [x, y, z], extents }: Plane): boolean {
  if (orientation !== 'horizontal') return false;
  if (-y < REACH.minBelow || -y > REACH.maxBelow) return false;
  if (z >= 0 || -z > REACH.maxForward) return false;
  if ((Math.atan2(Math.abs(x), -z) * 180) / Math.PI > REACH.maxYaw) return false;
  return !extents || Math.min(extents.width, extents.depth) >= REACH.minSize;
}

/** True if every grabbable point of every level sits in the comfort zone with the tray at this pose. */
export const fitsComfort = (pose: TrayPose) => LEVELS.every((l) => interactables(l, pose).every(inComfortZone));

/**
 * Stands the tray on the nearest usable horizontal plane: x/z clamped near the default spot, the centre
 * height clamped into the comfortable band (so a low plane gets a riser, a high one no push above the cone).
 * A plane with an outline snaps the tray to the table edge nearest the player (src/edge.ts), turned as far as
 * comfort allows; if no outlined plane can hold it comfortably the tray stays at the default pose, fit 'small'.
 * Without an outline, or with the head over it (no edge to snap to), the tray is not yawed. Falls back to the default pose when no plane qualifies or comfort would break.
 */
export function placeTray(planes: readonly Plane[]): Placement {
  const near = planes.filter(usable).sort((a, b) => Math.hypot(...a.position) - Math.hypot(...b.position));
  let small: Placement | undefined;
  for (const { position: [px, py, pz], polygon } of near) {
    const y = clamp(py + TRAY_SPOT.lift, TRAY_SPOT.minY, TRAY_SPOT.maxY);
    if (polygon && polygon.length >= 3 && hasEdge(polygon)) {
      const pose = snapToEdge(polygon, y, fitsComfort);
      if (pose) return { pose, source: 'plane', stand: y - py, fit: 'edge', table: polygon };
      small ??= { ...DEFAULT_PLACEMENT, fit: 'small', table: polygon };
      continue;
    }
    const pose: TrayPose = { position: [clamp(px, -TRAY_SPOT.maxX, TRAY_SPOT.maxX), y, clamp(pz, TRAY_SPOT.minZ, TRAY_SPOT.maxZ)], tilt: TRAY_POSE.tilt };
    return fitsComfort(pose) ? { pose, source: 'plane', stand: y - py, fit: 'default' } : DEFAULT_PLACEMENT;
  }
  return small ?? DEFAULT_PLACEMENT;
}

/** Head position in local space and its yaw (radians about Y, 0 = facing -Z). */
export type Head = { position: Vec3; yaw: number };

/** A plane's outline (plane space, y about 0) as [x, z] points in the head frame, using the plane pose's full transform. */
export function planePolygonToHead(
  points: readonly { x: number; y: number; z: number }[],
  at: { position: Vec3; orientation: { x: number; y: number; z: number; w: number } },
  head: Head,
): Pt[] {
  const { x: qx, y: qy, z: qz, w: qw } = at.orientation;
  return points.map(({ x, y, z }) => {
    // v + 2w (u x v) + 2 u x (u x v) with u = (qx, qy, qz), t = 2 (u x v)
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    const local: Vec3 = [
      at.position[0] + x + qw * tx + (qy * tz - qz * ty),
      at.position[1] + y + qw * ty + (qz * tx - qx * tz),
      at.position[2] + z + qw * tz + (qx * ty - qy * tx),
    ];
    const h = toHeadFrame(local, head);
    return [h[0], h[2]] as Pt;
  });
}

/** A local-space point expressed in the head frame (head at the origin, facing -Z). */
export function toHeadFrame(p: Vec3, head: Head): Vec3 {
  const dx = p[0] - head.position[0];
  const dz = p[2] - head.position[2];
  const c = Math.cos(head.yaw);
  const s = Math.sin(head.yaw);
  return [dx * c - dz * s, p[1] - head.position[1], dx * s + dz * c];
}

/** A tray pose chosen in the head frame, moved to local space for the given head. */
export function poseToWorld(pose: TrayPose, head: Head): TrayPose {
  const [x, y, z] = pose.position;
  const c = Math.cos(head.yaw);
  const s = Math.sin(head.yaw);
  return {
    position: [head.position[0] + x * c + z * s, head.position[1] + y, head.position[2] - x * s + z * c],
    tilt: pose.tilt,
    yaw: (pose.yaw ?? 0) + head.yaw,
  };
}

export const RECENTER_HOLD_MS = 1000;

/**
 * Feed it every frame with the time (ms) and whether both hands pinch. Returns true once per hold,
 * the moment the hold reaches RECENTER_HOLD_MS; letting go of either hand starts over.
 */
export function createRecenterHold(holdMs = RECENTER_HOLD_MS) {
  let since: number | null = null;
  let fired = false;
  return (now: number, bothPinching: boolean): boolean => {
    if (!bothPinching) {
      since = null;
      fired = false;
      return false;
    }
    since ??= now;
    if (fired || now - since < holdMs) return false;
    fired = true;
    return true;
  };
}
