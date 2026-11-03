import type { Head, Placement } from './anchor';
import { anchoredAt, loadTray, restoreAt, savedFrom, saveTray, yawOf, type SavedTray } from './persist';

/** What the keeper needs from an XRSession: the WebXR anchors module's persistence, all optional. */
export type KeeperSession = Pick<XRSession, 'persistentAnchors' | 'restorePersistentAnchor' | 'deletePersistentAnchor'>;
/** What it needs from an XRFrame. */
export type KeeperFrame = Pick<XRFrame, 'createAnchor' | 'getPose'>;
type Storage2 = Pick<Storage, 'getItem' | 'setItem'> | null;

const quiet = (p: Promise<unknown> | undefined) => void p?.catch(() => {});

/**
 * Saves and restores the tray's spot for one XR session (src/persist.ts says what is saved and why). The head-relative
 * pose is written at once; where the runtime has persistent anchors (`frame.createAnchor`, `requestPersistentHandle`,
 * `session.restorePersistentAnchor`, as in the Quest Browser and IWER) an anchor at the tray is added, and next session
 * the tray goes back to it once the runtime tracks it. Every anchor call may be missing or reject; then the
 * head-relative pose stands.
 */
export function createKeeper(storage: Storage2, session: KeeperSession) {
  let saved: SavedTray | null = null;
  /** Bumped by every save, so a late anchor from an older save or restore is dropped. */
  let gen = 0;
  /** Handle to restore once the runtime lists it. */
  let wanted: string | null = null;
  let restored: XRAnchor | null = null;

  const restore = () => {
    const uuid = wanted;
    const list = session.persistentAnchors;
    if (!uuid || !session.restorePersistentAnchor || (list && !list.includes(uuid))) return;
    wanted = null;
    const mine = gen;
    quiet(session.restorePersistentAnchor(uuid).then((a) => void (gen === mine && (restored = a))));
  };

  return {
    /** First frame of a session: the saved placement in front of this head, or null. Asks for its anchor. */
    start(head: Head): Placement | null {
      saved = loadTray(storage);
      if (!saved) return null;
      wanted = saved.anchor ?? null;
      restore();
      return restoreAt(saved, head);
    },

    /** Every frame: the placement at the restored anchor, once, as soon as the runtime tracks it and if it is in reach. */
    poll(frame: KeeperFrame, space: XRReferenceSpace, head: Head): Placement | null {
      restore();
      if (!restored || !saved) return null;
      let pose: XRPose | undefined;
      try {
        pose = frame.getPose(restored.anchorSpace, space);
      } catch {
        restored = null; // deleted or lost
        return null;
      }
      if (!pose) return null;
      restored = null;
      const { position: p, orientation } = pose.transform;
      return anchoredAt(saved, { position: [p.x, p.y, p.z], yaw: yawOf(orientation) }, head);
    },

    /** Saves a placement over the old one (and its anchor); call inside the frame callback. */
    keep(frame: KeeperFrame, space: XRReferenceSpace, placement: Placement, head: Head): void {
      const mine = ++gen;
      wanted = null;
      restored = null;
      const old = saved?.anchor;
      if (old) quiet(session.deletePersistentAnchor?.(old));
      const next = savedFrom(placement, head);
      saved = next;
      saveTray(storage, next);
      if (!frame.createAnchor || typeof XRRigidTransform !== 'function') return;
      const [x, y, z] = placement.pose.position;
      const half = (placement.pose.yaw ?? 0) / 2;
      try {
        const made = frame.createAnchor(new XRRigidTransform({ x, y, z }, { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }), space);
        quiet(
          made
            ?.then((a) => a.requestPersistentHandle?.())
            .then((uuid) => {
              if (!uuid) return;
              if (gen !== mine) return quiet(session.deletePersistentAnchor?.(uuid));
              saved = { ...next, anchor: uuid };
              saveTray(storage, saved);
            }),
        );
      } catch {
        // anchors not enabled for this session: the head-relative save stands
      }
    },
  };
}
