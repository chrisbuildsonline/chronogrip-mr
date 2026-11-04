import type { Level } from './levels';
import { COMFORT, TRAY_POSE, layerLift, ledgeFar, partsStrip, trayToWorld, type TrayPose, type Vec3 } from './seat';

/** Layouts and placement of the in-world panels (see design/DESIGN.md). Panel space: metres, origin at the bottom centre, +Y up, +Z towards the player. */
export type Screen = 'title' | 'select' | 'hud' | 'complete' | 'paused';
export const SCREENS: readonly Screen[] = ['title', 'select', 'hud', 'complete', 'paused'];

export type ButtonKind = 'primary' | 'secondary' | 'tile' | 'icon' | 'toggle';
/** A button rectangle in panel space; x, y is its centre. */
export type Button = { id: string; label: string; kind: ButtonKind; x: number; y: number; w: number; h: number };
export type Layout = { width: number; height: number; buttons: Button[] };

/** Smallest side of any button: a fingertip target. */
export const BUTTON_MIN_M = 0.04;
/** A fingertip this close to a button's face touches it, metres. */
export const TOUCH_M = 0.015;
/** Menu buttons sit just above the board, so they may be a little higher than the board's own touch cone. */
export const PANEL_ZONE = { ...COMFORT, maxPitch: 18 } as const;

const PAD = 0.016;
const GAP = 0.012;
const BH = 0.046;

/** Buttons side by side, centred on the panel, on one row at height y. */
function row(y: number, items: [id: string, label: string, kind: ButtonKind, w: number][]): Button[] {
  let x = -(items.reduce((s, i) => s + i[3], 0) + GAP * (items.length - 1)) / 2;
  return items.map(([id, label, kind, w]) => {
    const b = { id, label, kind, x: x + w / 2, y, w, h: BH };
    x += w + GAP;
    return b;
  });
}

/**
 * `random`: the last level is the endless Random puzzle, after the daily or shared one, with its own tile; `daily`: the last base level is today's tinker puzzle; `shared`: it is a puzzle opened from a ?seed= link. `resume`: a level is solved, so the title offers Continue.
 * `over`: the level was solved past its par time, so the complete card leads with Retry. `copy`: the label of the Copy link pill on the complete card (absent: no pill). `narrow`: a phone in portrait outside XR; every card is NARROW_W wide and drawn as a bottom sheet (src/fit.ts).
 */
export type LayoutCtx = { level: number; levels: number; daily?: boolean; shared?: boolean; random?: boolean; resume?: boolean; narrow?: boolean; copy?: string; over?: boolean };

/** Width of every card on a phone in portrait (outside XR), metres of panel space. */
export const NARROW_W = 0.3;
/** Phone level select: five targets to a row (Back, then the tiles), 44 x 60 mm, two rows for nine levels. */
const NARROW_COLS = 5;
const NARROW_TILE_H = 0.06;
/** Room over the tiles for the "Levels" heading and the solved count. */
const NARROW_HEAD = 0.052;

const TILE_W = 0.05;
/** With the Random tile there are ten, so the level tiles narrow a little and Random, the longest word, gets a wider one: the row is no wider than before, so the outer tile stays inside the yaw cone. */
const TILE_W_RANDOM = 0.042;
const RANDOM_W = 0.07; // wide enough for "Random" to be drawn at least as large as "Daily", with the run's step under it
const TILE_H = 0.07;
const BACK_W = 0.076;
/** Back is navigation, not a level: a little more room sets it apart from the tiles. */
const BACK_GAP = 0.02;
/** The Relaxed toggle on the phone's pause card. */
const TOGGLE_W = 0.082;
/** Wide enough for "Turn the marked gear ↻ 37.5 rpm" in body type, and for the countdown ring and its time between the clock and the pause button. */
const HUD_W = 0.3;

export function layout(screen: Screen, ctx: LayoutCtx): Layout {
  const low = PAD + BH / 2;
  const narrow = !!ctx.narrow;
  // Phone: the same buttons in one phone width (content 268 mm): primary 100 mm, secondaries 72 mm.
  const [primaryW, secondaryW] = narrow ? [0.1, 0.072] : [0.11, 0.088];
  switch (screen) {
    case 'title':
      return {
        width: narrow ? NARROW_W : 0.34,
        height: 0.15,
        buttons: row(low, [
          ['start', ctx.resume ? 'Continue' : 'Start', 'primary', narrow ? 0.08 : 0.106],
          ['levels', 'Levels', 'secondary', narrow ? 0.07 : 0.09],
          ['relaxed', 'No timer', 'toggle', narrow ? 0.098 : 0.088],
        ]),
      };
    case 'select': {
      const n = ctx.levels;
      const rnd = !!ctx.random;
      const base = rnd ? n - 1 : n; // the numbered levels and the daily or shared one; Random comes after them
      const label = (i: number) => (rnd && i === n - 1 ? 'Random' : i === base - 1 && (ctx.shared ? 'Shared' : ctx.daily && 'Daily')) || String(i + 1);
      if (narrow) {
        // Phone: Back then the tiles, five to a row, so nine levels make two rows that fit the width. Back takes the top
        // left cell, where a phone keeps its back control; the tiles read left to right, then the lower row.
        const w = (NARROW_W - 2 * PAD - (NARROW_COLS - 1) * GAP) / NARROW_COLS;
        // Random is a bar across the width on a row of its own under the grid.
        const rows = Math.ceil((base + 1) / NARROW_COLS);
        const bar = rnd ? BH + GAP : 0;
        const cell = (k: number) => ({
          x: -NARROW_W / 2 + PAD + (k % NARROW_COLS) * (w + GAP) + w / 2,
          y: PAD + bar + (rows - 1 - Math.floor(k / NARROW_COLS)) * (NARROW_TILE_H + GAP) + NARROW_TILE_H / 2,
          w,
          h: NARROW_TILE_H,
        });
        const back: Button = { id: 'back', label: 'Back', kind: 'secondary', ...cell(0) };
        const tiles = Array.from({ length: base }, (_, i): Button => ({ id: `level-${i + 1}`, label: label(i), kind: 'tile', ...cell(i + 1) }));
        if (rnd) tiles.push({ id: `level-${n}`, label: 'Random', kind: 'tile', x: 0, y: PAD + BH / 2, w: NARROW_W - 2 * PAD, h: BH });
        return { width: NARROW_W, height: PAD + bar + rows * NARROW_TILE_H + (rows - 1) * GAP + NARROW_HEAD, buttons: [back, ...tiles] };
      }
      // One row, low on the card so every target stays in reach: the Back pill, a wider gap, then one tile per level.
      const widthOf = (i: number) => (rnd ? (i === n - 1 ? RANDOM_W : TILE_W_RANDOM) : TILE_W);
      const width = 2 * PAD + BACK_W + BACK_GAP + (n - 1) * GAP + Array.from({ length: n }, (_, i) => widthOf(i)).reduce((a, b) => a + b, 0);
      const y = PAD + TILE_H / 2;
      const left = -width / 2 + PAD;
      const back: Button = { id: 'back', label: 'Back', kind: 'secondary', x: left + BACK_W / 2, y, w: BACK_W, h: BH };
      let x = left + BACK_W + BACK_GAP;
      const tiles = Array.from({ length: n }, (_, i): Button => {
        const w = widthOf(i);
        const b: Button = { id: `level-${i + 1}`, label: label(i), kind: 'tile', x: x + w / 2, y, w, h: TILE_H };
        x += w + GAP;
        return b;
      });
      return { width, height: 0.15, buttons: [back, ...tiles] };
    }
    case 'hud': {
      // The goal line runs across the top; under it the level, a time with tenths (0:04.7) and the pause button. The
      // button stays on the bottom row, so it is no higher in view than before.
      const width = narrow ? NARROW_W : HUD_W;
      return { width, height: 0.096, buttons: [{ id: 'pause', label: 'Pause', kind: 'icon', x: width / 2 - 0.008 - BH / 2, y: 0.031, w: BH, h: BH }] };
    }
    case 'complete': {
      // After the last level the primary already goes to level select, so there is no second Levels button.
      // Random is not "the next level" after the daily: the daily is still the last of the levels.
      const endless = !!ctx.random && ctx.level === ctx.levels - 1;
      const last = endless || ctx.level + 1 >= (ctx.random ? ctx.levels - 1 : ctx.levels);
      // Random keeps going: its primary is the next puzzle, not a way back to level select.
      const nextLabel = endless ? 'Next puzzle' : last ? 'Levels' : 'Next';
      // Over par: Retry leads, and Next stays a plain secondary so a slow solve never blocks the way on.
      const items: Parameters<typeof row>[1] = ctx.over
        ? [['restart', 'Retry', 'primary', primaryW], ['next', nextLabel, 'secondary', secondaryW]]
        : [['next', nextLabel, 'primary', primaryW], ['restart', 'Restart', 'secondary', secondaryW]];
      if (!last) items.push(['levels', 'Levels', 'secondary', secondaryW]);
      if (ctx.copy && last) {
        // The tinker puzzle is always the last level; only it has room for a third pill. On a phone "Copy link" needs a little more than 72 mm, so the primary gives it 8.
        items[0]![3] = narrow ? 0.092 : primaryW;
        items.push(['copy', ctx.copy, 'secondary', narrow ? 0.082 : secondaryW]);
        // "Next puzzle" is the longest label: on a phone it gets 104 mm and Restart/Retry and Copy link share the rest (the row may use a little of the card's padding).
        if (narrow && endless) for (const it of items) it[3] = it[0] === 'next' ? 0.104 : it[0] === 'restart' ? 0.062 : 0.08;
      }
      return { width: narrow ? NARROW_W : 0.35, height: 0.17, buttons: row(low, items) };
    }
    case 'paused': {
      // Wide: the Relaxed toggle is a fourth pill on the one row, which keeps every target in the panel zone (a card this wide is still well inside the yaw cone).
      if (!narrow) {
        return {
          width: 0.42,
          height: 0.15,
          buttons: row(low, [['resume', 'Resume', 'primary', 0.1], ['restart', 'Restart', 'secondary', 0.084], ['levels', 'Levels', 'secondary', 0.084], ['relaxed', 'No timer', 'toggle', 0.09]]),
        };
      }
      // Phone: the row is full, and the zone does not apply outside XR, so the toggle rides the top right beside the "Paused" words.
      const toggle: Button = { id: 'relaxed', label: 'No timer', kind: 'toggle', x: NARROW_W / 2 - 0.008 - TOGGLE_W / 2, y: 0.104, w: TOGGLE_W, h: BH };
      return {
        width: NARROW_W,
        height: 0.15,
        buttons: [...row(low, [['resume', 'Resume', 'primary', primaryW], ['restart', 'Restart', 'secondary', secondaryW], ['levels', 'Levels', 'secondary', secondaryW]]), toggle],
      };
    }
  }
}

/** The button under a panel-space point that is within touch depth of the face, else null. */
export function buttonAt(p: Vec3, buttons: readonly Button[], depth = TOUCH_M): string | null {
  if (Math.abs(p[2]) > depth) return null;
  return buttons.find((b) => Math.abs(p[0] - b.x) <= b.w / 2 && Math.abs(p[1] - b.y) <= b.h / 2)?.id ?? null;
}

/** A poke: the tip touches a button now and was in front of the panel (beyond touch depth) last frame. */
export const pokeHit = (lastZ: number | null, p: Vec3, buttons: readonly Button[]) =>
  lastZ !== null && lastZ > TOUCH_M ? buttonAt(p, buttons) : null;

/**
 * Panel anchor: the bottom centre of every panel, tilted to face the head. `scale` (default 1) sizes panel space in the
 * world: the phone card is a small card near the camera (src/fit.ts phoneCard); XR and desktop cards are full size.
 */
export type Anchor = { position: Vec3; pitch: number; yaw: number; scale?: number };

/** Distance from the head to the panel's bottom edge, metres. */
const PANEL_DISTANCE = 0.46;
/** Clear sky between the board's top in view and the panel's bottom edge, degrees. */
const CLEAR_DEG = 1.5;

/**
 * The panel sits just above the board's highest line of sight (its far ledge or the parts on it), so it never hides a part.
 * Worked out for the default tray pose with the head at the origin, then carried along with the actual tray.
 */
export function panelAnchor(level: Level, pose: TrayPose = TRAY_POSE): Anchor {
  const tops = [trayToWorld(0, ledgeFar(level)), ...partsStrip(level).map((s) => trayToWorld(0, s.y + s.radius, layerLift(0) + 0.01))];
  const top = Math.max(...tops.map(([, y, z]) => Math.atan2(y, -z)));
  const pitch = top + (CLEAR_DEG * Math.PI) / 180;
  const off = [0, PANEL_DISTANCE * Math.sin(pitch) - TRAY_POSE.position[1], -PANEL_DISTANCE * Math.cos(pitch) - TRAY_POSE.position[2]] as const;
  const yaw = pose.yaw ?? 0;
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  const [px, py, pz] = pose.position;
  return { position: [px + off[0] * c + off[2] * s, py + off[1], pz - off[0] * s + off[2] * c], pitch, yaw };
}

export function panelToWorld(a: Anchor, p: Vec3): Vec3 {
  const k = a.scale ?? 1;
  const [x, y, z] = [p[0] * k, p[1] * k, p[2] * k];
  const [cp, sp, cy, sy] = [Math.cos(a.pitch), Math.sin(a.pitch), Math.cos(a.yaw), Math.sin(a.yaw)];
  const [ty, tz] = [y * cp - z * sp, y * sp + z * cp];
  return [a.position[0] + x * cy + tz * sy, a.position[1] + ty, a.position[2] - x * sy + tz * cy];
}

export function worldToPanel(a: Anchor, p: Vec3): Vec3 {
  const k = a.scale ?? 1;
  const [cp, sp, cy, sy] = [Math.cos(a.pitch), Math.sin(a.pitch), Math.cos(a.yaw), Math.sin(a.yaw)];
  const [dx, dy, dz] = [p[0] - a.position[0], p[1] - a.position[1], p[2] - a.position[2]];
  const [x, tz] = [dx * cy - dz * sy, dx * sy + dz * cy];
  return [x / k, (dy * cp + tz * sp) / k, (-dy * sp + tz * cp) / k];
}

/** Seconds as m:ss, with tenths under 10 s (0:04.7) so a quick solve never reads 0:00. Truncated, never rounded up. */
export const clock = (s: number) =>
  s < 10 ? `0:0${(Math.floor(s * 10 + 1e-6) / 10).toFixed(1)}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
