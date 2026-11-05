import { Grabbed, GrabSystem, OneHandGrabbable, World, type Entity } from '@iwsdk/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { APP_TITLE, createWorldOptions } from './config';
import { DEFAULT_PLACEMENT, toHeadFrame, type Head } from './anchor';
import { startSession } from './enter';
import { BoxGeometry, Color, MathUtils, PMREMGenerator, type MeshPhysicalMaterial, DoubleSide, Euler, Mesh, MeshBasicMaterial, Plane, PlaneGeometry, Quaternion, Raycaster, RingGeometry, Vector2, Vector3, type MeshStandardMaterial, type Object3D } from 'three';
import { grabModeOf, holderHand, occupiedAt, pickGear, pinchOwner, snapAxle, type Hand } from './grab';
import { handNear, rayPick, validAxles, type HoverTarget } from './hover';
import { LEVELS, checkLevel, type Level } from './levels';
import { buildScene } from './scene';
import { loadBackdrop, type BackdropId } from './backdrop';
import { MENU_BACKDROP, MENU_THEME, RANDOM_PICK, STAGES, dOf, kindOf, parOf, stageOf, type StageId } from './stages';
import { BENCH_Y as BENCH_TOP_Y, createScenery } from './scenery';
import { woodSet } from './wood';
import { trackMr } from './mr';
import { isSoftwareGl, tuneForSoftwareGl } from './render';
import { qualityOf } from './quality';
import { createAmbient, poseOf, type Ambient } from './ambient';
import { setPlainMetals } from './metal';
import { TRAY_POSE, layerLift, partsStrip, trayLocal, worldToTray, type TrayPose, type Vec3 } from './seat';
import { TITLE, createClock, reloads, screenOf, step, type Flow, type FlowEvent } from './flow';
import { MENU_SCREENS, PLAY_SCREENS, SCRIM_OPACITY, buttonAt, clockTenths, layout, menuAnchor, panelAnchor, panelToWorld, pokeHit, worldToPanel, type Anchor, type Button, type Screen } from './ui';
import { aboutMax, createPanels, RING, SMALL_TABLE_TEXT, type PanelCtx } from './panels';
import { createGhostHand, ghostAt, ghostTwistAt } from './ghost';
import { TWEEN_MS, easeOut, tweenAt } from './tween';
import { faultKind, faultOf, faultText, shakeSpin, shakeTilt, SHAKE_MS, type Fault } from './fault';
import { C } from './palette';
import type { GearSpin } from './train';
import { createRegulator, dragTwist, settingOf, startSetting, targetRate, twistOf, type Quat } from './escapement';
import { createSound, loadSoundOn, saveSoundOn, tickGain, ticksBetween } from './sound';
import { LOW_TIME_S, THEMES, loadMusicOn, saveMusicOn } from './music';
import { DIAL_AT, KNOB_GRAB_M, KNOB_TOP, TWIST_CUE_AT, createAutomaton, createEscapement } from './clockwork';
import { carried, loadRun, nextIndex, reached, saveRun, solvedLevel, startRun, won, type Run } from './run';
import { loadRelaxed, outcomeOf, parFor, saveRelaxed, timerView, type Outcome } from './timer';
import { fallbackLevel, tinkerLevel } from './tinker';
import { decodeSeed, encodeSeed } from './seed';
import { fetchGlobal, submitGlobal } from './global';
import { BOARDS, RUN_STEP, boardOf, addEntry, backInitial, loadScores, qualifies, saveScores, stepInitial, todayISO, typeInitial, type Entry, type Scores } from './scores';
import { CAMPAIGN, DIFFICULTIES, freshSeed, puzzleFor, randomLevel, type Difficulty } from './random';
import { HAND_JOINTS, createHandOccluder } from './occlude';
import { createPlaceCue, cueFor } from './cue';
import { goalOf, goalText } from './goal';
import { createGoalBadge } from './badge';
import { DESKTOP_EYE, DESKTOP_TARGET, desktopDistance, faceView, isPhone, menuCard, phoneCard, phoneReserve, phoneShift, viewContent } from './fit';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

document.title = `${APP_TITLE} MR`;
const heading = document.getElementById('title');

const enterButton = document.getElementById('enter-mr') as HTMLButtonElement | null;
const enterNote = document.getElementById('enter-note');
if (!enterButton || !enterNote) throw new Error('Enter MR controls missing');

const world = await World.create(container, createWorldOptions());
// The menus are drawn in the canvas, so their face (Josefin Sans, self-hosted) must be loaded before the first card is drawn.
await Promise.race([Promise.all(['300', '400', '600'].map((w) => document.fonts.load(`${w} 16px "Josefin Sans"`))), new Promise((done) => setTimeout(done, 3000))]).catch(() => undefined);

// ?seed=CODE: a shared puzzle, the exact one the code was made from. It takes the extra slot after the 20 campaign levels and is
// the board the title opens on; its best time is saved under its own id (t<seed>), so the campaign's saved times are never touched.
const seedParam = new URLSearchParams(location.search).get('seed');
const sharedSeed = seedParam === null ? null : decodeSeed(seedParam);
const seedNote = document.getElementById('seed-note');
if (seedParam !== null && sharedSeed === null && seedNote) {
  seedNote.textContent = 'That puzzle code didn’t work. Start a new game instead.';
  seedNote.hidden = false;
  setTimeout(() => (seedNote.hidden = true), 8000);
}
// Saved best times. Reading localStorage itself can throw (storage blocked), so fall back to none.
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
// Generated puzzles (src/random.ts): every campaign level is made fresh each time it is started, from a new seed, so it cannot be
// learned; the seed is kept so the puzzle's code can be shared. `classic` (a flag the e2e specs set) plays the hand-made
// levels l1-l8 in their places, so specs can drive a puzzle they know.
const classic = (() => {
  try {
    return window.localStorage.getItem('chronogrip.classic.v1') === '1';
  } catch {
    return false;
  }
})();
const seedOfLevel = new WeakMap<Level, number>();
/** The run in progress (or saved), from New Game; the stage it plays is the one the campaign levels are made for. */
let run: Run | null = sharedSeed === null ? loadRun(storage) : null;
let stage: StageId = run?.stage ?? 'easy';
function campaignLevel(i: number): Level {
  const hand = classic ? LEVELS[i] : undefined;
  if (hand) return hand;
  const seed = freshSeed(kindOf(stage, i + 1));
  const level = { ...randomLevel(dOf(stage, i + 1), seed), id: `l${i + 1}`, name: `Level ${i + 1}` };
  seedOfLevel.set(level, seed);
  return level;
}
/** What the extra slot after the campaign holds: a Random level at a difficulty, or a puzzle opened from a ?seed= link. */
let special: 'random' | 'shared' = sharedSeed === null ? 'random' : 'shared';
let randomDiff: Difficulty = 'easy';
const randomPuzzle = (): Level => {
  const pick = RANDOM_PICK[randomDiff];
  const seed = freshSeed(kindOf(pick.stage, pick.level));
  const level = randomLevel(dOf(pick.stage, pick.level), seed);
  seedOfLevel.set(level, seed);
  return level;
};
// The 20 campaign levels, then the extra slot. Every level is made fresh when it is played, so only the one Continue shows is made now; the rest wait as a cheap stand-in.
const firstSlot = run ? nextIndex(run) : 0;
let levels: readonly Level[] = [...Array.from({ length: CAMPAIGN }, (_, i) => (i === firstSlot || classic ? campaignLevel(i) : fallbackLevel(`l${i + 1}`))), sharedSeed === null ? randomPuzzle() : puzzleFor(sharedSeed, tinkerLevel)];
let levelIds = levels.map((l) => l.id);
/** The slot after the campaign: always the last one. */
const randomSlot = () => levels.length - 1;
// Only a completed run is scored, with a name entered once, when it ends. Random levels are practice: no run.
// High score boards (src/scores.ts): a top ten per campaign level and one per Random level difficulty, kept on this device.
let scores: Scores = loadScores(storage);
/**
 * A card laid over the flow's own: the high scores board or the options (opened from the start panel), or the initials entry
 * that comes before the complete card when a solve makes its board's top ten. `board` is the board id (l1-l20, random-easy..);
 * `confirm`: Reset progress is waiting for its yes.
 */
type Overlay =
  | { kind: 'board'; board: string; tab: 'local' | 'global' }
  | { kind: 'options'; confirm: boolean }
  | { kind: 'stages' }
  | { kind: 'picker' }
  | { kind: 'result'; level: number; ms: number }
  | { kind: 'countdown'; at: number }
  | { kind: 'about'; scroll: number }
  | { kind: 'initials'; board: string; rank: number; entry: Omit<Entry, 'name'>; letters: string; cursor: number };
let overlay: Overlay | null = null;
// The global top tens (src/global.ts): the last good board per id, kept so a tab switch does not ask again, and how this
// opening of the scores screen has fared per board (asking, or gave up). Opening the screen asks afresh.
const globalRows = new Map<string, Entry[]>();
const globalAsk = new Map<string, 'asking' | 'offline' | 'done'>();
function loadGlobal(board: string): void {
  if (globalAsk.has(board)) return;
  globalAsk.set(board, 'asking');
  void fetchGlobal(board).then((rows) => {
    if (rows) globalRows.set(board, rows);
    globalAsk.set(board, rows ? 'done' : 'offline');
    if (overlay?.kind === 'board') showPanel();
  });
}
/** The board of the level last started: the board the Best times card opens on. */
/** Relaxed: no timer. Default off (timer on), saved across visits. */
let relaxed = loadRelaxed(storage);
/** The time limit of the level on the board, and whether the solve on the complete card beat it (null while playing, and in Relaxed). */
let par = 0;
let outcome: Outcome | null = null;
/** The title board is the level Continue plays: the first one not yet solved. */
const continueAt = () => (run ? nextIndex(run) : 0);
const resume = () => run !== null;

/** The time limit of a level: a stage's table for its 20 levels, the measured difficulty for anything else (Random, a shared puzzle, the hand-made specs' levels). */
const parHere = (i: number, l: Level): number => (i < CAMPAIGN && !classic ? parOf(stage, i + 1) : parFor(l));
let levelIndex = sharedSeed === null ? continueAt() : randomSlot();
let level: Level = levels[levelIndex]!;
par = parHere(levelIndex, level);
tuneForSoftwareGl(world.renderer);
// Render quality (src/quality.ts): software GL draws the low tier; ?quality=high|low overrides.
const quality = qualityOf(location.search, isSoftwareGl(world.renderer), navigator.userAgent);
const low = quality === 'low';
setPlainMetals(low);
const built = buildScene(level, world.scene, world.renderer, low);
// // The bench and a rendered panorama behind the tray on desktop and phone; in immersive-ar only a few props on the real table (src/scenery.ts).
const scenery = createScenery(world.scene, low ? null : woodSet('bench', isPhone(window.innerWidth, window.innerHeight), world.renderer), low ? null : new PMREMGenerator(world.renderer));
/**
 * The rendered panorama behind the tray: the attic (c2) on every menu, the stage's own while a level is on. One at a time: a
 * new one replaces the old (freeing its texture) once it has loaded, and a switch made while one is loading wins.
 */
let backdropWanted: BackdropId | null = null;
function useBackdrop(id: BackdropId): void {
  if (id === backdropWanted) return;
  backdropWanted = id;
  void loadBackdrop(id, low || isPhone(window.innerWidth, window.innerHeight)).then((t) => (backdropWanted === id ? scenery.setBackdrop(id, t) : t.dispose()));
}
/**
 * The animated stage backdrop (src/ambient.ts): one group per stage, only while a level is on (never on the menus, never in
 * immersive-ar), ticking on the stage music's beat (the audio clock; seconds * bpm / 60 while the music is not playing), both
 * clocks frozen while paused and through the resume countdown. Its room-light multiplier drives the background intensity.
 */
let ambient: Ambient | null = null;
let ambientStage: StageId | null = null;
let ambientOn: StageId | null = null; // what the screen wants, XR or not
let ambSeconds = 0;
let ambBeats = 0;
let ambOffset = 0;
let ambMul = 1;
const ambientEye = new Vector3();
const ambientEye0 = new Vector3(...DESKTOP_EYE);
function useAmbient(id: StageId | null): void {
  ambientOn = id;
  const wanted = world.renderer.xr.isPresenting ? null : id;
  if (wanted === ambientStage) return;
  ambient?.dispose();
  ambient = null;
  ambientStage = wanted;
  ambSeconds = ambBeats = ambOffset = 0;
  ambMul = world.scene.backgroundIntensity = 1;
  if (!wanted) return;
  ambient = createAmbient(wanted, {
    eye: DESKTOP_EYE,
    target: DESKTOP_TARGET,
    phone: isPhone(window.innerWidth, window.innerHeight),
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  world.scene.add(ambient.group);
}
/** One frame of the ambient parts: the beat clock (frozen while paused), then the room-light multiplier. */
function tickAmbient(dt: number): void {
  if (!ambient || world.renderer.xr.isPresenting) return;
  const frozen = flow.name === 'paused' || overlay?.kind === 'countdown';
  if (!frozen) ambSeconds += dt;
  const raw = sound.beats() ?? (ambSeconds * THEMES[sound.theme].bpm) / 60;
  if (frozen) ambOffset = ambBeats - raw;
  else ambBeats = raw + ambOffset;
  ambMul = ambient.update(ambBeats, ambSeconds).bgMul;
  // The parts were placed by direction from the tuned eye; the camera backs off and orbits, so the group rides along with it
  // (never rotating), which keeps every part in its painted spot of the cubemap (the second hand on the clock hub).
  ambient.group.position.copy(world.camera.getWorldPosition(ambientEye)).sub(ambientEye0);
  world.scene.backgroundIntensity = ambMul;
}
// In immersive-ar there is no environment and the headset GPU is a mobile one: the varnish (clearcoat) goes for the session.
const varnish = (built.wood as MeshPhysicalMaterial).clearcoat ?? 0;
const setVarnish = (on: boolean) => {
  const m = built.wood as MeshPhysicalMaterial;
  if (!m.isMeshPhysicalMaterial) return;
  m.clearcoat = on ? varnish : 0;
  m.needsUpdate = true;
};
world.renderer.xr.addEventListener('sessionstart', () => {
  scenery.set(true);
  useAmbient(ambientOn);
  setVarnish(false);
});
world.renderer.xr.addEventListener('sessionend', () => {
  scenery.set(false);
  useAmbient(ambientOn);
  setVarnish(true);
});

// Desktop preview: from above, behind and a little right of the seated head, so the board reads in depth (bevel,
// gear thickness, the bird standing up) and the panel above it stays in frame. A narrow window backs it off (fitView).
world.camera.position.set(...DESKTOP_EYE);
const controls = new OrbitControls(world.camera, world.renderer.domElement);
controls.target.set(...DESKTOP_TARGET);
// The orbit stays a look around the tray, never a way out of the room: a few degrees of tilt either side of the tuned view (never
// below the bench top, never straight down), about 40 degrees of turn, a bounded dolly (moveToFit sets it from the fitted
// distance) and no panning, so the tray and the panel above it stay in frame. Damped: the frame loop calls update().
const home = new Vector3(...DESKTOP_EYE).sub(new Vector3(...DESKTOP_TARGET));
const HOME_POLAR = Math.acos(home.y / home.length());
const HOME_AZIMUTH = Math.atan2(home.x, home.z);
controls.minPolarAngle = HOME_POLAR - MathUtils.degToRad(18);
controls.maxPolarAngle = HOME_POLAR + MathUtils.degToRad(12);
controls.minAzimuthAngle = HOME_AZIMUTH - MathUtils.degToRad(40);
controls.maxAzimuthAngle = HOME_AZIMUTH + MathUtils.degToRad(40);
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.update();
world.renderer.xr.addEventListener('sessionstart', () => (controls.enabled = false));
world.renderer.xr.addEventListener('sessionend', () => (controls.enabled = true));

// Board state: which loose gear sits on which axle, and which one a hand or the mouse is carrying.
let axleOf = new Map(level.axles.map((a) => [a.id, a]));
let layerOf = new Map(level.tray.map((g) => [g.id, g.layer]));
let slots = new Map(partsStrip(level).map((s) => [s.id, s]));
let placements: Record<string, string> = {};
let solved = false;
/** The target gear's live spin as placed now: the goal badge turns amber when it meets the target. */
let targetSpin: GearSpin | undefined;
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

// Level flow: title, playing, calibrate, complete, paused, level select; plus the level clock.
// The clock runs only while playing: it stops when the train is solved, so calibrating is not timed.
let flow: Flow = { ...TITLE, level: levelIndex };
const levelClock = createClock();
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

// Sound: procedural WebAudio, created and unlocked on the first press (mouse or pinch); silent before that.
const sound = createSound();
/** Options: sound on or off, saved across visits. */
let soundOn = loadSoundOn(storage);
sound.setMuted(!soundOn);
/** Options: the background music, on or off, saved across visits. Plays only after the first gesture, and not while Sound is off. */
let musicOn = loadMusicOn(storage);
sound.setMusic(musicOn);

const panels = createPanels();
world.scene.add(panels.root);
let anchor: Anchor = panelAnchor(level);
/** The camera's backward axis (from what it looks at towards the eye). */
const cameraBack = (): Vec3 => world.camera.getWorldDirection(new Vector3()).negate().toArray();
/** The cards the camera fits for: the ones played with. The menus are centred in the view over a black layer instead. */
const fitScreens = (): readonly Screen[] => PLAY_SCREENS;
const xrEntry = document.getElementById('xr-entry')!;
/** The page header's foot in px: the wordmark and the Enter MR column, plus a little air. */
const headerBottom = () => Math.max(heading?.getBoundingClientRect().bottom ?? 0, xrEntry.getBoundingClientRect().bottom) + 8;
/** Pixels kept clear inside each edge of the desktop view. */
const FIT_MARGIN = { top: 16, right: 12, bottom: 12, left: 12 };
/** A phone in portrait, outside XR: the cards become a bottom sheet in the narrow layouts. */
const phone = () => !world.renderer.xr.isPresenting && isPhone(window.innerWidth, window.innerHeight);
/** The room a phone keeps for the board, in px from the top: under the header, over the bottom-sheet card. */
const phoneRoom = () => ({ top: headerBottom() + FIT_MARGIN.top, bottom: window.innerHeight - phoneReserve(window.innerWidth, fitScreens(), levels.length) });
/** Phone: raises the view (a camera view offset) so the board sits midway in its room; returns how many px. */
function raiseView(): number {
  const [w, h] = [window.innerWidth, window.innerHeight];
  const offset = world.camera.position.clone().sub(controls.target);
  const dir = offset.clone().normalize().toArray();
  const shift = phoneShift({ target: controls.target.toArray(), dir, fovDeg: world.camera.fov, width: w, height: h, d: offset.length(), points: viewContent(level, levels.length, currentPose(), dir, []), ...phoneRoom() });
  world.camera.setViewOffset(w, h, 0, shift, w, h);
  return shift;
}
/** The black layer behind the menus on a flat screen: a camera-facing quad under the cards (renderOrder 10), over the scene. */
const scrim = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: C.scrim, transparent: true, opacity: SCRIM_OPACITY, depthTest: false, depthWrite: false }));
scrim.renderOrder = 5;
scrim.frustumCulled = false;
scrim.visible = false;
world.scene.add(scrim);
/** The menu card up now, if one is. */
const menuUp = () => (panels.panelMesh.visible && panels.current && MENU_SCREENS.includes(panels.current.screen) ? panels.current : null);
/** Page pixels per metre of panel space, at most, for a menu card on a desktop screen, and the air kept over and under it. */
const MENU_MAX_PX = 1700;
const MENU_MARGIN = 72;
/** The air kept over and under a menu card: 72 px, or the page header's depth when the card is wide enough to run under the wordmark or the Enter MR note. */
function menuMargin(card: { width: number; height: number }): number {
  const [w, h] = [window.innerWidth, window.innerHeight];
  const px = Math.min(MENU_MAX_PX, (w - 32) / card.width, (h - 2 * MENU_MARGIN) / card.height);
  const [left, right] = [w / 2 - (card.width * px) / 2, w / 2 + (card.width * px) / 2];
  const [title, entry] = [heading?.getBoundingClientRect(), xrEntry.getBoundingClientRect()];
  const clash = left < (title?.right ?? 0) + 8 || right > entry.left - 8;
  return clash ? Math.max(MENU_MARGIN, headerBottom()) : MENU_MARGIN;
}
/**
 * In XR the card tilts to face the head; on desktop it lies face on to the preview camera, so it reads square. On a phone
 * it is a bottom sheet held in front of the camera, a phone width wide, whatever the orbit or zoom. A menu is the exception
 * outside XR: it is centred in the view; in XR it hangs lower, to keep its buttons in reach.
 */
const placePanels = () => {
  const a = panelAnchor(level, currentPose());
  const menu = menuUp();
  const eye = world.camera.getWorldPosition(new Vector3()).toArray();
  const view = { eye, back: cameraBack(), fovDeg: world.camera.fov, width: window.innerWidth, height: window.innerHeight };
  if (phone()) {
    const shift = raiseView();
    anchor = menu ? menuCard({ ...view, shift, card: menu.layout, maxPx: MENU_MAX_PX, margin: menuMargin(menu.layout) }) : phoneCard({ ...view, shift });
  } else {
    if (world.camera.view?.enabled) world.camera.clearViewOffset();
    if (world.renderer.xr.isPresenting) anchor = menu ? menuAnchor(menu.layout, level, currentPose()) : a;
    else anchor = menu ? menuCard({ ...view, card: menu.layout, maxPx: MENU_MAX_PX, margin: menuMargin(menu.layout) }) : faceView(a, cameraBack());
  }
  panels.setAnchor(anchor);
  placedFor = menu && `${menu.screen}${menu.layout.height}`;
  // Flat: a full-view black layer; XR keeps the passthrough, so its menus get the backing panel behind the card instead.
  scrim.visible = !!menu && !world.renderer.xr.isPresenting;
  if (scrim.visible) {
    const d = 0.2;
    const h = 2 * d * Math.tan((world.camera.fov * Math.PI) / 360);
    scrim.position.set(...view.eye).addScaledVector(new Vector3(...view.back), -d);
    scrim.quaternion.copy(world.camera.getWorldQuaternion(new Quaternion()));
    scrim.scale.set(3 * h * (window.innerWidth / window.innerHeight), 3 * h, 1); // oversize: a phone's raised view is offset from the middle
  }
};
/** Which menu card (and size) the anchor was last placed for; null for a card that is not a menu. */
let placedFor: string | null = null;
placePanels();
world.renderer.xr.addEventListener('sessionstart', placePanels);
controls.addEventListener('change', placePanels);

/**
 * Desktop: back the camera off along its line of sight until this level's board and parts strip, the dial, the bird and
 * the card on show (the wide level select, or the others) fit the window, staying under the wordmark and Enter MR where
 * they reach the top corners. Never nearer than the tuned landscape view. On resize it jumps there; after a level load
 * or a card change (`keepZoom`) it eases there, keeping the player's own zoom in proportion. Then places the cards.
 */
const TUNED_DISTANCE = new Vector3(...DESKTOP_EYE).distanceTo(new Vector3(...DESKTOP_TARGET));
const FIT_MS = 400;
let fitted = TUNED_DISTANCE;
let cameraTween: { from: Vec3; to: Vec3; start: number } | null = null;
function fitView(keepZoom = false): void {
  if (!world.renderer.xr.isPresenting) moveToFit(keepZoom);
  placePanels();
}
function moveToFit(keepZoom: boolean): void {
  const offset = world.camera.position.clone().sub(controls.target);
  // Mid-ease, the zoom to keep is where the ease was going.
  const now = cameraTween ? controls.target.distanceTo(new Vector3(...cameraTween.to)) : offset.length();
  cameraTween = null;
  offset.normalize();
  const dir = offset.toArray();
  const [title, entry] = [heading?.getBoundingClientRect(), xrEntry.getBoundingClientRect()];
  // A phone keeps the card out of the 3D fit: the board fits its room, under the header and over the bottom-sheet card.
  const room = phone() && phoneRoom();
  const d = desktopDistance({
    target: controls.target.toArray(),
    dir,
    base: TUNED_DISTANCE,
    fovDeg: world.camera.fov,
    width: window.innerWidth,
    height: window.innerHeight,
    margin: room ? { ...FIT_MARGIN, top: room.top, bottom: window.innerHeight - room.bottom } : FIT_MARGIN,
    header: { left: (title?.right ?? 0) + 16, right: entry.left - 16, bottom: headerBottom() },
    points: viewContent(level, levels.length, currentPose(), dir, room ? [] : fitScreens()),
  });
  const to = controls.target.clone().addScaledVector(offset, keepZoom ? (now * d) / fitted : d);
  fitted = d;
  controls.minDistance = d * 0.8; // in a little, out a fair way: the board and the panel stay in frame
  controls.maxDistance = d * 1.45;
  if (keepZoom && to.distanceTo(world.camera.position) > 1e-6) cameraTween = { from: world.camera.position.toArray(), to: to.toArray(), start: performance.now() };
  else if (!keepZoom) {
    world.camera.position.copy(to);
    controls.update();
  }
}
fitView();
window.addEventListener('resize', () => fitView());
/** Eases the camera back to the tuned view (at the distance the window fits): the R key, or a double-click on empty space. */
function resetView(): void {
  if (world.renderer.xr.isPresenting) return;
  controls.target.set(...DESKTOP_TARGET);
  // A drag's damping leaves spin still to apply (per frame, so a slow frame rate drags it out): flush it so the ease ends exactly home.
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = true;
  const to = controls.target.clone().addScaledVector(home.clone().normalize(), fitted);
  cameraTween = { from: world.camera.position.toArray(), to: to.toArray(), start: performance.now() };
}

const firstMove = () => Object.entries(level.solution)[0]!;
const ghost = createGhostHand(built.loose.get(firstMove()[0])!.geometry);
built.tray.add(ghost.root);
/** Level 1 only, no text: first the carry loop until the first grab, then the twist loop until the knob is first turned. */
const ghostTwist = () => levelIndex === 0 && !turnedOnce && turning === null && flow.name === 'calibrate';
const ghostOn = () => ghostTwist() || (levelIndex === 0 && !grabbedOnce && (flow.name === 'title' || flow.name === 'playing'));

// The goal: a badge beside the target gear and a ring round it, on the board.
const badge = createGoalBadge();
built.tray.add(badge.root);
const goal = () => goalOf(level, targetSpin);
/** What is wrong with the train as placed: jammed gears turn red (and shake once), a wrong-way target turns the badge red. */
let fault: Fault = { jammed: [], wrongWay: false };
/** When the last jam shake starts (after its gear lands), and how many there have been. */
let shakeFrom = -Infinity;
let shakes = 0;
/** The spin offset each gear's shake has added to its turn, so the next frame can take it back out. */
const shaken = new Map<string, number>();
/** Rechecks the board after a gear moves: solved, the target's live spin, the fault and the badge. */
function recheck(): ReturnType<typeof checkLevel> {
  const r = checkLevel(level, placements);
  solved = r.solved;
  targetSpin = r.spins[level.target.gear];
  fault = faultOf(level, r.spins);
  badge.update(goal(), fault.wrongWay);
  return r;
}
badge.load(level, goal());

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

/** Every gear and pin a gaze or hand can land on; `center` is refilled each frame (world space), so nothing is allocated per frame. */
type Mut3 = [number, number, number];
type Target = Omit<HoverTarget, 'center'> & { center: Mut3; mesh: Mesh };
let hoverTargets: Target[] = [];
/** The loose gears among them, which a free hand can make glow. */
let looseTargets: Target[] = [];
const collectTargets = () => {
  const gears = [...built.gears].map(([id, m]): Target => ({ kind: 'gear', id, mesh: m, radius: (m.geometry.boundingSphere ?? m.geometry.computeBoundingSphere() ?? { radius: 0.03 }).radius, center: [0, 0, 0] }));
  const pins = [...built.pins].map(([id, m]): Target => ({ kind: 'axle', id, mesh: m, radius: 0.015, center: [0, 0, 0] }));
  hoverTargets = [...gears, ...pins];
  looseTargets = gears.filter((g) => built.loose.has(g.id));
};
collectTargets();

/** A fresh board for a level: every gear back on the strip, the clock at zero. */
/** The short code of a generated puzzle (the seed it was made from, or the id t<seed> of a shared one); null for a hand-made one. */
const codeOf = (l: Level): string | null => {
  const seed = seedOfLevel.get(l);
  return seed !== undefined ? encodeSeed(seed) : /^t\d+$/.test(l.id) ? encodeSeed(Number(l.id.slice(1))) : null;
};
function loadLevel(i: number): void {
  levelIndex = i;
  level = levels[i]!;
  par = parHere(levelIndex, level);
  outcome = null;
  dropGearEntities();
  built.load(level);
  axleOf = new Map(level.axles.map((a) => [a.id, a]));
  layerOf = new Map(level.tray.map((g) => [g.id, g.layer]));
  slots = new Map(partsStrip(level).map((s) => [s.id, s]));
  placements = {};
  solved = false;
  targetSpin = undefined;
  fault = { jammed: [], wrongWay: false };
  shakeFrom = -Infinity;
  shaken.clear();
  badge.load(level, goal());
  spins = {};
  held = heldFrom = null;
  if (holder === 'mouse') controls.enabled = true;
  holder = null;
  pending = null;
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
  dropGearEntities(); // ends any IWSDK carry at once, so it cannot move the gear again after it is put back
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
  recheck();
}

/** A fresh puzzle for a slot: a new campaign level, or a new Random level at the same difficulty. */
function freshLevel(i: number): void {
  const next = i === randomSlot() ? (special === 'random' ? randomPuzzle() : levels[i]!) : campaignLevel(i);
  levels = levels.map((l, k) => (k === i ? next : l));
  levelIds = levels.map((l) => l.id);
  randomScored = false;
}
/** Whether the slot holds a Random level. */
const isRandomLevel = (i: number) => i === randomSlot() && special === 'random';
let randomScored = false;

/** Random level at a difficulty, played at once: practice, no run and no score. */
function playRandom(d: Difficulty): void {
  randomDiff = d;
  special = 'random';
  send({ type: 'play', level: randomSlot() });
}

/** A fresh run of a stage from its level 1. */
function newRun(id: StageId): void {
  stage = id;
  run = startRun(id);
  saveRun(storage, run);
  send({ type: 'play', level: 0 });
}

/** The name entry for a completed run, over the title: the total time large, then three letters. */
function askInitials(ms: number, board: string): void {
  const entry = { ms, date: todayISO() };
  const q = qualifies(scores, board, { ...entry, name: scores.initials });
  if (q.ok) overlay = { kind: 'initials', board, rank: q.rank, entry, letters: scores.initials, cursor: 0 };
}

/**
 * The run ends: back to the title. Level 20 solved asks for a name (the time on the board); Give up and the time running out
 * show a short result card, "Level 7 reached", and score nothing. The time on the puzzle it ended on counts.
 */
function endRun(why: 'timeout' | 'giveup' | 'won'): void {
  const r = run;
  run = null;
  saveRun(storage, run);
  send({ type: 'back', level: 0 });
  if (r && why === 'won') askInitials(r.ms, boardOf(r.stage));
  else if (r) {
    const end = reached(r, levelClock.seconds);
    overlay = { kind: 'result', level: end.level, ms: end.ms };
  }
  showPanel();
  fitView(true);
}

/** The best times card: one stage's board, completed runs only. */
function boardCard(id: string, tab: 'local' | 'global'): NonNullable<PanelCtx['board']> {
  const st = id.replace(/^campaign-/, '');
  const local = { label: stageOf(st as StageId).name, stage: st, tab, entries: scores.boards[id]!, empty: 'No finished runs yet.' };
  if (tab === 'local') return local;
  // Global: the last good rows; with none, "Loading" while asking and the local rows with a quiet note once it failed.
  const rows = globalRows.get(id);
  if (rows) return { ...local, entries: rows, empty: 'No global runs yet. Be the first.' };
  if (globalAsk.get(id) === 'offline') return { ...local, note: 'Global scores offline · your runs' };
  return { ...local, entries: [], empty: 'Loading global scores' };
}

/**
 * Options > Reset progress, once confirmed: forgets the saved run (Continue) and puts level 1 back on the board.
 * The high scores boards are a separate store and stay.
 */
function resetProgress(): void {
  run = null;
  saveRun(storage, run);
  freshLevel(0);
  loadLevel(0);
  flow = { ...flow, level: levelIndex };
}

/** A press on the card laid over the flow: the board's Back and level arrows, or the initials' arrows, Save and Skip. */
/** Seconds each number of the resume countdown stays up. */
const COUNT_S = 0.7;
const countdownNumber = (at: number, now: number): number => 3 - Math.floor((now - at) / (COUNT_S * 1000));
/** Where the About text is scrolled to by one arrow press or key, metres. */
const ABOUT_STEP = 0.06;
const scrollAbout = (by: number): void => {
  if (overlay?.kind !== 'about') return;
  overlay = { ...overlay, scroll: Math.min(aboutMax, Math.max(0, overlay.scroll + by)) };
  showPanel();
};

function pressOverlay(id: string): void {
  const o = overlay!;
  if (o.kind === 'countdown') return; // nothing to press: the board is coming back
  if (o.kind === 'about') {
    if (id === 'back') overlay = null;
    else if (id === 'up-scroll' || id === 'down-scroll') return scrollAbout(id === 'up-scroll' ? -ABOUT_STEP : ABOUT_STEP);
    else return;
  } else if (o.kind === 'options') {
    if (id === 'back') overlay = null;
    else if (id === 'relaxed') {
      relaxed = !relaxed;
      saveRelaxed(storage, relaxed);
    } else if (id === 'music') {
      musicOn = !musicOn;
      sound.setMusic(musicOn);
      saveMusicOn(storage, musicOn);
    } else if (id === 'sound') {
      soundOn = !soundOn;
      sound.setMuted(!soundOn);
      saveSoundOn(storage, soundOn);
    } else if (id === 'reset') overlay = { kind: 'options', confirm: true };
    else if (id === 'reset-cancel') overlay = { kind: 'options', confirm: false };
    else if (id === 'reset-yes') {
      resetProgress();
      overlay = null;
    } else return;
  } else if (o.kind === 'stages') {
    overlay = null;
    const pick = STAGES.find((st) => `stage-${st.id}` === id);
    if (pick) return newRun(pick.id);
  } else if (o.kind === 'picker') {
    overlay = null;
    if (id !== 'back' && (DIFFICULTIES as readonly string[]).includes(id)) return playRandom(id as Difficulty);
  } else if (o.kind === 'board') {
    if (id === 'back') overlay = null;
    else if (id === 'tab-local' || id === 'tab-global') overlay = { ...o, tab: id === 'tab-global' ? 'global' : 'local' };
    else if (STAGES.some((st) => `tab-${st.id}` === id)) overlay = { ...o, board: boardOf(id.slice(4)) };
    else return;
    const now = overlay as Overlay | null;
    if (now?.kind === 'board' && now.tab === 'global') loadGlobal(now.board);
  } else if (o.kind === 'result') {
    overlay = null;
    if (id === 'start') overlay = { kind: 'stages' }; // New Game: which stage?
  } else {
    const slot = /^slot-([0-2])$/.exec(id);
    if (slot) return void (overlay = { ...o, cursor: Number(slot[1]) }, showPanel());
    const arrow = /^(up|down)-([0-2])$/.exec(id);
    if (arrow) overlay = { ...o, ...stepInitial(o, Number(arrow[2]), arrow[1] === 'up' ? 1 : -1) };
    else if (id === 'save') {
      scores = addEntry(scores, o.board, { ...o.entry, name: o.letters });
      saveScores(storage, scores);
      void submitGlobal(o.board, scores.initials, o.entry.ms, RUN_STEP); // fire and forget: the card never waits on it
      overlay = null;
    } else if (id === 'skip') overlay = null;
    else return;
  }
  showPanel();
  fitView(true);
}

function send(e: FlowEvent): void {
  const next = step(flow, e, levels.length);
  if (next === flow) return;
  // A card laid over the flow goes when the flow leaves the title: the board, the options, the picker and the run's result all sit over it.
  if (overlay && next.name !== 'title') overlay = null;
  if (next.name === 'paused') {
    putBack();
    letGoKnob();
    sound.suspend();
  } else if (flow.name === 'paused') sound.resume();
  if (reloads(flow, e, next)) {
    // A puzzle is made fresh each time it is started: a level played, the next one, a Retry on the complete card, the board the
    // title shows. A Restart from the pause card puts the same puzzle back.
    if (e.type === 'play' || e.type === 'next' || e.type === 'back' || (e.type === 'restart' && flow.name === 'paused')) freshLevel(next.level);
    loadLevel(next.level);
  }
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
    sound.chime();
    rewardAt = calibratedAt = performance.now();
    letGoKnob();
    outcome = relaxed ? null : outcomeOf(levelClock.seconds, par);
    // A level cleared counts towards the run (a shared puzzle is no part of one); the score waits for the run to end.
    if (run && levelIndex < CAMPAIGN) {
      run = solvedLevel(run, levelClock.seconds);
      saveRun(storage, run);
    }
    burst.position.set(...trayLocal(DIAL_AT[0], DIAL_AT[1], 0.008));
  }
  syncBackdrop();
  built.tray.visible = flow.name !== 'paused'; // a paused level shows nothing of its board
  showPanel();
  fitView(true); // a new level or card may want the camera nearer or further
}
/**
 * The title and its cards show the attic and play the calm menu music; a level on the board shows its stage's panorama and plays its
 * theme (a Random level, its pick's stage). The music crossfades over 2 s (src/sound.ts); the pause card keeps the stage's theme 6 dB down.
 */
function syncBackdrop(): void {
  const on = flow.name === 'title' ? null : levelIndex < CAMPAIGN ? stage : isRandomLevel(levelIndex) ? RANDOM_PICK[randomDiff].stage : null;
  useBackdrop(on ? stageOf(on).backdrop : MENU_BACKDROP);
  sound.setTheme(on ? stageOf(on).theme : MENU_THEME);
  useAmbient(on);
  sound.setDucked(flow.name === 'paused');
}

const PRESS: Record<string, FlowEvent> = {
  continue: { type: 'start' }, // straight into the next unsolved level
  pause: { type: 'pause' },
  resume: { type: 'resume' },
  restart: { type: 'restart' },
  next: { type: 'next' },
};
/**
 * One press per touch: a poke and a pinch in the same moment, or a card swapping under the finger, never double-fire.
 * A mouse click is one discrete pointerdown, so it skips the gap: quick clicks through the menus all land.
 */
const PRESS_GAP_MS = 300;
let pressedAt = -Infinity;
function press(id: string, by: 'hand' | 'mouse' | 'key' = 'hand'): void {
  const now = performance.now();
  if (by === 'hand' && now - pressedAt < PRESS_GAP_MS) return;
  pressedAt = now;
  if (overlay) return pressOverlay(id);
  if ((id === 'scores' || id === 'options') && flow.name === 'title') {
    globalAsk.clear();
    overlay = id === 'scores' ? { kind: 'board', board: boardOf(stage), tab: 'local' } : { kind: 'options', confirm: false };
    showPanel();
    return fitView(true);
  }
  if (flow.name === 'title' && id === 'about') {
    overlay = { kind: 'about', scroll: 0 };
    showPanel();
    return fitView(true);
  }
  if (flow.name === 'title' && id === 'random') {
    overlay = { kind: 'picker' }; // Random level: how hard?
    showPanel();
    return fitView(true);
  }
  if (flow.name === 'title' && id === 'start') {
    // New Game: which stage, then a fresh run from its level 1.
    overlay = { kind: 'stages' };
    showPanel();
    return fitView(true);
  }
  if (id === 'resume' && flow.name === 'paused') {
    // Resuming counts down 3, 2, 1 with the board still hidden; the clock restarts when the board comes back.
    overlay = { kind: 'countdown', at: performance.now() };
    showPanel();
    return;
  }
  if (id === 'giveup') return isRandomLevel(levelIndex) ? send({ type: 'back', level: continueAt() }) : endRun('giveup');
  if (id === 'menu') {
    // The Main menu leaves the run saved, with the time spent on this puzzle carried into it.
    if (run && flow.name === 'paused') {
      run = carried(run, levelClock.seconds);
      saveRun(storage, run);
    }
    return send({ type: 'back', level: continueAt() });
  }
  if (id === 'next' && flow.name === 'complete' && levelIndex >= CAMPAIGN - 1) {
    // After level 20 the run is won and the name entry comes up; after a Random level it is another puzzle at the same difficulty.
    if (isRandomLevel(levelIndex)) playRandom(randomDiff);
    else endRun('won');
    return;
  }
  if (id === 'restart' && run && levelIndex < CAMPAIGN) {
    // Restart is a new puzzle at the same level; the run's clock keeps counting what was spent on this one.
    run = carried(run, levelClock.seconds);
    saveRun(storage, run);
  }
  if (id === 'relaxed') {
    relaxed = !relaxed;
    saveRelaxed(storage, relaxed);
  } else send(PRESS[id]!);
}
/** Board parts move only while playing: on the menus the board is under the dark layer (or the AR backing panel), so a touch there is a button's. */
const live = () => flow.name === 'playing';
/** The complete card waits while the automaton and the running train play the reward. */
const COMPLETE_DELAY_MS = 2000;
const shownButtons = (): Button[] => (panels.panelMesh.visible ? [...(panels.current?.layout.buttons ?? [])] : []);

/** The loose gear nearest a world point, if one is within reach and the board is live. */
function gearNear(world: Vec3): string | null {
  if (!live()) return null;
  const point = worldToTray(world, currentPose());
  return pickGear(
    point,
    [...built.loose].filter(([gid]) => gid !== held).map(([gid, m]) => ({ id: gid, x: m.position.x, y: -m.position.z, lift: m.position.y })),
  );
}

/** Starts carrying a loose gear, freeing its axle. */
function take(id: string): void {
  if (flow.name === 'title') send({ type: 'start' });
  grabbedOnce = true;
  held = id;
  heldFrom = placements[id] ?? null;
  tweens.delete(id);
  if (delete placements[id]) recheck();
}

/** Picks up the loose gear nearest a world point, if one is within reach; freeing its axle. */
function grab(world: Vec3): boolean {
  const id = gearNear(world);
  if (!id) return false;
  take(id);
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
  const check = recheck();
  if (axle) {
    sound.click();
    if (Object.values(check.spins).includes('jammed')) {
      sound.grind();
      // The locked gears shudder once the dropped gear has landed.
      shakeFrom = performance.now() + TWEEN_MS;
      shakes++;
    }
  }
  if (solved) send({ type: 'solve' });
}

// Gear pick-up in XR goes through IWSDK's GrabSystem: each loose gear is an entity with OneHandGrabbable while the board is
// live, and the Grabbed tag it gains and loses starts and ends the same carry as the raw pinch. `?grab=pinch` leaves the raw
// pinch in charge. The raw pinch also stays as the fallback when IWSDK never grabs for a pinch that is on a gear.
const grabMode = grabModeOf(location.search);
/** How the current (or last) gear pick-up started. */
let grabVia: 'iwsdk' | 'pinch' | null = null;
const grabSystem = world.getSystem(GrabSystem)!;
const trayEntity = world.createTransformEntity(built.tray, { parent: world.sceneEntity, persistent: true });
const gearEntities = new Map<string, Entity>();
/** The gear IWSDK is carrying now, if any. */
let iwsdkHeld: string | null = null;
/** A pinch that is on a gear: the raw path gives IWSDK a few frames to grab it before taking it itself. */
let pending: { hand: Hand; frames: number } | null = null;
/** Hands whose current pinch went to a panel button or the knob, so it never picks up a gear. */
const claimed = { left: false, right: false };

/** Drops every gear entity (which pulls the mesh out of the tray, so it goes straight back). Ends any IWSDK carry. */
function dropGearEntities(): void {
  for (const [id, e] of gearEntities) {
    const mesh = built.loose.get(id);
    e.destroy();
    if (mesh) built.tray.add(mesh);
  }
  gearEntities.clear();
  iwsdkHeld = null;
}

/** Gears are grabbable only in XR while the board is live; sealed (placed, calibrating) or paused, they are plain meshes. */
function syncGrabbables(): void {
  const want = grabMode === 'iwsdk' && world.renderer.xr.isPresenting && live();
  if (!want) {
    if (gearEntities.size) dropGearEntities();
    return;
  }
  if (gearEntities.size) return;
  for (const [id, mesh] of built.loose) {
    const e = world.createTransformEntity(mesh, { parent: trayEntity, persistent: true });
    e.addComponent(OneHandGrabbable, { rotate: false });
    gearEntities.set(id, e);
  }
}

/** Follows the Grabbed tag: a gear gaining it is picked up, losing it is let go. Runs once a frame. */
function stepGrabs(): void {
  syncGrabbables();
  if (iwsdkHeld) {
    const e = gearEntities.get(iwsdkHeld);
    if (!e || held !== iwsdkHeld) {
      // The board changed under the carry (paused, new level): IWSDK lets go, the game already has.
      if (e) grabSystem.forceRelease(e);
      iwsdkHeld = null;
    } else if (!e.hasComponent(Grabbed)) {
      iwsdkHeld = null;
      release();
    }
  }
  if (iwsdkHeld) return;
  for (const [id, e] of gearEntities) {
    if (!e.hasComponent(Grabbed)) continue;
    const at = worldOf(built.loose.get(id)!.position);
    const hand = holderHand(grabSystem.getHolderHand(e), pinching, pinchPoints, at);
    // A pinch already spoken for (a button, the knob), a carry already under way or a board that is not live: not a pick-up.
    if (held !== null || !live() || (hand && claimed[hand])) {
      grabSystem.forceRelease(e);
      continue;
    }
    take(id);
    holder = hand ?? 'right';
    iwsdkHeld = id;
    grabVia = 'iwsdk';
    break;
  }
}

// Desktop: click panel buttons, drag a loose gear across the tray plane; dragging empty space still orbits.
const canvas = world.renderer.domElement;
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', `${APP_TITLE}, a clockwork puzzle: drag brass gears from the ledge onto the axles to link the train, then turn the regulator dial until the clock keeps time.`);
// Desktop keys press the shown card's buttons, as a click would: Enter is the primary pill, Esc pauses, resumes or goes back.
window.addEventListener('keydown', (e) => {
  if (e.repeat || world.renderer.xr.isPresenting || e.target instanceof HTMLButtonElement) return;
  if (overlay?.kind === 'initials' && e.key.startsWith('Arrow')) {
    // The name entry: up and down cycle the letter, left and right move between the three slots.
    e.preventDefault();
    const slot = Math.min(overlay.cursor, 2);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') overlay = { ...overlay, ...stepInitial(overlay, slot, e.key === 'ArrowUp' ? 1 : -1) };
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') overlay = { ...overlay, cursor: Math.max(0, Math.min(2, slot + (e.key === 'ArrowRight' ? 1 : -1))) };
    return;
  }
  if (overlay?.kind === 'initials' && !(e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'Backspace' || /^[a-z]$/i.test(e.key))) {
    e.preventDefault();
    overlay = { ...overlay, ...(e.key === 'Backspace' ? backInitial(overlay) : typeInitial(overlay, e.key)) };
    return;
  }
  if ((e.key === 'r' || e.key === 'R') && !(e.ctrlKey || e.metaKey || e.altKey) && overlay?.kind !== 'initials') return resetView(); // (the name entry's letters were taken above)
  const shown = shownButtons();
  if (overlay?.kind === 'about' && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown')) {
    e.preventDefault();
    scrollAbout((e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 1) * ABOUT_STEP * (e.key.startsWith('Page') ? 3 : 1));
    return;
  }
  // A menu: nothing is selected until a key reaches it. Arrows and Tab walk the buttons (top to bottom, left to right) from the
  // top, Enter presses the one reached. The play cards keep Enter on their primary pill (Next).
  if (menuUp() && overlay?.kind !== 'initials' && (e.key.startsWith('Arrow') || e.key === 'Tab' || e.key === 'Enter')) {
    const order = [...shown].filter((b) => b.kind !== 'slot' && b.kind !== 'arrow').sort((a, b) => Math.round((b.y - a.y) * 1000) || a.x - b.x);
    if (e.key === 'Enter') {
      const at = kbdButton();
      if (!at) return;
      e.preventDefault();
      sound.unlock();
      kbd = null;
      return press(at, 'key');
    }
    e.preventDefault();
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey);
    const now = kbdButton();
    const from = now ? order.findIndex((b) => b.id === now) : -1;
    const next = from < 0 ? (forward ? 0 : order.length - 1) : (from + (forward ? 1 : -1) + order.length) % order.length;
    if (order[next]) kbd = { id: order[next]!.id, card: cardKey() };
    showPanel();
    return;
  }
  // Esc pauses, resumes or goes back one menu, P pauses and resumes (never on another menu); Enter is the primary pill of a play card.
  const id =
    e.key === 'Enter' ? shown.find((b) => b.kind === 'primary')?.id
    : e.key === 'Escape' ? ['pause', 'resume', 'back', 'skip'].find((k) => shown.some((b) => b.id === k))
    : e.key === 'p' || e.key === 'P' ? ['pause', 'resume'].find((k) => shown.some((b) => b.id === k))
    : undefined;
  if (!id) return;
  e.preventDefault();
  sound.unlock();
  press(id, 'key');
});
canvas.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
// The About window scrolls with the wheel (and keeps the orbit controls from zooming under it).
canvas.addEventListener(
  'wheel',
  (e) => {
    if (overlay?.kind !== 'about') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    scrollAbout(e.deltaY * 0.0004);
  },
  { capture: true, passive: false },
);
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
      if (id) press(id, 'mouse');
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
canvas.addEventListener('dblclick', (click) => {
  const e = click as PointerEvent; // only its position is read
  if (world.renderer.xr.isPresenting || holder !== null || turning !== null) return;
  if (onPanel(rayAt(e))) return;
  // Empty space only: not a card, not the tray (its plane is hit anywhere, so the board and parts strip are boxed here: x about
  // +-30 cm, from the strip's far end to just past the near edge).
  const hit = mouseOnTray(e);
  const local = hit && built.tray.worldToLocal(new Vector3(hit[0], hit[1], hit[2]));
  if (local && Math.abs(local.x) < 0.3 && local.z > -0.45 && local.z < 0.25) return;
  resetView();
});
let mouseRay: [Vec3, Vec3] | null = null;
let mouseButton: string | null = null;
/** The menu button the keys have reached: nothing is selected when a menu opens; the first arrow or Tab starts at the top. Cleared by the mouse and by a change of card. */
let kbd: { id: string; card: string } | null = null;
const cardKey = () => `${panels.current?.screen ?? ''}|${overlay?.kind ?? ''}`;
/** The button drawn selected: the mouse's or a hand's, else the keys'; only one that is on the card now (a pointer left over a button of the last card lights nothing). */
const highlight = (): string | null => {
  const here = shownButtons();
  const on = (id: string | null) => (id !== null && here.some((b) => b.id === id) ? id : null);
  return on(mouseButton) ?? on(tipButton.left) ?? on(tipButton.right) ?? kbdButton();
};
const kbdButton = () => (kbd && kbd.card === cardKey() && shownButtons().some((b) => b.id === kbd!.id) ? kbd.id : null);
let mouseKnob = false;
canvas.addEventListener('pointermove', (e) => {
  const p = holder === 'mouse' && mouseOnTray(e);
  if (p) drag(p);
  if (turning === 'mouse') {
    regulator.turn(dragTwist(e.clientX - lastMouseX));
    lastMouseX = e.clientX;
  }
  mouseRay = rayAt(e);
  kbd = null; // the mouse takes over the highlight
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
// The note's "Drag to look around the tray." has done its job at the first drag (orbit, gear or knob): it fades for good.
const lookNote = enterNote.querySelector('.cg-more');
canvas.addEventListener('pointermove', (e) => e.buttons && lookNote?.classList.add('gone'));

// Pause whenever the player is pulled away: tab hidden, headset menu or headset off, session over.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') send({ type: 'pause' });
  else fitView(true);
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
/** How this session's tray came back from an earlier one, if it did. */
let trayRestored: 'anchor' | 'saved' | null = null;
const lastTipZ: { left: number | null; right: number | null } = { left: null, right: null };
const tipButton: { left: string | null; right: string | null } = { left: null, right: null };
// Passthrough: real hands hide the board behind them (depth-only occluders on the joints), and a ring shows a found table.
const occluders = { left: createHandOccluder(), right: createHandOccluder() };
const jointsNow: { left: Float32Array | null; right: Float32Array | null } = { left: null, right: null };
const cue = createPlaceCue();
world.scene.add(occluders.left.root, occluders.right.root, cue.root);
const INDEX_TIP = HAND_JOINTS.indexOf('index-finger-tip');
const tipOf = (j: Float32Array | null) => (j ? { indexTip: [j[INDEX_TIP * 4]!, j[INDEX_TIP * 4 + 1]!, j[INDEX_TIP * 4 + 2]!] as const } : null);
trackMr(world.renderer, {
  onRecenter() {
    recenters++;
  },
  holding: () => holder === 'left' || holder === 'right' || turning === 'left' || turning === 'right',
  onPlace(next, head: Head, why) {
    placement = next;
    const [x, y, z] = toHeadFrame(next.pose.position, head);
    placedPose = { position: [x, y, z], tilt: next.pose.tilt, yaw: (next.pose.yaw ?? 0) - head.yaw };
    built.place(next);
    scenery.place(next);
    placePanels();
    panels.showNote(next.fit === 'small');
    trayRestored = why === 'saved' || why === 'anchor' ? why : null;
    const kind = cueFor(why, next);
    if (kind) cue.start(kind, next, performance.now());
  },
  onJoints(hand, joints) {
    jointsNow[hand] = joints;
    occluders[hand].update(joints);
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
    if (starts) sound.unlock();
    const onButton = starts && buttonAt(worldToPanel(anchor, point), shownButtons(), 0.03);
    if (starts) {
      claimed[hand] = !!onButton;
      pending = null;
    }
    if (onButton) press(onButton);
    else if (starts && grabKnob(point, hand)) {
      claimed[hand] = true;
      lastWrist = wrist;
    } else if (starts && grabMode === 'pinch') {
      if (grab(point)) {
        holder = hand;
        grabVia = 'pinch';
      }
    } else if (starts && gearNear(point)) pending = { hand, frames: 0 };
    if (!point) claimed[hand] = false;
    if (pending?.hand === hand) {
      // IWSDK's grab has a few frames to arrive; if it has not, this pinch picks the gear up itself.
      const owner = pinchOwner(grabMode, pending.frames, iwsdkHeld !== null);
      if (!point || owner === 'skip') pending = null;
      else if (owner === 'wait') pending.frames++;
      else {
        pending = null;
        if (holder === null && grab(point)) {
          holder = hand;
          grabVia = 'pinch';
        }
      }
    }
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
    if (holder === hand && iwsdkHeld) {
      // IWSDK ends the carry (and stepGrabs releases the gear); a lost pinch just makes sure of it.
      const e = !point && gearEntities.get(iwsdkHeld);
      if (e) grabSystem.forceRelease(e);
      return;
    }
    if (holder !== hand) return;
    if (point) drag(point);
    else release();
  },
}, storage);
world.renderer.xr.addEventListener('sessionend', () => {
  send({ type: 'pause' });
  putBack();
  placement = DEFAULT_PLACEMENT;
  placedPose = TRAY_POSE;
  handHint = false;
  panels.showNote(false);
  trayRestored = null;
  cue.hide();
  for (const hand of ['left', 'right'] as const) {
    jointsNow[hand] = null;
    occluders[hand].update(null);
  }
  built.place(DEFAULT_PLACEMENT);
  scenery.place(DEFAULT_PLACEMENT);
  placePanels();
  panels.showHint(false);
});

// Hover hints, refreshed every rendered frame: gaze tint, hand glow, and pulsing rings on valid axles.
const GAZE_TINT = { color: 0xffe2b0, intensity: 0.3 };
const HAND_TINT = { color: 0xff8a2a, intensity: 0.9 };
let gazeTarget: { kind: 'gear' | 'axle'; id: string } | null = null;
const handGlow: string[] = [];
let validNow: string[] = [];
// Scratch for the per-frame loop below, so a frame allocates nothing here.
const scratchA = new Vector3();
const scratchB = new Vector3();
const scratchC = new Vector3();
const scratchQ = new Quaternion();
const UP = new Vector3(0, 1, 0);
const gazeRay: [Mut3, Mut3] = [[0, 0, 0], [0, 0, 0]];
const freeHands: (Vec3 | null)[] = [null, null];
const soundAt: Mut3 = [0, 0, 0];
const listenAt: Mut3 = [0, 0, 0];
const listenForward: Mut3 = [0, 0, 0];
const listenUp: Mut3 = [0, 0, 0];
const set3 = (out: Mut3, v: Vector3): Mut3 => ((out[0] = v.x), (out[1] = v.y), (out[2] = v.z), out);
/** The escapement dial's top, in tray space, where the ticks come from. */
const knobTop = new Vector3(...trayLocal(KNOB[0], KNOB[1], KNOB_TOP));
const tint = (mesh: Mesh, t: { color: number; intensity: number } | null) => {
  const mat = mesh.material as MeshStandardMaterial;
  mat.emissive.set(t?.color ?? 0x000000);
  mat.emissiveIntensity = t?.intensity ?? 0;
};
// A jammed gear: its own brass lerps towards the jam red, with a faint red glow (every gear has its own material).
const BRASS = new Color(C.brass);
const JAM = new Color(C.jam);
/** How far a jammed gear's colour goes from brass to the jam red. */
const JAM_MIX = 0.7;
const JAM_TINT = { color: JAM.getHex(), intensity: 0.18 };
const redden = (mesh: Mesh, k: number) => (mesh.material as MeshStandardMaterial).color.lerpColors(BRASS, JAM, k * JAM_MIX);
/** For the test hook: how far a gear's colour has gone towards the full jam tint, 0..1, read back from its material. */
const reddened = (mesh: Mesh) => {
  const c = (mesh.material as MeshStandardMaterial).color;
  const [dr, dg, db] = [JAM.r - BRASS.r, JAM.g - BRASS.g, JAM.b - BRASS.b];
  const k = ((c.r - BRASS.r) * dr + (c.g - BRASS.g) * dg + (c.b - BRASS.b) * db) / (dr * dr + dg * dg + db * db) / JAM_MIX;
  return Math.round(k * 1000) / 1000;
};
/** Tick count as the train sees it: each tick is a quick 90 ms step, then a rest until the next. */
const stepped = (phase: number, rate: number) => {
  const whole = Math.floor(phase);
  return whole + easeOut((phase - whole) / Math.min(1, 0.09 * rate));
};
let soundPhase = 0;
let lastFrame = performance.now();
world.scene.onBeforeRender = () => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  stepGrabs();
  levelClock.tick(now, flow.name === 'playing');
  tickAmbient(dt);
  // The music's layers follow the level (a Random level counts as 10) and the clock: under 30 s left the pad opens and the ticks come up.
  sound.setIntensity(levelIndex < CAMPAIGN ? levelIndex + 1 : 10, (flow.name === 'playing' || flow.name === 'paused') && !relaxed && par - levelClock.seconds < LOW_TIME_S);
  // A campaign run is lost when the level's time limit runs out (not with No timer).
  if (flow.name === 'playing' && !relaxed && run && levelIndex < CAMPAIGN && levelClock.seconds >= par) endRun('timeout');
  for (const [id, t] of tweens) {
    const { pos, done } = tweenAt(t.from, t.to, now - t.start);
    built.loose.get(id)?.position.set(...pos);
    if (done) tweens.delete(id);
  }
  built.updateShadows();
  cue.update(now);
  if (!world.renderer.xr.isPresenting && !cameraTween && controls.enabled) controls.update(); // damping
  if (cameraTween && !world.renderer.xr.isPresenting) {
    const { pos, done } = tweenAt(cameraTween.from, cameraTween.to, now - cameraTween.start, FIT_MS);
    world.camera.position.set(...pos);
    controls.update();
    if (done) cameraTween = null;
  }

  // WebXR has no general eye-gaze API, so in XR the gaze ray is the head (viewer pose) forward direction.
  let ray: [Vec3, Vec3] | null = mouseRay;
  if (world.renderer.xr.isPresenting) {
    set3(gazeRay[0], world.camera.getWorldPosition(scratchA));
    set3(gazeRay[1], world.camera.getWorldDirection(scratchB));
    ray = gazeRay;
  }
  built.tray.updateMatrixWorld();
  for (const s of hoverTargets) set3(s.center, built.tray.localToWorld(scratchA.copy(s.mesh.position)));
  gazeTarget = ray && rayPick(ray[0], ray[1], hoverTargets);
  freeHands[0] = holder === 'left' ? null : handPoints.left;
  freeHands[1] = holder === 'right' ? null : handPoints.right;
  handNear(freeHands, looseTargets, HAND_NEAR_M, handGlow);
  if (held) validNow = validAxles(level, placements, held);
  else validNow.length = 0;

  // Escapement: it ticks once the train is solved. While calibrating, the train steps forward on each tick
  // (a step is what it turns in one tick at the target rate); once calibrated it runs smoothly at its true speeds.
  const ticking = flow.name === 'calibrate' || flow.name === 'complete';
  const before = stepped(regulator.phase, regulator.rate);
  const phaseBefore = regulator.phase;
  if (ticking && regulator.tick(dt) && flow.name === 'calibrate') send({ type: 'calibrated' });
  if (ticking) {
    const ticks = flow.name === 'complete' ? dt * regulator.target : stepped(regulator.phase, regulator.rate) - before;
    for (const [id, m] of built.gears) {
      const rpm = spins[id];
      if (typeof rpm === 'number') m.rotation.z += ((rpm * Math.PI) / 60 / regulator.target) * ticks;
    }
  }
  // One tick of sound per step of the escapement, from the dial; once calibrated the target rate keeps it.
  sound.setSource(set3(soundAt, built.tray.localToWorld(scratchA.copy(knobTop))));
  sound.setListener(
    set3(listenAt, world.camera.getWorldPosition(scratchA)),
    set3(listenForward, world.camera.getWorldDirection(scratchB)),
    set3(listenUp, scratchC.copy(UP).applyQuaternion(world.camera.getWorldQuaternion(scratchQ))),
  );
  let owed = flow.name === 'calibrate' ? ticksBetween(phaseBefore, regulator.phase) : 0;
  if (flow.name === 'complete') {
    soundPhase += dt * regulator.target;
    owed = Math.floor(soundPhase);
    soundPhase -= owed;
  }
  // After a solve the ticks fade out by 3 s (the bird keeps flapping on screen, silently).
  const hush = flow.name === 'complete' ? tickGain((now - calibratedAt) / 1000) : 1;
  for (let i = 0; i < Math.min(owed, 2); i++) sound.tick(hush);
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

  for (const s of hoverTargets) {
    const near = s.kind === 'gear' && handGlow.includes(s.id);
    const lit = near ? HAND_TINT : gazeTarget?.kind === s.kind && gazeTarget.id === s.id ? GAZE_TINT : null;
    const amber = s.kind === 'gear' ? Math.max(1.2 * flash, s.id === level.escapement.gear ? glint : 0) : 0;
    // A jammed gear stays red under the gaze; a hand reaching for it still lights it, so it reads as one to take off.
    const jam = s.kind === 'gear' && fault.jammed.includes(s.id);
    tint(s.mesh, amber > 0.01 ? { color: 0xd99a2b, intensity: amber } : jam && !near ? JAM_TINT : lit);
    if (s.kind === 'gear') redden(s.mesh, jam ? 1 : 0);
  }
  // The jam shake: the locked gears rattle about their axles and wobble across them, then hold still. Each frame takes
  // back last frame's rattle before adding this one's, so the turn is left exactly where it was.
  const shakeMs = now - shakeFrom;
  for (const [id, m] of built.gears) {
    const on = fault.jammed.includes(id);
    const spin = on ? shakeSpin(shakeMs) : 0;
    const was = shaken.get(id) ?? 0;
    if (spin !== was) m.rotation.z += spin - was;
    shaken.set(id, spin);
    const tilt = on ? shakeTilt(shakeMs) : 0;
    if (m.rotation.y !== tilt) m.rotation.y = tilt;
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
    ghost.update(ghostTwistAt(now / 1000, TWIST_CUE_AT, settingOf(regulator.target) >= regulator.setting ? 1 : -1));
  } else if (ghostOn()) {
    const slot = slots.get(from)!;
    const axle = axleOf.get(to)!;
    ghost.update(ghostAt(now / 1000, [slot.x, slot.y], [axle.x, axle.y]));
  }

  // The left Touch controller's menu button (gamepad button 7 in the WebXR input profiles of the Quest controllers) pauses and resumes
  // like Esc and P. Hands have no such button; the in-world pause button is theirs. Untested on a real headset.
  let menuDown = false;
  for (const src of world.renderer.xr.getSession()?.inputSources ?? []) {
    if (src.handedness === 'left' && src.gamepad && src.gamepad.buttons.length > 7) menuDown ||= !!src.gamepad.buttons[7]?.pressed;
  }
  if (menuDown && !menuWas) press(flow.name === 'paused' ? 'resume' : 'pause', 'key');
  menuWas = menuDown;
  // The resume countdown: a soft tick on each number, then the board is back and the level clock runs on.
  if (overlay?.kind === 'countdown') {
    const n = countdownNumber(overlay.at, now);
    if (n !== lastCount && n >= 1) sound.tick(1);
    lastCount = n;
    if (n < 1) {
      overlay = null;
      send({ type: 'resume' });
    }
  } else lastCount = 4;
  // A paused level hides its board: no gears, axles, strip, badge, goal ring or dial to study while the clock is stopped.
  built.tray.visible = flow.name !== 'paused';
  showPanel(now);
  panels.tick(now);
};

/**
 * The page header's progress, left of Enter MR: "EASY · LEVEL 2 / 20" and a 20-segment bar during a campaign level, "RANDOM · HARD"
 * with no bar in practice, nothing on the menus (and the pause menu) or a shared puzzle. It is a live region, so a screen reader
 * hears each level change. On a phone CSS shows the compact "E · 2/20".
 */
const progressBox = document.getElementById('progress');
const progressBar = progressBox?.querySelector('.bar');
if (progressBar) for (let i = 0; i < CAMPAIGN; i++) progressBar.append(document.createElement('i'));
let progressShown = '';
function updateProgress(): void {
  if (!progressBox || !progressBar) return;
  const playing = !overlay && PLAY_SCREENS.includes(screenOf(flow));
  const campaign = levelIndex < CAMPAIGN;
  const parts = !playing ? null : campaign ? { stage: stageOf(stage).name, level: ` · Level ${levelIndex + 1} / ${CAMPAIGN}`, short: ` · ${levelIndex + 1}/${CAMPAIGN}` } : isRandomLevel(levelIndex) ? { stage: 'Random', level: ` · ${randomDiff}`, short: ` · ${randomDiff[0]!.toUpperCase()}` } : null;
  const key = parts ? `${parts.stage}${parts.level}|${campaign ? levelIndex : -1}` : '';
  if (key === progressShown) return;
  progressShown = key;
  progressBox.hidden = !parts;
  if (!parts) return;
  const [full, short] = [...progressBox.querySelectorAll('.label > span')];
  for (const [box, level] of [[full, parts.level], [short, parts.short]] as const) {
    box!.querySelector('.stage')!.textContent = box === short ? parts.stage[0]! : parts.stage;
    box!.querySelector('.level')!.textContent = level;
  }
  (progressBar as HTMLElement).hidden = !campaign;
  [...progressBar.children].forEach((seg, i) => seg.classList.toggle('on', campaign && i <= levelIndex));
}

let lastCount = 4;
let menuWas = false;

/** Draws the card for the current state; run every frame and after every transition, so the buttons on show never lag the flow. */
function showPanel(now = performance.now()): void {
  const waiting = flow.name === 'complete' && now - calibratedAt < COMPLETE_DELAY_MS;
  panels.show(waiting ? null : (overlay?.kind ?? screenOf(flow)), {
    initials: overlay?.kind === 'initials' ? { rank: overlay.rank, letters: overlay.letters, cursor: overlay.cursor, ms: overlay.entry.ms } : undefined,
    result: overlay?.kind === 'result' ? { level: overlay.level, ms: overlay.ms } : undefined,
    countdown: overlay?.kind === 'countdown' ? countdownNumber(overlay.at, now) : undefined,
    aboutScroll: overlay?.kind === 'about' ? overlay.scroll : undefined,
    board: overlay?.kind === 'board' ? boardCard(overlay.board, overlay.tab) : undefined,
    stage: levelIndex < CAMPAIGN ? stageOf(stage).name : undefined,
    level: levelIndex,
    levels: levels.length,
    shared: special === 'shared',
    random: special === 'random',
    difficulty: randomDiff.replace(/^./, (c) => c.toUpperCase()),
    resume: resume(),
    time: levelClock.seconds,
    relaxed,
    sound: soundOn,
    music: musicOn,
    confirm: overlay?.kind === 'options' && overlay.confirm,
    xr: world.renderer.xr.isPresenting,
    timer: relaxed || screenOf(flow) !== 'hud' ? null : { par, ...timerView(levelClock.seconds, par) }, // only the HUD carries it, so no other card redraws as it counts
    outcome,
    par: outcome ? par : null,
    hover: highlight(),
    bests: Object.fromEntries(STAGES.flatMap((st) => { const t = scores.boards[boardOf(st.id)]?.[0]; return t ? [[st.id, clockTenths(t.ms / 1000).replace(/\.\d$/, '')]] : []; })),
    goal: badge.root.visible ? goal() : null,
    fault: faultKind(fault),
    narrow: phone(),
  });
  updateProgress();
  // A menu is centred in the view and a full-view layer sits under it: place it as soon as it shows, and follow the camera while it does.
  if (menuUp() || placedFor) placePanels();
}

syncBackdrop();
// Compile every shader now, behind the loading card, so no first play frame stalls on it (capped, so a slow GPU never hangs the card).
await Promise.race([world.renderer.compileAsync(world.scene, world.camera), new Promise((done) => setTimeout(done, 8000))]).catch(() => undefined);
// The world is built and the first card is up: the loading card in index.html fades out of the way.
document.getElementById('loading')?.classList.add('done');

const supported = await (navigator.xr?.isSessionSupported('immersive-ar') ?? Promise.resolve(false)).catch(() => false);
if (supported) {
  enterButton.disabled = false;
  enterNote.hidden = true;
  enterButton.addEventListener('click', () => sound.unlock());
  enterButton.addEventListener('click', () => void startSession(() => world.launchXR(), enterNote));
}

const toScreen = (p: Vec3): [number, number] => {
  const v = new Vector3(...p).project(world.camera);
  const rect = canvas.getBoundingClientRect();
  return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
};
const panelCorners = () => {
  const l = panels.panelMesh.visible ? panels.current?.layout : undefined;
  if (!l) return [];
  return ([[-1, 0], [1, 0], [-1, 1], [1, 1]] as const).map(([sx, k]) => toScreen(panelToWorld(anchor, [(sx * l.width) / 2, k * l.height, 0])));
};
/** For tests: the page-pixel box round the corners of each visible mesh's own bounding box, null if none. */
const screenBox = (meshes: Mesh[]): [number, number, number, number] | null => {
  const ps = meshes.flatMap((m) => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const { min, max } = m.geometry.boundingBox!;
    m.updateWorldMatrix(true, false);
    return [min.x, max.x].flatMap((x) => [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => toScreen(new Vector3(x, y, z).applyMatrix4(m.matrixWorld).toArray()))));
  });
  return boxOf(ps);
};
const boxOf = (ps: [number, number][]): [number, number, number, number] | null =>
  ps.length ? [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))] : null;
const meshesIn = (o: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  o.traverseVisible((c) => c instanceof Mesh && out.push(c));
  return out;
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
  get trayFit() {
    return placement.fit;
  },
  get trayYaw() {
    return placedPose.yaw ?? 0;
  },
  get pills() {
    return panels.pills;
  },
  get tableNote() {
    return placement.fit === 'small' && world.renderer.xr.isPresenting ? SMALL_TABLE_TEXT : null;
  },
  get tableOutline() {
    return placement.table ? placement.table.map((p) => [...p] as [number, number]) : null;
  },
  get recenters() {
    return recenters;
  },
  get placeCue() {
    return { ...cue.state };
  },
  holdCue(progress: number | null) {
    cue.hold(progress);
  },
  get trayRestored() {
    return trayRestored;
  },
  get occluders() {
    return { left: occluders.left.root.visible ? tipOf(jointsNow.left) : null, right: occluders.right.root.visible ? tipOf(jointsNow.right) : null };
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
  get grabVia() {
    return grabVia;
  },
  get grabMode() {
    return grabMode;
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
  get goal() {
    const at = badge.at;
    const tgt = built.gears.get(level.target.gear);
    if (!at || !tgt) return null;
    const g = goal();
    return { ...g, text: faultText(fault) ?? goalText(g), ring: badge.ringColor, at: worldOf(at), gear: worldOf(tgt.position) };
  },
  get cue() {
    const now = performance.now();
    return {
      jammed: [...fault.jammed],
      wrongWay: fault.wrongWay,
      shaking: fault.jammed.length > 0 && now < shakeFrom + SHAKE_MS,
      shakes,
      tint: Object.fromEntries([...built.gears].map(([id, m]) => [id, reddened(m)])),
    };
  },
  get levelIndex() {
    return levelIndex;
  },
  get seedCode() {
    return codeOf(level);
  },
  get scores() {
    return structuredClone(scores);
  },
  get initials() {
    return overlay?.kind === 'initials' ? { board: overlay.board, rank: overlay.rank, letters: overlay.letters, cursor: overlay.cursor } : null;
  },
  get random() {
    return { mode: isRandomLevel(levelIndex), difficulty: randomDiff, slot: randomSlot() };
  },
  /** Test hook: starts campaign level `n` (1-based) at once, a fresh puzzle, as New Game and a solve do. */
  jump(n: number) {
    send({ type: 'play', level: Math.min(CAMPAIGN, Math.max(1, Math.round(n))) - 1 });
  },
  /** Test hook: the solution of the level on the board, gear to axle. */
  get solution() {
    return { ...level.solution };
  },
  get seedNote() {
    return seedNote && !seedNote.hidden ? seedNote.textContent : null;
  },
  get stage() {
    return stage;
  },
  get boardVisible() {
    return built.tray.visible;
  },
  get countdown() {
    return overlay?.kind === 'countdown' ? Math.max(0, countdownNumber(overlay.at, performance.now())) : null;
  },
  get aboutScroll() {
    return overlay?.kind === 'about' ? { scroll: overlay.scroll, max: aboutMax } : null;
  },
  get stageCards() {
    return panels.stageCards;
  },
  get kbdFocus() {
    return kbdButton();
  },
  /** The menu button drawn selected now (mouse, hand or keys), null when none. */
  get highlighted() {
    return highlight();
  },
  get musicTheme() {
    return sound.theme;
  },
  /** Live: the desktop camera (position, target, distance) and the tray's centre on screen in CSS px, for the orbit-limit tests. */
  get view() {
    const c = world.camera.position;
    return { camera: [c.x, c.y, c.z] as const, target: controls.target.toArray(), distance: c.distanceTo(controls.target), tray: toScreen(built.tray.getWorldPosition(new Vector3()).toArray()), benchY: BENCH_TOP_Y };
  },
  get ambient() {
    return ambient && { stage: ambientStage!, parts: ambient.group.children.length, beats: ambBeats, seconds: ambSeconds, bgMul: ambMul, visible: ambient.group.visible, pose: poseOf(ambient.group), anchor: toScreen(ambient.group.children[0]!.getWorldPosition(new Vector3()).toArray()) };
  },
  /** Test hook: shows or hides the ambient parts (to compare a frame with and without them). */
  setAmbientVisible(v: boolean) {
    if (ambient) ambient.group.visible = v;
  },
  get music() {
    return sound.layers;
  },
  get musicDucked() {
    return sound.ducked;
  },
  get progress() {
    return progressBox && !progressBox.hidden ? { text: progressBox.querySelector<HTMLElement>('.full')!.innerText, filled: progressBar!.querySelectorAll('i.on').length, bar: !(progressBar as HTMLElement).hidden } : null;
  },
  get hudLabel() {
    return levelIndex < CAMPAIGN ? `${stageOf(stage).name} · Level ${levelIndex + 1}` : `Level ${levelIndex + 1}`;
  },
  /** Test hook: the run in progress (or saved), null when none. */
  get run() {
    return run && { ...run };
  },
  get levelTime() {
    return levelClock.seconds;
  },
  get timer() {
    return { relaxed, par, ring: panels.ring, ringSpan: [RING.x - RING.r, RING.x + RING.r] as const, ...timerView(levelClock.seconds, par) };
  },
  get outcome() {
    return outcome;
  },
  /** Test hook: plays `s` seconds of level time at once, so the clock can run out without waiting. */
  advanceClock(s: number) {
    levelClock.advance(s);
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
  get audio() {
    return { state: sound.state(), ...sound.counts };
  },
  get soundOn() {
    return soundOn;
  },
  get musicOn() {
    return musicOn;
  },
  get options() {
    return overlay?.kind === 'options' ? { confirm: overlay.confirm, relaxed, sound: soundOn, music: musicOn } : null;
  },
  // info.autoReset (the default) zeroes the counters at the start of each render, so these are the last frame's.
  get render() {
    const { calls, triangles } = world.renderer.info.render;
    return { calls, triangles };
  },
  /** Every gear's centre and its width on screen in CSS pixels, for the test that samples how bright the brass renders. */
  get gearScreens() {
    return [...built.gears].map(([id, m]) => {
      m.updateWorldMatrix(true, false);
      const c = m.getWorldPosition(new Vector3());
      const [x, y] = toScreen(c.toArray());
      const r = (m.geometry.boundingSphere?.radius ?? 0.02) * 0.8;
      const [x2] = toScreen(c.clone().add(new Vector3(1, 0, 0).transformDirection(world.camera.matrixWorld).multiplyScalar(r)).toArray());
      return { id, x, y, r: Math.abs(x2 - x) };
    });
  },
  get metals() {
    const g = built.gears.values().next().value!.material as MeshStandardMaterial;
    return { metalness: g.metalness, roughness: g.roughness, roughnessMap: !!g.roughnessMap, normalMap: !!g.normalMap, environment: g.envMap !== null, intensity: g.envMapIntensity };
  },
  get trayWood() {
    const m = built.wood;
    return { quality, physical: !!(m as MeshPhysicalMaterial).isMeshPhysicalMaterial, map: !!m.map, normalMap: !!m.normalMap, roughnessMap: !!m.roughnessMap, anisotropy: m.map?.anisotropy ?? 0, normalScale: m.normalScale.x, clearcoat: (m as MeshPhysicalMaterial).clearcoat ?? 0, texture: (m.map?.image as { width?: number } | undefined)?.width ?? 0 };
  },
  get scenery() {
    return { ...scenery.state(), clearAlpha: world.renderer.getClearAlpha() };
  },
  get automatonRunning() {
    return regulator.calibrated;
  },
  get tickPhase() {
    return regulator.phase;
  },
  get regulatorAt() {
    return worldOf(new Vector3(...trayLocal(KNOB[0], KNOB[1], KNOB_TOP)));
  },
  buttons() {
    return shownButtons().map((b) => {
      const w = panelToWorld(anchor, [b.x, b.y, 0]);
      const corners = ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy]) => toScreen(panelToWorld(anchor, [b.x + (sx * b.w) / 2, b.y + (sy * b.h) / 2, 0])));
      return { id: b.id, label: b.label, world: w, screen: toScreen(w), rect: boxOf(corners)! };
    });
  },
  /** The black layer behind the menus: `full` over a flat view, `backing` panel behind the card in XR, absent in play. */
  get scrim() {
    const mode = scrim.visible ? ('full' as const) : panels.backing ? ('backing' as const) : null;
    return { mode, opacity: (scrim.material as MeshBasicMaterial).opacity, backingOpacity: SCRIM_OPACITY };
  },
  get card() {
    const c = panels.panelMesh.visible ? panels.current : null;
    return c && { screen: c.screen, width: c.layout.width, height: c.layout.height };
  },
  labels() {
    if (!panels.panelMesh.visible) return [];
    // A word's height on screen: its font size, measured upright on the card where it is drawn.
    return panels.labels.map((t) => {
      const [a, b] = [toScreen(panelToWorld(anchor, [t.x, t.y - t.size / 2, 0])), toScreen(panelToWorld(anchor, [t.x, t.y + t.size / 2, 0]))];
      const [l, r] = [toScreen(panelToWorld(anchor, [t.x0, t.y, 0])), toScreen(panelToWorld(anchor, [t.x1, t.y, 0]))];
      return { text: t.text, size: t.size, height: Math.hypot(a[0] - b[0], a[1] - b[1]), y: (a[1] + b[1]) / 2, left: Math.min(l[0], r[0]), right: Math.max(l[0], r[0]) };
    });
  },
  panelCorners,
  viewBoxes() {
    // The board and the ledge are the tray's own box meshes.
    const board = built.tray.children.filter((c): c is Mesh => c instanceof Mesh && c.geometry instanceof BoxGeometry);
    return { board: screenBox(board), dial: screenBox(meshesIn(escapement.root)), bird: screenBox(meshesIn(automaton.root)), card: boxOf(panelCorners()) };
  },
  ghostBox: () => screenBox(meshesIn(ghost.root)),
  dialFaceBox: () => screenBox([escapement.face]),
  get cameraAt() {
    return world.camera.position.toArray();
  },
  get cameraMoving() {
    return cameraTween !== null;
  },
  toScreen,
});
