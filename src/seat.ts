import { gearRadii } from './gear';
import type { Level } from './levels';

export type Vec3 = readonly [number, number, number];

/**
 * Seated layout in the local reference space: head at the origin, -Z forward, +Y up.
 * The tray sits low and ahead, tilted so its normal points back at the player.
 * Tray-local axes: X right, Y normal (up from the surface), Z towards the player,
 * so a level (x, y) lands at tray-local (x, lift, -y).
 */
export type TrayPose = {
  position: Vec3;
  /** Radians about X; far edge up. */
  tilt: number;
  /** Radians about Y, applied after the tilt; turns the tray towards the player. Default 0. */
  yaw?: number;
};

export const TRAY_POSE: TrayPose = { position: [0, -0.19, -0.32], tilt: (50 * Math.PI) / 180 };

/** Everything the player touches must sit inside this volume around the head. */
export const COMFORT = { maxDistance: 0.6, maxYaw: 35, minPitch: -50, maxPitch: 10 } as const;

/** Tray board half extents in level coordinates (the tray is 0.40 x 0.30 m). */
export const TRAY_HALF = { x: 0.2, y: 0.15 } as const;

/** Gap between parts on the strip, metres. */
const STRIP_GAP = 0.012;
/** Radius of an axle pin, metres. */
export const PIN_RADIUS = 0.006;

/** Height of a gear centre above the tray surface for a layer. */
export const layerLift = (layer: number) => 0.006 + layer * 0.014;

export const trayLocal = (x: number, y: number, lift = 0): Vec3 => [x, lift, -y];

/** World position (reference space) of a level coordinate, `lift` metres above the tray surface. */
export function trayToWorld(x: number, y: number, lift = 0, pose: TrayPose = TRAY_POSE): Vec3 {
  const [lx, ly, lz] = trayLocal(x, y, lift);
  const c = Math.cos(pose.tilt);
  const s = Math.sin(pose.tilt);
  const ty = ly * c - lz * s;
  const tz = ly * s + lz * c;
  const cy = Math.cos(pose.yaw ?? 0);
  const sy = Math.sin(pose.yaw ?? 0);
  const [px, py, pz] = pose.position;
  return [px + lx * cy + tz * sy, py + ty, pz - lx * sy + tz * cy];
}

export function inComfortZone(p: Vec3): boolean {
  const [x, y, z] = p;
  if (z >= 0) return false;
  const deg = 180 / Math.PI;
  const yaw = Math.abs(Math.atan2(x, -z)) * deg;
  const pitch = Math.atan2(y, Math.hypot(x, z)) * deg;
  return (
    Math.hypot(x, y, z) <= COMFORT.maxDistance &&
    yaw <= COMFORT.maxYaw &&
    pitch >= COMFORT.minPitch &&
    pitch <= COMFORT.maxPitch
  );
}

export type Circle = { id: string; x: number; y: number; radius: number };

/** Space taken on the board: every axle pin and every fixed gear's tip circle. */
export function footprints(level: Level): Circle[] {
  const at = new Map(level.axles.map((a) => [a.id, a]));
  const pins = level.axles.map((a) => ({ id: a.id, x: a.x, y: a.y, radius: PIN_RADIUS }));
  const fixed = level.fixed.map((f) => {
    const a = at.get(f.axle)!;
    return { id: f.id, x: a.x, y: a.y, radius: gearRadii({ module: level.module, teeth: f.teeth }).tip };
  });
  return [...pins, ...fixed];
}

/**
 * Loose gears rest in one row on a ledge past the far edge of the board, centred on x = 0.
 * Far is up the tilted tray, which keeps the row inside the comfort cone.
 */
export function partsStrip(level: Level): Circle[] {
  const radii = level.tray.map((t) => gearRadii({ module: level.module, teeth: t.teeth }).tip);
  const width = radii.reduce((sum, r) => sum + 2 * r, 0) + STRIP_GAP * Math.max(0, radii.length - 1);
  const y = TRAY_HALF.y + STRIP_GAP + Math.max(0, ...radii);
  let x = -width / 2;
  return level.tray.map((t, i) => {
    const radius = radii[i]!;
    const c = { id: t.id, x: x + radius, y, radius };
    x += 2 * radius + STRIP_GAP;
    return c;
  });
}

/** Every point the player can grab or aim at, in world space. */
export function interactables(level: Level, pose: TrayPose = TRAY_POSE): Vec3[] {
  const axleAt = new Map(level.axles.map((a) => [a.id, a]));
  return [
    ...level.axles.map((a) => trayToWorld(a.x, a.y, layerLift(0), pose)),
    ...level.fixed.map((f) => {
      const a = axleAt.get(f.axle)!;
      return trayToWorld(a.x, a.y, layerLift(f.layer), pose);
    }),
    ...partsStrip(level).map((s) => trayToWorld(s.x, s.y, layerLift(0), pose)),
  ];
}
