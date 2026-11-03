import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { clock, layout, type Anchor, type Button, type Layout, type Screen } from './ui';
import { C } from './palette';
import { rpmLabel, type Goal } from './goal';
import { FAULT_WORDS } from './fault';

/** Canvas drawing of the in-world panels, per design/DESIGN.md. */
const PX = 3000; // canvas pixels per metre: 3 px per mm
const MARGIN = 48; // room for the soft shadow
export const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const mm = (v: number) => v * 3;
/** Type scale in panel millimetres (design/DESIGN.md). */
const WIDE = { display: 36, xl: 24, heading: 18, button: 12.5, body: 13.5, eyebrow: 8.5 };
/** On a phone the small styles grow so every word is 12 px or more on screen; the rest already is. */
const NARROW = { ...WIDE, button: 14, eyebrow: 11 };
/** The scale for the card being drawn: `draw` sets it from ctx.narrow. */
let T = WIDE;
const font = (weight: number, sizeMm: number, face = SANS) => `${weight} ${mm(sizeMm)}px ${face}`;

/**
 * `best` is per level index; `newBest`: this solve beat a saved time; `goal`: what the HUD asks of the marked gear;
 * `fault`: what is wrong with the train as placed, shown on the HUD in place of the goal line.
 */
export type PanelCtx = {
  level: number;
  levels: number;
  daily: boolean;
  resume: boolean;
  newBest: boolean;
  time: number;
  best: readonly (number | null)[];
  hover: string | null;
  goal: Goal | null;
  fault?: keyof typeof FAULT_WORDS | null;
  /** A phone in portrait outside XR: the narrow layouts and the phone type scale. */
  narrow?: boolean;
};

const isDaily = (ctx: PanelCtx, i: number) => ctx.daily && i === ctx.levels - 1;

type Draw = CanvasRenderingContext2D;

function pill(g: Draw, x: number, y: number, w: number, h: number, r = h / 2) {
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, r);
}

/** A word or line drawn on the card, for the test hook: its text, canvas position and font size in canvas pixels. */
type Drawn = { text: string; x: number; y: number; px: number };
/** Collects the card's words while `draw` runs; null otherwise (the hint is not a card). */
let drawn: Drawn[] | null = null;

function text(g: Draw, s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'center', tracking = 0) {
  g.font = f;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.letterSpacing = `${tracking}px`;
  g.fillText(s, x, y);
  g.letterSpacing = '0px';
  drawn?.push({ text: s.trim(), x, y, px: Number(/([\d.]+)px/.exec(f)![1]) });
}

/** A short tinted status pill centred (or left/right aligned) at x, y; `size` is its text height in mm. */
function status(g: Draw, s: string, x: number, y: number, align: 'left' | 'center' | 'right' = 'center', size = T.eyebrow) {
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
}

/** A level tile: its number (or 'Daily'); once solved, the best time in muted text under it and a small amber check. */
function tile(g: Draw, b: Button, x: number, y: number, w: number, h: number, ctx: PanelCtx) {
  const i = Number(b.id.slice('level-'.length)) - 1;
  const best = ctx.best[i];
  const daily = isDaily(ctx, i);
  if (daily) {
    // The daily is set apart by an amber edge along its top.
    g.save();
    pill(g, x, y, w, h, mm(12));
    g.clip();
    g.fillStyle = C.amber;
    g.fillRect(x - w / 2, y - h / 2, w, mm(4));
    g.restore();
  }
  text(g, b.label, x, y - (best == null ? 0 : mm(8)), daily ? font(600, T.heading, SERIF) : font(700, T.xl), C.ink);
  if (best == null) return;
  text(g, clock(best), x, y + mm(16), font(700, T.body), C.muted);
  check(g, x + w / 2 - mm(9), y - h / 2 + mm(10));
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

/** A small amber disc with a cream tick: solved tiles, a matched goal. */
function check(g: Draw, cx: number, cy: number) {
  g.beginPath();
  g.arc(cx, cy, mm(5), 0, Math.PI * 2);
  g.fillStyle = C.amber;
  g.fill();
  g.beginPath();
  g.moveTo(cx - mm(2.4), cy + mm(0.1));
  g.lineTo(cx - mm(0.7), cy + mm(1.9));
  g.lineTo(cx + mm(2.5), cy - mm(1.8));
  g.lineWidth = mm(1.2);
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

function button(g: Draw, b: Button, at: (x: number, y: number) => [number, number], ctx: PanelCtx) {
  const [x, y] = at(b.x, b.y);
  const [w, h] = [b.w * PX, b.h * PX];
  const hover = ctx.hover === b.id;
  // A pill where it is wider than tall; a cell taller than wide (a tile, the phone's Back) gets the tile's corners.
  const tall = b.h > b.w;
  if (b.kind === 'tile' || tall) pill(g, x, y, w, h, mm(12));
  else if (b.kind === 'icon') {
    g.beginPath();
    g.arc(x, y, h / 2, 0, Math.PI * 2);
  } else pill(g, x, y, w, h);
  g.fillStyle = b.kind === 'primary' ? (hover ? C.inkHover : C.ink) : hover ? C.deepHover : C.deep;
  g.fill();
  if (hover) {
    g.lineWidth = mm(3);
    g.strokeStyle = C.amber;
    g.stroke();
  }
  if (b.kind === 'icon') {
    g.fillStyle = C.ink;
    for (const dx of [-mm(3.2), mm(3.2)]) g.fillRect(x + dx - mm(1.5), y - mm(6), mm(3), mm(12));
  } else if (b.kind === 'tile') tile(g, b, x, y, w, h, ctx);
  else if (b.id === 'back') backLabel(g, b.label, x, y, tall);
  else text(g, b.label, x, y + 1, font(600, T.button), b.kind === 'primary' ? C.cream : C.ink);
}

function draw(g: Draw, screen: Screen, l: Layout, ctx: PanelCtx) {
  T = ctx.narrow ? NARROW : WIDE;
  const at = (x: number, y: number): [number, number] => [MARGIN + (x + l.width / 2) * PX, MARGIN + (l.height - y) * PX];
  const [W, H] = [l.width * PX, l.height * PX];
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.save();
  g.shadowColor = C.shadow;
  g.shadowBlur = 30;
  g.shadowOffsetY = 10;
  g.beginPath();
  g.roundRect(MARGIN, MARGIN, W, H, mm(18));
  g.fillStyle = C.cream;
  g.fill();
  g.restore();

  const left = (x: number) => at(-l.width / 2 + x, 0)[0];
  const right = (x: number) => at(l.width / 2 - x, 0)[0];
  const y = (v: number) => at(0, v)[1];
  const cx = at(0, 0)[0];
  const daily = isDaily(ctx, ctx.level);
  const level = String(ctx.level + 1);
  const name = daily ? 'Daily' : `Level ${level}`;
  switch (screen) {
    case 'title':
      text(g, 'A CLOCKWORK PUZZLE', cx, y(0.128), font(700, T.eyebrow), C.muted, 'center', 3);
      text(g, 'ChronoGrip', cx, y(0.093), font(600, T.display, SERIF), C.ink);
      break;
    case 'select': {
      const solved = ctx.best.filter((b) => b != null).length;
      // The heading sits in the middle of the room over the targets (one row wide, two on a phone).
      const head = (Math.max(...l.buttons.map((b) => b.y + b.h / 2)) + l.height) / 2;
      text(g, 'Levels', left(0.016), y(head), font(600, T.heading, SERIF), C.ink, 'left');
      text(g, `${solved} of ${ctx.levels} solved`, right(0.016), y(head), font(600, T.body), C.muted, 'right');
      break;
    }
    case 'hud':
      text(g, 'LEVEL', left(0.016), y(0.048), font(700, T.eyebrow), C.muted, 'left', 1);
      if (daily) text(g, 'Daily', left(0.016), y(0.022), font(600, T.heading, SERIF), C.ink, 'left');
      else text(g, level, left(0.016), y(0.022), font(700, T.xl), C.ink, 'left');
      text(g, 'TIME', left(0.066), y(0.048), font(700, T.eyebrow), C.muted, 'left', 1);
      text(g, clock(ctx.time), left(0.066), y(0.022), font(700, T.xl), C.ink, 'left');
      if (ctx.goal && ctx.fault) faultLine(g, ctx.fault, left(0.016), y(0.077), right(0.016) - left(0.016));
      else if (ctx.goal) goalLine(g, ctx.goal, left(0.016), y(0.077));
      break;
    case 'complete': {
      status(g, 'SOLVED', left(0.016), y(0.146), 'left', T.body * 0.8);
      text(g, `${name} complete`, left(0.016), y(0.11), font(600, T.heading, SERIF), C.ink, 'left');
      text(g, 'TIME', right(0.016), y(0.148), font(700, T.eyebrow), C.muted, 'right', 1);
      text(g, clock(ctx.time), right(0.016), y(0.11), font(700, T.xl), C.ink, 'right');
      // Under the time: the New best pill, or the saved best this run did not beat.
      const best = ctx.best[ctx.level];
      if (ctx.newBest) status(g, 'NEW BEST', right(0.016), y(0.08), 'right', T.body * 0.8);
      else if (best != null && best < ctx.time) text(g, `Best ${clock(best)}`, right(0.016), y(0.08), font(600, T.body), C.muted, 'right');
      break;
    }
    case 'paused':
      text(g, 'Paused', cx, y(0.118), font(600, T.heading, SERIF), C.ink);
      text(g, `${name}  ·  ${clock(ctx.time)}`, cx, y(0.087), font(500, T.body), C.muted);
      break;
  }
  for (const b of l.buttons) button(g, b, at, ctx);
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

/** One panel at a time on the shared anchor, plus the hands hint floating above it. */
export function createPanels() {
  const root = new Group();
  root.name = 'panels';
  root.rotation.order = 'YXZ';
  const panel = canvasPlane();
  const hint = canvasPlane();
  root.add(panel.mesh, hint.mesh);
  let key = '';
  let current: { screen: Screen; layout: Layout } | null = null;
  /** The words on the card up now, in panel space (metres): centre height y, left/centre x as drawn, font size. */
  let labels: { text: string; x: number; y: number; size: number }[] = [];

  const hintW = 0.3;
  const hintH = 0.03;
  resize(hint, hintW, hintH, 0);
  hint.g.save();
  hint.g.shadowColor = C.shadow;
  hint.g.shadowBlur = 24;
  hint.g.shadowOffsetY = 8;
  pill(hint.g, hint.g.canvas.width / 2, hint.g.canvas.height / 2, hintW * PX, hintH * PX);
  hint.g.fillStyle = C.cream;
  hint.g.fill();
  hint.g.restore();
  text(hint.g, HINT_TEXT, hint.g.canvas.width / 2, hint.g.canvas.height / 2 + 1, font(600, T.body), C.ink);
  hint.tex.needsUpdate = true;

  return {
    root,
    panelMesh: panel.mesh,
    get current() {
      return current;
    },
    get labels() {
      return labels;
    },
    setAnchor(a: Anchor) {
      root.position.set(...a.position);
      root.rotation.set(a.pitch, a.yaw, 0);
      root.scale.setScalar(a.scale ?? 1);
      // The phone card (scaled, just in front of the eye) draws over everything; in XR a real hand still hides the card.
      (panel.mesh.material as MeshBasicMaterial).depthTest = a.scale === undefined;
    },
    show(screen: Screen | null, ctx: PanelCtx) {
      const next = screen && JSON.stringify([screen, { ...ctx, time: clock(ctx.time) }]);
      if (next === key) return;
      key = next ?? '';
      panel.mesh.visible = screen !== null;
      current = null;
      if (!screen) return;
      const l = layout(screen, ctx);
      current = { screen, layout: l };
      resize(panel, l.width, l.height, l.height / 2);
      drawn = [];
      draw(panel.g, screen, l, ctx);
      labels = drawn.map((d) => ({ text: d.text, x: (d.x - MARGIN) / PX - l.width / 2, y: l.height - (d.y - MARGIN) / PX, size: d.px / PX }));
      drawn = null;
      panel.tex.needsUpdate = true;
      hint.mesh.position.y = l.height + 0.012 + hintH / 2;
    },
    showHint(visible: boolean) {
      hint.mesh.visible = visible;
    },
  };
}
