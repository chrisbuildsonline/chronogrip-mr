import { World } from '@iwsdk/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { APP_TITLE, createWorldOptions } from './config';
import { DEFAULT_PLACEMENT, toHeadFrame, type Head } from './anchor';
import { startSession } from './enter';
import { Euler, Plane, Quaternion, Raycaster, Vector2, Vector3, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { occupiedAt, pickGear, snapAxle } from './grab';
import { handNear, rayPick, validAxles } from './hover';
import { LEVELS, checkLevel } from './levels';
import { buildScene } from './scene';
import { trackMr } from './mr';
import { TRAY_POSE, layerLift, partsStrip, trayLocal, trayToWorld, worldToTray, type TrayPose, type Vec3 } from './seat';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

document.title = `${APP_TITLE} MR`;
const heading = document.getElementById('title');
if (heading) heading.textContent = APP_TITLE;

const enterButton = document.getElementById('enter-mr') as HTMLButtonElement | null;
const enterNote = document.getElementById('enter-note');
if (!enterButton || !enterNote) throw new Error('Enter MR controls missing');

const world = await World.create(container, createWorldOptions());

const level = LEVELS[0]!;
const built = buildScene(level, world.scene, world.renderer);

// Desktop preview: look at the tray centre from a bit more oblique than its normal, so depth shows.
const target = trayToWorld(0, 0);
const view = TRAY_POSE.tilt + (25 * Math.PI) / 180;
world.camera.position.set(target[0] + 0.1, target[1] + Math.cos(view) * 0.6, target[2] + Math.sin(view) * 0.6);
const controls = new OrbitControls(world.camera, world.renderer.domElement);
controls.target.set(...target);
controls.update();
world.renderer.xr.addEventListener('sessionstart', () => (controls.enabled = false));
world.renderer.xr.addEventListener('sessionend', () => (controls.enabled = true));

// Board state: which loose gear sits on which axle, and which one a hand or the mouse is carrying.
const axleOf = new Map(level.axles.map((a) => [a.id, a]));
const layerOf = new Map(level.tray.map((g) => [g.id, g.layer]));
const slots = new Map(partsStrip(level).map((s) => [s.id, s]));
const placements: Record<string, string> = {};
let solved = checkLevel(level, placements).solved;
let held: string | null = null;
let holder: 'left' | 'right' | 'mouse' | null = null;
/** A hand point this close to a gear centre makes it glow, metres. */
const HAND_NEAR_M = 0.05;
const pinching = { left: false, right: false };
const pinchPoints: { left: Vec3 | null; right: Vec3 | null } = { left: null, right: null };
const handPoints: { left: Vec3 | null; right: Vec3 | null } = { left: null, right: null };

/** The tray's current pose in world space, read from the tray group (placement and recenter move it). */
const currentPose = (): TrayPose => {
  built.tray.updateMatrixWorld();
  const p = built.tray.getWorldPosition(new Vector3());
  const e = new Euler().setFromQuaternion(built.tray.getWorldQuaternion(new Quaternion()), 'YXZ');
  return { position: [p.x, p.y, p.z], tilt: e.x, yaw: e.y };
};
const setGear = (id: string, x: number, y: number, lift: number) => built.loose.get(id)!.position.set(...trayLocal(x, y, lift));
const toSlot = (id: string) => setGear(id, slots.get(id)!.x, slots.get(id)!.y, layerLift(0));
const worldOf = (v: Vector3): Vec3 => {
  built.tray.updateMatrixWorld();
  const w = built.tray.localToWorld(v.clone());
  return [w.x, w.y, w.z];
};

/** Picks up the loose gear nearest a world point, if one is within reach; freeing its axle. */
function grab(world: Vec3): boolean {
  const point = worldToTray(world, currentPose());
  const id = pickGear(
    point,
    [...built.loose].filter(([gid]) => gid !== held).map(([gid, m]) => ({ id: gid, x: m.position.x, y: -m.position.z, lift: m.position.y })),
  );
  if (!id) return false;
  held = id;
  if (delete placements[id]) solved = checkLevel(level, placements).solved;
  drag(world);
  return true;
}

function drag(world: Vec3): void {
  const [x, y, lift] = worldToTray(world, currentPose());
  if (held) setGear(held, x, y, lift);
}

/** Drops the carried gear: onto a free axle in reach, else back to its slot in the strip. */
function release(): void {
  const id = held;
  held = holder = null;
  if (!id) return;
  const m = built.loose.get(id)!;
  const layer = layerOf.get(id)!;
  const axle = snapAxle([m.position.x, -m.position.z], level.axles, occupiedAt(level, placements, id), layer);
  if (axle) {
    setGear(id, axleOf.get(axle)!.x, axleOf.get(axle)!.y, layerLift(layer));
    placements[id] = axle;
  } else toSlot(id);
  solved = checkLevel(level, placements).solved;
}

// Desktop: drag a loose gear across the tray plane with the mouse; dragging empty space still orbits.
const canvas = world.renderer.domElement;
const mouseOnTray = (e: PointerEvent): Vec3 | null => {
  const rect = canvas.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), world.camera);
  const q = built.tray.getWorldQuaternion(new Quaternion());
  const plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0).applyQuaternion(q), new Vector3(...worldOf(new Vector3(0, layerLift(0), 0))));
  const hit = ray.ray.intersectPlane(plane, new Vector3());
  return hit && [hit.x, hit.y, hit.z];
};
canvas.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0 || world.renderer.xr.isPresenting || holder !== null) return;
    const p = mouseOnTray(e);
    if (p && grab(p)) {
      holder = 'mouse';
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
    }
  },
  { capture: true },
);
let mouseRay: [Vec3, Vec3] | null = null;
canvas.addEventListener('pointermove', (e) => {
  const p = holder === 'mouse' && mouseOnTray(e);
  if (p) drag(p);
  const rect = canvas.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), world.camera);
  mouseRay = [ray.ray.origin.toArray(), ray.ray.direction.toArray()];
});
canvas.addEventListener('pointerleave', () => (mouseRay = null));
const mouseUp = () => {
  if (holder !== 'mouse') return;
  release();
  controls.enabled = true;
};
canvas.addEventListener('pointerup', mouseUp);
canvas.addEventListener('pointercancel', mouseUp);

// Where the tray sits: the default until a session finds a plane. trayPose is relative to the head it was placed for.
let placement = DEFAULT_PLACEMENT;
let placedPose: TrayPose = TRAY_POSE;
let handHint = false;
let recenters = 0;
trackMr(world.renderer, {
  onRecenter() {
    recenters++;
  },
  onPlace(next, head: Head) {
    placement = next;
    const [x, y, z] = toHeadFrame(next.pose.position, head);
    placedPose = { position: [x, y, z], tilt: next.pose.tilt, yaw: (next.pose.yaw ?? 0) - head.yaw };
    built.place(next);
  },
  onHands(present) {
    handHint = !present;
    built.showHandHint(handHint);
  },
  onHandPoint(hand, point) {
    handPoints[hand] = point;
  },
  onPinch(hand, point) {
    if (point && holder === null && !pinching[hand] && grab(point)) holder = hand;
    pinching[hand] = point !== null;
    pinchPoints[hand] = point;
    if (holder !== hand) return;
    if (point) drag(point);
    else release();
  },
});
world.renderer.xr.addEventListener('sessionend', () => {
  release();
  placement = DEFAULT_PLACEMENT;
  placedPose = TRAY_POSE;
  handHint = false;
  built.place(DEFAULT_PLACEMENT);
  built.showHandHint(false);
});

// Hover hints, refreshed every rendered frame: gaze tint, hand glow, and pulsing rings on valid axles.
const GAZE_TINT = { color: 0xffe2b0, intensity: 0.3 };
const HAND_TINT = { color: 0xff8a2a, intensity: 0.9 };
const gazeSpheres = [...built.gears].map(([id, m]) => ({ kind: 'gear' as const, id, mesh: m, radius: (m.geometry.boundingSphere ?? m.geometry.computeBoundingSphere() ?? { radius: 0.03 }).radius }));
const pinSpheres = [...built.pins].map(([id, m]) => ({ kind: 'axle' as const, id, mesh: m, radius: 0.015 }));
let gazeTarget: { kind: 'gear' | 'axle'; id: string } | null = null;
let handGlow: string[] = [];
let validNow: string[] = [];
const tint = (mesh: Mesh, t: { color: number; intensity: number } | null) => {
  const mat = mesh.material as MeshStandardMaterial;
  mat.emissive.set(t?.color ?? 0x000000);
  mat.emissiveIntensity = t?.intensity ?? 0;
};
world.scene.onBeforeRender = () => {
  // WebXR has no general eye-gaze API, so in XR the gaze ray is the head (viewer pose) forward direction.
  const ray: [Vec3, Vec3] | null = world.renderer.xr.isPresenting
    ? [world.camera.getWorldPosition(new Vector3()).toArray(), world.camera.getWorldDirection(new Vector3()).toArray()]
    : mouseRay;
  const spheres = [...gazeSpheres, ...pinSpheres].map((s) => ({ kind: s.kind, id: s.id, radius: s.radius, center: worldOf(s.mesh.position) }));
  gazeTarget = ray && rayPick(ray[0], ray[1], spheres);
  handGlow = handNear(
    (['left', 'right'] as const).map((h) => (holder === h ? null : handPoints[h])),
    [...built.loose].map(([id, m]) => ({ id, center: worldOf(m.position) })),
    HAND_NEAR_M,
  );
  validNow = validAxles(level, placements, held);
  for (const s of [...gazeSpheres, ...pinSpheres]) {
    tint(s.mesh, s.kind === 'gear' && handGlow.includes(s.id) ? HAND_TINT : gazeTarget?.kind === s.kind && gazeTarget.id === s.id ? GAZE_TINT : null);
  }
  const pulse = Math.sin(performance.now() / 160);
  for (const [id, ring] of built.rings) {
    ring.visible = validNow.includes(id);
    (ring.material as MeshBasicMaterial).opacity = 0.65 + 0.35 * pulse;
    ring.scale.setScalar(1 + 0.15 * pulse);
  }
};

const supported = await (navigator.xr?.isSessionSupported('immersive-ar') ?? Promise.resolve(false)).catch(() => false);
if (supported) {
  enterButton.disabled = false;
  enterNote.hidden = true;
  enterButton.addEventListener('click', () => void startSession(() => world.launchXR(), enterNote));
}

window.__chrono = Object.freeze({
  levelId: level.id,
  gearCount: built.gearCount,
  axleCount: built.axleCount,
  ready: true as const,
  get xrPresenting() {
    return world.renderer.xr.isPresenting;
  },
  get trayPose() {
    return placedPose;
  },
  get trayPlaced() {
    return placement.source;
  },
  get recenters() {
    return recenters;
  },
  get handHint() {
    return handHint;
  },
  get placements() {
    return { ...placements };
  },
  get held() {
    return held;
  },
  get solved() {
    return solved;
  },
  get gears() {
    return Object.fromEntries([...built.loose].map(([id, m]) => [id, worldOf(m.position)]));
  },
  get axles() {
    return Object.fromEntries(level.axles.map((a) => [a.id, worldOf(new Vector3(...trayLocal(a.x, a.y, layerLift(0))))]));
  },
  get gazeTarget() {
    return gazeTarget;
  },
  get handGlow() {
    return [...handGlow];
  },
  get validAxles() {
    return [...validNow];
  },
  get pinchPoints() {
    return { ...pinchPoints };
  },
  toScreen(p: Vec3): [number, number] {
    const v = new Vector3(...p).project(world.camera);
    const rect = canvas.getBoundingClientRect();
    return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
  },
});
