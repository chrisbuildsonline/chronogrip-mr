import type { Level } from './levels';
import { STAGES } from './stages';
import { COMFORT, TRAY_POSE, inZone, layerLift, ledgeFar, partsStrip, trayToWorld, type TrayPose, type Vec3 } from './seat';

/** Layouts and placement of the in-world panels (see design/DESIGN.md). Panel space: metres, origin at the bottom centre, +Y up, +Z towards the player. */
export type Screen = 'title' | 'stages' | 'picker' | 'hud' | 'complete' | 'paused' | 'initials' | 'board' | 'options' | 'result';
export const SCREENS: readonly Screen[] = ['title', 'hud', 'complete', 'paused'];
/** Cards laid over the title or the complete card: the initials entry, the high scores board, the options and the difficulty picker. */
/** How opaque the black layer behind the menus is. */
export const SCRIM_OPACITY = 0.9;
/** The menus: the game behind them is dimmed to 90% black (a full-view layer on a flat screen, a backing panel in AR). */
export const MENU_SCREENS: readonly Screen[] = ['title', 'stages', 'picker', 'board', 'options', 'paused', 'result', 'initials'];
/** The cards the board is played with: the camera fits for these, the menus are centred over a black layer. */
export const PLAY_SCREENS: readonly Screen[] = SCREENS.filter((s) => !MENU_SCREENS.includes(s));
export const OVERLAY_SCREENS: readonly Screen[] = ['initials', 'board', 'options', 'stages', 'picker', 'result'];

export type ButtonKind = 'primary' | 'secondary' | 'icon' | 'toggle' | 'arrow' | 'tab' | 'slot';
/** A button rectangle in panel space; x, y is its centre. */
export type Button = { id: string; label: string; kind: ButtonKind; x: number; y: number; w: number; h: number; /** A small line after a menu row's label. */ hint?: string };
/** A display slot (not a target) in panel space; x, y is its centre. */
export type Slot = { x: number; y: number; w: number; h: number };
/** `track`: the rounded bed the Local / Global tab segments sit in; `track2`: the one under the stage tabs. */
export type Layout = { width: number; height: number; buttons: Button[]; slots?: Slot[]; track?: Slot; track2?: Slot };

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
const STAGE_TAB = 0.076;
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
 * `level` is the slot on the board and `levels` how many slots there are: the campaign levels, then one more for a Random level or
 * a puzzle opened from a ?seed= link (`random`, `shared` say which). `resume`: a level is solved, so the title offers Continue.
 * `narrow`: a phone in portrait outside XR; every card is NARROW_W wide and drawn as a bottom sheet (src/fit.ts).
 */
export type LayoutCtx = { level: number; levels: number; shared?: boolean; random?: boolean; resume?: boolean; narrow?: boolean; confirm?: boolean };

/** Width of every card on a phone in portrait (outside XR), metres of panel space. */
export const NARROW_W = 0.3;
const BACK_W = 0.076;
/**
 * The menu cards (start, options, high scores, pause, picker, result, name entry) are one column, one phone width wide: no card, text rows
 * on the dark layer, left-aligned. A row is 50 mm tall (a hand's target in XR) and nearly the card's width; rows nearly touch.
 */
const MENU_GAP = 0.004;
export const ROW_H = 0.05;
export const ROW_W = 0.26;
/** Room over the rows for the amber eyebrow and the big light heading. */
const MENU_HEAD = 0.11;
const startHeight = (rows: number) => PAD + rows * ROW_H + (rows - 1) * MENU_GAP + MENU_HEAD;
/** Wide enough for "Turn the marked gear ↻ 37.5 rpm" in body type, and for the countdown ring and its time between the clock and the pause button. */
const HUD_W = 0.3;

export function layout(screen: Screen, ctx: LayoutCtx): Layout {
  const low = PAD + BH / 2;
  const narrow = !!ctx.narrow;
  // Phone: the same buttons in one phone width (content 268 mm): primary 100 mm, secondaries 72 mm.
  const [primaryW, secondaryW] = narrow ? [0.1, 0.072] : [0.11, 0.088];
  switch (screen) {
    case 'title': {
      // One column: Continue (only with a saved run), New Game, Random level, Options, High scores, top to bottom.
      const items: Parameters<typeof stack>[1] = [
        ...(ctx.resume || ctx.shared ? [['continue', ctx.shared ? 'Shared puzzle' : 'Continue', 'primary'] as const] : []), // a ?seed= link opens its puzzle from here
        ['start', 'New Game', ctx.resume || ctx.shared ? 'secondary' : 'primary'],
        ['random', 'Random level', 'secondary'],
        ['options', 'Options', 'secondary'],
        ['scores', 'High scores', 'secondary'],
      ];
      return { width: NARROW_W, height: startHeight(items.length), buttons: stack(PAD, items, ROW_W, ROW_H) };
    }
    case 'options': {
      // The three switches, Reset progress, then Back. Confirming swaps the first four for a choice.
      const items: Parameters<typeof stack>[1] = ctx.confirm
        ? [['reset-yes', 'Reset now', 'primary'], ['reset-cancel', 'Keep it', 'secondary'], ['back', 'Back', 'secondary']]
        : [['relaxed', 'No timer', 'toggle'], ['sound', 'Sound', 'toggle'], ['music', 'Music', 'toggle'], ['reset', 'Reset progress', 'secondary'], ['back', 'Back', 'secondary']];
      return { width: NARROW_W, height: startHeight(items.length), buttons: stack(PAD, items, ROW_W, ROW_H) };
    }
    case 'stages': {
      // New Game: which stage. Each row carries its one-line hint; all three are open.
      const rows = stack(PAD + ROW_H + MENU_GAP, STAGES.map((st, i) => [`stage-${st.id}`, st.name, i === 0 ? 'primary' : 'secondary'] as const), ROW_W, ROW_H).map((b, i) => ({ ...b, hint: STAGES[i]!.hint }));
      const items = stack(PAD, [['back', 'Back', 'secondary']], ROW_W, ROW_H);
      return { width: NARROW_W, height: startHeight(STAGES.length + 1), buttons: [...rows, ...items] };
    }
    case 'picker': {
      // Random level (practice): how hard. Easy, Medium, Hard, Expert, then Back.
      const items: Parameters<typeof stack>[1] = [['easy', 'Easy', 'secondary'], ['medium', 'Medium', 'secondary'], ['hard', 'Hard', 'secondary'], ['expert', 'Expert', 'secondary'], ['back', 'Back', 'secondary']];
      return { width: NARROW_W, height: startHeight(items.length), buttons: stack(PAD, items, ROW_W, ROW_H) };
    }
    case 'result': {
      // A run that did not finish: "Level 7 reached" and the time; New Game or the Main menu. A line more of room for the words.
      const items: Parameters<typeof stack>[1] = [['start', 'New Game', 'primary'], ['menu', 'Main menu', 'secondary']];
      return { width: NARROW_W, height: startHeight(items.length) + 0.03, buttons: stack(PAD, items, ROW_W, ROW_H) };
    }
    case 'hud': {
      // The goal line runs across the top; under it the level, a time with tenths (0:04.7) and the pause button. The
      // button stays on the bottom row, so it is no higher in view than before.
      const width = narrow ? NARROW_W : HUD_W;
      return { width, height: 0.096, buttons: [{ id: 'pause', label: 'Pause', kind: 'icon', x: width / 2 - 0.008 - BH / 2, y: 0.031, w: BH, h: BH }] };
    }
    case 'complete': {
      // The last slot is a Random level (practice) or a shared puzzle; the one before it is level 20, after which Next is Finish.
      const special = ctx.level >= ctx.levels - 1;
      const last = ctx.level === ctx.levels - 2;
      // A level cleared: Next. A Random level: Play again, or the Main menu. A shared puzzle: Restart plays it again, Menu leaves.
      const items: Parameters<typeof row>[1] = special
        ? ctx.random
          ? [['next', 'Play again', 'primary', primaryW], ['menu', 'Main menu', 'secondary', secondaryW + 0.02]]
          : [['restart', 'Restart', 'primary', primaryW], ['menu', 'Menu', 'secondary', secondaryW]]
        : [['next', last ? 'Finish' : 'Next', 'primary', primaryW]];
      return { width: narrow ? NARROW_W : 0.35, height: 0.17, buttons: row(low, items) };
    }
    case 'paused': {
      // One column like the other menus: Resume, Restart (a new puzzle), Give up (ends the run), Main menu (the run stays saved), No timer.
      const items: Parameters<typeof stack>[1] = [['resume', 'Resume', 'primary'], ['restart', 'Restart', 'secondary'], ['giveup', 'Give up', 'secondary'], ['menu', 'Main menu', 'secondary'], ['relaxed', 'No timer', 'toggle']];
      return { width: NARROW_W, height: startHeight(items.length), buttons: stack(PAD, items, ROW_W, ROW_H) };
    }
    case 'initials': {
      // The name entry, arcade style: the time large, then three big letter slots (tap one to move to it) with an arrow over and under each, then OK and Skip.
      const col = (NARROW_W - 2 * PAD - 2 * MENU_GAP) / 3;
      const [AH, SH] = [ROW_H, 0.06];
      const okY = PAD + ROW_H + MENU_GAP + ROW_H / 2;
      const downY = PAD + 2 * (ROW_H + MENU_GAP) + 0.008 + AH / 2;
      const slotY = downY + AH / 2 + SH / 2;
      const upY = slotY + SH / 2 + AH / 2;
      const buttons: Button[] = [];
      const slots: Slot[] = [];
      for (let k = 0; k < 3; k++) {
        const cx = -NARROW_W / 2 + PAD + col / 2 + k * (col + MENU_GAP);
        buttons.push(
          { id: `up-${k}`, label: 'Up', kind: 'arrow', x: cx, y: upY, w: col, h: AH },
          { id: `slot-${k}`, label: 'Letter', kind: 'slot', x: cx, y: slotY, w: col, h: SH },
          { id: `down-${k}`, label: 'Down', kind: 'arrow', x: cx, y: downY, w: col, h: AH },
        );
        slots.push({ x: cx, y: slotY, w: col, h: SH });
      }
      buttons.push(...stack(PAD, [['save', 'OK', 'primary'], ['skip', 'Skip', 'secondary']], ROW_W, ROW_H));
      return { width: NARROW_W, height: upY + AH / 2 + 0.15, buttons, slots };
    }
    case 'board': {
      // One column, top to bottom: the heading, the Local / Global control, the ten rows, Back.
      const g = boardGrid(narrow);
      const trackW = 2 * WIDE_TAB + 0.006;
      return {
        width: g.width,
        height: g.height,
        buttons: [
          ...stack(PAD, [['back', 'Back', 'secondary']], ROW_W, ROW_H),
          tabBtn('tab-local', 'Local', -WIDE_TAB / 2, g.tabsY, WIDE_TAB, g.tabH),
          tabBtn('tab-global', 'Global', WIDE_TAB / 2, g.tabsY, WIDE_TAB, g.tabH),
          ...STAGES.map((st, i) => tabBtn(`tab-${st.id}`, st.name, (i - 1) * STAGE_TAB, g.stageY, STAGE_TAB, g.tabH)),
        ],
        track: { x: 0, y: g.tabsY, w: trackW, h: g.tabH + 0.006 },
        track2: { x: 0, y: g.stageY, w: STAGES.length * STAGE_TAB + 0.006, h: g.tabH + 0.006 },
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
  const rowsFoot = PAD + ROW_H + 0.012;
  const y0 = rowsFoot + pitch / 2 + (rows - 1) * pitch;
  const tabsY = rowsFoot + rows * pitch + GAP + 0.003 + tabH / 2;
  const stageY = tabsY + tabH + 0.01;
  const headY = stageY + tabH / 2 + 0.04;
  return { width: NARROW_W, cols, rows, gap: 0, pitch, y0, headY, tabsY, stageY, tabH, height: headY + 0.06, colW: NARROW_W - 2 * PAD };
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
