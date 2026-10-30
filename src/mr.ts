import type { WebGLRenderer } from 'three';
import { createRecenterHold, placeTray, poseToWorld, toHeadFrame, type Head, type Placement, type Plane } from './anchor';
import type { Vec3 } from './seat';
import type { Quat } from './escapement';

/** Thumb tip to index tip closer than this counts as a pinch, metres. */
const PINCH_M = 0.02;
/** After the session starts, keep looking for a plane this long before settling on the default pose. */
const PLACE_WINDOW_MS = 3000;

export type MrHooks = {
  /** Called with the placement in local space and the head it was chosen for. */
  onPlace(placement: Placement, head: Head): void;
  onHands(present: boolean): void;
  /**
   * Every frame per hand: the pinch point (midpoint of thumb and index tips) while pinching, else null (also when the
   * hand is not tracked), and the wrist joint's orientation [x, y, z, w] when tracked.
   */
  onPinch(hand: 'left' | 'right', point: Vec3 | null, wrist: Quat | null): void;
  /** Every frame per hand: the thumb/index midpoint pinching or not, and the index tip; null when the hand is not tracked. */
  onHandPoint(hand: 'left' | 'right', point: Vec3 | null, tip: Vec3 | null): void;
  /** Called when a two-hand pinch hold fires, just before the tray is re-placed. */
  onRecenter(): void;
  /** True while a hand carries a gear: a two-hand pinch then is not a recenter. */
  holding(): boolean;
};

const pos = (t: XRRigidTransform): Vec3 => [t.position.x, t.position.y, t.position.z];

/** Head yaw from the viewer orientation: the heading of the -Z axis, 0 when facing -Z. */
function headOf(t: XRRigidTransform): Head {
  const { x, y, z, w } = t.orientation;
  return { position: pos(t), yaw: Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) };
}

/** Detected planes of this frame in the head frame; empty when the runtime has none. */
function planesIn(frame: XRFrame, space: XRReferenceSpace, head: Head): Plane[] {
  return [...(frame.detectedPlanes ?? [])].flatMap((p) => {
    const pose = frame.getPose(p.planeSpace, space);
    if (!pose) return [];
    const xs = p.polygon.map((v) => v.x);
    const zs = p.polygon.map((v) => v.z);
    const extents = xs.length ? { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) } : undefined;
    return [{ orientation: p.orientation, position: toHeadFrame(pos(pose.transform), head), extents }];
  });
}

/** Midpoint of thumb tip and index tip, whether they touch (closer than PINCH_M), and the wrist orientation; null when untracked. */
function tipsMid(frame: XRFrame, space: XRReferenceSpace, source: XRInputSource): { point: Vec3; tip: Vec3; pinching: boolean; wrist: Quat | null } | null {
  const thumb = source.hand?.get('thumb-tip');
  const index = source.hand?.get('index-finger-tip');
  const wristJoint = source.hand?.get('wrist');
  const a = thumb && frame.getJointPose?.(thumb, space);
  const b = index && frame.getJointPose?.(index, space);
  if (!a || !b) return null;
  const w = wristJoint && frame.getJointPose?.(wristJoint, space)?.transform.orientation;
  const [p, q] = [a.transform.position, b.transform.position];
  return {
    point: [(p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2],
    tip: [q.x, q.y, q.z],
    pinching: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < PINCH_M,
    wrist: w ? [w.x, w.y, w.z, w.w] : null,
  };
}

/**
 * While an XR session runs: places the tray from detected planes (searching for a short window, default pose
 * after that), reports whether any hand is tracked, and re-places it from the current head when both hands
 * pinch for a second.
 */
export function trackMr(renderer: WebGLRenderer, hooks: MrHooks): void {
  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    if (!session) return;
    const hold = createRecenterHold();
    let searchUntil: number | null = null;

    /** Best placement for this frame in the head frame, moved to local space for emitting. */
    const choose = (frame: XRFrame, space: XRReferenceSpace, head: Head): Placement => {
      const found = placeTray(planesIn(frame, space, head));
      return { ...found, pose: poseToWorld(found.pose, head) };
    };

    const tick = (now: number, frame: XRFrame) => {
      const space = renderer.xr.getReferenceSpace() as XRReferenceSpace | null;
      const viewer = space && frame.getViewerPose(space);
      if (viewer && space) {
        const head = headOf(viewer.transform);
        if (searchUntil === null) {
          searchUntil = now + PLACE_WINDOW_MS;
          hooks.onPlace(choose(frame, space, head), head);
        } else if (now < searchUntil) {
          const found = choose(frame, space, head);
          if (found.source === 'plane') {
            hooks.onPlace(found, head);
            searchUntil = now;
          }
        }
        const hands = [...session.inputSources].filter((s) => s.hand);
        hooks.onHands(hands.length > 0);
        const tips = hands.map((s) => ({ side: s.handedness, tip: tipsMid(frame, space, s) }));
        const points = tips.map((t) => ({ side: t.side, point: t.tip?.pinching ? t.tip.point : null }));
        for (const side of ['left', 'right'] as const) {
          const tip = tips.find((t) => t.side === side)?.tip;
          hooks.onHandPoint(side, tip?.point ?? null, tip?.tip ?? null);
          hooks.onPinch(side, points.find((p) => p.side === side)?.point ?? null, tip?.wrist ?? null);
        }
        const both = hands.length === 2 && points.every((p) => p.point);
        if (hold(now, both && !hooks.holding())) {
          hooks.onRecenter();
          hooks.onPlace(choose(frame, space, head), head);
        }
      }
      session.requestAnimationFrame(tick);
    };
    session.requestAnimationFrame(tick);
  });
}
