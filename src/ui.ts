import type { Level } from './levels';
import { COMFORT, TRAY_POSE, layerLift, ledgeFar, partsStrip, trayToWorld, type TrayPose, type Vec3 } from './seat';

/** Layouts and placement of the in-world panels (see design/DESIGN.md). Panel space: metres, origin at the bottom centre, +Y up, +Z towards the player. */
export type Screen = 'title' | 'select' | 'hud' | 'complete' | 'paused' | 'initials' | 'board' | 'options';
export const SCREENS: readonly Screen[] = ['title', 'select', 'hud', 'complete', 'paused'];
/** Cards laid over the title or the complete card: the initials entry, the high scores board and the options. */
export const OVERLAY_SCREENS: readonly Screen[] = ['initials', 'board', 'options'];

export type ButtonKind = 'primary' | 'secondary' | 'tile' | 'icon' | 'toggle' | 'arrow' | 'tab';
/** A button rectangle in panel space; x, y is its centre. */
export type Button = { id: string; label: string; kind: ButtonKind; x: number; y: number; w: number; h: number };
/** A display slot (not a target) in panel space; x, y is its centre. */
export type Slot = { x: number; y: number; w: number; h: number };
/** `tabs`: on a phone the high scores tabs sit on the heading line, apart from the buttons (a hand never reaches that high; a thumb does). */
export type Layout = { width: number; height: number; buttons: Button[]; slots?: Slot[]; tabs?: Button[] };

/** Smallest side of any button: a fingertip target. */
export const BUTTON_MIN_M = 0.04;
/** A fingertip this close to a button's face touches it, metres. */
export const TOUCH_M = 0.015;
/** Menu buttons sit just above the board, so they may be a little higher than the board's own touch cone. */
export const PANEL_ZONE = { ...COMFORT, maxPitch: 18 } as const;

const PAD = 0.016;
const GAP = 0.012;
const BH = 0.046;
const WIDE_TAB = 0.05;
/** A high scores tab. */
const tabBtn = (id: string, label: string, x: number, y: number, w = WIDE_TAB, h = BH): Button => ({ id, label, kind: 'tab', x, y, w, h });

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
export type LayoutCtx = { level: number; levels: number; daily?: boolean; shared?: boolean; random?: boolean; resume?: boolean; narrow?: boolean; copy?: string; over?: boolean; confirm?: boolean };

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
/** The start panel's big buttons: 50 mm tall in XR and on a desktop (their top edge stays under the zone's 18 degrees), the primary 52 mm on a phone (59 px at the sheet scale). */
const START_BH = 0.05;
const START_FOOT = 0.014;
const START_BH_NARROW = 0.052;
/** The start panel: 0.17 m tall wide (a little taller would push the desktop camera back at 1440 x 900), 0.208 m as a phone sheet (title, tagline and two button rows; no taller than the old title sheet, so the phone camera is unchanged). */
export const START_H = { wide: 0.17, narrow: 0.208 } as const;
/** The options panel: 0.15 m tall wide (heading, one static line, one button row), 0.2 m as a phone sheet (two rows). */
export const OPTIONS_H = { wide: 0.15, narrow: 0.2 } as const;
/** Wide enough for "Turn the marked gear ↻ 37.5 rpm" in body type, and for the countdown ring and its time between the clock and the pause button. */
const HUD_W = 0.3;

export function layout(screen: Screen, ctx: LayoutCtx): Layout {
  const low = PAD + BH / 2;
  const narrow = !!ctx.narrow;
  // Phone: the same buttons in one phone width (content 268 mm): primary 100 mm, secondaries 72 mm.
  const [primaryW, secondaryW] = narrow ? [0.1, 0.072] : [0.11, 0.088];
  switch (screen) {
    case 'title': {
      const start = ['start', ctx.resume ? 'Continue' : 'Start game', 'primary'] as const;
      const sized = (bs: Button[], h: number) => bs.map((b) => ({ ...b, h }));
      // Wide: the three big buttons on one row, Start game the widest, so every target stays in the panel zone.
      if (!narrow) return { width: 0.42, height: START_H.wide, buttons: sized(row(START_FOOT + START_BH / 2, [[...start, 0.13], ['options', 'Options', 'secondary', 0.09], ['scores', 'High scores', 'secondary', 0.11]]), START_BH) };
      // Phone: Start game across the foot under the thumb, Options and High scores side by side above it.
      const full = NARROW_W - 2 * PAD;
      const half = (full - GAP) / 2;
      const [a] = sized(row(PAD + START_BH_NARROW / 2, [[...start, full]]), START_BH_NARROW);
      const [b, c] = row(PAD + START_BH_NARROW + GAP + BH / 2, [['options', 'Options', 'secondary', half], ['scores', 'High scores', 'secondary', half]]);
      return { width: NARROW_W, height: START_H.narrow, buttons: [a!, b!, c!] };
    }
    case 'options': {
      const confirm = !!ctx.confirm;
      if (!narrow) {
        // One row low on the card, as everywhere in the zone: Back, the two switches, Reset progress. Confirming swaps the switches for a choice.
        const items: Parameters<typeof row>[1] = confirm
          ? [['back', 'Back', 'secondary', 0.07], ['reset-cancel', 'Keep it', 'secondary', 0.09], ['reset-yes', 'Reset now', 'primary', 0.11]]
          : [['back', 'Back', 'secondary', 0.07], ['relaxed', 'No timer', 'toggle', 0.088], ['sound', 'Sound', 'toggle', 0.08], ['reset', 'Reset progress', 'secondary', 0.11]];
        return { width: 0.44, height: OPTIONS_H.wide, buttons: row(low, items) };
      }
      // Phone: two rows. The thumb row carries Back and Reset progress (or the choice), the switches ride above.
      const full = NARROW_W - 2 * PAD;
      const half = (full - GAP) / 2;
      const up = low + BH + GAP;
      if (confirm) {
        const [yes, no] = row(low, [['reset-yes', 'Reset now', 'primary', 0.15], ['reset-cancel', 'Keep it', 'secondary', full - 0.15 - GAP]]);
        const [back] = row(up, [['back', 'Back', 'secondary', 0.1]]);
        return { width: NARROW_W, height: OPTIONS_H.narrow, buttons: [back!, no!, yes!] };
      }
      const [back, reset] = row(low, [['back', 'Back', 'secondary', 0.1], ['reset', 'Reset progress', 'secondary', full - 0.1 - GAP]]);
      const [timer, sound] = row(up, [['relaxed', 'No timer', 'toggle', half], ['sound', 'Sound', 'toggle', half]]);
      return { width: NARROW_W, height: OPTIONS_H.narrow, buttons: [back!, timer!, sound!, reset!] };
    }
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
    case 'initials': {
      const letter = (k: number) => [`up-${k}`, `down-${k}`] as const;
      const arrow = (id: string, label: string, x: number, y: number, w: number, h: number): Button => ({ id, label, kind: 'arrow', x, y, w, h });
      const slots: Slot[] = [];
      if (!narrow) {
        // One row, low on the card (the panel zone's pitch rules out a second): each letter in its slot with a down arrow at its left and an up arrow at its right, then Save and Skip.
        const [AW, SW, TIGHT] = [BUTTON_MIN_M, 0.03, 0.003];
        const group = 2 * AW + SW + 2 * TIGHT;
        const slotGap = GAP + 0.002;
        const total = 3 * group + 2 * slotGap + 0.024 + 0.08 + GAP + 0.06;
        let x = -total / 2;
        const buttons: Button[] = [];
        for (let k = 0; k < 3; k++) {
          const [up, down] = letter(k);
          buttons.push(arrow(up, 'Up', x + group - AW / 2, low, AW, BH), arrow(down, 'Down', x + AW / 2, low, AW, BH));
          slots.push({ x: x + AW + TIGHT + SW / 2, y: low, w: SW, h: BH });
          x += group + slotGap;
        }
        const at = x - slotGap + 0.024; // Save and Skip start a wider gap after the last letter's arrows
        buttons.push(
          { id: 'save', label: 'Save', kind: 'primary', x: at + 0.04, y: low, w: 0.08, h: BH },
          { id: 'skip', label: 'Skip', kind: 'secondary', x: at + 0.08 + GAP + 0.03, y: low, w: 0.06, h: BH },
        );
        return { width: total + 2 * PAD, height: 0.14, buttons, slots };
      }
      // Phone: the zone does not apply, so each letter's slot has its up pill over it and its down pill under it, and Save and Skip sit under the thumb.
      const col = (NARROW_W - 2 * PAD - 2 * GAP) / 3;
      const AH = 0.044;
      const SLOT_H = 0.04;
      const downY = low + BH / 2 + GAP + AH / 2;
      const slotY = downY + AH / 2 + 0.003 + SLOT_H / 2;
      const upY = slotY + SLOT_H / 2 + 0.003 + AH / 2;
      const buttons: Button[] = [];
      for (let k = 0; k < 3; k++) {
        const [up, down] = letter(k);
        const cx = -NARROW_W / 2 + PAD + col / 2 + k * (col + GAP);
        buttons.push(arrow(up, 'Up', cx, upY, col, AH), arrow(down, 'Down', cx, downY, col, AH));
        slots.push({ x: cx, y: slotY, w: col, h: SLOT_H });
      }
      buttons.push(...row(low, [['save', 'Save', 'primary', 0.15], ['skip', 'Skip', 'secondary', 0.106]]));
      return { width: NARROW_W, height: 0.29, buttons, slots };
    }
    case 'board': {
      const g = boardGrid(narrow);
      const right = g.width / 2 - PAD;
      const backW = narrow ? 0.07 : 0.076;
      const next = right - BH / 2;
      const prev = right - BH - GAP - g.labelW - GAP - BH / 2;
      const tabAt = -g.width / 2 + PAD + backW + GAP + WIDE_TAB / 2;
      return {
        width: g.width,
        height: g.height,
        buttons: [
          { id: 'back', label: 'Back', kind: 'secondary', x: -g.width / 2 + PAD + backW / 2, y: low, w: backW, h: BH },
          ...(g.tabs ? [] : [tabBtn('tab-local', 'LOCAL', tabAt, low), tabBtn('tab-global', 'GLOBAL', tabAt + WIDE_TAB + GAP, low)]),
          { id: 'board-prev', label: 'Previous', kind: 'arrow', x: prev, y: low, w: BH, h: BH },
          { id: 'board-next', label: 'Next', kind: 'arrow', x: next, y: low, w: BH, h: BH },
        ],
        ...(g.tabs ? { tabs: [tabBtn('tab-local', 'LOCAL', g.tabs.x0 + g.tabs.local.w / 2, g.tabs.y, g.tabs.local.w, g.tabs.h), tabBtn('tab-global', 'GLOBAL', g.tabs.x0 + g.tabs.local.w + GAP + g.tabs.global.w / 2, g.tabs.y, g.tabs.global.w, g.tabs.h)] } : {}),
      };
    }
  }
}

/**
 * The best times card, over the one button row: ten rows as two columns of five, or on a phone (where a column would leave
 * too little room for a name, a step, a time and a date at 12 px) one column of ten. `y0` is the centre of the first row from
 * the card's foot, `pitch` the distance between rows, `labelW` the room for "Level 3" between the arrows, `headY` the heading's centre.
 */
export function boardGrid(narrow: boolean) {
  const width = narrow ? NARROW_W : 0.48;
  const [cols, rows] = narrow ? [1, 10] : [2, 5];
  const gap = 0.03;
  const pitch = narrow ? 0.0165 : 0.0185;
  const y0 = PAD + BH + GAP + pitch / 2 + (rows - 1) * pitch;
  const headY = y0 + pitch / 2 + 0.024;
  // On a phone the tab strip sits on the heading's line, just after "High scores" (44 px tall, 12 mm apart); a wide card keeps both tabs in its button row, inside the reach of a hand.
  const tabs = narrow ? { x0: -width / 2 + PAD + 0.125, y: headY - 0.002, w: 0.13, h: 0.04, local: { w: 0.058 }, global: { w: 0.06 } } : null;
  return { width, cols, rows, gap, pitch, y0, headY, tabs, height: headY + 0.027, colW: (width - 2 * PAD - (cols - 1) * gap) / cols, labelW: narrow ? 0.066 : 0.12 };
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
export const clock =(s: number) =>
  s < 10 ? `0:0${(Math.floor(s * 10 + 1e-6) / 10).toFixed(1)}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Seconds as m:ss.t, tenths always (0:08.0, 1:01.5), truncated like `clock`: the best times board shows one format on every row. */
export const clockTenths = (s: number) => {
  const t = Math.floor(s * 10 + 1e-6);
  return `${Math.floor(t / 600)}:${String(Math.floor((t % 600) / 10)).padStart(2, '0')}.${t % 10}`;
};
