import { InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';

/**
 * The stage-cleared celebration (all 20 levels of a stage solved): brass gear confetti bursting from the tray and the stage's
 * backdrop parts spinning up to a whirr and settling back. Sound (the chime and the bird's song) is src/sound.ts's fanfare.
 */
export const CELEBRATE = {
  /** Seconds the confetti flies. */
  seconds: 4.5,
  /** Gears in the burst; reduced motion has none. */
  gears: 48,
  /** Extra beats the backdrop parts turn through over the spin-up, on top of the music's own. */
  spinBeats: 24,
  /** Seconds the spin-up lasts. */
  spinSeconds: 3.2,
} as const;

/**
 * Extra beats `t` seconds into the spin-up: a smooth speed bump (fast in the middle, still at both ends), so the parts whirr
 * up and settle with no jump. 0 before it starts, `spinBeats` once it is over.
 */
export function spinUpBeats(t: number, total = CELEBRATE.spinBeats, seconds = CELEBRATE.spinSeconds): number {
  if (!(t > 0)) return 0;
  if (t >= seconds) return total;
  const u = t / seconds;
  return total * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI)); // the integral of 1 - cos: a speed curve that starts and ends at 0
}

/** A small seeded random (mulberry32), so a burst is the same every time for one seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAVITY = 0.9; // m/s², gentler than real so the gears hang in the air a moment over the tray
type Piece = { v: Vector3; axis: Vector3; spin: number; size: number; up: number };

/**
 * Gear confetti: one instanced mesh of small gears thrown up and out from a point, tumbling, falling under a soft gravity and
 * shrinking away over the last second. `start` sets it off; `update` moves it and returns whether it is still flying.
 */
export function createConfetti(geometry: BufferGeometry, material: Material, count = CELEBRATE.gears) {
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = 'confetti';
  mesh.visible = false;
  mesh.frustumCulled = false; // the pieces fly well outside the geometry's own bounds
  let pieces: Piece[] = [];
  let startedAt = -Infinity;
  const origin = new Vector3(), up = new Vector3(0, 1, 0);
  let floor = -Infinity; // how far below the origin (along up) the gears land and lie still
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), scale = new Vector3();

  /** When piece i lands on the floor, s after the throw (Infinity with no floor). */
  const landsAt = (p: Piece) => (Number.isFinite(floor) ? (p.up + Math.sqrt(p.up * p.up - 2 * GRAVITY * floor)) / GRAVITY : Infinity);
  /** Where piece i is at t seconds (for tests too): thrown from the origin, gravity along -up, lying still once it lands. */
  const at = (i: number, t: number, out = new Vector3()) => {
    const p = pieces[i]!, s = Math.min(t, landsAt(p));
    return out.copy(origin).addScaledVector(p.v, s).addScaledVector(up, -0.5 * GRAVITY * s * s);
  };

  return {
    mesh,
    at,
    get flying() {
      return mesh.visible;
    },
    /** Sets the burst off from `from` (world), with `upward` as the sky. The same seed makes the same burst. */
    start(from: Vector3, upward: Vector3, now: number, seed = 1, landAt = -Infinity): void {
      floor = Math.min(0, landAt);
      const r = rng(seed);
      origin.copy(from);
      up.copy(upward).normalize();
      // a side direction to fan the throws around the up axis
      const side = new Vector3(1, 0, 0).cross(up).lengthSq() > 1e-6 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
      side.addScaledVector(up, -side.dot(up)).normalize();
      const side2 = new Vector3().crossVectors(up, side);
      pieces = Array.from({ length: count }, () => {
        const a = r() * Math.PI * 2, out = 0.08 + r() * 0.2, rise = 0.75 + r() * 0.4; // up to ~0.7 m: a fountain over the tray, in view
        const v = new Vector3().addScaledVector(side, Math.cos(a) * out).addScaledVector(side2, Math.sin(a) * out).addScaledVector(up, rise);
        return { v, up: rise, axis: new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), spin: 4 + r() * 10, size: 0.6 + r() * 0.7 };
      });
      startedAt = now;
      mesh.visible = true;
      this.update(now);
    },
    /** Moves every piece to `now` (ms); hides the mesh and returns false once the burst is over. */
    update(now: number): boolean {
      if (!mesh.visible) return false;
      const t = (now - startedAt) / 1000;
      if (t >= CELEBRATE.seconds) {
        mesh.visible = false;
        return false;
      }
      const fade = Math.min(1, (CELEBRATE.seconds - t) / 1); // shrinks away over the last second
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i]!;
        at(i, t, pos);
        q.setFromAxisAngle(p.axis, p.spin * Math.min(t, landsAt(p))); // a landed gear stops tumbling
        scale.setScalar(p.size * fade);
        mesh.setMatrixAt(i, m.compose(pos, q, scale));
      }
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },
    stop(): void {
      mesh.visible = false;
    },
  };
}
export type Confetti = ReturnType<typeof createConfetti>;
