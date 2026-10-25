import type { Axle } from './train';
import type { Level } from './levels';
import type { Vec3 } from './seat';

/** A pinch within this distance of a gear centre picks it up, metres. */
export const GRAB_M = 0.04;
/** A released gear within this distance of a free axle snaps onto it, metres. */
export const SNAP_M = 0.025;

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
