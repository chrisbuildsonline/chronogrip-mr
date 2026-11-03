import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, SRGBColorSpace } from 'three';
import { gearRadii } from './gear';
import { BADGE, badgeSpot, rpmLabel, type Goal } from './goal';
import type { Level } from './levels';
import { C } from './palette';
import { SANS, turnArrow } from './panels';
import { trayLocal } from './seat';

/** Canvas pixels per metre of badge: 10 px per mm, sharp from the seat. */
const PX = 10_000;
/** Room round the pill for its soft shadow, pixels. */
const PAD = 26;
/** Just above the board, under every gear's lift, so a carried gear passes over it. */
const LIFT = 0.0015;

/**
 * The goal on the board, per design/DESIGN.md: a cream pill lying on the tray beside the target gear with the turn
 * arrow and the rpm, turning amber once the train matches it, and a fine amber ring round the target gear that marks
 * it. Two meshes, children of the tray.
 */
export function createGoalBadge() {
  const root = new Group();
  root.name = 'goal';
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(BADGE.w * PX) + 2 * PAD;
  canvas.height = Math.round(BADGE.h * PX) + 2 * PAD;
  const g = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  const badge = new Mesh(
    new PlaneGeometry(canvas.width / PX, canvas.height / PX).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  badge.renderOrder = 2;
  const ring = new Mesh(new RingGeometry(1, 1.06, 96).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: C.amber, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }));
  ring.renderOrder = 2;
  root.add(badge, ring);
  root.visible = false;
  let shown = '';

  const draw = (goal: Goal, wrongWay: boolean) => {
    const [w, h] = [BADGE.w * PX, BADGE.h * PX];
    const [x0, y0] = [PAD, PAD];
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.save();
    g.shadowColor = C.shadow;
    g.shadowBlur = 16;
    g.shadowOffsetY = 5;
    g.beginPath();
    g.roundRect(x0, y0, w, h, h / 2);
    g.fillStyle = goal.matched ? C.amber : C.cream;
    g.fill();
    g.restore();
    const cy = y0 + h / 2;
    // Wrong way: the arrow the target should follow turns red (a touch bolder), so the badge says which way is wanted.
    turnArrow(g, x0 + h * 0.56, cy, h * 0.25, goal.dir, wrongWay ? C.jamInk : C.ink, h * (wrongWay ? 0.1 : 0.08));
    // The number large, "rpm" smaller after it on the same baseline; the pair shrinks only if a long daily number needs it.
    const [num, unit] = rpmLabel(goal.rpm).split(' ') as [string, string];
    const left = x0 + h * 1.02;
    const room = x0 + w - h * 0.4 - left;
    let [size, unitSize] = [h * 0.6, h * 0.42];
    const widths = () => {
      g.font = `700 ${size}px ${SANS}`;
      const n = g.measureText(num).width;
      g.font = `700 ${unitSize}px ${SANS}`;
      return [n, g.measureText(unit).width] as const;
    };
    let [numW, unitW] = widths();
    const k = Math.min(1, room / (numW + h * 0.1 + unitW));
    [size, unitSize] = [size * k, unitSize * k];
    [numW, unitW] = widths();
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    const base = cy + size * 0.36;
    g.font = `700 ${size}px ${SANS}`;
    g.fillStyle = C.ink;
    g.fillText(num, left, base);
    g.font = `700 ${unitSize}px ${SANS}`;
    g.fillStyle = goal.matched ? C.ink : C.muted;
    g.fillText(unit, left + numW + h * 0.1 * k, base);
    tex.needsUpdate = true;
  };

  return {
    root,
    /** Badge centre in tray-local space, for the test hook; null when hidden. */
    get at() {
      return root.visible ? badge.position : null;
    },
    /** Puts the badge beside a level's target gear, or hides it if the level has no fixed target. */
    load(level: Level, goal: Goal) {
      const spot = badgeSpot(level);
      const tgt = level.fixed.find((f) => f.id === level.target.gear);
      const axle = tgt && level.axles.find((a) => a.id === tgt.axle);
      root.visible = !!(spot && tgt && axle);
      if (!spot || !tgt || !axle) return;
      badge.position.set(...trayLocal(spot.x, spot.y, LIFT));
      const r = gearRadii({ module: level.module, teeth: tgt.teeth }).tip + 0.004;
      ring.position.set(...trayLocal(axle.x, axle.y, LIFT));
      ring.scale.setScalar(r);
      shown = '';
      this.update(goal);
    },
    /** The ring's colour now, '#rrggbb', for the test hook. */
    get ringColor() {
      return `#${(ring.material as MeshBasicMaterial).color.getHexString()}`;
    },
    /** Redraws only when the goal, its matched state or the wrong-way cue changes; wrong way turns the arrow and ring red. */
    update(goal: Goal, wrongWay = false) {
      const key = `${goal.dir} ${goal.rpm} ${goal.matched} ${wrongWay}`;
      if (key === shown) return;
      shown = key;
      (ring.material as MeshBasicMaterial).color.set(wrongWay ? C.jam : C.amber);
      draw(goal, wrongWay);
    },
  };
}
