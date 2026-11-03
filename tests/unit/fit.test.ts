import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { LEVELS, type Level } from '../../src/levels';
import { dailySeed, tinkerLevel } from '../../src/tinker';
import { TRAY_POSE, type Vec3 } from '../../src/seat';
import { SCREENS, panelAnchor, panelToWorld, type Screen } from '../../src/ui';
import { DESKTOP_EYE, DESKTOP_TARGET, desktopDistance, faceView, fitDistance, viewContent } from '../../src/fit';

const NO_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(...a);
const unit = (a: Vec3): Vec3 => a.map((v) => v / len(a)) as unknown as Vec3;

describe('fitDistance', () => {
  it('backs off until the widest point fits, further on a narrow screen', () => {
    const base = { target: [0, 0, 0] as Vec3, dir: [0, 0, 1] as Vec3, fovDeg: 90, margin: NO_MARGIN, points: [[1, 0, 0], [-1, 0, 0]] as Vec3[] };
    expect(fitDistance({ ...base, width: 100, height: 100 })).toBeCloseTo(1, 6);
    expect(fitDistance({ ...base, width: 50, height: 100 })).toBeCloseTo(2, 6);
  });

  it('counts a point nearer the camera than the target', () => {
    const d = fitDistance({ target: [0, 0, 0], dir: [0, 0, 1], fovDeg: 90, width: 100, height: 100, margin: NO_MARGIN, points: [[1, 0, 0.5]] });
    expect(d).toBeCloseTo(1.5, 6);
  });

  it('keeps clear of a margin on one side only', () => {
    // Top 25 px of 100: the top of the frame is at NDC 0.5, so a point 1 m up needs twice the distance; down is unaffected.
    const opts = { target: [0, 0, 0] as Vec3, dir: [0, 0, 1] as Vec3, fovDeg: 90, width: 100, height: 100, margin: { ...NO_MARGIN, top: 25 } };
    expect(fitDistance({ ...opts, points: [[0, 1, 0]] })).toBeCloseTo(2, 6);
    expect(fitDistance({ ...opts, points: [[0, -1, 0]] })).toBeCloseTo(1, 6);
  });

});

describe('desktopDistance', () => {
  const levels = [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 10, 3)))];
  const base = len(sub(DESKTOP_EYE, DESKTOP_TARGET));
  const dir = unit(sub(DESKTOP_EYE, DESKTOP_TARGET));
  const margin = { top: 16, right: 12, bottom: 12, left: 12 };
  /** The page header: the wordmark top left (to x 160), the Enter MR pill and its note top right (from 220 px in), 120 px tall. */
  const header = (width: number) => ({ left: 160, right: width - 24 - 220, bottom: 120 });
  const view = (level: Level, width: number, height: number) => {
    const points = viewContent(level, levels.length, TRAY_POSE, dir);
    const d = desktopDistance({ target: DESKTOP_TARGET, dir, base, fovDeg: 50, width, height, margin, header: header(width), points });
    const eye = DESKTOP_TARGET.map((t, k) => t + dir[k]! * d) as unknown as Vec3;
    const cam = new PerspectiveCamera(50, width / height, 0.01, 100);
    cam.position.set(...eye);
    cam.lookAt(...DESKTOP_TARGET);
    cam.updateMatrixWorld();
    const px = points.map((p): [number, number] => {
      const v = new Vector3(...p).project(cam);
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
    });
    return { d, px };
  };

  it('every content point lands inside the view at any aspect on every level, landscape keeps the tuned camera', () => {
    for (const level of levels) {
      for (const [width, height] of [[375, 812], [768, 1024], [1440, 900], [1280, 720], [1920, 1080]] as const) {
        const { d, px } = view(level, width, height);
        if (width > height) expect(d, `${level.id} ${width}x${height} keeps the tuned distance`).toBe(base);
        else expect(d, `${level.id} ${width}x${height} backs off`).toBeGreaterThan(base);
        for (const [x, y] of px) {
          expect(x, `${level.id} ${width}x${height} x`).toBeGreaterThanOrEqual(margin.left - 0.5);
          expect(x, `${level.id} ${width}x${height} x`).toBeLessThanOrEqual(width - margin.right + 0.5);
          expect(y, `${level.id} ${width}x${height} y`).toBeGreaterThanOrEqual(margin.top - 0.5);
          expect(y, `${level.id} ${width}x${height} y`).toBeLessThanOrEqual(height - margin.bottom + 0.5);
        }
      }
    }
  });

  it('fits the level on the board and the card on show: at phone width the wide select card and level 5 strip back off more', () => {
    const at = (level: Level, screens?: Screen[]) =>
      desktopDistance({ target: DESKTOP_TARGET, dir, base, fovDeg: 50, width: 375, height: 812, margin, header: header(375), points: viewContent(level, 9, TRAY_POSE, dir, screens) });
    const play = SCREENS.filter((s) => s !== 'select');
    const l1 = at(LEVELS[0]!, play);
    expect(l1).toBeGreaterThan(base);
    expect(at(LEVELS[0]!, ['select'])).toBeGreaterThan(1.1 * l1);
    expect(at(LEVELS[4]!, play)).toBeGreaterThan(1.1 * l1);
    expect(at(LEVELS[0]!)).toBe(at(LEVELS[0]!, ['select'])); // default: every card, and select is the widest
  });

  it('keeps everything under the header where it reaches the corners, but not when it fits between them', () => {
    for (const level of levels) {
      for (const [width, height] of [[375, 812], [768, 1024], [1000, 900], [1440, 900], [1280, 720]] as const) {
        const h = header(width);
        for (const [x, y] of view(level, width, height).px) {
          if (x < h.left || x > h.right) expect(y, `${level.id} ${width}x${height} at x ${x.toFixed(0)}`).toBeGreaterThanOrEqual(h.bottom);
        }
      }
    }
  });
});

describe('viewContent', () => {
  it('spans the 9-tile select card, the board and the bird off its right edge', () => {
    const pts = viewContent(LEVELS[0]!, 9, TRAY_POSE, unit(sub(DESKTOP_EYE, DESKTOP_TARGET)));
    const xs = pts.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(0.674);
    expect(Math.max(...xs)).toBeGreaterThan(0.252 + TRAY_POSE.position[0]); // the bird
  });
});

describe('faceView', () => {
  it('lays the card parallel to the screen, keeping its anchor point: a rectangle on screen, no keystone', () => {
    const a = panelAnchor(LEVELS[1]!);
    const back = unit(sub(DESKTOP_EYE, DESKTOP_TARGET));
    const f = faceView(a, back);
    expect(f.position).toEqual(a.position);
    const normal = unit(sub(panelToWorld(f, [0, 0, 1]), f.position));
    for (let k = 0; k < 3; k++) expect(normal[k]).toBeCloseTo(back[k]!, 6);

    const cam = new PerspectiveCamera(50, 375 / 812, 0.01, 100);
    cam.position.set(...DESKTOP_EYE);
    cam.lookAt(...DESKTOP_TARGET);
    cam.updateMatrixWorld();
    const [bl, br, tl, tr] = ([[-1, 0], [1, 0], [-1, 1], [1, 1]] as const).map(([sx, k]) => new Vector3(...panelToWorld(f, [sx * 0.337, k * 0.15, 0])).project(cam));
    expect(tr!.x - tl!.x).toBeCloseTo(br!.x - bl!.x, 6);
    expect(tl!.x).toBeCloseTo(bl!.x, 6);
    expect(tl!.y).toBeCloseTo(tr!.y, 6);
  });

  it('a camera at the head looking at the card gets the XR tilt back', () => {
    const a = panelAnchor(LEVELS[0]!);
    // The XR anchor tilts to face the head exactly (its normal points at the origin).
    const f = faceView(a, unit(sub([0, 0, 0], a.position)));
    expect(f.yaw).toBeCloseTo(a.yaw, 6);
    expect(f.pitch).toBeCloseTo(a.pitch, 6);
  });
});
