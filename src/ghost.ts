import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { easeOut } from './tween';
import { trayLocal, type Vec3 } from './seat';

/** One loop of the ghost hand: reach, pinch, carry, let go, fade. */
export const GHOST_PERIOD_S = 3.4;
const GRIP = 0.012;
const HOVER = 0.07;
const ARC = 0.05;

/** One loop of the twist cue: come down onto the knob, pinch, roll the wrist, let go, lift off. */
export const GHOST_TWIST_S = 2.8;
/** How far the cue rolls the wrist, radians. */
const TWIST_ROLL = 1;

/** `roll` turns the hand about the tray normal through its pinch point, clockwise (seen from above) positive. */
export type GhostState = { pos: Vec3; pinch: number; opacity: number; carrying: boolean; roll?: number };

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

/** Twist cue at time t seconds over the knob at [level x, level y]; `dir` is the way to turn (+1 clockwise). */
export function ghostTwistAt(t: number, at: readonly [number, number], dir: 1 | -1): GhostState {
  const u = (((t % GHOST_TWIST_S) + GHOST_TWIST_S) % GHOST_TWIST_S) / GHOST_TWIST_S;
  const lift = u < 0.2 ? HOVER - (HOVER - GRIP) * easeOut(span(u, 0, 0.2)) : GRIP + (HOVER - GRIP) * easeOut(span(u, 0.8, 0.95));
  const pinch = u < 0.2 ? 0 : u < 0.28 ? span(u, 0.2, 0.28) : u < 0.74 ? 1 : 1 - span(u, 0.74, 0.8);
  const roll = dir * TWIST_ROLL * (u < 0.8 ? easeOut(span(u, 0.3, 0.66)) : 1);
  const opacity = u < 0.1 ? span(u, 0, 0.1) : u < 0.8 ? 1 : 1 - span(u, 0.8, 1);
  return { pos: [at[0], at[1], lift], pinch, opacity, carrying: false, roll };
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const UP = v(0, 1, 0);

/** Cream skin with an amber Fresnel rim: the hand's outline and each finger's edge glow, so it reads against wood and brass. */
function ghostSkin() {
  const m = new MeshStandardMaterial({ color: 0xcdbfa8, roughness: 0.7, transparent: true });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.85, 0.5, 0.1) * 2.2 * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 1.8);',
    );
  };
  return m;
}

/**
 * A translucent stylised right hand, pinch point at its origin; +Y is the tray normal, +Z towards the player.
 * Seen from the seat it shows the back of the hand: a palm, four jointed fingers reaching up the board and a thumb
 * from the near side. A pinch closes the tips of thumb and index on the origin.
 */
export function createGhostHand(gearGeometry: BufferGeometry) {
  const skin = ghostSkin();
  const ghostBrass = new MeshStandardMaterial({ color: 0xd9b26a, emissive: 0xd99a2b, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.4, transparent: true, depthWrite: false });
  const hand = new Group();
  const root = new Group();
  root.name = 'ghost-hand';
  root.add(hand);
  const scratch = new Vector3();
  /** A capsule from a to b; it stretches a little when a pinch moves its ends. */
  const bone = (radius: number, a: Vector3, b: Vector3) => {
    const length = a.distanceTo(b);
    const m = new Mesh(new CapsuleGeometry(radius, length, 4, 10), skin);
    hand.add(m);
    const set = (from: Vector3, to: Vector3) => {
      const dir = scratch.copy(to).sub(from);
      m.scale.y = dir.length() / length;
      m.quaternion.setFromUnitVectors(UP, dir.normalize());
      m.position.copy(from).add(to).multiplyScalar(0.5);
    };
    set(a, b);
    return set;
  };
  /** Two bones through knuckle, joint and tip. */
  const finger = (radius: number, knuckle: Vector3, joint: Vector3, tip: Vector3) => {
    const near = bone(radius, knuckle, joint);
    const far = bone(radius * 0.92, joint, tip);
    return (j: Vector3, t: Vector3) => (near(knuckle, j), far(j, t));
  };

  const palm = new Mesh(new RoundedBoxGeometry(0.066, 0.02, 0.072, 3, 0.009), skin);
  palm.position.set(0.032, 0.068, 0.056);
  palm.rotation.x = -0.4; // far end low, towards the fingers
  hand.add(palm);
  bone(0.016, v(0.034, 0.08, 0.088), v(0.038, 0.1, 0.13)); // wrist
  // Middle, ring and little fingers, loosely curled up the board past the pinch.
  finger(0.0074, v(0.026, 0.054, 0.02), v(0.027, 0.042, -0.012), v(0.027, 0.022, -0.032));
  finger(0.0071, v(0.042, 0.053, 0.022), v(0.044, 0.041, -0.006), v(0.045, 0.024, -0.024));
  finger(0.0062, v(0.057, 0.05, 0.026), v(0.06, 0.04, 0.006), v(0.061, 0.027, -0.008));
  const knuckle = { index: v(0.008, 0.055, 0.02), thumb: v(-0.004, 0.05, 0.066) };
  const index = finger(0.0076, knuckle.index, v(0.005, 0.036, -0.012), v(0, 0, -0.022));
  const thumb = finger(0.0086, knuckle.thumb, v(-0.016, 0.026, 0.034), v(0, 0, 0.022));
  const [joint, tip] = [new Vector3(), new Vector3()];

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
      skin.opacity = 0.78 * s.opacity;
      ghostBrass.opacity = 0.5 * s.opacity;
      gear.visible = s.carrying;
      gear.position.y = -0.004;
      hand.rotation.y = -(s.roll ?? 0);
      const gap = 0.004 + 0.018 * (1 - s.pinch);
      index(joint.set(0.005, 0.036, -0.004 - 0.4 * gap), tip.set(0, 0, -gap));
      thumb(joint.set(-0.016, 0.026, 0.026 + 0.4 * gap), tip.set(0, 0, gap));
    },
  };
}
