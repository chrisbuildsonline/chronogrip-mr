import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { easeOut } from './tween';
import { trayLocal, type Vec3 } from './seat';

/** One loop of the ghost hand: reach, pinch, carry, let go, fade. */
export const GHOST_PERIOD_S = 3.4;
const GRIP = 0.012;
const HOVER = 0.07;
const ARC = 0.05;

export type GhostState = { pos: Vec3; pinch: number; opacity: number; carrying: boolean };

const span = (u: number, a: number, b: number) => Math.min(1, Math.max(0, (u - a) / (b - a)));

/** Ghost hand at time t seconds: pos is [level x, level y, lift] of its pinch point, carrying from `from` to `to`. */
export function ghostAt(t: number, from: readonly [number, number], to: readonly [number, number]): GhostState {
  const u = (((t % GHOST_PERIOD_S) + GHOST_PERIOD_S) % GHOST_PERIOD_S) / GHOST_PERIOD_S;
  const k = easeOut(span(u, 0.26, 0.56));
  const [x, y] = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
  let lift = GRIP;
  if (u < 0.18) lift = HOVER - (HOVER - GRIP) * easeOut(span(u, 0, 0.18));
  else if (u < 0.56) lift = GRIP + ARC * Math.sin(Math.PI * span(u, 0.26, 0.56));
  else if (u >= 0.64) lift = GRIP + (HOVER - GRIP) * easeOut(span(u, 0.64, 0.8));
  const pinch = u < 0.18 || u >= 0.64 ? 0 : u < 0.26 ? span(u, 0.18, 0.26) : u < 0.56 ? 1 : 1 - span(u, 0.56, 0.64);
  const opacity = u < 0.1 ? span(u, 0, 0.1) : u < 0.64 ? 1 : 1 - span(u, 0.64, 0.8);
  return { pos: [x, y, lift], pinch, opacity, carrying: u >= 0.26 && u < 0.56 };
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const UP = v(0, 1, 0);

/**
 * A translucent stylised right hand, pinch point at its origin; +Y is the tray normal, +Z towards the player.
 * Fingers are capsules swung from their knuckles, so a pinch closes thumb and index on the origin.
 */
export function createGhostHand(gearGeometry: BufferGeometry) {
  const skin = new MeshStandardMaterial({ color: 0xf6efe2, emissive: 0xf6efe2, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, depthWrite: false });
  const ghostBrass = new MeshStandardMaterial({ color: 0xd9b26a, emissive: 0xd99a2b, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.4, transparent: true, depthWrite: false });
  const hand = new Group();
  const root = new Group();
  root.name = 'ghost-hand';
  root.add(hand);
  const limb = (length: number, radius: number) => {
    const m = new Mesh(new CapsuleGeometry(radius, length, 4, 10), skin);
    hand.add(m);
    return { m, length };
  };
  const swing = ({ m, length }: { m: Mesh; length: number }, knuckle: Vector3, toward: Vector3) => {
    const dir = toward.clone().sub(knuckle).normalize();
    m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir));
    m.position.copy(knuckle).addScaledVector(dir, length / 2);
  };
  const index = limb(0.052, 0.0085);
  const thumb = limb(0.044, 0.0095);
  const curled = [0.019, 0.036, 0.051].map((x) => ({ x, l: limb(0.026, 0.0085) }));
  const palm = new Mesh(new RoundedBoxGeometry(0.068, 0.024, 0.07, 3, 0.011), skin);
  palm.position.set(0.026, 0.078, 0.004);
  const wrist = limb(0.05, 0.016);
  swing(wrist, v(0.028, 0.085, 0.035), v(0.03, 0.13, 0.1));
  hand.add(palm);
  for (const { x, l } of curled) swing(l, v(x, 0.066, -0.026), v(x, 0.034, -0.004));
  const gear = new Mesh(gearGeometry, ghostBrass);
  gear.rotation.x = -Math.PI / 2;
  root.add(gear);

  return {
    root,
    /** The translucent gear carried during the loop; swap its geometry when the level changes. */
    gear,
    update(s: GhostState) {
      root.visible = s.opacity > 0.01;
      root.position.set(...trayLocal(s.pos[0], s.pos[1], s.pos[2]));
      skin.opacity = 0.62 * s.opacity;
      ghostBrass.opacity = 0.5 * s.opacity;
      gear.visible = s.carrying;
      gear.position.y = -0.004;
      const gap = 0.004 + 0.018 * (1 - s.pinch);
      swing(index, v(0.002, 0.066, -0.03), v(0, 0, -gap));
      swing(thumb, v(0.026, 0.05, 0.034), v(0, 0, gap));
    },
  };
}
