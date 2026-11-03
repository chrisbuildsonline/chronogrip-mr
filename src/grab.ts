import type { Axle } from './train';
import type { Level } from './levels';
import type { Vec3 } from './seat';

/** A pinch within this distance of a gear centre picks it up, metres. */
export const GRAB_M = 0.04;
/** A released gear within this distance of a free axle snaps onto it, metres. */
export const SNAP_M = 0.025;

export type Hand = 'left' | 'right';
/** 'iwsdk': IWSDK's GrabSystem picks gears up (the default). 'pinch': our raw-joint pinch does (`?grab=pinch`). */
export type GrabMode = 'iwsdk' | 'pinch';
/** Frames the raw pinch waits for IWSDK's grab to arrive before it picks the gear up itself. */
export const GRAB_WAIT_FRAMES = 4;

export const grabModeOf = (search: string): GrabMode => (new URLSearchParams(search).get('grab') === 'pinch' ? 'pinch' : 'iwsdk');

/** Who picks up the gear a pinch is on: the raw path now, it keeps waiting, or it skips because IWSDK has grabbed it. */
export function pinchOwner(mode: GrabMode, framesWaited: number, grabbed: boolean): 'raw' | 'wait' | 'skip' {
  if (mode === 'pinch') return 'raw';
  if (grabbed) return 'skip';
  return framesWaited >= GRAB_WAIT_FRAMES ? 'raw' : 'wait';
}

/** The hand carrying a gear: the one IWSDK says, else the nearest pinching hand to the gear, else null. */
export function holderHand(
  iwsdk: Hand | null,
  pinching: Record<Hand, boolean>,
  points: Record<Hand, Vec3 | null>,
  at: Vec3,
): Hand | null {
  if (iwsdk) return iwsdk;
  let best: Hand | null = null;
  let bestD = Infinity;
  for (const h of ['left', 'right'] as const) {
    const p = points[h];
    if (!pinching[h] || !p) continue;
    const d = Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
    if (d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/** Nearest candidate to a tray-space point [x, y, lift], or null if none is within `maxM`. */
export function pickGear(point: Vec3, candidates: readonly { id: string; x: number; y: number; lift: number }[], maxM = GRAB_M): string | null {
  let best: string | null = null;
  let bestD = maxM;
  for (const c of candidates) {
    const d = Math.hypot(point[0] - c.x, point[1] - c.y, point[2] - c.lift);
    if (d <= bestD) {
      best = c.id;
      bestD = d;
    }
  }
  return best;
}

/** Axle/layer pairs already holding a gear: the fixed ones plus placed loose gears, except `ignore`. */
export function occupiedAt(level: Level, placements: Record<string, string>, ignore?: string): { axle: string; layer: number }[] {
  const loose = new Map(level.tray.map((g) => [g.id, g.layer]));
  return [
    ...level.fixed.map((f) => ({ axle: f.axle, layer: f.layer })),
    ...Object.entries(placements)
      .filter(([id]) => id !== ignore)
      .map(([id, axle]) => ({ axle, layer: loose.get(id)! })),
  ];
}

/** The nearest axle within `maxM` of a gear centre [x, y] that has nothing at `layer`, or null. */
export function snapAxle(
  centre: readonly [number, number],
  axles: readonly Axle[],
  occupied: readonly { axle: string; layer: number }[],
  layer: number,
  maxM = SNAP_M,
): string | null {
  let best: string | null = null;
  let bestD = maxM;
  for (const a of axles) {
    if (occupied.some((o) => o.axle === a.id && o.layer === layer)) continue;
    const d = Math.hypot(centre[0] - a.x, centre[1] - a.y);
    if (d <= bestD) {
      best = a.id;
      bestD = d;
    }
  }
  return best;
}
