import { fitsComfort, poseToWorld, toHeadFrame, type Fit, type Head, type Placement } from './anchor';
import type { TrayPose, Vec3 } from './seat';

/**
 * The tray's spot, kept between sessions. The local reference space starts wherever the head is when a session starts,
 * so a raw local pose means nothing next time. What does carry over for a seated player is where the tray sat relative
 * to their head (yaw only: they sit facing the same table), so that is what is saved. Where the runtime offers
 * persistent anchors (src/keeper.ts), the handle of one pinned at the tray is saved too, and the tray comes back to
 * that spot in the room instead.
 */
export const TRAY_KEY = 'chronogrip.tray.v1';

export type SavedTray = {
  /** In the head frame the tray was placed for: head at the origin, facing -Z. */
  pose: TrayPose;
  source: Placement['source'];
  stand: number;
  /** How the tray sat on its table; older saves have none and read as 'default'. */
  fit?: Fit;
  /** A persistent anchor handle at the tray centre, when the runtime gave one. */
  anchor?: string;
};

/** Why the tray was placed: the plane search (or its default), a two-hand recenter, a saved pose, or a restored anchor. */
export type PlaceWhy = 'search' | 'recenter' | 'saved' | 'anchor';

/** A plane found by the search is saved, and so is any recenter (the player chose that spot); the timed default is not. */
export const keeps = (why: PlaceWhy, p: Placement): boolean => why === 'recenter' || (why === 'search' && p.source === 'plane');

/** Yaw (radians about Y, 0 facing -Z) of an orientation quaternion. */
export const yawOf = ({ x, y, z, w }: { x: number; y: number; z: number; w: number }): number =>
  Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));

/** A local-space placement as saved: its pose moved into the head frame. */
export function savedFrom(p: Placement, head: Head, anchor?: string): SavedTray {
  const pose: TrayPose = { position: toHeadFrame(p.pose.position, head), tilt: p.pose.tilt, yaw: (p.pose.yaw ?? 0) - head.yaw };
  return { pose, source: p.source, stand: p.stand, fit: p.fit, ...(anchor === undefined ? {} : { anchor }) };
}

/** The saved placement in front of this head. */
export const restoreAt = (s: SavedTray, head: Head): Placement => ({ pose: poseToWorld(s.pose, head), source: s.source, stand: s.stand, fit: s.fit ?? 'default' });

/** The saved placement at a restored anchor (local space), or null if that spot is out of comfortable reach of this head. */
export function anchoredAt(s: SavedTray, at: { position: Vec3; yaw: number }, head: Head): Placement | null {
  const inHead: TrayPose = { position: toHeadFrame(at.position, head), tilt: s.pose.tilt, yaw: at.yaw - head.yaw };
  if (!fitsComfort(inHead)) return null;
  return { pose: { position: at.position, tilt: s.pose.tilt, yaw: at.yaw }, source: s.source, stand: s.stand, fit: s.fit ?? 'default' };
}

export const serializeTray = (s: SavedTray): string => JSON.stringify({ v: 1, ...s });

const num = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
const HANDLE = /^[\w-]{1,128}$/;

/** A saved tray, or null for anything missing, corrupt, from another version or out of comfortable reach. Never throws. */
export function parseTray(raw: string | null | undefined): SavedTray | null {
  let o: unknown;
  try {
    o = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const { v, pose, source, stand, anchor, fit } = o as Record<string, unknown>;
  if (v !== 1 || (source !== 'plane' && source !== 'default') || !num(stand, 1) || stand < 0) return null;
  if (fit !== undefined && fit !== 'edge' && fit !== 'small' && fit !== 'default') return null;
  if (anchor !== undefined && (typeof anchor !== 'string' || !HANDLE.test(anchor))) return null;
  if (typeof pose !== 'object' || pose === null) return null;
  const { position, tilt, yaw } = pose as Record<string, unknown>;
  if (!Array.isArray(position) || position.length !== 3 || !position.every((c) => num(c, 2))) return null;
  if (!num(tilt, Math.PI) || (yaw !== undefined && !num(yaw, 2 * Math.PI))) return null;
  const p: TrayPose = { position: [position[0], position[1], position[2]], tilt, ...(yaw === undefined ? {} : { yaw }) };
  if (!fitsComfort(p)) return null;
  return { pose: p, source, stand, ...(fit === undefined ? {} : { fit }), ...(anchor === undefined ? {} : { anchor }) };
}

/** The saved tray, or null; blocked storage reads as nothing saved. */
export function loadTray(storage: Pick<Storage, 'getItem'> | null | undefined): SavedTray | null {
  try {
    return parseTray(storage?.getItem(TRAY_KEY));
  } catch {
    return null;
  }
}

export function saveTray(storage: Pick<Storage, 'setItem'> | null | undefined, s: SavedTray): void {
  try {
    storage?.setItem(TRAY_KEY, serializeTray(s));
  } catch {
    // quota or security error: the tray just will not come back next time
  }
}
