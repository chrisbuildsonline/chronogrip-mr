import { CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { clock, layout, type Anchor, type Button, type Layout, type Screen } from './ui';

/** Canvas drawing of the in-world panels, per design/DESIGN.md. */
const C = { cream: '#f6efe2', deep: '#ebe0cc', ink: '#1c1712', muted: '#7d6f5f', amber: '#d99a2b', tint: '#f3dcae', tintInk: '#7a4e0e', shadow: 'rgba(20,12,4,0.35)' };
const PX = 3000; // canvas pixels per metre: 3 px per mm
const MARGIN = 48; // room for the soft shadow
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const mm = (v: number) => v * 3;
/** Type scale in panel millimetres (design/DESIGN.md). */
const T = { display: 26, xl: 24, heading: 16, button: 12, body: 9.5, eyebrow: 8 };
const font = (weight: number, sizeMm: number, face = SANS) => `${weight} ${mm(sizeMm)}px ${face}`;

export type PanelCtx = { level: number; levels: number; time: number; best: readonly (number | null)[]; hover: string | null };

type Draw = CanvasRenderingContext2D;

function pill(g: Draw, x: number, y: number, w: number, h: number, r = h / 2) {
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, r);
}

function text(g: Draw, s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'center', tracking = 0) {
  g.font = f;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.letterSpacing = `${tracking}px`;
  g.fillText(s, x, y);
  g.letterSpacing = '0px';
}

/** A short tinted status pill centred (or left/right aligned) at x, y. */
function status(g: Draw, s: string, x: number, y: number, align: 'left' | 'center' = 'center') {
  g.font = font(700, 6.5);
  g.letterSpacing = '1px';
  const w = g.measureText(s).width + mm(7);
  g.letterSpacing = '0px';
  const cx = align === 'left' ? x + w / 2 : x;
  pill(g, cx, y, w, mm(12));
  g.fillStyle = C.tint;
  g.fill();
  text(g, s, cx, y + 1, font(700, T.eyebrow), C.tintInk, 'center', 1);
}

function button(g: Draw, b: Button, at: (x: number, y: number) => [number, number], ctx: PanelCtx, index: number) {
  const [x, y] = at(b.x, b.y);
  const [w, h] = [b.w * PX, b.h * PX];
  const hover = ctx.hover === b.id;
  if (b.kind === 'tile') pill(g, x, y, w, h, mm(12));
  else if (b.kind === 'icon') {
    g.beginPath();
    g.arc(x, y, h / 2, 0, Math.PI * 2);
  } else pill(g, x, y, w, h);
  g.fillStyle = b.kind === 'primary' ? (hover ? '#33291f' : C.ink) : hover ? '#e2d3b8' : C.deep;
  g.fill();
  if (hover) {
    g.lineWidth = mm(3);
    g.strokeStyle = C.amber;
    g.stroke();
  }
  if (b.kind === 'icon') {
    g.fillStyle = C.ink;
    for (const dx of [-mm(3.2), mm(3.2)]) g.fillRect(x + dx - mm(1.5), y - mm(6), mm(3), mm(12));
  } else if (b.kind === 'tile') {
    const best = ctx.best[index];
    text(g, b.label, x, y - (best == null ? 0 : mm(9)), font(700, T.xl), C.ink);
    if (best != null) status(g, clock(best), x, y + mm(20));
  } else text(g, b.label, x, y + 1, font(600, T.button), b.kind === 'primary' ? C.cream : C.ink);
}

function draw(g: Draw, screen: Screen, l: Layout, ctx: PanelCtx) {
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
  const level = String(ctx.level + 1);
  switch (screen) {
    case 'title':
      text(g, 'A CLOCKWORK PUZZLE', cx, y(0.128), font(700, T.eyebrow), C.muted, 'center', 3);
      text(g, 'ChronoGrip', cx, y(0.093), font(600, T.display, SERIF), C.ink);
      break;
    case 'select':
      text(g, 'Levels', cx, y(0.12), font(600, T.heading, SERIF), C.ink);
      break;
    case 'hud':
      text(g, 'LEVEL', left(0.016), y(0.048), font(700, T.eyebrow), C.muted, 'left', 1);
      text(g, level, left(0.016), y(0.022), font(700, T.xl), C.ink, 'left');
      text(g, 'TIME', left(0.066), y(0.048), font(700, T.eyebrow), C.muted, 'left', 1);
      text(g, clock(ctx.time), left(0.066), y(0.022), font(700, T.xl), C.ink, 'left');
      break;
    case 'complete':
      status(g, 'SOLVED', left(0.016), y(0.148), 'left');
      text(g, `Level ${level} complete`, left(0.016), y(0.11), font(600, T.heading, SERIF), C.ink, 'left');
      text(g, 'TIME', right(0.016), y(0.148), font(700, T.eyebrow), C.muted, 'right', 1);
      text(g, clock(ctx.time), right(0.016), y(0.11), font(700, T.xl), C.ink, 'right');
      break;
    case 'paused':
      text(g, 'Paused', cx, y(0.118), font(600, T.heading, SERIF), C.ink);
      text(g, `Level ${level}  ·  ${clock(ctx.time)}`, cx, y(0.087), font(500, T.body), C.muted);
      break;
  }
  l.buttons.forEach((b, i) => button(g, b, at, ctx, i));
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
    setAnchor(a: Anchor) {
      root.position.set(...a.position);
      root.rotation.set(a.pitch, a.yaw, 0);
    },
    show(screen: Screen | null, ctx: PanelCtx) {
      const next = screen && JSON.stringify([screen, ctx.level, ctx.levels, Math.floor(ctx.time), ctx.best, ctx.hover]);
      if (next === key) return;
      key = next ?? '';
      panel.mesh.visible = screen !== null;
      current = null;
      if (!screen) return;
      const l = layout(screen, ctx);
      current = { screen, layout: l };
      resize(panel, l.width, l.height, l.height / 2);
      draw(panel.g, screen, l, ctx);
      panel.tex.needsUpdate = true;
      hint.mesh.position.y = l.height + 0.012 + hintH / 2;
    },
    showHint(visible: boolean) {
      hint.mesh.visible = visible;
    },
  };
}
