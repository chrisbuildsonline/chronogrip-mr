import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { MENU_SCREENS, ROW_H, SCRIM_OPACITY, boardGrid, clock, clockTenths, layout, type Anchor, type Button, type Layout, type Screen } from './ui';
import { formatDate, type Entry } from './scores';
import { C } from './palette';
import { createStageCards } from './cards';
import type { StageId } from './stages';
import { ABOUT_VIEW_H } from './ui';
import { rpmLabel, type Goal } from './goal';
import { FAULT_WORDS } from './fault';
import type { Outcome } from './timer';

/** Canvas drawing of the in-world panels, per design/DESIGN.md. */
const PX = 3000; // canvas pixels per metre: 3 px per mm
const MARGIN = 48; // room for the soft shadow
export const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
/** The menus' face (self-hosted, public/fonts): light for the big words, regular for the rows, semibold for the small amber eyebrow. */
const JOSEFIN = '"Josefin Sans", system-ui, sans-serif';
const mm = (v: number) => v * 3;
/** Type scale in panel millimetres (design/DESIGN.md). */
const WIDE = { display: 36, title: 46, xl: 24, heading: 18, button: 12.5, body: 13.5, eyebrow: 8.5 };
/** On a phone the small styles grow so every word is 12 px or more on screen; the rest already is. */
const NARROW = { ...WIDE, title: 42, button: 14, eyebrow: 11 };
/** The scale for the card being drawn: `draw` sets it from ctx.narrow. */
let T = WIDE;
const font = (weight: number, sizeMm: number, face = SANS) => `${weight} ${mm(sizeMm)}px ${face}`;

/**
 * `goal`: what the HUD asks of the marked gear;
 * `fault`: what is wrong with the train as placed, shown on the HUD in place of the goal line.
 */
export type PanelCtx = {
  level: number;
  levels: number;
  /** The last slot is a puzzle opened from a ?seed= link: "Shared puzzle", not a numbered level. */
  shared?: boolean;
  /** The last slot is a Random level; `difficulty` is its name (Easy..Expert). */
  random?: boolean;
  difficulty?: string;
  /** The stage being played (Easy..Hard), for the HUD and the pause card; absent on a Random or shared puzzle. */
  stage?: string;
  resume: boolean;
  time: number;
  hover: string | null;
  goal: Goal | null;
  fault?: keyof typeof FAULT_WORDS | null;
  /** A phone in portrait outside XR: the narrow layouts and the phone type scale. */
  narrow?: boolean;
  /** The Relaxed (no timer) setting: the toggle's state. */
  relaxed?: boolean;
  /** The Options panel: the Sound switch's state, whether Reset progress is waiting for its confirm, and whether the player is in XR (the grab line says pinch). */
  sound?: boolean;
  /** The Music switch's state (Sound off silences it too). */
  music?: boolean;
  confirm?: boolean;
  xr?: boolean;
  /** The HUD's countdown ring: par, whole seconds left and over, share of par left. Absent in Relaxed mode. */
  timer?: { par: number; left: number; over: number; fraction: number } | null;
  /** The complete card: whether this solve beat par, and the par it was held to. Absent in Relaxed mode. */
  outcome?: Outcome | null;
  par?: number | null;
  /** The initials card: the rank this solve would take, the three letters, the slot typing fills next (3: all in) and the run's total in ms. */
  initials?: { rank: number; letters: string; cursor: number; ms: number; /** A run that did not finish: the level it reached. */ reached?: number };
  /** The result card of a run that did not finish: the level it reached and its total time in ms. */
  result?: { level: number; ms: number };
  /**
   * After level 20 of a run, the stage-cleared card: the whole run's time, its place on this device's board for the stage
   * (1-10, or 0 when it does not make it) and every stage with a time (this run for the stage just cleared, the best otherwise).
   */
  cleared?: { ms: number; rank?: number; stage?: string; stages?: { name: string; ms: number | null; current: boolean }[] };
  /** The resume countdown: 3, 2 or 1. */
  countdown?: number;
  /** The About window: how far the text is scrolled, metres. */
  aboutScroll?: number;
  /** The best times card: the board's name, its rows, and the muted line shown while it is empty. */
  /** `tab` is the board shown; `note` is a quiet line over the rows (the global board is offline). */
  /** The stage picker: the player's best time on each stage, as m:ss. */
  bests?: Partial<Record<StageId, string>>;
  board?: { label: string; stage: string; entries: readonly Entry[]; empty: string; tab: 'local' | 'global'; note?: string };
};

/** The HUD's countdown ring: its centre from the card's left edge, and its radius with the stroke, metres. */
export const RING = { x: 0.183, r: 0.011 };

type Draw = CanvasRenderingContext2D;

function pill(g: Draw, x: number, y: number, w: number, h: number, r = h / 2) {
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, r);
}

/** A word or line drawn on the card, for the test hook: its text, canvas position and font size in canvas pixels. */
type Drawn = { text: string; x: number; y: number; px: number; x0: number; x1: number };
/** Collects the card's words while `draw` runs; null otherwise (the hint is not a card). */
let drawn: Drawn[] | null = null;
/** Set by `draw` when the HUD it drew carries the countdown ring. */
let ringShown = false;

function text(g: Draw, s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'center', tracking = 0) {
  g.font = f;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.letterSpacing = `${tracking}px`;
  g.fillText(s, x, y);
  const w = g.measureText(s).width;
  g.letterSpacing = '0px';
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  drawn?.push({ text: s.trim(), x, y, px: Number(/([\d.]+)px/.exec(f)![1]), x0, x1: x0 + w });
}

/** A short tinted status pill centred (or left/right aligned) at x, y; `size` is its text height in mm. Returns its right edge. */
function status(g: Draw, s: string, x: number, y: number, align: 'left' | 'center' | 'right' = 'center', size = T.eyebrow): number {
  const k = size / T.eyebrow;
  g.font = font(700, size);
  g.letterSpacing = '1px';
  const w = g.measureText(s).width + mm(7 * k);
  g.letterSpacing = '0px';
  const cx = align === 'left' ? x + w / 2 : align === 'right' ? x - w / 2 : x;
  pill(g, cx, y, w, mm(12 * k));
  g.fillStyle = C.tint;
  g.fill();
  text(g, s, cx, y + 1, font(700, size), C.tintInk, 'center', 1);
  return cx + w / 2;
}

/**
 * The HUD's countdown ring: a deep track with an amber arc for the share of par left, sweeping down from twelve o'clock,
 * and beside it "LEFT" over the time left; past par the arc is gone and it reads "OVER" and "+m:ss". Returns nothing drawn
 * if there is no timer (Relaxed).
 */
function ring(g: Draw, t: NonNullable<PanelCtx['timer']>, x: number, y: number, stop: number) {
  const r = mm(9.5);
  g.lineWidth = mm(3);
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.strokeStyle = C.deep;
  g.stroke();
  if (t.fraction > 0) {
    g.beginPath();
    g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + t.fraction * Math.PI * 2);
    g.strokeStyle = C.amber;
    g.stroke();
  }
  const over = t.left === 0 && t.over > 0;
  const tx = x + r + mm(4);
  const room = stop - tx;
  const whole = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; // the ring counts whole seconds, no tenths
  text(g, over ? 'OVER' : 'LEFT', tx, y - mm(8.5), font(700, T.eyebrow), C.muted, 'left', 1);
  // The count shrinks to stop short of the pause button when it runs long (+10:23).
  const count = over ? `+${whole(t.over)}` : whole(t.left);
  g.font = font(700, T.body);
  const size = T.body * Math.min(1, room / g.measureText(count).width);
  text(g, count, tx, y + mm(6), font(700, size), C.ink, 'left');
}

/** The Relaxed toggle: a pill that is cream deep with an empty circle while the timer is on, and amber tint with an amber check once Relaxed is on. */
function toggle(g: Draw, label: string, on: boolean, x: number, y: number) {
  const size = WIDE.button; // the phone's 14 mm button type would leave "No timer" no room to breathe in its pill
  g.font = font(600, size);
  const disc = mm(4);
  const gap = mm(2.5);
  const w = disc * 2 + gap + g.measureText(label).width;
  const cx = x - w / 2 + disc;
  if (on) check(g, cx, y, disc);
  else {
    g.beginPath();
    g.arc(cx, y, disc - mm(0.6), 0, Math.PI * 2);
    g.lineWidth = mm(1.2);
    g.strokeStyle = C.muted;
    g.stroke();
  }
  text(g, label, x + w / 2, y + 1, font(600, size), on ? C.tintInk : C.ink, 'right');
}

/**
 * The turn arrow (↻ or ↺ as the player sees the gear): an open circle of radius `r` round x, y with its gap at the top
 * and an arrowhead at the end it turns towards. Drawn, not a glyph, so it looks the same in every font.
 */
export function turnArrow(g: Draw, x: number, y: number, r: number, dir: Goal['dir'], color: string, width: number) {
  const s = dir === 'cw' ? 1 : -1; // canvas angles grow clockwise on screen
  const gap = 0.62;
  const a0 = -Math.PI / 2 + s * gap;
  const a1 = a0 + s * (2 * Math.PI - 2 * gap);
  const head = width * 2.6;
  g.beginPath();
  g.arc(x, y, r, a0, a1 - s * (head * 0.35) / r, s < 0);
  g.lineWidth = width;
  g.lineCap = 'round';
  g.strokeStyle = color;
  g.stroke();
  const [ex, ey] = [x + r * Math.cos(a1), y + r * Math.sin(a1)];
  const [tx, ty] = [-s * Math.sin(a1), s * Math.cos(a1)]; // along the turn
  const [nx, ny] = [Math.cos(a1), Math.sin(a1)]; // outwards
  g.beginPath();
  g.moveTo(ex + tx * head * 0.75, ey + ty * head * 0.75);
  g.lineTo(ex - tx * head * 0.45 + nx * head * 0.6, ey - ty * head * 0.45 + ny * head * 0.6);
  g.lineTo(ex - tx * head * 0.45 - nx * head * 0.6, ey - ty * head * 0.45 - ny * head * 0.6);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

/** A small amber disc with a cream tick: a matched goal, a pass. */
function check(g: Draw, cx: number, cy: number, r = mm(5)) {
  const k = r / mm(5);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = C.amber;
  g.fill();
  g.beginPath();
  g.moveTo(cx - mm(2.4) * k, cy + mm(0.1) * k);
  g.lineTo(cx - mm(0.7) * k, cy + mm(1.9) * k);
  g.lineTo(cx + mm(2.5) * k, cy - mm(1.8) * k);
  g.lineWidth = mm(1.2) * k;
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = C.cream;
  g.stroke();
}

/** The HUD's goal line: "Turn the marked gear", the turn arrow, the rpm; a check at the end once the train matches it. */
function goalLine(g: Draw, goal: Goal, x: number, y: number) {
  const lead = 'Turn the marked gear';
  g.font = font(600, T.body);
  const leadW = g.measureText(lead).width;
  text(g, lead, x, y + 1, font(600, T.body), C.muted, 'left');
  const r = mm(4.6);
  const ax = x + leadW + mm(6) + r;
  turnArrow(g, ax, y, r, goal.dir, C.ink, mm(1.5));
  const rpm = rpmLabel(goal.rpm);
  g.font = font(700, T.body);
  const rpmX = ax + r + mm(4.5);
  text(g, rpm, rpmX, y + 1, font(700, T.body), C.ink, 'left');
  if (goal.matched) check(g, rpmX + g.measureText(rpm).width + mm(4) + mm(5), y);
}

/**
 * The HUD's fault line, in place of the goal line: a small red disc with a cream "!", the lead in red bold, the fix in
 * muted. One line, shrunk to fit `room` if a wide system font needs it.
 */
function faultLine(g: Draw, kind: keyof typeof FAULT_WORDS, x: number, y: number, room: number) {
  const [lead, rest] = FAULT_WORDS[kind];
  const disc = mm(6);
  const gap = mm(3);
  let size = T.body;
  const width = () => {
    g.font = font(700, size);
    const a = g.measureText(lead).width;
    g.font = font(600, size);
    return [a, g.measureText(` ${rest}`).width] as const;
  };
  let [leadW, restW] = width();
  const k = Math.min(1, (room - 2 * disc - gap) / (leadW + restW));
  if (k < 1) {
    size *= k;
    [leadW, restW] = width();
  }
  const r = disc * Math.max(0.85, size / T.body);
  g.beginPath();
  g.arc(x + r, y, r, 0, Math.PI * 2);
  g.fillStyle = C.jamInk;
  g.fill();
  // The "!": a rounded stroke and a dot, drawn so it sits dead centre in any font.
  g.lineWidth = r * 0.26;
  g.lineCap = 'round';
  g.strokeStyle = C.cream;
  g.beginPath();
  g.moveTo(x + r, y - r * 0.52);
  g.lineTo(x + r, y + r * 0.12);
  g.stroke();
  g.beginPath();
  g.arc(x + r, y + r * 0.5, r * 0.15, 0, Math.PI * 2);
  g.fillStyle = C.cream;
  g.fill();
  const tx = x + 2 * r + gap;
  text(g, lead, tx, y + 1, font(700, size), C.jamInk, 'left');
  text(g, ` ${rest}`, tx + leadW, y + 1, font(600, size), C.muted, 'left');
}

function chevron(g: Draw, left: number, y: number, w: number, h: number, line: number) {
  g.beginPath();
  g.moveTo(left + w, y - h);
  g.lineTo(left, y);
  g.lineTo(left + w, y + h);
  g.lineWidth = line;
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = C.ink;
  g.stroke();
}

/** 'Back' with a small chevron before it; in a tall cell (the phone's level grid) the chevron sits over the word. */
function backLabel(g: Draw, label: string, x: number, y: number, stacked: boolean) {
  if (stacked) {
    chevron(g, x - mm(2.5), y - mm(9), mm(5), mm(5.5), mm(1.6));
    text(g, label, x, y + mm(8), font(600, T.button), C.ink);
    return;
  }
  g.font = font(600, T.button);
  const [chev, gap] = [mm(3.5), mm(3)];
  const left = x - (chev + gap + g.measureText(label).width) / 2;
  chevron(g, left, y, chev, mm(4), mm(1.4));
  text(g, label, left + chev + gap, y + 1, font(600, T.button), C.ink, 'left');
}

/** The arrow on a round arrow button: a chevron pointing up, down, left or right as the button's id says. */
function arrowGlyph(g: Draw, id: string, x: number, y: number, color: string = C.ink) {
  const [dx, dy] = id.startsWith('up') ? [0, -1] : id.startsWith('down') ? [0, 1] : id === 'board-prev' ? [-1, 0] : [1, 0];
  const [px, py] = [-dy, dx]; // across the arrow
  const [s, tip, tail] = [mm(5), mm(2.6), mm(2.2)];
  g.beginPath();
  g.moveTo(x - dx * tail + px * s * 0.9, y - dy * tail + py * s * 0.9);
  g.lineTo(x + dx * tip, y + dy * tip);
  g.lineTo(x - dx * tail - px * s * 0.9, y - dy * tail - py * s * 0.9);
  g.lineWidth = mm(1.8);
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = color;
  g.stroke();
}

function button(g: Draw, b: Button, at: (x: number, y: number) => [number, number], ctx: PanelCtx, menu = false) {
  const [x, y] = at(b.x, b.y);
  const [w, h] = [b.w * PX, b.h * PX];
  const hover = ctx.hover === b.id;
  if (menu) return menuButton(g, b, x, y, w, h, hover, ctx);
  if (b.kind === 'tab') {
    // The selected tab is the amber tint pill (as the status pills); the other is muted words with no fill.
    const picked = b.id === 'tab-local' || b.id === 'tab-global' ? ctx.board?.tab === (b.id === 'tab-global' ? 'global' : 'local') : b.id === `tab-${ctx.board?.stage}`;
    pill(g, x, y, w, h);
    if (picked) {
      g.fillStyle = C.tint;
      g.fill();
    }
    if (hover) {
      g.lineWidth = mm(3);
      g.strokeStyle = C.amber;
      g.stroke();
    }
    return text(g, b.label, x, y + 1, font(600, T.button), picked ? C.tintInk : C.muted); // the size of Back's label
  }
  // A pill where it is wider than tall; a cell taller than wide gets rounded corners.
  const tall = b.h > b.w;
  if (tall) pill(g, x, y, w, h, mm(12));
  else if (b.kind === 'icon') {
    g.beginPath();
    g.arc(x, y, h / 2, 0, Math.PI * 2);
  } else pill(g, x, y, w, h);
  const on = b.kind === 'toggle' && !!(b.id === 'sound' ? ctx.sound : b.id === 'music' ? ctx.music : ctx.relaxed);
  g.fillStyle = b.kind === 'primary' ? (hover ? C.inkHover : C.ink) : on ? C.tint : hover ? C.deepHover : C.deep;
  g.fill();
  if (hover) {
    g.lineWidth = mm(3);
    g.strokeStyle = C.amber;
    g.stroke();
  }
  if (b.kind === 'icon') {
    g.fillStyle = C.ink;
    for (const dx of [-mm(3.2), mm(3.2)]) g.fillRect(x + dx - mm(1.5), y - mm(6), mm(3), mm(12));
  } else if (b.kind === 'arrow') arrowGlyph(g, b.id, x, y);
  else if (b.kind === 'toggle') toggle(g, b.label, on, x, y);
  else if (b.id === 'back') backLabel(g, b.label, x, y, tall);
  else text(g, b.label, x, y + 1, font(600, T.button * (b.h >= 0.05 ? 1.1 : 1)), b.kind === 'primary' ? C.cream : C.ink); // the start panel's big buttons carry bigger words
}

/** A menu word in the light, spaced, upper-case face; `weight` 300 for the big words, 400 for rows, 600 for the amber eyebrow. */
const jfont = (weight: number, sizeMm: number) => font(weight, sizeMm, JOSEFIN);

/** The gradient behind a selected or hovered row: amber fading to nothing, with the amber bar at its left edge. */
function selectedRow(g: Draw, x: number, y: number, w: number, h: number) {
  const left = x - w / 2;
  const grad = g.createLinearGradient(left, 0, left + w, 0);
  grad.addColorStop(0, 'rgba(217,154,43,0.22)');
  grad.addColorStop(0.85, 'rgba(217,154,43,0)');
  g.fillStyle = grad;
  g.fillRect(left, y - h / 2, w, h);
  g.fillStyle = C.amber;
  g.fillRect(left, y - h / 2, mm(3.5), h);
}

/** A menu button: an upper-case row (a switch shows On or Off at its right), or an arrow, a letter slot, a tab. The selected, primary or hovered row has the amber bar, gradient and ›. */
function menuButton(g: Draw, b: Button, x: number, y: number, w: number, h: number, hover: boolean, ctx: PanelCtx) {
  const left = x - w / 2;
  if (b.kind === 'tab') {
    const picked = b.id === 'tab-local' || b.id === 'tab-global' ? ctx.board?.tab === (b.id === 'tab-global' ? 'global' : 'local') : b.id === `tab-${ctx.board?.stage}`;
    text(g, b.label.toUpperCase(), x, y + 1, jfont(picked ? 600 : 400, T.button * 0.9), picked ? C.amber : C.menuInk, 'center', 3);
    if (picked) {
      g.fillStyle = C.amber;
      g.fillRect(x - w * 0.34, y + h / 2 - mm(1.5), w * 0.68, mm(1));
    }
    if (hover && !picked) text(g, b.label.toUpperCase(), x, y + 1, jfont(400, T.button * 0.9), C.menuHi, 'center', 3);
    return;
  }
  if (b.kind === 'arrow') {
    if (hover) selectedRow(g, x, y, w, h);
    arrowGlyph(g, b.id, x, y, C.amber);
    return;
  }
  if (b.kind === 'slot') {
    const k = Number(b.id.slice(-1));
    const on = ctx.initials?.cursor === k;
    if (on) {
      g.lineWidth = mm(1.2);
      g.strokeStyle = C.amber;
      g.strokeRect(x - w / 2 + mm(1), y - h / 2 + mm(1), w - mm(2), h - mm(2));
    }
    text(g, ctx.initials?.letters[k] ?? '', x, y + mm(1), jfont(300, 24), on ? C.menuHi : C.logo);
    return;
  }
  if (b.kind === 'card') return; // a stage card is drawn by src/cards.ts
  // Nothing is selected when a menu opens: a row lights (amber bar, gradient, ›) only while it is hovered or reached with the keys.
  const lit = hover;
  if (lit) selectedRow(g, x, y, w, h);
  const word = b.label.toUpperCase();
  const color = lit ? C.menuHi : C.menuInk;
  text(g, word, left + mm(11), y + 1, jfont(400, T.button * 1.1), color, 'left', 4.2);
  if (b.kind === 'toggle') {
    const on = !!(b.id === 'sound' ? ctx.sound : b.id === 'music' ? ctx.music : ctx.relaxed);
    text(g, on ? 'ON' : 'OFF', left + w - mm(8), y + 1, jfont(600, T.button * 0.8), on ? C.amber : C.menuMuted, 'right', 3);
  } else if (lit) text(g, '›', left + w - mm(8), y, jfont(300, 28), C.amber, 'right');
}


/** What the About window says: a heading and its paragraphs (a paragraph starting with a dot is a bullet). */
export const ABOUT: readonly { heading: string; lines: readonly string[] }[] = [
  { heading: 'WHAT IT IS', lines: ['ChronoGrip is a mixed-reality clockwork puzzle, made by Chris for the Meta VR Start Developer Competition 2026, a hackathon.'] },
  { heading: 'HOW TO PLAY', lines: ['Pick a gear from the strip and fit it on an axle. Build a train that turns the marked gear at the target rpm and in the target direction. Then twist the regulator until the ticking matches, and the brass bird comes alive.'] },
  {
    heading: 'MECHANICS',
    lines: [
      '· Three stages of 20 levels, made fresh every time.',
      '· Each level has a time limit. No timer, in Options or on the pause menu, turns the limit off.',
      '· Pausing stops the clock and hides the board; play resumes after a 3-second countdown.',
      '· Give up, or run out of time, and the run ends with no score.',
      '· Finish all 20 levels of a stage to enter three initials on that stage\'s board, on this device and global.',
      '· Random level is practice: no scores.',
    ],
  },
  { heading: 'CREDITS', lines: ['Built with Meta IWSDK and Three.js. The music is generated in code. The environments are rendered in Blender. The font is Josefin Sans (SIL Open Font License).'] },
];

/** The most the About text can scroll, metres: set by the last draw (src/main.ts clamps its scroll to it). */
export let aboutMax = 0;

/** The About text, wrapped to the window and clipped to it, `ctx.aboutScroll` metres up; a thin bar shows where the window is. */
function drawAbout(g: Draw, l: Layout, ctx: PanelCtx, at: (x: number, y: number) => [number, number]) {
  const pad = 0.024;
  const topY = l.height - 0.115; // the window's top edge, panel metres
  const [x0] = at(-l.width / 2 + pad, 0);
  const maxW = (l.width - 2 * pad - 0.008) * PX;
  const size = T.body * 0.85;
  const lineH = size * 3 * 1.5;
  const scroll = (ctx.aboutScroll ?? 0) * PX;
  const [, top] = at(0, topY);
  const bottom = top + ABOUT_VIEW_H * PX;
  g.save();
  g.beginPath();
  g.rect(0, top, g.canvas.width, ABOUT_VIEW_H * PX);
  g.clip();
  let y = top + mm(3) - scroll;
  const wrap = (s: string, indent: number): string[] => {
    g.font = jfont(400, size);
    const words = s.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (g.measureText(next).width > maxW - indent && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    return line ? [...lines, line] : lines;
  };
  for (const block of ABOUT) {
    text(g, block.heading, x0, y + mm(3), jfont(600, T.eyebrow), C.amber, 'left', 6);
    y += mm(9);
    for (const para of block.lines) {
      const bullet = para.startsWith('· ');
      for (const [i, line] of wrap(bullet ? para.slice(2) : para, bullet ? mm(5) : 0).entries()) {
        if (bullet && i === 0) text(g, '·', x0, y + lineH / 2, jfont(600, size), C.amber, 'left', 0);
        text(g, line, x0 + (bullet ? mm(5) : 0), y + lineH / 2, jfont(400, size), C.menuInk, 'left', 0);
        y += lineH;
      }
      y += mm(2);
    }
    y += mm(4);
  }
  const content = y + scroll - top;
  aboutMax = Math.max(0, (content - ABOUT_VIEW_H * PX) / PX);
  g.restore();
  // The scroll bar: a hairline at the window's right edge, its thumb showing the visible share.
  if (aboutMax > 0) {
    const [bx] = at(l.width / 2 - 0.016, 0);
    const share = Math.min(1, (ABOUT_VIEW_H * PX) / content);
    const trackH = ABOUT_VIEW_H * PX;
    g.fillStyle = 'rgba(241,232,216,0.15)';
    g.fillRect(bx, top, mm(0.8), trackH);
    g.fillStyle = C.amber;
    g.fillRect(bx, top + (scroll / PX / aboutMax) * trackH * (1 - share), mm(0.8), trackH * share);
  }
  void bottom;
}

/**
 * The stage-cleared card's own panel (the other menus have none): walnut night, lighter at the top, an amber hairline and a
 * large faint gear turning out of the lower right corner.
 */
function clearedCard(g: Draw, W: number, H: number) {
  g.save();
  g.shadowColor = C.shadow;
  g.shadowBlur = 40;
  g.shadowOffsetY = 12;
  g.beginPath();
  g.roundRect(MARGIN, MARGIN, W, H, mm(18));
  const fill = g.createLinearGradient(0, MARGIN, 0, MARGIN + H);
  fill.addColorStop(0, C.clearedTop);
  fill.addColorStop(1, C.clearedFoot);
  g.fillStyle = fill;
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  g.roundRect(MARGIN, MARGIN, W, H, mm(18));
  g.clip();
  // the watermark gear: 24 teeth, centred just off the corner
  const [gx, gy, r] = [MARGIN + W * 0.92, MARGIN + H * 0.86, H * 0.42];
  g.beginPath();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, rr = i % 2 ? r : r * 1.1;
    g.lineTo(gx + rr * Math.cos(a), gy + rr * Math.sin(a));
  }
  g.closePath();
  g.moveTo(gx + r * 0.18, gy);
  g.arc(gx, gy, r * 0.18, 0, Math.PI * 2, true);
  g.globalAlpha = 0.045;
  g.fillStyle = C.amber;
  g.fill('evenodd');
  g.restore();
  g.save();
  g.beginPath();
  g.roundRect(MARGIN + 1, MARGIN + 1, W - 2, H - 2, mm(18));
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  g.strokeStyle = C.amber;
  g.stroke();
  g.restore();
}

/** A run's time in words: "48.2 s" under a minute, else "19 min 03 s". */
export const spoken = (ms: number): string => {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${(Math.floor(s * 10) / 10).toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;
};

/** The words of a menu: the amber eyebrow and the big light heading at the left, and the high scores' rows. */
function drawMenu(g: Draw, screen: Screen, l: Layout, ctx: PanelCtx, at: (x: number, y: number) => [number, number]) {
  const left = at(-l.width / 2 + 0.024, 0)[0];
  const y = (v: number) => at(0, v)[1];
  const W = l.width * PX;
  /** The eyebrow, then the big heading shrunk to fit the card. */
  const head = (eyebrow: string, big: string, bigSize = 34, top = l.height - 0.02) => {
    text(g, eyebrow, left, y(top), jfont(600, T.eyebrow), C.amber, 'left', 6);
    g.font = jfont(300, bigSize);
    g.letterSpacing = '4px';
    const size = bigSize * Math.min(1, (W - mm(2 * 24)) / g.measureText(big).width);
    g.letterSpacing = '0px';
    text(g, big, left, y(top - 0.04), jfont(300, size), C.logo, 'left', 4);
  };
  switch (screen) {
    case 'title':
      head('A CLOCKWORK PUZZLE', 'CHRONOGRIP');
      break;
    case 'options':
      head(ctx.confirm ? 'ARE YOU SURE' : 'SETTINGS', ctx.confirm ? 'RESET?' : 'OPTIONS');
      {
        const line = ctx.confirm ? 'Clears the saved run. Best times stay.' : ctx.xr ? 'Grab a gear: pinch it, carry it, let go.' : ctx.narrow ? 'Grab a gear: touch and drag it.' : 'Grab a gear: click and drag it.';
        g.font = jfont(400, T.body * 0.85);
        text(g, line, left, y(l.height - 0.092), jfont(400, T.body * 0.85 * Math.min(1, (W - mm(2 * 24)) / g.measureText(line).width)), C.menuMuted, 'left', 0);
      }
      break;
    case 'stages':
      head('NEW GAME', 'CHOOSE A STAGE');
      break;
    case 'picker':
      head('PRACTICE', 'RANDOM LEVEL');
      text(g, 'A new puzzle each time. How hard?', left, y(l.height - 0.092), jfont(400, T.body * 0.85), C.menuMuted, 'left', 1);
      break;
    case 'paused':
      head('PAUSED', ctx.level >= ctx.levels - 1 ? (ctx.random ? `RANDOM · ${(ctx.difficulty ?? '').toUpperCase()}` : 'SHARED PUZZLE') : `${ctx.stage ? `${ctx.stage.toUpperCase()} · ` : ''}LEVEL ${ctx.level + 1}`);
      text(g, clock(ctx.time), left, y(l.height - 0.092), jfont(400, T.body * 0.9), C.menuMuted, 'left', 2);
      text(g, 'The board is hidden while paused', left, y(l.height - 0.108), jfont(400, T.body * 0.8), C.menuMuted, 'left', 0);
      break;
    case 'cleared': {
      const c = ctx.cleared!;
      const name = c.stage ?? ctx.stage ?? 'Stage';
      head(`STAGE CLEARED · ${name.toUpperCase()}`, 'GOOD JOB');
      text(g, `You solved ${name} in ${spoken(c.ms)}`, left, y(l.height - 0.094), jfont(400, T.body * 0.9), C.logo, 'left', 0);
      const rank = c.rank ?? 0;
      if (rank) text(g, rank === 1 ? 'New local best!' : `#${rank} on your local board`, left, y(l.height - 0.116), jfont(600, T.body * 0.8), C.amber, 'left', 1);
      const right = at(l.width / 2 - 0.024, 0)[0];
      (c.stages ?? []).forEach((st, i) => {
        const ry = y(l.height - 0.152 - i * 0.026);
        const col = st.current ? C.logo : C.menuMuted;
        text(g, st.current ? `${st.name} · this run` : st.name, left, ry, jfont(st.current ? 600 : 400, T.body * 0.85), col, 'left', 1);
        text(g, st.ms === null ? '—' : clockTenths(st.ms / 1000), right, ry, jfont(st.current ? 600 : 400, T.body * 0.85), col, 'right', 1);
      });
      break;
    }
    case 'countdown':
      text(g, 'GET READY', at(0, 0)[0], y(l.height - 0.03), jfont(600, T.eyebrow), C.amber, 'center', 6);
      text(g, String(ctx.countdown ?? 3), at(0, 0)[0], y(l.height / 2 - 0.01), jfont(300, 78), C.logo, 'center', 0);
      break;
    case 'about':
      head('ABOUT', 'CHRONOGRIP');
      drawAbout(g, l, ctx, at);
      break;
    case 'result': {
      const r = ctx.result!;
      head('RUN OVER', `LEVEL ${r.level} REACHED`, 22);
      text(g, clock(r.ms / 1000), left, y(l.height - 0.106), jfont(300, 24), C.logo, 'left', 3);
      break;
    }
    case 'initials': {
      const ini = ctx.initials!;
      text(g, ini.reached ? `LEVEL ${ini.reached} REACHED · #${ini.rank}` : `RUN COMPLETE · #${ini.rank}`, left, y(l.height - 0.02), jfont(600, T.eyebrow), C.amber, 'left', 6);
      text(g, clock(ini.ms / 1000), left, y(l.height - 0.062), jfont(300, 30), C.logo, 'left', 3);
      text(g, 'YOUR NAME', left, y(l.height - 0.1), jfont(400, T.body * 0.8), C.menuMuted, 'left', 4);
      break;
    }
    case 'board': {
      const b = ctx.board!;
      const grid = boardGrid(!!ctx.narrow);
      head(`${b.label.toUpperCase()} · FASTEST RUNS`, 'HIGH SCORES', 30, grid.headY + 0.02);
      const lowered = !!b.note;
      if (b.note) {
        const [nx, ny] = at(-l.width / 2 + 0.024, grid.y0);
        text(g, b.note, nx, ny + 1, jfont(400, ctx.narrow ? 10.5 : 10.5), C.menuMuted, 'left', 1);
      }
      if (!b.entries.length) {
        g.font = jfont(400, T.body * 0.8);
        const [ex, ey] = at(-l.width / 2 + 0.024, grid.y0 - ((grid.rows - 1) / 2) * grid.pitch);
        text(g, b.empty, ex, ey, jfont(400, T.body * 0.8 * Math.min(1, mm((l.width - 0.048) * 1000) / g.measureText(b.empty).width)), C.menuMuted, 'left');
        break;
      }
      const [size, small] = ctx.narrow ? [11.5, 11] : [12.5, 11.5];
      const cols = ctx.narrow ? { name: 0.026, time: 0.2 } : { name: 0.028, time: 0.2 };
      (lowered ? b.entries.slice(0, grid.rows - 1) : b.entries).forEach((e, n) => {
        const i = n + (lowered ? 1 : 0);
        const rowY = grid.y0 - (i % grid.rows) * grid.pitch;
        const x0 = -l.width / 2 + 0.024;
        const put = (s: string, dx: number, f: string, color: string, align: CanvasTextAlign) => {
          const [px, py] = at(x0 + dx, rowY);
          text(g, s, px, py + 1, f, color, align);
        };
        put(String(n + 1), 0, jfont(400, small), C.menuMuted, 'left');
        put(e.name, cols.name, jfont(600, size), C.menuHi, 'left');
        put(clockTenths(e.ms / 1000), cols.time, jfont(400, size), C.menuInk, 'right');
        put(formatDate(e.date), cols.time + 0.012, jfont(400, small), C.menuMuted, 'left'); // right after the time
      });
      break;
    }
  }
}


/** The bed under a menu's tab segments: a faint cream wash on the dark layer (the cream card colour made the grey tab words unreadable). */
function bed(g: Draw) {
  g.fillStyle = 'rgba(241,232,216,0.09)';
  g.fill();
}

function draw(g: Draw, screen: Screen, l: Layout, ctx: PanelCtx) {
  T = ctx.narrow ? NARROW : WIDE;
  const at = (x: number, y: number): [number, number] => [MARGIN + (x + l.width / 2) * PX, MARGIN + (l.height - y) * PX];
  const [W, H] = [l.width * PX, l.height * PX];
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  const menu = MENU_SCREENS.includes(screen);
  if (!menu) {
    // The game's cards are cream; a menu has no card: its words float on the dark layer (a flat view) or the dark backing panel (XR).
    g.save();
    g.shadowColor = C.shadow;
    g.shadowBlur = 30;
    g.shadowOffsetY = 10;
    g.beginPath();
    g.roundRect(MARGIN, MARGIN, W, H, mm(18));
    g.fillStyle = C.cream;
    g.fill();
    g.restore();
  }

  const left = (x: number) => at(-l.width / 2 + x, 0)[0];
  const right = (x: number) => at(l.width / 2 - x, 0)[0];
  const y = (v: number) => at(0, v)[1];
  const cx = at(0, 0)[0];
  const level = String(ctx.level + 1);
  const special = ctx.level >= ctx.levels - 1;
  const shared = special && !!ctx.shared;
  const random = special && !!ctx.random;
  const name = random ? `Random · ${ctx.difficulty ?? ''}` : shared ? 'Shared puzzle' : `Level ${level}`;
  if (screen === 'cleared') clearedCard(g, W, H);
  if (menu) drawMenu(g, screen, l, ctx, at);
  switch (screen) {
    case 'hud':
      // A shared puzzle reads "SHARED" over "Puzzle", and the time moves over to make room.
      // Random has no column split: one eyebrow line, "RANDOM · HARD", with the time under it at the left, so the difficulty is
      // never squeezed beside the time.
      const timeX = random ? 0.016 : shared ? 0.08 : ctx.stage ? (ctx.narrow ? 0.08 : 0.092) : 0.066; // "SHARED" and "MEDIUM · LEVEL" are wider than "LEVEL"
      // The heading shrinks to stop short of the time ("Step 12" is the widest).
      const headSize = (words: string) => {
        g.font = font(600, T.heading, SERIF);
        return T.heading * Math.min(1, mm((timeX - 0.016 - 0.008) * 1000) / g.measureText(words).width);
      };
      // A phone's card is too narrow for "MEDIUM · LEVEL" at a readable size: it reads the stage alone over the number.
      const eyebrow = random ? `RANDOM · ${(ctx.difficulty ?? '').toUpperCase()}` : shared ? 'SHARED' : ctx.stage ? (ctx.narrow ? ctx.stage.toUpperCase() : `${ctx.stage.toUpperCase()} · LEVEL`) : 'LEVEL';
      // On the wide card the longer words shrink to stop short of the time column.
      g.font = font(700, T.eyebrow);
      const eyebrowSize = ctx.narrow ? T.eyebrow : T.eyebrow * Math.min(1, mm((timeX - 0.016 - 0.006) * 1000) / (g.measureText(eyebrow).width + eyebrow.length));
      text(g, eyebrow, left(0.016), y(0.048), font(700, random ? T.eyebrow : eyebrowSize), C.muted, 'left', 1);
      if (!random) {
        if (shared) text(g, 'Puzzle', left(0.016), y(0.022), font(600, headSize('Puzzle'), SERIF), C.ink, 'left');
        else text(g, level, left(0.016), y(0.022), font(700, T.xl), C.ink, 'left');
        if (ctx.stage && !shared) {
          // "/ 20" after the number, so the card reads "EASY · LEVEL 2 / 20" like the page header.
          g.font = font(700, T.xl);
          text(g, `/ ${ctx.levels - 1}`, left(0.016) + g.measureText(level).width + mm(2), y(0.022), font(700, T.eyebrow), C.muted, 'left', 1);
        }
        text(g, 'TIME', left(timeX), y(0.048), font(700, T.eyebrow), C.muted, 'left', 1);
      }
      text(g, clock(ctx.time), left(timeX), y(0.022), font(700, T.xl), C.ink, 'left');
      if (ctx.timer) {
        ring(g, ctx.timer, left(RING.x), y(0.031), left(l.width - 0.008 - 0.046 - 0.006)); // up to 6 mm short of the pause button
        ringShown = true;
      }
      if (ctx.goal && ctx.fault) faultLine(g, ctx.fault, left(0.016), y(0.077), right(0.016) - left(0.016));
      else if (ctx.goal) goalLine(g, ctx.goal, left(0.016), y(0.077));
      break;
    case 'complete': {
      const pillEnd = status(g, 'SOLVED', left(0.016), y(0.146), 'left', T.body * 0.8);
      if (ctx.par) text(g, `PAR ${clock(ctx.par)}`, pillEnd + mm(5), y(0.146) + 1, font(700, T.eyebrow), C.muted, 'left', 1);
      // Shrunk, if need be, to stop short of the time at the right (a long name on a phone).
      const title = `${name} complete`;
      g.font = font(600, T.heading, SERIF);
      const titleSize = T.heading * Math.min(1, (right(0.016) - left(0.016) - mm(ctx.outcome === 'pass' ? 109 : 95)) / g.measureText(title).width); // a pass puts an amber check before the time
      text(g, title, left(0.016), y(0.11), font(600, titleSize, SERIF), C.ink, 'left');
      text(g, 'TIME', right(0.016), y(0.148), font(700, T.eyebrow), C.muted, 'right', 1);
      text(g, clock(ctx.time), right(0.016), y(0.11), font(700, T.xl), C.ink, 'right');
      if (ctx.outcome === 'pass') {
        // Under par: the amber check sits just before the time.
        g.font = font(700, T.xl);
        check(g, right(0.016) - g.measureText(clock(ctx.time)).width - mm(8), y(0.11));
      }
      break;
    }
  }
  if (l.track) {
    const [kx, ky] = at(l.track.x, l.track.y);
    pill(g, kx, ky, l.track.w * PX, l.track.h * PX);
    bed(g);
  }
  if (l.track2) {
    const [kx, ky] = at(l.track2.x, l.track2.y);
    pill(g, kx, ky, l.track2.w * PX, l.track2.h * PX);
    bed(g);
  }
  for (const b of l.buttons) button(g, b, at, ctx, menu);
  T = WIDE;
}

function canvasPlane(): { mesh: Mesh; g: Draw; tex: CanvasTexture } {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  mesh.renderOrder = 10;
  mesh.visible = false;
  return { mesh, g, tex };
}

/** The backing panel's margin round the card, and how far behind it it sits, metres. */
const BACKING_PAD = 0.02;
const BACKING_Z = 0.004;

function resize(p: { mesh: Mesh; g: Draw; tex: CanvasTexture }, w: number, h: number, centreY: number) {
  const [cw, ch] = [Math.round(w * PX) + 2 * MARGIN, Math.round(h * PX) + 2 * MARGIN];
  if (p.g.canvas.width !== cw || p.g.canvas.height !== ch) {
    p.g.canvas.width = cw;
    p.g.canvas.height = ch;
    p.tex.dispose(); // a new size needs a new GPU texture
  }
  p.mesh.scale.set(cw / PX, ch / PX, 1);
  p.mesh.position.set(0, centreY, 0);
}

const HINT_TEXT = 'Put the controllers down and use your hands';
/** Said when the detected table cannot hold the tray, so it stays at the default spot. */
export const SMALL_TABLE_TEXT = 'Table’s a bit small, tray kept in easy reach';

/** One panel at a time on the shared anchor, plus the hands hint floating above it. */
export function createPanels() {
  const root = new Group();
  root.name = 'panels';
  root.rotation.order = 'YXZ';
  const panel = canvasPlane();
  const hint = canvasPlane();
  const note = canvasPlane();
  // In AR the menus can't blank the view (passthrough stays): a 90% black panel sits just behind the card instead.
  const backing = canvasPlane();
  backing.mesh.renderOrder = 9;
  backing.mesh.position.z = -BACKING_Z;
  const cards = createStageCards();
  root.add(backing.mesh, panel.mesh, cards.group, hint.mesh, note.mesh);
  let key = '';
  let hasRing = false;
  let current: { screen: Screen; layout: Layout } | null = null;
  /** The words on the card up now, in panel space (metres): centre height y, left/centre x as drawn, font size. */
  let labels: { text: string; x: number; y: number; size: number; x0: number; x1: number }[] = [];

  const hintH = 0.03;
  /** Side room between a pill's end and its words, metres. */
  const PILL_PAD = 0.02;
  /** Gap between the card and the first pill, and between pills, metres. */
  const PILL_GAP = 0.012;
  const textWidth = (words: string) => {
    hint.g.font = font(600, T.body);
    return hint.g.measureText(words).width / PX;
  };
  // Both pills share the width of the longer line, so they stack as one column centred over the card.
  const pillWidth = Math.max(...[HINT_TEXT, SMALL_TABLE_TEXT].map(textWidth)) + 2 * PILL_PAD;
  const drawPill = (p: ReturnType<typeof canvasPlane>, words: string, width = pillWidth) => {
    resize(p, width, hintH, 0);
    p.g.save();
    p.g.shadowColor = C.shadow;
    p.g.shadowBlur = 24;
    p.g.shadowOffsetY = 8;
    pill(p.g, p.g.canvas.width / 2, p.g.canvas.height / 2, width * PX, hintH * PX);
    p.g.fillStyle = C.cream;
    p.g.fill();
    p.g.restore();
    text(p.g, words, p.g.canvas.width / 2, p.g.canvas.height / 2 + 1, font(600, T.body), C.ink);
    p.tex.needsUpdate = true;
  };
  drawPill(hint, HINT_TEXT);
  drawPill(note, SMALL_TABLE_TEXT);
  note.mesh.visible = false;

  return {
    root,
    panelMesh: panel.mesh,
    get current() {
      return current;
    },
    /** Whether the AR backing panel is up behind the card (the test hook reads it). */
    get backing() {
      return backing.mesh.visible;
    },
    get labels() {
      return labels;
    },
    /** Whether the card up now is a HUD with the countdown ring on it (the test hook reads it). */
    get ring() {
      return hasRing && !!current && panel.mesh.visible;
    },
    /** The floating pills for the test hook: words, measured text width, side padding and pill width, metres. */
    get pills() {
      return [HINT_TEXT, SMALL_TABLE_TEXT].map((words) => ({ text: words, textWidth: textWidth(words), padding: PILL_PAD, width: pillWidth }));
    },
    setAnchor(a: Anchor) {
      root.position.set(...a.position);
      root.rotation.set(a.pitch, a.yaw, 0);
      root.scale.setScalar(a.scale ?? 1);
      // The phone card (scaled, just in front of the eye) draws over everything; in XR a real hand still hides the card.
      (panel.mesh.material as MeshBasicMaterial).depthTest = a.scale === undefined;
      (backing.mesh.material as MeshBasicMaterial).depthTest = a.scale === undefined;
      cards.setDepth(a.scale === undefined);
    },
    /** One frame of the stage cards' float and pan (a no-op while they are not up). */
    tick(now: number) {
      cards.update(now);
    },
    get stageCards() {
      return cards.state();
    },
    show(screen: Screen | null, ctx: PanelCtx) {
      const next = screen && JSON.stringify([screen, { ...ctx, time: clock(ctx.time) }]);
      if (next === key) return;
      key = next ?? '';
      panel.mesh.visible = screen !== null;
      if (!screen) backing.mesh.visible = false;
      current = null;
      if (!screen) cards.set([], { hover: null, bests: {}, narrow: false });
      if (!screen) return;
      const l = layout(screen, ctx);
      current = { screen, layout: l };
      cards.set(screen === 'stages' ? l.buttons : [], { hover: ctx.hover, bests: ctx.bests ?? {}, narrow: !!ctx.narrow });
      resize(panel, l.width, l.height, l.height / 2);
      drawn = [];
      ringShown = false;
      draw(panel.g, screen, l, ctx);
      hasRing = ringShown;
      labels = drawn.map((d) => ({ text: d.text, x: (d.x - MARGIN) / PX - l.width / 2, y: l.height - (d.y - MARGIN) / PX, size: d.px / PX, x0: (d.x0 - MARGIN) / PX - l.width / 2, x1: (d.x1 - MARGIN) / PX - l.width / 2 }));
      drawn = null;
      panel.tex.needsUpdate = true;
      backing.mesh.visible = !!ctx.xr && MENU_SCREENS.includes(screen);
      if (backing.mesh.visible) {
        const [bw, bh] = [l.width + 2 * BACKING_PAD, l.height + 2 * BACKING_PAD];
        resize(backing, bw, bh, l.height / 2);
        backing.mesh.position.z = -BACKING_Z;
        backing.g.clearRect(0, 0, backing.g.canvas.width, backing.g.canvas.height);
        pill(backing.g, backing.g.canvas.width / 2, backing.g.canvas.height / 2, bw * PX, bh * PX, mm(24));
        backing.g.globalAlpha = SCRIM_OPACITY;
        backing.g.fillStyle = C.scrim;
        backing.g.fill();
        backing.tex.needsUpdate = true;
      }
      hint.mesh.position.y = l.height + PILL_GAP + hintH / 2;
      note.mesh.position.y = hint.mesh.position.y + hintH + PILL_GAP;
    },
    showHint(visible: boolean) {
      hint.mesh.visible = visible;
    },
    showNote(visible: boolean) {
      note.mesh.visible = visible;
    },
  };
}
