import { LEVELS } from './levels';
import { TRAY_POSE, inComfortZone, interactables, type TrayPose, type Vec3 } from './seat';

/** A detected surface in local space (head at the origin, -Z forward, +Y up). */
export type Plane = {
  orientation: 'horizontal' | 'vertical';
  /** Centre of the plane. */
  position: Vec3;
  extents?: { width: number; depth: number };
};

export type Placement = {
  pose: TrayPose;
  source: 'plane' | 'default';
  /** Height of the tray centre above the plane surface; the scene draws a riser for it. 0 by default. */
  stand: number;
};

export const DEFAULT_PLACEMENT: Placement = { pose: TRAY_POSE, source: 'default', stand: 0 };

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
 * The tray is not yawed: turning a 0.4 m wide tray towards the player pushes its ends out of the yaw cone.
 * Falls back to the default pose when no plane qualifies or comfort would break.
 */
export function placeTray(planes: readonly Plane[]): Placement {
  const near = planes.filter(usable).sort((a, b) => Math.hypot(...a.position) - Math.hypot(...b.position))[0];
  if (!near) return DEFAULT_PLACEMENT;
  const [px, py, pz] = near.position;
  const x = clamp(px, -TRAY_SPOT.maxX, TRAY_SPOT.maxX);
  const y = clamp(py + TRAY_SPOT.lift, TRAY_SPOT.minY, TRAY_SPOT.maxY);
  const z = clamp(pz, TRAY_SPOT.minZ, TRAY_SPOT.maxZ);
  const pose: TrayPose = { position: [x, y, z], tilt: TRAY_POSE.tilt };
  return fitsComfort(pose) ? { pose, source: 'plane', stand: y - py } : DEFAULT_PLACEMENT;
}

/** Head position in local space and its yaw (radians about Y, 0 = facing -Z). */
export type Head = { position: Vec3; yaw: number };

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
