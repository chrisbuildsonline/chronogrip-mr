import type { Vec3 } from './seat';

/** Snap and float-back time, milliseconds. */
export const TWEEN_MS = 200;

/** Cubic ease-out, clamped to [0, 1]. */
export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export function tweenAt(from: Vec3, to: Vec3, elapsedMs: number, durationMs = TWEEN_MS): { pos: Vec3; done: boolean } {
  if (elapsedMs >= durationMs) return { pos: [...to], done: true };
  const k = easeOut(elapsedMs / durationMs);
  return { pos: [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k], done: false };
}
