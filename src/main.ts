import { Grabbed, GrabSystem, OneHandGrabbable, World, type Entity } from '@iwsdk/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { APP_TITLE, createWorldOptions } from './config';
import { DEFAULT_PLACEMENT, toHeadFrame, type Head } from './anchor';
import { startSession } from './enter';
import { BoxGeometry, Color, DoubleSide, Euler, Mesh, MeshBasicMaterial, Plane, Quaternion, Raycaster, RingGeometry, Vector2, Vector3, type MeshStandardMaterial, type Object3D } from 'three';
import { grabModeOf, holderHand, occupiedAt, pickGear, pinchOwner, snapAxle, type Hand } from './grab';
import { handNear, rayPick, validAxles, type HoverTarget } from './hover';
import { LEVELS, checkLevel, type Level } from './levels';
import { buildScene } from './scene';
import { createScenery } from './scenery';
import { trackMr } from './mr';
import { tuneForSoftwareGl } from './render';
import { TRAY_POSE, layerLift, partsStrip, trayLocal, worldToTray, type TrayPose, type Vec3 } from './seat';
import { TITLE, createClock, reloads, screenOf, step, type Flow, type FlowEvent } from './flow';
import { SCREENS, buttonAt, panelAnchor, panelToWorld, pokeHit, worldToPanel, type Anchor, type Button, type Screen } from './ui';
import { createPanels, RING, SMALL_TABLE_TEXT, type PanelCtx } from './panels';
import { createGhostHand, ghostAt, ghostTwistAt } from './ghost';
import { TWEEN_MS, easeOut, tweenAt } from './tween';
import { faultKind, faultOf, faultText, shakeSpin, shakeTilt, SHAKE_MS, type Fault } from './fault';
import { C } from './palette';
import type { GearSpin } from './train';
import { createRegulator, dragTwist, settingOf, startSetting, targetRate, twistOf, type Quat } from './escapement';
import { createSound, loadSoundOn, saveSoundOn, ticksBetween } from './sound';
import { DIAL_AT, KNOB_GRAB_M, KNOB_TOP, TWIST_CUE_AT, createAutomaton, createEscapement } from './clockwork';
import { firstUnsolved, loadProgress, recordOutcome, recordSolve, saveProgress, type Progress } from './progress';
import { loadRelaxed, outcomeOf, parFor, saveRelaxed, timerView, type Outcome } from './timer';
import { dailySeed, tinkerLevel, withDaily } from './tinker';
import { decodeSeed, encodeSeed } from './seed';
import { fetchGlobal, submitGlobal } from './global';
import { BOARDS, addEntry, backInitial, boardOf, loadScores, qualifies, saveScores, stepInitial, todayISO, typeInitial, type Entry, type Scores } from './scores';
import { START, adapt, freshSeed, loadRandom, puzzleFor, randomLevel, saveRandom, type RandomState } from './random';
import { HAND_JOINTS, createHandOccluder } from './occlude';
import { createPlaceCue, cueFor } from './cue';
import { goalOf, goalText } from './goal';
import { createGoalBadge } from './badge';
import { DESKTOP_EYE, DESKTOP_TARGET, desktopDistance, faceView, isPhone, phoneCard, phoneReserve, phoneShift, viewContent } from './fit';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');

document.title = `${APP_TITLE} MR`;
const heading = document.getElementById('title');
if (heading) heading.textContent = APP_TITLE;

const enterButton = document.getElementById('enter-mr') as HTMLButtonElement | null;
const enterNote = document.getElementById('enter-note');
if (!enterButton || !enterNote) throw new Error('Enter MR controls missing');

const world = await World.create(container, createWorldOptions());

// ?seed=CODE: a shared tinker puzzle. It takes the daily's slot (the last level) and is the board the title opens on;
// its best time is saved under its own id (t<seed>), so the daily's and l1-l5's saved times are never touched.
const seedParam = new URLSearchParams(location.search).get('seed');
const sharedSeed = seedParam === null ? null : decodeSeed(seedParam);
const seedNote = document.getElementById('seed-note');
if (seedParam !== null && sharedSeed === null && seedNote) {
  seedNote.textContent = 'That puzzle code didn’t work. Pick any level to play.';
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
// Random mode (src/random.ts): the run's step is saved; the puzzle in the last slot is re-rolled for each new one.
// Its solves are never saved as level progress: the run's one key is all it keeps.
let run: RandomState = loadRandom(storage);
/** The step of the Random puzzle in the last slot, and whether its first solve has already moved the run on. */
let randomStep = run.step;
let randomScored = false;
const rollRandom = (): Level => {
  randomStep = run.step;
  randomScored = false;
  return randomLevel(randomStep, freshSeed(randomStep));
};
// The hand-made levels, then today's daily tinker puzzle (or the shared one), then the Random puzzle.
let levels: readonly Level[] = [...LEVELS, sharedSeed === null ? tinkerLevel(dailySeed(new Date())) : puzzleFor(sharedSeed, tinkerLevel), rollRandom()];
let levelIds = levels.map((l) => l.id);
/** The slot of the Random puzzle: always the last one. */
const randomSlot = () => levels.length - 1;
let progress: Progress = loadProgress(storage);
// High score boards (src/scores.ts): a top ten per hand-made level and one for Random, kept on this device.
let scores: Scores = loadScores(storage);
/**
 * A card laid over the flow's own: the high scores board or the options (opened from the start panel), or the initials entry
 * that comes before the complete card when a solve makes its board's top ten. `board` is the board id (l1-l8, random);
 * `confirm`: Reset progress is waiting for its yes.
 */
type Overlay =
  | { kind: 'board'; board: string; tab: 'local' | 'global' }
  | { kind: 'options'; confirm: boolean }
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
let lastBoard = BOARDS[0]!;
/** True on the complete card when this solve beat a saved time. */
let newBest = false;
/** Relaxed: no timer. Default off (timer on), saved across visits. */
let relaxed = loadRelaxed(storage);
/** The time limit of the level on the board, and whether the solve on the complete card beat it (null while playing, and in Relaxed). */
let par = 0;
let outcome: Outcome | null = null;
/** The title board is the level Continue plays: the first one not yet solved. */
const continueAt = () => firstUnsolved(progress, levelIds.slice(0, -1));
const resume = () => levelIds.slice(0, -1).some((id) => Object.hasOwn(progress.best, id));

let levelIndex = sharedSeed === null ? continueAt() : randomSlot() - 1;
let level: Level = levels[levelIndex]!;
par = parFor(level);
tuneForSoftwareGl(world.renderer);
const built = buildScene(level, world.scene, world.renderer);
// The workshop behind the tray on desktop and phone; in immersive-ar only a few props on the real table (src/scenery.ts).
const scenery = createScenery(world.scene);
world.renderer.xr.addEventListener('sessionstart', () => scenery.set(true));
world.renderer.xr.addEventListener('sessionend', () => scenery.set(false));

// Desktop preview: from above, behind and a little right of the seated head, so the board reads in depth (bevel,
// gear thickness, the bird standing up) and the panel above it stays in frame. A narrow window backs it off (fitView).
world.camera.position.set(...DESKTOP_EYE);
const controls = new OrbitControls(world.camera, world.renderer.domElement);
controls.target.set(...DESKTOP_TARGET);
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

const panels = createPanels();
world.scene.add(panels.root);
let anchor: Anchor = panelAnchor(level);
/** The camera's backward axis (from what it looks at towards the eye). */
const cameraBack = (): Vec3 => world.camera.getWorldDirection(new Vector3()).negate().toArray();
const PLAY_SCREENS = SCREENS.filter((s) => s !== 'select');
/**
 * The cards the camera fits for: the wide level select alone, or the others (so it holds still between them). A card laid over
 * the flow's own is fitted for on the desktop; on a phone the board keeps the view it has, and the sheet sits over its foot.
 */
const fitScreens = (): readonly Screen[] => (overlay && !phone() ? [overlay.kind] : flow.name === 'select' ? ['select'] : PLAY_SCREENS);
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
/**
 * In XR the card tilts to face the head; on desktop it lies face on to the preview camera, so it reads square. On a phone
 * it is a bottom sheet held in front of the camera, a phone width wide, whatever the orbit or zoom.
 */
const placePanels = () => {
  const a = panelAnchor(level, currentPose());
  if (phone()) {
    const eye = world.camera.getWorldPosition(new Vector3()).toArray();
    anchor = phoneCard({ eye, back: cameraBack(), fovDeg: world.camera.fov, width: window.innerWidth, height: window.innerHeight, shift: raiseView() });
  } else {
    if (world.camera.view?.enabled) world.camera.clearViewOffset();
    anchor = world.renderer.xr.isPresenting ? a : faceView(a, cameraBack());
  }
  panels.setAnchor(anchor);
};
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
  if (keepZoom && to.distanceTo(world.camera.position) > 1e-6) cameraTween = { from: world.camera.position.toArray(), to: to.toArray(), start: performance.now() };
  else if (!keepZoom) {
    world.camera.position.copy(to);
    controls.update();
  }
}
fitView();
window.addEventListener('resize', () => fitView());

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
/** The short code of a tinker level (ids t<seed>); null for a hand-made one. */
const codeOf = (l: Level): string | null => (/^t\d+$/.test(l.id) ? encodeSeed(Number(l.id.slice(1))) : null);
/** Copy link on the complete card: idle, copied (back to idle after a moment), or failed (the card shows the link). */
let copy: { state: 'idle' | 'copied' | 'failed'; link: string | null } = { state: 'idle', link: null };
const COPIED_MS = 2500;
async function copyLink(): Promise<void> {
  const code = codeOf(level);
  if (!code || world.renderer.xr.isPresenting) return;
  const link = `${location.origin}${location.pathname}?seed=${code}`;
  const id = level.id;
  try {
    await navigator.clipboard.writeText(link);
    copy = { state: 'copied', link };
    setTimeout(() => {
      if (copy.state === 'copied' && level.id === id) copy = { state: 'idle', link: null };
    }, COPIED_MS);
  } catch {
    copy = { state: 'failed', link };
  }
}

function loadLevel(i: number): void {
  levelIndex = i;
  level = levels[i]!;
  newBest = false;
  par = parFor(level);
  outcome = null;
  copy = { state: 'idle', link: null };
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

/** On the title or level select, swaps in today's daily if the date has rolled over since it was picked (a session left open past midnight). */
function rolloverDaily(): void {
  if (sharedSeed !== null || (flow.name !== 'title' && flow.name !== 'select')) return;
  const base = levels.slice(0, -1);
  const fresh = withDaily(base, new Date());
  if (fresh === base) return;
  levels = [...fresh, levels[randomSlot()]!];
  levelIds = levels.map((l) => l.id);
  if (flow.name === 'title') {
    loadLevel(continueAt());
    flow = { ...flow, level: levelIndex };
  }
}

/** A new Random puzzle at the run's step, played at once. */
function playRandom(): void {
  levels = [...levels.slice(0, -1), rollRandom()];
  levelIds = levels.map((l) => l.id);
  send({ type: 'select', level: randomSlot() });
}

/** If this solve makes its board's top ten, the initials card comes up before the complete card. */
function askInitials(board: string, extra: { step?: number }): void {
  const entry = { ms: Math.round(levelClock.seconds * 1000), date: todayISO(), ...extra };
  const q = qualifies(scores, board, { ...entry, name: scores.initials });
  if (q.ok) overlay = { kind: 'initials', board, rank: q.rank, entry, letters: scores.initials, cursor: 0 };
}

/** The best times card's board: its name, its rows and what it says while empty. */
function boardCard(id: string, tab: 'local' | 'global'): NonNullable<PanelCtx['board']> {
  const n = id.slice(1);
  const random = id === 'random';
  const label = random ? 'Random' : `Level ${n}`;
  const local = { label, tab, entries: scores.boards[id]!, empty: `No times yet. Solve ${random ? 'a Random puzzle' : `level ${n}`} to set one.` };
  if (tab === 'local') return local;
  // Global: the last good rows; with none, "Loading" while asking and the local rows with a quiet note once it failed.
  const rows = globalRows.get(id);
  if (rows) return { ...local, entries: rows, empty: 'No global times yet. Be the first.' };
  if (globalAsk.get(id) === 'offline') return { ...local, note: 'Global scores offline · your times' };
  return { ...local, entries: [], empty: 'Loading global scores' };
}

/**
 * Options > Reset progress, once confirmed: forgets every solved level (best times on the tiles, passes, Continue) and the
 * Random run's step, and puts level 1 back on the board. The high scores boards are a separate store and stay.
 */
function resetProgress(): void {
  progress = { best: {} };
  saveProgress(storage, progress);
  run = START;
  saveRandom(storage, run);
  levels = [...levels.slice(0, -1), rollRandom()];
  levelIds = levels.map((l) => l.id);
  loadLevel(sharedSeed === null ? continueAt() : randomSlot() - 1);
  flow = { ...flow, level: levelIndex };
}

/** A press on the card laid over the flow: the board's Back and level arrows, or the initials' arrows, Save and Skip. */
function pressOverlay(id: string): void {
  const o = overlay!;
  if (o.kind === 'options') {
    if (id === 'back') overlay = null;
    else if (id === 'relaxed') {
      relaxed = !relaxed;
      saveRelaxed(storage, relaxed);
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
  } else if (o.kind === 'board') {
    if (id === 'back') overlay = null;
    else if (id === 'board-prev' || id === 'board-next') overlay = { ...o, board: BOARDS[(BOARDS.indexOf(o.board) + (id === 'board-next' ? 1 : BOARDS.length - 1)) % BOARDS.length]! };
    else if (id === 'tab-local' || id === 'tab-global') overlay = { ...o, tab: id === 'tab-global' ? 'global' : 'local' };
    else return;
    const now = overlay as Overlay | null;
    if (now?.kind === 'board' && now.tab === 'global') loadGlobal(now.board);
  } else {
    const arrow = /^(up|down)-([0-2])$/.exec(id);
    if (arrow) overlay = { ...o, ...stepInitial(o, Number(arrow[2]), arrow[1] === 'up' ? 1 : -1) };
    else if (id === 'save') {
      scores = addEntry(scores, o.board, { ...o.entry, name: o.letters });
      saveScores(storage, scores);
      void submitGlobal(o.board, scores.initials, o.entry.ms, o.entry.step); // fire and forget: the card never waits on it
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
  // A card laid over the flow goes when the flow leaves its place: the board with the title, the initials with the complete card.
  if (overlay && next.name !== (overlay.kind === 'initials' ? 'complete' : 'title')) overlay = null;
  if (next.name === 'playing') lastBoard = next.level === randomSlot() ? 'random' : (boardOf(levels[next.level]!.id) ?? lastBoard);
  if (next.name === 'paused') {
    putBack();
    letGoKnob();
    sound.suspend();
  } else if (flow.name === 'paused') sound.resume();
  if (reloads(flow, e, next)) loadLevel(next.level);
  const entering = next.name !== flow.name && flow.name !== 'paused';
  flow = next;
  rolloverDaily();
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
    if (levelIndex === randomSlot()) {
      // Random: the first solve of a puzzle moves the run on (a Retry after going over does not count twice); nothing goes into level progress.
      newBest = false;
      if (!randomScored) {
        randomScored = true;
        run = adapt(run, relaxed ? null : levelClock.seconds, par);
        saveRandom(storage, run);
        askInitials('random', { step: randomStep });
      }
    } else {
      // A first solve is just solved; New best is for beating a time already saved.
      const had = Object.hasOwn(progress.best, level.id);
      const r = recordSolve(progress, level.id, levelClock.seconds);
      progress = r.progress;
      newBest = had && r.newBest;
      // Held to par unless Relaxed: past it the bird still wakes, but the card says over time. The best time is kept either way.
      if (outcome) progress = recordOutcome(progress, level.id, outcome);
      if (r.newBest || outcome) saveProgress(storage, progress);
      const board = boardOf(level.id);
      if (board) askInitials(board, {});
    }
    burst.position.set(...trayLocal(DIAL_AT[0], DIAL_AT[1], 0.008));
  }
  showPanel();
  fitView(true); // a new level or card may want the camera nearer or further
}

const PRESS: Record<string, FlowEvent> = {
  start: { type: 'select' }, // Start game / Continue opens level select
  levels: { type: 'select' },
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
  rolloverDaily();
  const now = performance.now();
  if (by === 'hand' && now - pressedAt < PRESS_GAP_MS) return;
  pressedAt = now;
  if (overlay) return pressOverlay(id);
  if ((id === 'scores' || id === 'options') && flow.name === 'title') {
    globalAsk.clear();
    overlay = id === 'scores' ? { kind: 'board', board: lastBoard, tab: 'local' } : { kind: 'options', confirm: false };
    showPanel();
    return fitView(true);
  }
  const n = /^level-(\d+)$/.exec(id);
  if (id === 'next' && flow.name === 'complete' && levelIndex >= randomSlot() - 1) {
    // After the daily or a shared puzzle the way on is level select; after a Random puzzle it is the next one.
    if (levelIndex === randomSlot()) playRandom();
    else send({ type: 'select' });
  } else if (n && Number(n[1]) - 1 === randomSlot()) playRandom();
  else if (id === 'copy') void copyLink();
  else if (id === 'relaxed') {
    relaxed = !relaxed;
    saveRelaxed(storage, relaxed);
  }
  else if (n) send({ type: 'select', level: Number(n[1]) - 1 });
  else if (id === 'back') send({ type: 'back', level: continueAt() });
  else send(PRESS[id]!);
}
/** Board parts move only on the title (touching a gear starts the level) and while playing. */
const live = () => flow.name === 'title' || flow.name === 'playing';
/** The complete card waits while the automaton and the running train play the reward. */
const COMPLETE_DELAY_MS = 2000;
const shownButtons = (): Button[] => (panels.panelMesh.visible ? [...(panels.current?.layout.buttons ?? []), ...(panels.current?.layout.tabs ?? [])] : []);

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
  if (overlay?.kind === 'initials' && !(e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'Backspace' || /^[a-z]$/i.test(e.key))) {
    e.preventDefault();
    overlay = { ...overlay, ...(e.key === 'Backspace' ? backInitial(overlay) : typeInitial(overlay, e.key)) };
    return;
  }
  const shown = shownButtons();
  const id = e.key === 'Enter' ? shown.find((b) => b.kind === 'primary')?.id : e.key === 'Escape' ? ['pause', 'resume', 'back', 'skip'].find((k) => shown.some((b) => b.id === k)) : undefined;
  if (!id) return;
  e.preventDefault();
  sound.unlock();
  press(id, 'key');
});
canvas.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
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
// The note's "Drag to look around the tray." has done its job at the first drag (orbit, gear or knob): it fades for good.
const lookNote = enterNote.querySelector('.cg-more');
canvas.addEventListener('pointermove', (e) => e.buttons && lookNote?.classList.add('gone'));

// Pause whenever the player is pulled away: tab hidden, headset menu or headset off, session over.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') send({ type: 'pause' });
  else {
    rolloverDaily();
    fitView(true);
  }
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
  for (const [id, t] of tweens) {
    const { pos, done } = tweenAt(t.from, t.to, now - t.start);
    built.loose.get(id)?.position.set(...pos);
    if (done) tweens.delete(id);
  }
  built.updateShadows();
  cue.update(now);
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
  for (let i = 0; i < Math.min(owed, 2); i++) sound.tick();
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

  showPanel(now);
};

/** Draws the card for the current state; run every frame and after every transition, so the buttons on show never lag the flow. */
function showPanel(now = performance.now()): void {
  const waiting = flow.name === 'complete' && now - calibratedAt < COMPLETE_DELAY_MS;
  panels.show(waiting ? null : (overlay?.kind ?? screenOf(flow)), {
    initials: overlay?.kind === 'initials' ? { rank: overlay.rank, letters: overlay.letters, cursor: overlay.cursor } : undefined,
    board: overlay?.kind === 'board' ? boardCard(overlay.board, overlay.tab) : undefined,
    level: levelIndex,
    levels: levels.length,
    daily: sharedSeed === null, // a shared puzzle in the last slot is not today's daily: it is named "Shared puzzle"
    shared: sharedSeed !== null,
    random: true,
    step: randomStep,
    next: run.step,
    code: codeOf(level),
    link: copy.state === 'failed' ? copy.link : null,
    copy: world.renderer.xr.isPresenting || !codeOf(level) ? undefined : copy.state === 'copied' ? 'Copied' : 'Copy link',
    resume: resume(),
    newBest,
    time: levelClock.seconds,
    relaxed,
    sound: soundOn,
    confirm: overlay?.kind === 'options' && overlay.confirm,
    xr: world.renderer.xr.isPresenting,
    timer: relaxed || screenOf(flow) !== 'hud' ? null : { par, ...timerView(levelClock.seconds, par) }, // only the HUD carries it, so no other card redraws as it counts
    outcome,
    par: outcome ? par : null,
    best: levelIds.map((id) => progress.best[id] ?? null),
    hover: mouseButton ?? tipButton.left ?? tipButton.right,
    goal: badge.root.visible ? goal() : null,
    fault: faultKind(fault),
    narrow: phone(),
  });
}

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
    return { mode: levelIndex === randomSlot(), step: randomStep, next: run.step, slow: run.slow, slot: randomSlot() };
  },
  get seedNote() {
    return seedNote && !seedNote.hidden ? seedNote.textContent : null;
  },
  get copy() {
    return { ...copy };
  },
  get levelTime() {
    return levelClock.seconds;
  },
  get progress() {
    return { best: { ...progress.best } };
  },
  get newBest() {
    return newBest;
  },
  get timer() {
    return { relaxed, par, ring: panels.ring, ringSpan: [RING.x - RING.r, RING.x + RING.r] as const, ...timerView(levelClock.seconds, par) };
  },
  get outcome() {
    return outcome;
  },
  get outcomes() {
    return { ...progress.outcome };
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
  get options() {
    return overlay?.kind === 'options' ? { confirm: overlay.confirm, relaxed, sound: soundOn } : null;
  },
  // info.autoReset (the default) zeroes the counters at the start of each render, so these are the last frame's.
  get render() {
    const { calls, triangles } = world.renderer.info.render;
    return { calls, triangles };
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
