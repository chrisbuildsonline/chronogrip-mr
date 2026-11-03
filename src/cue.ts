import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { Placement } from './anchor';
import { C } from './palette';
import type { PlaceWhy } from './persist';
import { trayToWorld, type Vec3 } from './seat';
import { easeOut } from './tween';

/**
 * "Table found": when a plane places the tray, a brass chapter ring (a watch dial's minute track) pulses out across
 * the table from under it, so the player knows the game saw their table. A restored pose gets a fainter, shorter pulse.
 * The default fallback gets nothing: no table was found.
 */
export type CueKind = 'plane' | 'restored';

export const CUE_MS: Record<CueKind, number> = { plane: 1000, restored: 1200 };
export const CUE_COLORS = { ring: C.amber, lines: C.brass, glow: C.tint } as const;

const LOOK: Record<CueKind, { peak: number; from: number; grow: number; echo: number }> = {
  plane: { peak: 1, from: 0.55, grow: 0.6, echo: 0.45 },
  restored: { peak: 0.55, from: 0.8, grow: 0.25, echo: 0 },
};
/** The ring's radius at scale 1, metres: just past the tray's corners. */
const RADIUS = 0.28;
/** The echo ring starts this far into the pulse. */
const ECHO_DELAY = 0.22;
const FADE_IN = 0.12;

export function cueFor(why: PlaceWhy, p: Placement): CueKind | null {
  if (why === 'saved' || why === 'anchor') return 'restored';
  return p.source === 'plane' ? 'plane' : null;
}

/** Fades in over the first 12%, then out, slower at first. */
const fade = (t: number) => (t < 0 || t >= 1 ? 0 : t < FADE_IN ? t / FADE_IN : (1 - (t - FADE_IN) / (1 - FADE_IN)) ** 1.6);

/** The pulse `ms` after it started: ring scale (1 = RADIUS), opacity, a slow turn of the bezel, and the trailing echo ring. */
export function cueAt(kind: CueKind, ms: number) {
  const look = LOOK[kind];
  const t = ms / CUE_MS[kind];
  const te = (t - ECHO_DELAY) / (1 - ECHO_DELAY);
  const visible = t >= 0 && t < 1;
  return {
    visible,
    scale: look.from + look.grow * easeOut(t),
    opacity: look.peak * fade(t),
    spin: (Math.PI / 6) * easeOut(t),
    echo: { scale: look.from + 0.85 * look.grow * easeOut(te), opacity: visible ? look.peak * look.echo * fade(te) : 0 },
  };
}

/** Where the ring lies: in the tray's own plane, centred, just under the board top, so it grows out past the rim. */
export function cueSpot(p: Placement): { position: Vec3; tilt: number; yaw: number } {
  return { position: trayToWorld(0, 0, -0.008, p.pose), tilt: p.pose.tilt, yaw: p.pose.yaw ?? 0 };
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/** The chapter ring, drawn once: a soft amber glow, a bold amber band between fine brass lines, and 60 minute ticks with longer five-minute marks. */
function chapterRing(): CanvasTexture {
  const S = 512;
  const R = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  g.translate(R, R);
  const glow = g.createRadialGradient(0, 0, 0.62 * R, 0, 0, R);
  glow.addColorStop(0, rgba(CUE_COLORS.glow, 0));
  glow.addColorStop(0.7, rgba(CUE_COLORS.glow, 0.32));
  glow.addColorStop(1, rgba(CUE_COLORS.glow, 0));
  g.fillStyle = glow;
  g.fillRect(-R, -R, S, S);
  const circle = (r: number, width: number, color: string) => {
    g.beginPath();
    g.arc(0, 0, r * R, 0, Math.PI * 2);
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
  };
  circle(0.9, 0.06 * R, CUE_COLORS.ring);
  circle(0.955, 3, CUE_COLORS.lines);
  circle(0.78, 2, CUE_COLORS.lines);
  for (let i = 0; i < 60; i++) {
    const five = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const [r0, r1] = five ? [0.72, 0.84] : [0.79, 0.84];
    g.beginPath();
    g.moveTo(c * r0 * R, s * r0 * R);
    g.lineTo(c * r1 * R, s * r1 * R);
    g.lineWidth = five ? 6 : 2;
    g.strokeStyle = five ? CUE_COLORS.ring : CUE_COLORS.lines;
    g.stroke();
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
  hide(): void;
  readonly state: { kind: CueKind | null; showing: boolean; count: number };
};

export function createPlaceCue(): PlaceCue {
  const root = new Group();
  root.name = 'place-cue';
  root.visible = false;
  const map = chapterRing();
  const geometry = new PlaneGeometry(2 * RADIUS, 2 * RADIUS).rotateX(-Math.PI / 2);
  const disc = () => new Mesh(geometry, new MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide }));
  const ring = disc();
  const echo = disc();
  root.add(ring, echo);
  const state: PlaceCue['state'] = { kind: null, showing: false, count: 0 };
  let since = -Infinity;

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
      const c = cueAt(state.kind, now - since);
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
    hide() {
      state.showing = root.visible = false;
      since = -Infinity;
    },
  };
}
