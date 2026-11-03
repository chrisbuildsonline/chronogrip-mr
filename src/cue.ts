import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { Placement } from './anchor';
import { C } from './palette';
import type { PlaceWhy } from './persist';
import { BOARD_MARGIN, TRAY_HALF, trayToWorld, type Vec3 } from './seat';
import { easeOut } from './tween';

/**
 * "Table found": when a plane places the tray, a brass chapter ring (a watch dial's bezel and minute track) sweeps out
 * across the table from the tray's rim, so the player knows the game saw their table. A restored pose gets a fainter
 * pulse that grows less. The default fallback gets nothing: no table was found.
 */
export type CueKind = 'plane' | 'restored';

export const CUE_MS: Record<CueKind, number> = { plane: 1000, restored: 1200 };
export const CUE_COLORS = { ring: C.amber, lines: C.brass, glow: C.tint, engrave: C.tintInk } as const;

const LOOK: Record<CueKind, { peak: number; grow: number; echo: number }> = {
  plane: { peak: 1, grow: 0.5, echo: 0.45 },
  restored: { peak: 0.7, grow: 0.18, echo: 0 },
};
/** Where the bold band starts, as a fraction of the dial's radius; the minute track and the glow lie outside it. */
const BAND_IN = 0.72;
const BAND_OUT = 0.86;
/**
 * The cue lies just under the board top, so anything inside the board's footprint is hidden. The band starts 3 cm past
 * the board's corners (for its thickness seen at an angle) and only grows from there: the whole pulse shows.
 */
const START = Math.hypot(TRAY_HALF.x + BOARD_MARGIN, TRAY_HALF.y + BOARD_MARGIN) + 0.03;
/** The dial's radius at scale 1, metres. */
const RADIUS = START / BAND_IN;
/** The echo ring starts this far into the pulse. */
const ECHO_DELAY = 0.22;
const FADE_IN = 0.12;

export function cueFor(why: PlaceWhy, p: Placement): CueKind | null {
  if (why === 'saved' || why === 'anchor') return 'restored';
  return p.source === 'plane' ? 'plane' : null;
}

/** Fades in over the first 12%, holds near full while it sweeps, then eases out. */
const fade = (t: number) => (t < 0 || t >= 1 ? 0 : t < FADE_IN ? t / FADE_IN : 0.5 * (1 + Math.cos((Math.PI * (t - FADE_IN)) / (1 - FADE_IN))));

/** The pulse `ms` after it started: ring scale (1 = RADIUS), opacity, a slow turn of the bezel, and the trailing echo ring. */
export function cueAt(kind: CueKind, ms: number) {
  const look = LOOK[kind];
  const t = ms / CUE_MS[kind];
  const te = (t - ECHO_DELAY) / (1 - ECHO_DELAY);
  const visible = t >= 0 && t < 1;
  return {
    visible,
    scale: 1 + look.grow * easeOut(t),
    opacity: look.peak * fade(t),
    spin: (Math.PI / 6) * easeOut(t),
    echo: { scale: 1 + 0.85 * look.grow * easeOut(te), opacity: visible ? look.peak * look.echo * fade(te) : 0 },
  };
}

/** The bold band's inner edge `ms` into the pulse, metres from the tray's centre. */
export const bandInner = (kind: CueKind, ms: number) => BAND_IN * RADIUS * cueAt(kind, ms).scale;

/** Where the ring lies: in the tray's own plane, centred, just under the board top, so it grows out past the rim. */
export function cueSpot(p: Placement): { position: Vec3; tilt: number; yaw: number } {
  return { position: trayToWorld(0, 0, -0.008, p.pose), tilt: p.pose.tilt, yaw: p.pose.yaw ?? 0 };
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

const NUMERALS = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

/**
 * The dial, drawn once (radii as fractions of its edge): a warm light spill; a bold polished brass bezel with shaded
 * edges, a bright crest, a turning sheen and engraved Roman hours; fine brass lines; and a minute track outside it, with
 * bold five-minute marks and lozenges at the quarters.
 */
function chapterRing(): CanvasTexture {
  const S = 1024;
  const R = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  g.translate(R, R);
  const annulus = (r0: number, r1: number) => {
    g.beginPath();
    g.arc(0, 0, r1 * R, 0, Math.PI * 2);
    g.arc(0, 0, r0 * R, 0, Math.PI * 2, true);
  };
  const radial = (stops: [number, string][]) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    for (const [at, color] of stops) gr.addColorStop(at, color);
    return gr;
  };
  const circle = (r: number, width: number, color: string) => {
    g.beginPath();
    g.arc(0, 0, r * R, 0, Math.PI * 2);
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
  };
  const { ring, lines, glow, engrave } = CUE_COLORS;

  // Light spill on the table both sides of the bezel.
  annulus(BAND_IN - 0.1, 1);
  g.fillStyle = radial([[BAND_IN - 0.1, rgba(glow, 0)], [BAND_IN, rgba(glow, 0.34)], [0.93, rgba(glow, 0.26)], [1, rgba(glow, 0)]]);
  g.fill();

  // The bezel: shaded at both edges, amber through, a bright crest just outside its middle.
  annulus(BAND_IN, BAND_OUT);
  const mid = (BAND_IN + BAND_OUT) / 2;
  g.fillStyle = radial([
    [BAND_IN, engrave],
    [BAND_IN + 0.012, lines],
    [BAND_IN + 0.03, ring],
    [mid, ring],
    [mid + 0.012, glow],
    [mid + 0.026, ring],
    [BAND_OUT - 0.012, lines],
    [BAND_OUT, engrave],
  ]);
  g.fill();
  // Polished metal: broad light and shade around the ring, clipped to the bezel.
  g.save();
  annulus(BAND_IN, BAND_OUT);
  g.clip();
  const sheen = g.createConicGradient(-Math.PI / 3, 0, 0);
  for (let i = 0; i <= 8; i++) sheen.addColorStop(i / 8, i % 2 ? rgba(engrave, 0.28) : rgba(glow, 0.32));
  g.fillStyle = sheen;
  g.fillRect(-R, -R, S, S);
  g.restore();

  // Engraved hours on the bezel, read from outside the ring: a dark cut with a light lip below it.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(0.072 * R)}px Georgia, "Times New Roman", serif`;
  NUMERALS.forEach((n, i) => {
    g.save();
    g.rotate((i / 12) * Math.PI * 2);
    g.translate(0, -mid * R);
    g.fillStyle = rgba(glow, 0.7);
    g.fillText(n, 0, 2);
    g.fillStyle = rgba(engrave, 0.92);
    g.fillText(n, 0, 0);
    g.restore();
  });

  // Fine lines either side of the minute track.
  circle(BAND_IN, 3, engrave);
  circle(BAND_OUT, 3, engrave);
  circle(BAND_OUT + 0.014, 2.5, lines);
  circle(0.95, 4, lines);
  for (let i = 0; i < 60; i++) {
    const five = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const [r0, r1] = five ? [BAND_OUT + 0.014, 0.95] : [BAND_OUT + 0.04, 0.95];
    g.beginPath();
    g.moveTo(c * r0 * R, s * r0 * R);
    g.lineTo(c * r1 * R, s * r1 * R);
    g.lineCap = 'round';
    g.lineWidth = five ? 11 : 5;
    g.strokeStyle = five ? ring : lines;
    g.stroke();
  }
  // A lozenge outside the track at each quarter.
  for (let q = 0; q < 4; q++) {
    g.save();
    g.rotate((q * Math.PI) / 2);
    g.beginPath();
    g.moveTo(0, -0.958 * R);
    g.lineTo(0.022 * R, -0.977 * R);
    g.lineTo(0, -0.996 * R);
    g.lineTo(-0.022 * R, -0.977 * R);
    g.closePath();
    g.fillStyle = ring;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = engrave;
    g.stroke();
    g.restore();
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export type PlaceCue = {
  root: Group;
  /** Starts a pulse at this placement; a restored pose that is refined while its pulse runs just moves it. */
  start(kind: CueKind, p: Placement, now: number): void;
  update(now: number): void;
  /** Pins a running pulse at this fraction of its length, for screenshots; null lets it go (it is over by then, so it ends). */
  hold(progress: number | null): void;
  hide(): void;
  readonly state: { kind: CueKind | null; showing: boolean; count: number };
};

export function createPlaceCue(): PlaceCue {
  const root = new Group();
  root.name = 'place-cue';
  root.visible = false;
  const map = chapterRing();
  const geometry = new PlaneGeometry(2 * RADIUS, 2 * RADIUS).rotateX(-Math.PI / 2);
  // Depth-tested, so real hands (the depth-only occluders) hide it; drawn after the tray's soft shadow, which lies under it.
  const disc = () => {
    const m = new Mesh(geometry, new MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide }));
    m.renderOrder = 1;
    return m;
  };
  const ring = disc();
  const echo = disc();
  root.add(ring, echo);
  const state: PlaceCue['state'] = { kind: null, showing: false, count: 0 };
  let since = -Infinity;
  let held: number | null = null;

  return {
    root,
    state,
    start(kind, p, now) {
      const spot = cueSpot(p);
      root.position.set(...spot.position);
      root.rotation.set(spot.tilt, spot.yaw, 0, 'YXZ'); // as the tray: yaw outside the tilt
      if (state.showing && state.kind === kind && kind === 'restored') return;
      Object.assign(state, { kind, showing: true, count: state.count + 1 });
      since = now;
    },
    update(now) {
      if (!state.kind) return;
      const c = cueAt(state.kind, held === null || !state.showing ? now - since : held * CUE_MS[state.kind]);
      state.showing = root.visible = c.visible;
      if (!c.visible) return;
      ring.scale.setScalar(c.scale);
      ring.rotation.y = c.spin;
      (ring.material as MeshBasicMaterial).opacity = c.opacity;
      echo.visible = c.echo.opacity > 0.005;
      echo.scale.setScalar(c.echo.scale);
      echo.rotation.y = -c.spin;
      (echo.material as MeshBasicMaterial).opacity = c.echo.opacity;
    },
    hold(progress) {
      held = progress;
    },
    hide() {
      state.showing = root.visible = false;
      since = -Infinity;
    },
  };
}
