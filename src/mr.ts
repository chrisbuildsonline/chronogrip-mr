import type { WebGLRenderer } from 'three';
import { createRecenterHold, placeTray, poseToWorld, toHeadFrame, type Head, type Placement, type Plane } from './anchor';
import type { Vec3 } from './seat';
import type { Quat } from './escapement';
import { createKeeper } from './keeper';
import { HAND_JOINTS } from './occlude';
import { keeps, type PlaceWhy } from './persist';

/** Thumb tip to index tip closer than this counts as a pinch, metres. */
const PINCH_M = 0.02;
/** After the session starts, keep looking for a plane this long before settling on the default pose. */
const PLACE_WINDOW_MS = 3000;

export type MrHooks = {
  /** Called with the placement in local space, the head it was chosen for, and why (src/persist.ts). */
  onPlace(placement: Placement, head: Head, why: PlaceWhy): void;
  /** Every frame per hand: all 25 joints as [x, y, z, radius] in local space, or null when the hand is not fully tracked. */
  onJoints(hand: 'left' | 'right', joints: Float32Array | null): void;
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

/** Fills `out` with every joint of the hand ([x, y, z, radius] each); false if any joint is not tracked this frame. */
function jointsOf(frame: XRFrame, space: XRReferenceSpace, hand: XRHand, out: Float32Array): boolean {
  for (let i = 0; i < HAND_JOINTS.length; i++) {
    const joint = hand.get(HAND_JOINTS[i]!);
    const pose = joint && frame.getJointPose?.(joint, space);
    if (!pose) return false;
    const p = pose.transform.position;
    out[i * 4] = p.x;
    out[i * 4 + 1] = p.y;
    out[i * 4 + 2] = p.z;
    out[i * 4 + 3] = pose.radius ?? Number.NaN;
  }
  return true;
}

/**
 * While an XR session runs: puts back the tray's saved spot from an earlier session if there is one, else places it
 * from detected planes (searching for a short window, default pose after that) and saves a plane's placement. Reports
 * whether any hand is tracked and every hand joint, and re-places (and re-saves) the tray from the current head when
 * both hands pinch for a second.
 */
export function trackMr(renderer: WebGLRenderer, hooks: MrHooks, storage: Pick<Storage, 'getItem' | 'setItem'> | null = null): void {
  const jointBuffers = { left: new Float32Array(HAND_JOINTS.length * 4), right: new Float32Array(HAND_JOINTS.length * 4) };
  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    if (!session) return;
    const hold = createRecenterHold();
    const keeper = createKeeper(storage, session);
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
        const place = (p: Placement, why: PlaceWhy) => {
          hooks.onPlace(p, head, why);
          if (keeps(why, p)) keeper.keep(frame, space, p, head);
        };
        if (searchUntil === null) {
          // A spot saved last time is put back as it is: no search runs over it.
          const saved = keeper.start(head);
          const found = saved ?? choose(frame, space, head);
          searchUntil = saved || found.source === 'plane' ? now : now + PLACE_WINDOW_MS;
          place(found, saved ? 'saved' : 'search');
        } else if (now < searchUntil) {
          const found = choose(frame, space, head);
          if (found.source === 'plane') {
            place(found, 'search');
            searchUntil = now;
          }
        }
        const anchored = keeper.poll(frame, space, head);
        if (anchored) place(anchored, 'anchor');
        const hands = [...session.inputSources].filter((s) => s.hand);
        hooks.onHands(hands.length > 0);
        const tips = hands.map((s) => ({ side: s.handedness, tip: tipsMid(frame, space, s) }));
        const points = tips.map((t) => ({ side: t.side, point: t.tip?.pinching ? t.tip.point : null }));
        for (const side of ['left', 'right'] as const) {
          const tip = tips.find((t) => t.side === side)?.tip;
          hooks.onHandPoint(side, tip?.point ?? null, tip?.tip ?? null);
          hooks.onPinch(side, points.find((p) => p.side === side)?.point ?? null, tip?.wrist ?? null);
          const hand = hands.find((s) => s.handedness === side)?.hand;
          hooks.onJoints(side, hand && jointsOf(frame, space, hand, jointBuffers[side]) ? jointBuffers[side] : null);
        }
        const both = hands.length === 2 && points.every((p) => p.point);
        if (hold(now, both && !hooks.holding())) {
          hooks.onRecenter();
          place(choose(frame, space, head), 'recenter');
        }
      }
      session.requestAnimationFrame(tick);
    };
    session.requestAnimationFrame(tick);
  });
}
