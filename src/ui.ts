import type { Level } from './levels';
import { COMFORT, TRAY_POSE, layerLift, ledgeFar, partsStrip, trayToWorld, type TrayPose, type Vec3 } from './seat';

/** Layouts and placement of the in-world panels (see design/DESIGN.md). Panel space: metres, origin at the bottom centre, +Y up, +Z towards the player. */
export type Screen = 'title' | 'select' | 'hud' | 'complete' | 'paused';
export const SCREENS: readonly Screen[] = ['title', 'select', 'hud', 'complete', 'paused'];

export type ButtonKind = 'primary' | 'secondary' | 'tile' | 'icon';
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

/** `daily`: the last level is today's tinker puzzle. `resume`: a level is solved, so the title offers Continue. */
export type LayoutCtx = { level: number; levels: number; daily?: boolean; resume?: boolean };

const TILE_W = 0.05;
const TILE_H = 0.07;
const BACK_W = 0.076;
/** Back is navigation, not a level: a little more room sets it apart from the tiles. */
const BACK_GAP = 0.02;

export function layout(screen: Screen, ctx: LayoutCtx): Layout {
  const low = PAD + BH / 2;
  switch (screen) {
    case 'title':
      return { width: 0.34, height: 0.15, buttons: row(low, [['start', ctx.resume ? 'Continue' : 'Start', 'primary', 0.13], ['levels', 'Levels', 'secondary', 0.1]]) };
    case 'select': {
      // One row, low on the card so every target stays in reach: the Back pill, a wider gap, then one tile per level.
      const n = ctx.levels;
      const width = 2 * PAD + BACK_W + BACK_GAP + n * TILE_W + (n - 1) * GAP;
      const y = PAD + TILE_H / 2;
      const label = (i: number) => (ctx.daily && i === n - 1 ? 'Daily' : String(i + 1));
      const left = -width / 2 + PAD;
      const back: Button = { id: 'back', label: 'Back', kind: 'secondary', x: left + BACK_W / 2, y, w: BACK_W, h: BH };
      const tiles = Array.from({ length: n }, (_, i): Button => ({
        id: `level-${i + 1}`, label: label(i), kind: 'tile', x: left + BACK_W + BACK_GAP + i * (TILE_W + GAP) + TILE_W / 2, y, w: TILE_W, h: TILE_H,
      }));
      return { width, height: 0.15, buttons: [back, ...tiles] };
    }
    case 'hud':
      return { width: 0.2, height: 0.062, buttons: [{ id: 'pause', label: 'Pause', kind: 'icon', x: 0.1 - 0.008 - BH / 2, y: 0.031, w: BH, h: BH }] };
    case 'complete': {
      // After the last level the primary already goes to level select, so there is no second Levels button.
      const last = ctx.level + 1 >= ctx.levels;
      const items: Parameters<typeof row>[1] = [['next', last ? 'Levels' : 'Next', 'primary', 0.11], ['restart', 'Restart', 'secondary', 0.088]];
      if (!last) items.push(['levels', 'Levels', 'secondary', 0.088]);
      return { width: 0.35, height: 0.17, buttons: row(low, items) };
    }
    case 'paused':
      return { width: 0.35, height: 0.15, buttons: row(low, [['resume', 'Resume', 'primary', 0.11], ['restart', 'Restart', 'secondary', 0.088], ['levels', 'Levels', 'secondary', 0.088]]) };
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

/** Panel anchor: the bottom centre of every panel, tilted to face the head. */
export type Anchor = { position: Vec3; pitch: number; yaw: number };

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

export function panelToWorld(a: Anchor, [x, y, z]: Vec3): Vec3 {
  const [cp, sp, cy, sy] = [Math.cos(a.pitch), Math.sin(a.pitch), Math.cos(a.yaw), Math.sin(a.yaw)];
  const [ty, tz] = [y * cp - z * sp, y * sp + z * cp];
  return [a.position[0] + x * cy + tz * sy, a.position[1] + ty, a.position[2] - x * sy + tz * cy];
}

export function worldToPanel(a: Anchor, p: Vec3): Vec3 {
  const [cp, sp, cy, sy] = [Math.cos(a.pitch), Math.sin(a.pitch), Math.cos(a.yaw), Math.sin(a.yaw)];
  const [dx, dy, dz] = [p[0] - a.position[0], p[1] - a.position[1], p[2] - a.position[2]];
  const [x, tz] = [dx * cy - dz * sy, dx * sy + dz * cy];
  return [x, dy * cp + tz * sp, -dy * sp + tz * cp];
}

/** Seconds as m:ss. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
