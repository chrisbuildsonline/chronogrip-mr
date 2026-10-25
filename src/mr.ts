import type { WebGLRenderer } from 'three';
import { createRecenterHold, placeTray, poseToWorld, toHeadFrame, type Head, type Placement, type Plane } from './anchor';
import type { Vec3 } from './seat';

/** Thumb tip to index tip closer than this counts as a pinch, metres. */
const PINCH_M = 0.02;
/** After the session starts, keep looking for a plane this long before settling on the default pose. */
const PLACE_WINDOW_MS = 3000;

export type MrHooks = {
  /** Called with the placement in local space and the head it was chosen for. */
  onPlace(placement: Placement, head: Head): void;
  onHands(present: boolean): void;
  /** Called when a two-hand pinch hold fires, just before the tray is re-placed. */
  onRecenter(): void;
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

function pinching(frame: XRFrame, space: XRReferenceSpace, source: XRInputSource): boolean {
  const thumb = source.hand?.get('thumb-tip');
  const index = source.hand?.get('index-finger-tip');
  const a = thumb && frame.getJointPose?.(thumb, space);
  const b = index && frame.getJointPose?.(index, space);
  return !!a && !!b && Math.hypot(a.transform.position.x - b.transform.position.x, a.transform.position.y - b.transform.position.y, a.transform.position.z - b.transform.position.z) < PINCH_M;
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
        const both = hands.length === 2 && hands.every((s) => pinching(frame, space, s));
        if (hold(now, both)) {
          hooks.onRecenter();
          hooks.onPlace(choose(frame, space, head), head);
        }
      }
      session.requestAnimationFrame(tick);
    };
    session.requestAnimationFrame(tick);
  });
}
