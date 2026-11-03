import type { Level } from './levels';
import { BIRD, DIAL_AT, KNOB_TOP } from './clockwork';
import { BOARD_MARGIN, TRAY_HALF, ledgeFar, partsStrip, trayToWorld, type TrayPose, type Vec3 } from './seat';
import { SCREENS, layout, panelAnchor, panelToWorld, type Anchor, type Screen } from './ui';

/**
 * Desktop preview framing (outside XR). The tuned three-quarter view: from above, behind and a little right of the seated
 * head, looking at the board. On a narrow screen the camera backs off along the same line until everything fits.
 */
export const DESKTOP_EYE: Vec3 = [0.107, 0.225, 0.364];
export const DESKTOP_TARGET: Vec3 = [0.015, -0.08, -0.36];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Pixels kept clear at each edge of the view. */
export type Margin = { top: number; right: number; bottom: number; left: number };
type View = { target: Vec3; dir: Vec3; fovDeg: number; width: number; height: number };

/** The camera's right, up and back axes when it looks at the target from along `dir` with world up. */
function axes(dir: Vec3): [Vec3, Vec3, Vec3] {
  const z = unit(dir);
  const x = unit(cross([0, 1, 0], z));
  return [x, cross(z, x), z];
}

/**
 * The least distance from `target`, along `dir` (target towards the eye), at which a camera looking at `target` with
 * world up sees every point inside the view less its margins. Vertical field of view in degrees, view size in pixels.
 */
export function fitDistance(o: View & { margin: Margin; points: readonly Vec3[] }): number {
  const [x, y, z] = axes(o.dir);
  const tanV = Math.tan((o.fovDeg * Math.PI) / 360);
  const tanH = tanV * (o.width / o.height);
  // The clear part of the view in normalised device coordinates (-1..1, +Y up).
  const [left, right] = [-1 + (2 * o.margin.left) / o.width, 1 - (2 * o.margin.right) / o.width];
  const [bottom, top] = [-1 + (2 * o.margin.bottom) / o.height, 1 - (2 * o.margin.top) / o.height];
  let d = 0;
  for (const p of o.points) {
    const q: Vec3 = [p[0] - o.target[0], p[1] - o.target[1], p[2] - o.target[2]];
    const [qx, qy, qz] = [dot(q, x), dot(q, y), dot(q, z)];
    // A point at depth d - qz projects to qx / ((d - qz) tanH); solve for the d that puts it on the clear edge.
    const needX = qx / ((qx > 0 ? right : left) * tanH);
    const needY = qy / ((qy > 0 ? top : bottom) * tanV);
    d = Math.max(d, qz + Math.max(needX || 0, needY || 0));
  }
  return d;
}

/** Page pixels of a world point seen from `d` along the view's `dir`. */
function toPixel(o: View, d: number, p: Vec3): [number, number] {
  const [x, y, z] = axes(o.dir);
  const q: Vec3 = [p[0] - o.target[0], p[1] - o.target[1], p[2] - o.target[2]];
  const tanV = Math.tan((o.fovDeg * Math.PI) / 360);
  const depth = d - dot(q, z);
  return [((dot(q, x) / (depth * tanV * (o.width / o.height)) + 1) / 2) * o.width, ((1 - dot(q, y) / (depth * tanV)) / 2) * o.height];
}

/** The page header in pixels: the wordmark ends at `left`, the Enter MR column starts at `right`, both above `bottom`. */
export type Header = { left: number; right: number; bottom: number };

/**
 * How far from the target the desktop camera sits: never nearer than `base` (the tuned landscape view), and far enough
 * that every point fits the view. Content that reaches up into a header corner is kept under the header; content that
 * fits between the wordmark and the Enter MR column may rise beside them.
 */
export function desktopDistance(o: View & { base: number; margin: Margin; header: Header; points: readonly Vec3[] }): number {
  const fit = (top: number) => Math.max(o.base, fitDistance({ ...o, margin: { ...o.margin, top } }));
  const d = fit(o.margin.top);
  const clash = o.points.some((p) => {
    const [x, y] = toPixel(o, d, p);
    return y < o.header.bottom && (x < o.header.left || x > o.header.right);
  });
  return clash ? fit(o.header.bottom + o.margin.top) : d;
}

/**
 * The anchor turned (yaw, then pitch; no roll) so the card lies parallel to the screen of a camera whose backward axis
 * (target towards the eye) is `back`: seen face on, no keystone. Its bottom centre stays put.
 */
export function faceView(a: Anchor, back: Vec3): Anchor {
  const [x, y, z] = unit(back);
  // The card's normal is (cos p sin y, -sin p, cos p cos y) (src/ui.ts panelToWorld).
  return { position: a.position, pitch: -Math.asin(y), yaw: Math.atan2(x, z) };
}

/** Height of the gears and pins above the board top, metres: a generous top for the board's box. */
const PARTS_TOP = 0.04;
const BOARD_THICKNESS = 0.018;

/**
 * Points of a level that must stay in the desktop view: the board and the ledge with its parts (as wide as the level's
 * strip), the escapement dial, the bird standing on its bracket, and the cards of `screens` (default all) turned face on
 * to a camera looking along -`back`. `levels` is how many tiles the select card shows.
 */
export function viewContent(level: Level, levels: number, pose: TrayPose, back: Vec3, screens: readonly Screen[] = SCREENS): Vec3[] {
  const out: Vec3[] = [];
  const nearY = -TRAY_HALF.y - BOARD_MARGIN;
  const far = ledgeFar(level);
  const ledgeHalf = Math.max(TRAY_HALF.x, ...partsStrip(level).map((s) => Math.abs(s.x) + s.radius)) + 0.02;
  for (const lift of [-BOARD_THICKNESS, PARTS_TOP]) {
    for (const sx of [-1, 1]) {
      out.push(trayToWorld(sx * (TRAY_HALF.x + BOARD_MARGIN), nearY, lift, pose), trayToWorld(sx * ledgeHalf, far, lift, pose));
    }
  }
  const anchor = faceView(panelAnchor(level, pose), back);
  for (const s of screens) {
    const l = layout(s, { level: 0, levels, daily: true });
    for (const [sx, k] of [[-1, 0], [1, 0], [-1, 1], [1, 1]] as const) out.push(panelToWorld(anchor, [(sx * l.width) / 2, k * l.height, 0]));
  }
  out.push(trayToWorld(DIAL_AT[0], DIAL_AT[1], KNOB_TOP, pose));
  // The bird stands upright whatever the tray's tilt: its base on the bracket, its head straight up from there.
  const [bx, by, bz] = trayToWorld(BIRD.x, BIRD.y, 0, pose);
  for (const dx of [-BIRD.radius, BIRD.radius]) out.push([bx + dx, by, bz], [bx + dx, by + BIRD.height, bz]);
  return out;
}
