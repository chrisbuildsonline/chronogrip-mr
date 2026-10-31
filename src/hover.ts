import { occupiedAt, snapAxle } from './grab';
import type { Level } from './levels';
import type { Vec3 } from './seat';

export type HoverTarget = { kind: 'gear' | 'axle'; id: string; center: Vec3; radius: number };

/** The nearest target whose sphere the ray hits in front of its origin; `dir` need not be unit length. */
export function rayPick(origin: Vec3, dir: Vec3, targets: readonly HoverTarget[]): { kind: 'gear' | 'axle'; id: string } | null {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len === 0) return null;
  const dx = dir[0] / len;
  const dy = dir[1] / len;
  const dz = dir[2] / len;
  let best: { kind: 'gear' | 'axle'; id: string } | null = null;
  let bestT = Infinity;
  for (const t of targets) {
    const ox = t.center[0] - origin[0];
    const oy = t.center[1] - origin[1];
    const oz = t.center[2] - origin[2];
    const along = ox * dx + oy * dy + oz * dz;
    if (along < 0) continue;
    const miss2 = ox ** 2 + oy ** 2 + oz ** 2 - along * along;
    if (miss2 > t.radius * t.radius) continue;
    const hit = along - Math.sqrt(t.radius * t.radius - miss2);
    if (hit < bestT) {
      bestT = hit;
      best = { kind: t.kind, id: t.id };
    }
  }
  return best;
}

/** Ids of the gears with a (tracked) hand point within `radius` of their centre; `out` is cleared and filled when given (no allocation). */
export function handNear(points: readonly (Vec3 | null)[], gears: readonly { id: string; center: Vec3 }[], radius: number, out: string[] = []): string[] {
  out.length = 0;
  for (const g of gears) {
    for (const p of points) {
      if (p && Math.hypot(p[0] - g.center[0], p[1] - g.center[1], p[2] - g.center[2]) <= radius) {
        out.push(g.id);
        break;
      }
    }
  }
  return out;
}

/** Axles where the held gear could snap: free at its layer, by the same rule as a release (`snapAxle`). */
export function validAxles(level: Level, placements: Record<string, string>, held: string | null): string[] {
  const gear = level.tray.find((g) => g.id === held);
  if (!gear) return [];
  const occupied = occupiedAt(level, placements, gear.id);
  return level.axles.filter((a) => snapAxle([a.x, a.y], [a], occupied, gear.layer) !== null).map((a) => a.id);
}
