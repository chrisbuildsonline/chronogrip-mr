import { World } from '@iwsdk/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { APP_TITLE, createWorldOptions } from './config';
import { DEFAULT_PLACEMENT, toHeadFrame, type Head } from './anchor';
import { startSession } from './enter';
import { DoubleSide, Euler, Mesh, MeshBasicMaterial, Plane, Quaternion, Raycaster, RingGeometry, Vector2, Vector3, type MeshStandardMaterial } from 'three';
import { occupiedAt, pickGear, snapAxle } from './grab';
import { handNear, rayPick, validAxles } from './hover';
import { LEVELS, checkLevel, type Level } from './levels';
import { buildScene } from './scene';
import { trackMr } from './mr';
import { TRAY_POSE, layerLift, partsStrip, trayLocal, worldToTray, type TrayPose, type Vec3 } from './seat';
import { TITLE, createClock, reloads, screenOf, step, type Flow, type FlowEvent } from './flow';
import { buttonAt, panelAnchor, panelToWorld, pokeHit, worldToPanel, type Anchor, type Button } from './ui';
import { createPanels } from './panels';
import { createGhostHand, ghostAt, ghostTwistAt } from './ghost';
import { easeOut, tweenAt } from './tween';
import type { GearSpin } from './train';
import { createRegulator, dragTwist, settingOf, startSetting, targetRate, twistOf, type Quat } from './escapement';
import { DIAL_AT, KNOB_GRAB_M, KNOB_TOP, createAutomaton, createEscapement } from './clockwork';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

document.title = `${APP_TITLE} MR`;
const heading = document.getElementById('title');
if (heading) heading.textContent = APP_TITLE;

const enterButton = document.getElementById('enter-mr') as HTMLButtonElement | null;
const enterNote = document.getElementById('enter-note');
if (!enterButton || !enterNote) throw new Error('Enter MR controls missing');

const world = await World.create(container, createWorldOptions());

let levelIndex = 0;
let level: Level = LEVELS[0]!;
const built = buildScene(level, world.scene, world.renderer);

// Desktop preview: from a little above and behind the seated head, framing the board and the panel above it.
world.camera.position.set(0.05, 0.13, 0.42);
const controls = new OrbitControls(world.camera, world.renderer.domElement);
controls.target.set(0, -0.07, -0.36);
controls.update();
world.renderer.xr.addEventListener('sessionstart', () => (controls.enabled = false));
world.renderer.xr.addEventListener('sessionend', () => (controls.enabled = true));

// Board state: which loose gear sits on which axle, and which one a hand or the mouse is carrying.
let axleOf = new Map(level.axles.map((a) => [a.id, a]));
let layerOf = new Map(level.tray.map((g) => [g.id, g.layer]));
let slots = new Map(partsStrip(level).map((s) => [s.id, s]));
let placements: Record<string, string> = {};
let solved = false;
let held: string | null = null;
/** The axle the held gear was lifted from, so a pause can put it back. */
let heldFrom: string | null = null;
let holder: 'left' | 'right' | 'mouse' | null = null;
/** A hand point this close to a gear centre makes it glow, metres. */
const HAND_NEAR_M = 0.05;
const pinching = { left: false, right: false };
const pinchPoints: { left: Vec3 | null; right: Vec3 | null } = { left: null, right: null };
const handPoints: { left: Vec3 | null; right: Vec3 | null } = { left: null, right: null };
const wrists: { left: Quat | null; right: Quat | null } = { left: null, right: null };
const tweens = new Map<string, { from: Vec3; to: Vec3; start: number }>();

// Level flow: title, playing, calibrate, complete, paused, level select; plus the level clock and best times.
// The clock runs only while playing: it stops when the train is solved, so calibrating is not timed.
let flow: Flow = TITLE;
const levelClock = createClock();
const best: (number | null)[] = LEVELS.map(() => null);
let spins: Record<string, GearSpin> = {};
/** When the last reward (solve, then calibrated) fired: gears flash and a ring bursts. */
let rewardAt = -Infinity;
let calibratedAt = 0;
let grabbedOnce = false;

// The escapement regulator: turned by a pinch and a wrist roll (or a mouse drag) while calibrating.
const newRegulator = () => createRegulator(targetRate(level), startSetting(level));
let regulator = newRegulator();
let turning: 'left' | 'right' | 'mouse' | null = null;
let lastWrist: Quat | null = null;
let lastMouseX = 0;
let turnedOnce = false;

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

const panels = createPanels();
world.scene.add(panels.root);
let anchor: Anchor = panelAnchor(level);
const placePanels = () => panels.setAnchor((anchor = panelAnchor(level, currentPose())));
placePanels();

const firstMove = () => Object.entries(level.solution)[0]!;
const ghost = createGhostHand(built.loose.get(firstMove()[0])!.geometry);
built.tray.add(ghost.root);
/** Level 1 only, no text: first the carry loop until the first grab, then the twist loop until the knob is first turned. */
const ghostTwist = () => levelIndex === 0 && !turnedOnce && turning === null && flow.name === 'calibrate';
const ghostOn = () => ghostTwist() || (levelIndex === 0 && !grabbedOnce && (flow.name === 'title' || flow.name === 'playing'));

const escapement = createEscapement();
const automaton = createAutomaton();
built.tray.add(escapement.root, automaton.root);
/** The knob's centre in tray space [x, y, lift]. */
const KNOB: Vec3 = [DIAL_AT[0], DIAL_AT[1], KNOB_TOP / 2];
const nearKnob = (world: Vec3) => {
  const [x, y, lift] = worldToTray(world, currentPose());
  return Math.hypot(x - KNOB[0], y - KNOB[1], lift - KNOB[2]) <= KNOB_GRAB_M;
};
/** Takes hold of the regulator knob if calibrating and the point is on it. */
function grabKnob(world: Vec3, who: 'left' | 'right' | 'mouse'): boolean {
  if (flow.name !== 'calibrate' || turning !== null || !nearKnob(world)) return false;
  turning = who;
  turnedOnce = true;
  return true;
}
function letGoKnob(): void {
  if (turning === 'mouse') controls.enabled = true;
  turning = null;
  lastWrist = null;
}

// Reward: an amber ring that bursts from the target gear when the train is solved, and round the dial when calibrated.
const burst = new Mesh(new RingGeometry(0.03, 0.036, 48), new MeshBasicMaterial({ color: 0xd99a2b, transparent: true, depthWrite: false, side: DoubleSide }));
burst.rotation.x = -Math.PI / 2;
burst.visible = false;
built.tray.add(burst);

let gazeSpheres: { kind: 'gear'; id: string; mesh: Mesh; radius: number }[] = [];
let pinSpheres: { kind: 'axle'; id: string; mesh: Mesh; radius: number }[] = [];
const collectTargets = () => {
  gazeSpheres = [...built.gears].map(([id, m]) => ({ kind: 'gear' as const, id, mesh: m, radius: (m.geometry.boundingSphere ?? m.geometry.computeBoundingSphere() ?? { radius: 0.03 }).radius }));
  pinSpheres = [...built.pins].map(([id, m]) => ({ kind: 'axle' as const, id, mesh: m, radius: 0.015 }));
};
collectTargets();

/** A fresh board for a level: every gear back on the strip, the clock at zero. */
function loadLevel(i: number): void {
  levelIndex = i;
  level = LEVELS[i]!;
  built.load(level);
  axleOf = new Map(level.axles.map((a) => [a.id, a]));
  layerOf = new Map(level.tray.map((g) => [g.id, g.layer]));
  slots = new Map(partsStrip(level).map((s) => [s.id, s]));
  placements = {};
  solved = false;
  spins = {};
  held = heldFrom = null;
  if (holder === 'mouse') controls.enabled = true;
  holder = null;
  tweens.clear();
  burst.visible = false;
  rewardAt = -Infinity;
  letGoKnob();
  regulator = newRegulator();
  levelClock.reset();
  ghost.gear.geometry = built.loose.get(firstMove()[0])!.geometry;
  collectTargets();
  placePanels();
}

/** The carried gear goes back where it was picked from, at once: the board is as it was before the grab. */
function putBack(): void {
  const id = held;
  if (holder === 'mouse') controls.enabled = true;
  held = holder = null;
  if (!id) return;
  tweens.delete(id);
  const axle = heldFrom && axleOf.get(heldFrom);
  if (axle) {
    setGear(id, axle.x, axle.y, layerLift(layerOf.get(id)!));
    placements[id] = axle.id;
  } else toSlot(id);
  heldFrom = null;
  solved = checkLevel(level, placements).solved;
}

function send(e: FlowEvent): void {
  const next = step(flow, e);
  if (next === flow) return;
  if (next.name === 'paused') {
    putBack();
    letGoKnob();
  }
  if (reloads(flow, e, next)) loadLevel(next.level);
  const entering = next.name !== flow.name && flow.name !== 'paused';
  flow = next;
  if (next.name === 'calibrate' && entering) {
    rewardAt = performance.now();
    spins = checkLevel(level, placements).spins;
    const tgt = level.fixed.find((f) => f.id === level.target.gear);
    const at = tgt && axleOf.get(tgt.axle);
    if (at) burst.position.set(...trayLocal(at.x, at.y, layerLift(tgt.layer) + 0.004));
  }
  if (next.name === 'complete') {
    rewardAt = calibratedAt = performance.now();
    letGoKnob();
    const prev = best[levelIndex];
    best[levelIndex] = prev == null ? levelClock.seconds : Math.min(prev, levelClock.seconds);
    burst.position.set(...trayLocal(DIAL_AT[0], DIAL_AT[1], 0.008));
  }
}

const PRESS: Record<string, FlowEvent> = {
  start: { type: 'start' },
  levels: { type: 'select' },
  pause: { type: 'pause' },
  resume: { type: 'resume' },
  restart: { type: 'restart' },
  next: { type: 'next' },
};
/** One press per touch: a poke and a pinch in the same moment, or a card swapping under the finger, never double-fire. */
const PRESS_GAP_MS = 300;
let pressedAt = -Infinity;
function press(id: string): void {
  const now = performance.now();
  if (now - pressedAt < PRESS_GAP_MS) return;
  pressedAt = now;
  const n = /^level-(\d+)$/.exec(id);
  send(n ? { type: 'select', level: Number(n[1]) - 1 } : PRESS[id]!);
}
/** Board parts move only on the title (touching a gear starts the level) and while playing. */
const live = () => flow.name === 'title' || flow.name === 'playing';
/** The complete card waits while the automaton and the running train play the reward. */
const COMPLETE_DELAY_MS = 2000;
const shownButtons = (): Button[] => (panels.panelMesh.visible ? (panels.current?.layout.buttons ?? []) : []);

/** Picks up the loose gear nearest a world point, if one is within reach; freeing its axle. */
function grab(world: Vec3): boolean {
  if (!live()) return false;
  const point = worldToTray(world, currentPose());
  const id = pickGear(
    point,
    [...built.loose].filter(([gid]) => gid !== held).map(([gid, m]) => ({ id: gid, x: m.position.x, y: -m.position.z, lift: m.position.y })),
  );
  if (!id) return false;
  if (flow.name === 'title') send({ type: 'start' });
  grabbedOnce = true;
  held = id;
  heldFrom = placements[id] ?? null;
  tweens.delete(id);
  if (delete placements[id]) solved = checkLevel(level, placements).solved;
  drag(world);
  return true;
}

function drag(world: Vec3): void {
  const [x, y, lift] = worldToTray(world, currentPose());
  if (held) setGear(held, x, y, lift);
}

/** Drops the carried gear: it glides onto a free axle in reach, else back to its slot in the strip. */
function release(): void {
  const id = held;
  held = holder = heldFrom = null;
  if (!id) return;
  const m = built.loose.get(id)!;
  const layer = layerOf.get(id)!;
  const axle = snapAxle([m.position.x, -m.position.z], level.axles, occupiedAt(level, placements, id), layer);
  const to = axle ? trayLocal(axleOf.get(axle)!.x, axleOf.get(axle)!.y, layerLift(layer)) : trayLocal(slots.get(id)!.x, slots.get(id)!.y, layerLift(0));
  if (axle) placements[id] = axle;
  tweens.set(id, { from: [m.position.x, m.position.y, m.position.z], to, start: performance.now() });
  solved = checkLevel(level, placements).solved;
  if (solved) send({ type: 'solve' });
}

// Desktop: click panel buttons, drag a loose gear across the tray plane; dragging empty space still orbits.
const canvas = world.renderer.domElement;
const rayAt = (e: PointerEvent): [Vec3, Vec3] => {
  const rect = canvas.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), world.camera);
  return [ray.ray.origin.toArray(), ray.ray.direction.toArray()];
};
/** Where a ray meets the shown panel, in panel space, if it lands on the card. */
const onPanel = ([o, d]: [Vec3, Vec3]): Vec3 | null => {
  const l = panels.panelMesh.visible && panels.current?.layout;
  if (!l) return null;
  const lo = worldToPanel(anchor, o);
  const lt = worldToPanel(anchor, [o[0] + d[0], o[1] + d[1], o[2] + d[2]]);
  const dz = lt[2] - lo[2];
  const t = dz < 0 ? -lo[2] / dz : -1;
  if (t < 0) return null;
  const p: Vec3 = [lo[0] + t * (lt[0] - lo[0]), lo[1] + t * (lt[1] - lo[1]), 0];
  return Math.abs(p[0]) <= l.width / 2 && p[1] >= 0 && p[1] <= l.height ? p : null;
};
const mouseOnTray = (e: PointerEvent): Vec3 | null => {
  const [o, d] = rayAt(e);
  const q = built.tray.getWorldQuaternion(new Quaternion());
  const plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0).applyQuaternion(q), new Vector3(...worldOf(new Vector3(0, layerLift(0), 0))));
  const hit = new Raycaster(new Vector3(...o), new Vector3(...d)).ray.intersectPlane(plane, new Vector3());
  return hit && [hit.x, hit.y, hit.z];
};
let panelDown = false;
canvas.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0 || world.renderer.xr.isPresenting || holder !== null || turning !== null) return;
    const hit = onPanel(rayAt(e));
    if (hit) {
      panelDown = true;
      controls.enabled = false;
      const id = buttonAt(hit, shownButtons());
      if (id) press(id);
      return;
    }
    const p = mouseOnTray(e);
    if (p && grabKnob(p, 'mouse')) {
      lastMouseX = e.clientX;
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
    } else if (p && grab(p)) {
      holder = 'mouse';
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
    }
  },
  { capture: true },
);
let mouseRay: [Vec3, Vec3] | null = null;
let mouseButton: string | null = null;
let mouseKnob = false;
canvas.addEventListener('pointermove', (e) => {
  const p = holder === 'mouse' && mouseOnTray(e);
  if (p) drag(p);
  if (turning === 'mouse') {
    regulator.turn(dragTwist(e.clientX - lastMouseX));
    lastMouseX = e.clientX;
  }
  mouseRay = rayAt(e);
  const hit = onPanel(mouseRay);
  mouseButton = hit && buttonAt(hit, shownButtons());
  const onTray = !mouseButton && flow.name === 'calibrate' && mouseOnTray(e);
  mouseKnob = turning === 'mouse' || (!!onTray && nearKnob(onTray));
  canvas.style.cursor = mouseButton ? 'pointer' : mouseKnob ? 'ew-resize' : '';
});
canvas.addEventListener('pointerleave', () => {
  mouseRay = mouseButton = null;
  mouseKnob = false;
});
const mouseUp = () => {
  if (panelDown) {
    panelDown = false;
    controls.enabled = true;
  }
  if (turning === 'mouse') letGoKnob();
  if (holder !== 'mouse') return;
  release();
  controls.enabled = true;
};
canvas.addEventListener('pointerup', mouseUp);
canvas.addEventListener('pointercancel', mouseUp);

// Pause whenever the player is pulled away: tab hidden, headset menu or headset off, session over.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') send({ type: 'pause' });
});
world.renderer.xr.addEventListener('sessionstart', () => {
  const session = world.renderer.xr.getSession();
  session?.addEventListener('visibilitychange', () => {
    if (session.visibilityState !== 'visible') send({ type: 'pause' });
  });
});

// Where the tray sits: the default until a session finds a plane. trayPose is relative to the head it was placed for.
let placement = DEFAULT_PLACEMENT;
let placedPose: TrayPose = TRAY_POSE;
let handHint = false;
let recenters = 0;
const lastTipZ: { left: number | null; right: number | null } = { left: null, right: null };
const tipButton: { left: string | null; right: string | null } = { left: null, right: null };
trackMr(world.renderer, {
  onRecenter() {
    recenters++;
  },
  holding: () => holder === 'left' || holder === 'right' || turning === 'left' || turning === 'right',
  onPlace(next, head: Head) {
    placement = next;
    const [x, y, z] = toHeadFrame(next.pose.position, head);
    placedPose = { position: [x, y, z], tilt: next.pose.tilt, yaw: (next.pose.yaw ?? 0) - head.yaw };
    built.place(next);
    placePanels();
  },
  onHands(present) {
    handHint = !present;
    panels.showHint(handHint);
  },
  onHandPoint(hand, point, tip) {
    handPoints[hand] = point;
    const local = tip && worldToPanel(anchor, tip);
    const buttons = shownButtons();
    tipButton[hand] = local && buttonAt(local, buttons, 0.04);
    const poked = local && holder !== hand ? pokeHit(lastTipZ[hand], local, buttons) : null;
    lastTipZ[hand] = local ? local[2] : null;
    if (poked) press(poked);
  },
  onPinch(hand, point, wrist) {
    wrists[hand] = wrist;
    const starts = point !== null && !pinching[hand] && holder === null;
    const onButton = starts && buttonAt(worldToPanel(anchor, point), shownButtons(), 0.03);
    if (onButton) press(onButton);
    else if (starts && grabKnob(point, hand)) lastWrist = wrist;
    else if (starts && grab(point)) holder = hand;
    pinching[hand] = point !== null;
    pinchPoints[hand] = point;
    if (turning === hand) {
      // The knob turns with the wrist's roll, frame by frame, while the pinch holds.
      if (!point) letGoKnob();
      else if (wrist) {
        if (lastWrist) regulator.turn(twistOf(lastWrist, wrist));
        lastWrist = wrist;
      }
      return;
    }
    if (holder !== hand) return;
    if (point) drag(point);
    else release();
  },
});
world.renderer.xr.addEventListener('sessionend', () => {
  send({ type: 'pause' });
  putBack();
  placement = DEFAULT_PLACEMENT;
  placedPose = TRAY_POSE;
  handHint = false;
  built.place(DEFAULT_PLACEMENT);
  placePanels();
  panels.showHint(false);
});

// Hover hints, refreshed every rendered frame: gaze tint, hand glow, and pulsing rings on valid axles.
const GAZE_TINT = { color: 0xffe2b0, intensity: 0.3 };
const HAND_TINT = { color: 0xff8a2a, intensity: 0.9 };
let gazeTarget: { kind: 'gear' | 'axle'; id: string } | null = null;
let handGlow: string[] = [];
let validNow: string[] = [];
const tint = (mesh: Mesh, t: { color: number; intensity: number } | null) => {
  const mat = mesh.material as MeshStandardMaterial;
  mat.emissive.set(t?.color ?? 0x000000);
  mat.emissiveIntensity = t?.intensity ?? 0;
};
/** Tick count as the train sees it: each tick is a quick 90 ms step, then a rest until the next. */
const stepped = (phase: number, rate: number) => {
  const whole = Math.floor(phase);
  return whole + easeOut((phase - whole) / Math.min(1, 0.09 * rate));
};
let lastFrame = performance.now();
world.scene.onBeforeRender = () => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  levelClock.tick(now, flow.name === 'playing');
  for (const [id, t] of tweens) {
    const { pos, done } = tweenAt(t.from, t.to, now - t.start);
    built.loose.get(id)?.position.set(...pos);
    if (done) tweens.delete(id);
  }

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

  // Escapement: it ticks once the train is solved. While calibrating, the train steps forward on each tick
  // (a step is what it turns in one tick at the target rate); once calibrated it runs smoothly at its true speeds.
  const ticking = flow.name === 'calibrate' || flow.name === 'complete';
  const before = stepped(regulator.phase, regulator.rate);
  if (ticking && regulator.tick(dt) && flow.name === 'calibrate') send({ type: 'calibrated' });
  if (ticking) {
    const ticks = flow.name === 'complete' ? dt * regulator.target : stepped(regulator.phase, regulator.rate) - before;
    for (const [id, m] of built.gears) {
      const rpm = spins[id];
      if (typeof rpm === 'number') m.rotation.z += ((rpm * Math.PI) / 60 / regulator.target) * ticks;
    }
  }
  const knobLit = turning !== null || (flow.name === 'calibrate' && (mouseKnob || (['left', 'right'] as const).some((h) => handPoints[h] && nearKnob(handPoints[h]!))));
  escapement.update({ setting: regulator.setting, target: regulator.target, phase: regulator.phase, ticking, hold: regulator.hold, inBand: regulator.inBand, calibrated: regulator.calibrated, lit: knobLit });
  automaton.update(now / 1000, regulator.phase, regulator.calibrated, built.tray.rotation.x);

  // Reward, on solve and again on calibrated: every gear flashes amber, fading out, and a ring bursts.
  const sinceReward = (now - rewardAt) / 1000;
  const flash = ticking ? Math.max(0, 1 - sinceReward / 1.2) : 0;
  burst.visible = ticking && sinceReward < 0.9;
  burst.scale.setScalar(1 + 3 * sinceReward);
  (burst.material as MeshBasicMaterial).opacity = Math.max(0, 1 - sinceReward / 0.9);
  // While calibrating the escapement gear glints on every tick.
  const glint = flow.name === 'calibrate' ? 0.6 * (1 - (regulator.phase % 1)) ** 3 : 0;

  for (const s of [...gazeSpheres, ...pinSpheres]) {
    const lit = s.kind === 'gear' && handGlow.includes(s.id) ? HAND_TINT : gazeTarget?.kind === s.kind && gazeTarget.id === s.id ? GAZE_TINT : null;
    const amber = s.kind === 'gear' ? Math.max(1.2 * flash, s.id === level.escapement.gear ? glint : 0) : 0;
    tint(s.mesh, amber > 0.01 ? { color: 0xd99a2b, intensity: amber } : lit);
  }
  const pulse = Math.sin(now / 160);
  for (const [id, ring] of built.rings) {
    ring.visible = validNow.includes(id);
    (ring.material as MeshBasicMaterial).opacity = 0.65 + 0.35 * pulse;
    ring.scale.setScalar(1 + 0.15 * pulse);
  }

  const [from, to] = firstMove();
  ghost.root.visible = ghostOn();
  if (ghostTwist()) {
    const s = ghostTwistAt(now / 1000, DIAL_AT, settingOf(regulator.target) >= regulator.setting ? 1 : -1);
    ghost.update({ ...s, pos: [s.pos[0], s.pos[1], s.pos[2] + KNOB_TOP - 0.006] });
  } else if (ghostOn()) {
    const slot = slots.get(from)!;
    const axle = axleOf.get(to)!;
    ghost.update(ghostAt(now / 1000, [slot.x, slot.y], [axle.x, axle.y]));
  }

  const waiting = flow.name === 'complete' && now - calibratedAt < COMPLETE_DELAY_MS;
  panels.show(waiting ? null : screenOf(flow), {
    level: levelIndex,
    levels: LEVELS.length,
    time: levelClock.seconds,
    best,
    hover: mouseButton ?? tipButton.left ?? tipButton.right,
  });
};

const supported = await (navigator.xr?.isSessionSupported('immersive-ar') ?? Promise.resolve(false)).catch(() => false);
if (supported) {
  enterButton.disabled = false;
  enterNote.hidden = true;
  enterButton.addEventListener('click', () => void startSession(() => world.launchXR(), enterNote));
}

const toScreen = (p: Vec3): [number, number] => {
  const v = new Vector3(...p).project(world.camera);
  const rect = canvas.getBoundingClientRect();
  return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
};

window.__chrono = Object.freeze({
  get levelId() {
    return level.id;
  },
  get gearCount() {
    return built.gearCount;
  },
  get axleCount() {
    return built.axleCount;
  },
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
    return validAxles(level, placements, held);
  },
  get pinchPoints() {
    return { ...pinchPoints };
  },
  get flow() {
    return flow.name;
  },
  get levelIndex() {
    return levelIndex;
  },
  get levelTime() {
    return levelClock.seconds;
  },
  get paused() {
    return flow.name === 'paused';
  },
  get ghostHand() {
    return ghostOn();
  },
  get ghostTwist() {
    return ghostTwist();
  },
  get regulator() {
    return regulator.setting;
  },
  get tickRate() {
    return regulator.rate;
  },
  get targetRate() {
    return regulator.target;
  },
  get inBand() {
    return regulator.inBand;
  },
  get turning() {
    return turning;
  },
  get wrists() {
    return { ...wrists };
  },
  get automatonRunning() {
    return regulator.calibrated;
  },
  get regulatorAt() {
    return worldOf(new Vector3(...trayLocal(KNOB[0], KNOB[1], KNOB_TOP)));
  },
  buttons() {
    return shownButtons().map((b) => {
      const w = panelToWorld(anchor, [b.x, b.y, 0]);
      return { id: b.id, label: b.label, world: w, screen: toScreen(w) };
    });
  },
  toScreen,
});
