import type { Level } from './levels';
import { COMFORT, TRAY_POSE, inZone, layerLift, ledgeFar, partsStrip, trayToWorld, type TrayPose, type Vec3 } from './seat';

/** Layouts and placement of the in-world panels (see design/DESIGN.md). Panel space: metres, origin at the bottom centre, +Y up, +Z towards the player. */
export type Screen = 'title' | 'select' | 'hud' | 'complete' | 'paused' | 'initials' | 'board' | 'options';
export const SCREENS: readonly Screen[] = ['title', 'select', 'hud', 'complete', 'paused'];
/** Cards laid over the title or the complete card: the initials entry, the high scores board and the options. */
/** How opaque the black layer behind the menus is. */
export const SCRIM_OPACITY = 0.9;
/** The menus: the game behind them is dimmed to 90% black (a full-view layer on a flat screen, a backing panel in AR). */
export const MENU_SCREENS: readonly Screen[] = ['title', 'select', 'board', 'options'];
/** The cards the board is played with: the camera fits for these, the menus are centred over a black layer. */
export const PLAY_SCREENS: readonly Screen[] = SCREENS.filter((s) => !MENU_SCREENS.includes(s));
export const OVERLAY_SCREENS: readonly Screen[] = ['initials', 'board', 'options'];

export type ButtonKind = 'primary' | 'secondary' | 'tile' | 'icon' | 'toggle' | 'arrow' | 'tab';
/** A button rectangle in panel space; x, y is its centre. */
export type Button = { id: string; label: string; kind: ButtonKind; x: number; y: number; w: number; h: number };
/** A display slot (not a target) in panel space; x, y is its centre. */
export type Slot = { x: number; y: number; w: number; h: number };
/** `track`: the rounded bed the two high scores tab segments sit in. */
export type Layout = { width: number; height: number; buttons: Button[]; slots?: Slot[]; track?: Slot };

/** Smallest side of any button: a fingertip target. */
export const BUTTON_MIN_M = 0.04;
/** A fingertip this close to a button's face touches it, metres. */
export const TOUCH_M = 0.015;
/** Menu buttons sit just above the board, so they may be a little higher than the board's own touch cone. */
export const PANEL_ZONE = { ...COMFORT, maxPitch: 18 } as const;

const PAD = 0.016;
const GAP = 0.012;
const BH = 0.046;
const WIDE_TAB = 0.068;
/** A high scores tab. */
const tabBtn = (id: string, label: string, x: number, y: number, w = WIDE_TAB, h = BH - 0.006): Button => ({ id, label, kind: 'tab', x, y, w, h });

/** Buttons one over the other, centred on the panel, the last item lowest with its bottom edge at `foot`; each is `w` x `h`. */
function stack(foot: number, items: readonly (readonly [id: string, label: string, kind: ButtonKind])[], w: number, h: number): Button[] {
  return items.map(([id, label, kind], i) => ({ id, label, kind, x: 0, y: foot + (items.length - 1 - i) * (h + MENU_GAP) + h / 2, w, h }));
}

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
 * `cols`: the level select's tiles in one column or two (a flat view picks by the room it has; XR always two, so the column stays in the comfort cone).
 * `over`: the level was solved past its par time, so the complete card leads with Retry. `copy`: the label of the Copy link pill on the complete card (absent: no pill). `narrow`: a phone in portrait outside XR; every card is NARROW_W wide and drawn as a bottom sheet (src/fit.ts).
 */
export type LayoutCtx = { level: number; levels: number; daily?: boolean; shared?: boolean; random?: boolean; resume?: boolean; narrow?: boolean; copy?: string; over?: boolean; confirm?: boolean; cols?: 1 | 2 };

/** Width of every card on a phone in portrait (outside XR), metres of panel space. */
export const NARROW_W = 0.3;
const BACK_W = 0.076;
/** The Relaxed toggle on the phone's pause card. */
const TOGGLE_W = 0.082;
/** The menu cards (start, options, high scores, level select) are one column, one phone width wide, wide or narrow. */
const MENU_GAP = 0.012;
/** The start panel's big buttons: 50 mm tall in XR and everywhere else; three stacked, with the words over them. */
const START_BH = 0.05;
const START_BTN_W = 0.2;
/** The start panel: up to five buttons stacked, then the tagline, title and eyebrow over them. */
const startHeight = (buttons: number) => PAD + buttons * START_BH + (buttons - 1) * MENU_GAP + 0.106;
/** Room over the options buttons for the heading and the static line. */
const OPTIONS_HEAD = 0.078;
/** The level select's tiles: 44 mm tall and 6 mm apart in one column (a mouse), 50 mm and 12 mm in two (a finger or a hand); room over them for the "Levels" heading. */
const SELECT_TILE = { 1: { w: 0.2, h: 0.044, gap: 0.006 }, 2: { w: (NARROW_W - 2 * PAD - GAP) / 2, h: 0.05, gap: GAP } } as const;
const SELECT_HEAD = 0.058;
/** Wide enough for "Turn the marked gear ↻ 37.5 rpm" in body type, and for the countdown ring and its time between the clock and the pause button. */
const HUD_W = 0.3;

export function layout(screen: Screen, ctx: LayoutCtx): Layout {
  const low = PAD + BH / 2;
  const narrow = !!ctx.narrow;
  // Phone: the same buttons in one phone width (content 268 mm): primary 100 mm, secondaries 72 mm.
  const [primaryW, secondaryW] = narrow ? [0.1, 0.072] : [0.11, 0.088];
  switch (screen) {
    case 'title': {
      // One column, centred: Continue (only with progress), New Game, Random level, Options, High scores, top to bottom.
      // Continue and New Game go straight into a level; the level list is Choose level on the pause card.
      const items: Parameters<typeof stack>[1] = [
        ...(ctx.resume || ctx.shared ? [['continue', ctx.shared ? 'Shared puzzle' : 'Continue', 'primary'] as const] : []), // a ?seed= link opens its puzzle from here
        ['start', 'New Game', ctx.resume || ctx.shared ? 'secondary' : 'primary'],
        ['random', 'Random level', 'secondary'],
        ['options', 'Options', 'secondary'],
        ['scores', 'High scores', 'secondary'],
      ];
      return { width: NARROW_W, height: startHeight(items.length), buttons: stack(PAD, items, START_BTN_W, START_BH) };
    }
    case 'options': {
      // One column: the two switches, Reset progress, then Back. Confirming swaps the first three for a choice.
      const items: Parameters<typeof stack>[1] = ctx.confirm
        ? [['reset-yes', 'Reset now', 'primary'], ['reset-cancel', 'Keep it', 'secondary'], ['back', 'Back', 'secondary']]
        : [['relaxed', 'No timer', 'toggle'], ['sound', 'Sound', 'toggle'], ['reset', 'Reset progress', 'secondary'], ['back', 'Back', 'secondary']];
      return { width: NARROW_W, height: PAD + items.length * BH + (items.length - 1) * MENU_GAP + OPTIONS_HEAD, buttons: stack(PAD, items, START_BTN_W, BH) };
    }
    case 'select': {
      const n = ctx.levels;
      const rnd = !!ctx.random;
      const base = rnd ? n - 1 : n; // the numbered levels and the daily or shared one; Random comes after them
      const label = (i: number) => (rnd && i === n - 1 ? 'Random' : i === base - 1 && (ctx.shared ? 'Shared' : ctx.daily && 'Daily')) || String(i + 1);
      // The tiles in one centred column, or two when the room is short; Back is a pill under them. The tiles read top to bottom (one column) or left to right, then down (two).
      const cols = ctx.cols ?? 1;
      const t = SELECT_TILE[cols];
      const rows = Math.ceil(n / cols);
      const foot = PAD + BH + GAP;
      const tiles = Array.from({ length: n }, (_, i): Button => {
        const alone = cols === 2 && i === n - 1 && n % 2 === 1; // an odd last tile sits in the middle
        const x = cols === 1 || alone ? 0 : (i % 2 === 0 ? -1 : 1) * (t.w + GAP) / 2;
        return { id: `level-${i + 1}`, label: label(i), kind: 'tile', x, y: foot + (rows - 1 - Math.floor(i / cols)) * (t.h + t.gap) + t.h / 2, w: t.w, h: t.h };
      });
      const back: Button = { id: 'back', label: 'Back', kind: 'secondary', x: 0, y: PAD + BH / 2, w: BACK_W, h: BH };
      return { width: NARROW_W, height: foot + rows * t.h + (rows - 1) * t.gap + SELECT_HEAD, buttons: [back, ...tiles] };
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
          buttons: row(low, [['resume', 'Resume', 'primary', 0.1], ['restart', 'Restart', 'secondary', 0.08], ['levels', 'Choose level', 'secondary', 0.108], ['relaxed', 'No timer', 'toggle', 0.09]]),
        };
      }
      // Phone: the row is full, and the zone does not apply outside XR, so the toggle rides the top right beside the "Paused" words.
      const toggle: Button = { id: 'relaxed', label: 'No timer', kind: 'toggle', x: NARROW_W / 2 - 0.008 - TOGGLE_W / 2, y: 0.104, w: TOGGLE_W, h: BH };
      return {
        width: NARROW_W,
        height: 0.15,
        buttons: [...row(low, [['resume', 'Resume', 'primary', 0.086], ['restart', 'Restart', 'secondary', 0.066], ['levels', 'Choose level', 'secondary', 0.1]]), toggle],
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
      // One column, top to bottom: the heading, the Local / Global control, the ten rows, the level switcher, Back.
      const g = boardGrid(narrow);
      const trackW = 2 * WIDE_TAB + 0.006;
      return {
        width: g.width,
        height: g.height,
        buttons: [
          { id: 'back', label: 'Back', kind: 'secondary', x: 0, y: g.backY, w: 0.1, h: BH },
          tabBtn('tab-local', 'Local', -WIDE_TAB / 2, g.tabsY, WIDE_TAB, g.tabH),
          tabBtn('tab-global', 'Global', WIDE_TAB / 2, g.tabsY, WIDE_TAB, g.tabH),
          { id: 'board-prev', label: 'Previous', kind: 'arrow', x: -(g.labelW / 2 + GAP + BH / 2), y: g.switchY, w: BH, h: BH },
          { id: 'board-next', label: 'Next', kind: 'arrow', x: g.labelW / 2 + GAP + BH / 2, y: g.switchY, w: BH, h: BH },
        ],
        track: { x: 0, y: g.tabsY, w: trackW, h: g.tabH + 0.006 },
      };
    }
  }
}

/**
 * The best times card, one column and one phone wide: from the foot up, Back, the level switcher, the ten rows, the Local /
 * Global control and the heading. `y0` is the centre of the first row from the card's foot, `pitch` the distance between rows,
 * `labelW` the room for "Level 3" between the arrows, `headY` the heading's centre.
 */
export function boardGrid(narrow: boolean) {
  const [cols, rows] = [1, 10];
  const pitch = narrow ? 0.0165 : 0.0185;
  const tabH = BH - 0.006;
  const backY = PAD + BH / 2;
  const switchY = PAD + BH + GAP + BH / 2;
  const rowsFoot = PAD + 2 * BH + 2 * GAP;
  const y0 = rowsFoot + pitch / 2 + (rows - 1) * pitch;
  const tabsY = rowsFoot + rows * pitch + GAP + 0.003 + tabH / 2;
  const headY = tabsY + tabH / 2 + 0.026;
  return { width: NARROW_W, cols, rows, gap: 0, pitch, y0, headY, tabsY, tabH, backY, switchY, height: headY + 0.027, colW: NARROW_W - 2 * PAD, labelW: 0.09 };
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

/**
 * Where a menu card (start, options, high scores, level select) hangs in XR: the card is tall, a column, so it is tilted to
 * face the head at its middle and lowered, a half degree at a time, until every button's corners are in the panel zone.
 */
export function menuAnchor(l: Layout, level: Level, pose: TrayPose = TRAY_POSE): Anchor {
  const base = panelAnchor(level, pose);
  const yaw = pose.yaw ?? 0;
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  const [px, py, pz] = pose.position;
  const at = (pitch: number): Anchor => {
    const [sp, cp] = [Math.sin(pitch), Math.cos(pitch)];
    const half = l.height / 2;
    // The card's middle is PANEL_DISTANCE out along the pitch; its foot is half a card below that, along the card.
    const off = [0, PANEL_DISTANCE * sp - half * cp - TRAY_POSE.position[1], -PANEL_DISTANCE * cp - half * sp - TRAY_POSE.position[2]] as const;
    return { position: [px + off[0] * c + off[2] * s, py + off[1], pz - off[0] * s + off[2] * c], pitch, yaw };
  };
  const inReach = (a: Anchor) =>
    l.buttons.every((b) => [-1, 0, 1].every((sx) => [-1, 1].every((sy) => inZone(panelToWorld(a, [b.x + (sx * b.w) / 2, b.y + (sy * b.h) / 2, 0]), PANEL_ZONE))));
  for (let deg = 30; deg > -45; deg -= 0.5) {
    const a = at((deg * Math.PI) / 180);
    if (inReach(a)) return a;
  }
  return base;
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
