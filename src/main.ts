import { World } from '@iwsdk/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { APP_TITLE, createWorldOptions } from './config';
import { DEFAULT_PLACEMENT, toHeadFrame, type Head } from './anchor';
import { startSession } from './enter';
import { LEVELS } from './levels';
import { buildScene } from './scene';
import { trackMr } from './mr';
import { TRAY_POSE, trayToWorld, type TrayPose } from './seat';

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
});
world.renderer.xr.addEventListener('sessionend', () => {
  placement = DEFAULT_PLACEMENT;
  placedPose = TRAY_POSE;
  handHint = false;
  built.place(DEFAULT_PLACEMENT);
  built.showHandHint(false);
});

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
});
