import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { LEVELS, type Level } from '../../src/levels';
import { dailySeed, tinkerLevel } from '../../src/tinker';
import { TRAY_POSE, type Vec3 } from '../../src/seat';
import { NARROW_W, PLAY_SCREENS, layout, panelAnchor, panelToWorld, type Screen } from '../../src/ui';
import { DESKTOP_EYE, DESKTOP_TARGET, PHONE, desktopDistance, faceView, fitDistance, isPhone, menuCard, phoneCard, phonePx, phoneReserve, phoneShift, viewContent } from '../../src/fit';

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

  it('fits the level on the board and the card on show: at phone width the level 5 strip backs off more than the level 1 strip', () => {
    const at = (level: Level, screens?: Screen[]) =>
      desktopDistance({ target: DESKTOP_TARGET, dir, base, fovDeg: 50, width: 375, height: 812, margin, header: header(375), points: viewContent(level, 9, TRAY_POSE, dir, screens) });
    const play = PLAY_SCREENS;
    const l1 = at(LEVELS[0]!, [...play]);
    expect(l1).toBeGreaterThan(base);
    expect(at(LEVELS[4]!, [...play])).toBeGreaterThan(1.1 * l1);
    expect(at(LEVELS[0]!)).toBe(l1); // default: the cards played with; the menus are centred over a black layer, not fitted
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
  it('spans the board, the cards played with and the bird off its right edge', () => {
    const pts = viewContent(LEVELS[0]!, 9, TRAY_POSE, unit(sub(DESKTOP_EYE, DESKTOP_TARGET)));
    const xs = pts.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...xs)).toBeGreaterThan(0.252 + TRAY_POSE.position[0]); // the bird
  });
});

describe('phone portrait', () => {
  const dir = unit(sub(DESKTOP_EYE, DESKTOP_TARGET));
  const levels = [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 10, 3)))];
  const camera = (eye: Vec3, width: number, height: number) => {
    const cam = new PerspectiveCamera(50, width / height, 0.01, 100);
    cam.position.set(...eye);
    cam.lookAt(...DESKTOP_TARGET);
    cam.updateMatrixWorld();
    return (p: Vec3): [number, number] => {
      const v = new Vector3(...p).project(cam);
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
    };
  };

  it('is a narrow window taller than wide, under 500 px', () => {
    expect(isPhone(375, 812)).toBe(true);
    expect(isPhone(390, 844)).toBe(true);
    expect(isPhone(480, 853)).toBe(true);
    expect(isPhone(500, 900)).toBe(false);
    expect(isPhone(768, 1024)).toBe(false);
    expect(isPhone(1440, 900)).toBe(false);
    expect(isPhone(480, 400)).toBe(false); // a short window has no room for the card under the board
  });

  it('the card sits face on along the bottom, a phone width wide, at any eye along the line', () => {
    for (const [width, height] of [[375, 812], [390, 844], [430, 932]] as const) {
      for (const d of [1, 1.4]) {
        const eye = DESKTOP_TARGET.map((t, k) => t + dir[k]! * d) as unknown as Vec3;
        const a = phoneCard({ eye, back: dir, fovDeg: 50, width, height });
        const px = camera(eye, width, height);
        const [bl, br, tl, tr] = ([[-1, 0], [1, 0], [-1, 1], [1, 1]] as const).map(([sx, k]) => px(panelToWorld(a, [(sx * NARROW_W) / 2, k * 0.2, 0])));
        expect(bl![0], `${width} left`).toBeCloseTo(PHONE.side, 3);
        expect(br![0], `${width} right`).toBeCloseTo(width - PHONE.side, 3);
        expect(bl![1], `${width} bottom`).toBeCloseTo(height - PHONE.bottom, 3);
        expect(tl![0]).toBeCloseTo(bl![0], 3);
        expect(tr![0] - tl![0]).toBeCloseTo(br![0] - bl![0], 3);
        expect(bl![1] - tl![1], 'height in proportion').toBeCloseTo(0.2 * phonePx(width), 3);
        // Nearer the eye than anything on the board, so nothing draws over it.
        expect(Math.hypot(...sub(a.position, eye))).toBeLessThan(0.5);
      }
    }
    expect(phonePx(375)).toBeCloseTo((375 - 2 * PHONE.side) / NARROW_W, 9);
  });

  it('with the view raised to centre the board, the card still sits on the bottom edge', () => {
    const [width, height, shift] = [375, 812, 70];
    const eye = DESKTOP_TARGET.map((t, k) => t + dir[k]! * 1.2) as unknown as Vec3;
    const a = phoneCard({ eye, back: dir, fovDeg: 50, width, height, shift });
    const cam = new PerspectiveCamera(50, width / height, 0.01, 100);
    cam.setViewOffset(width, height, 0, shift, width, height);
    cam.position.set(...eye);
    cam.lookAt(...DESKTOP_TARGET);
    cam.updateMatrixWorld();
    const v = new Vector3(...panelToWorld(a, [-NARROW_W / 2, 0, 0])).project(cam);
    expect(((v.x + 1) / 2) * width).toBeCloseTo(PHONE.side, 3);
    expect(((1 - v.y) / 2) * height).toBeCloseTo(height - PHONE.bottom, 3);
  });

  it('raises the view so the board sits midway between the header and the card', () => {
    const [width, height, top, bottom] = [375, 812, 110, 590];
    const points = viewContent(LEVELS[0]!, 9, TRAY_POSE, dir, []);
    const d = 1.3;
    const shift = phoneShift({ target: DESKTOP_TARGET, dir, fovDeg: 50, width, height, d, points, top, bottom });
    const cam = new PerspectiveCamera(50, width / height, 0.01, 100);
    cam.setViewOffset(width, height, 0, shift, width, height);
    cam.position.set(...(DESKTOP_TARGET.map((t, k) => t + dir[k]! * d) as unknown as Vec3));
    cam.lookAt(...DESKTOP_TARGET);
    cam.updateMatrixWorld();
    const ys = points.map((p) => ((1 - new Vector3(...p).project(cam).y) / 2) * height);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo((top + bottom) / 2, 3);
  });

  it('the board, dial and bird fit above the card on show, on every level', () => {
    const base = len(sub(DESKTOP_EYE, DESKTOP_TARGET));
    const play = PLAY_SCREENS;
    for (const level of levels) {
      for (const [width, height] of [[375, 812], [390, 844]] as const) {
        for (const screens of [play]) {
          const bottom = phoneReserve(width, screens, levels.length);
          const tallest = Math.max(...screens.map((s) => layout(s, { level: 0, levels: levels.length, narrow: true }).height));
          expect(bottom).toBeCloseTo(PHONE.bottom + PHONE.gap + tallest * phonePx(width), 6);
          const points = viewContent(level, levels.length, TRAY_POSE, dir, []);
          const header = { left: 160, right: width - 16 - 150, bottom: 110 };
          const d = desktopDistance({ target: DESKTOP_TARGET, dir, base, fovDeg: 50, width, height, margin: { top: 16, right: 12, bottom, left: 12 }, header, points });
          const px = camera(DESKTOP_TARGET.map((t, k) => t + dir[k]! * d) as unknown as Vec3, width, height);
          for (const p of points) {
            const [x, y] = px(p);
            expect(y, `${level.id} ${width} ${screens} above the card`).toBeLessThanOrEqual(height - bottom + 0.5);
            expect(x).toBeGreaterThanOrEqual(11.5);
            expect(x).toBeLessThanOrEqual(width - 11.5);
          }
        }
      }
    }
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

describe('menuCard', () => {
  const back = unit(sub(DESKTOP_EYE, DESKTOP_TARGET));
  const project = (width: number, height: number, p: Vec3, shift = 0) => {
    const cam = new PerspectiveCamera(50, width / height, 0.01, 100);
    cam.position.set(...DESKTOP_EYE);
    cam.lookAt(...DESKTOP_TARGET);
    cam.setViewOffset(width, height, 0, shift, width, height);
    cam.updateMatrixWorld();
    const v = new Vector3(...p).project(cam);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height] as const;
  };
  const card = (width: number, height: number, c: { width: number; height: number }, shift = 0) =>
    menuCard({ eye: DESKTOP_EYE, back, fovDeg: 50, width, height, shift, card: c, maxPx: 1700, margin: 72 });

  it('puts the middle of the card on the middle of the view, desktop and phone, raised view included', () => {
    for (const [w, h, shift] of [[1440, 900, 0], [375, 812, 0], [375, 812, 90]] as const) {
      const l = layout('title', { level: 0, levels: 10 });
      const [x, y] = project(w, h, panelToWorld(card(w, h, l, shift), [0, l.height / 2, 0]), shift);
      expect(x, `${w}x${h} x`).toBeCloseTo(w / 2, 3);
      expect(y, `${w}x${h} y`).toBeCloseTo(h / 2, 3);
    }
  });

  it('keeps the card inside the view with the air kept over and under it, at most maxPx per metre', () => {
    for (const [w, h] of [[1440, 900], [375, 812], [1280, 600]] as const) {
      const l = layout('board', { level: 0, levels: 10, narrow: w < 500 });
      const a = card(w, h, l);
      const top = project(w, h, panelToWorld(a, [0, l.height, 0]));
      const foot = project(w, h, panelToWorld(a, [0, 0, 0]));
      expect(top[1], `${w}x${h} top`).toBeGreaterThanOrEqual(72 - 0.5);
      expect(foot[1], `${w}x${h} foot`).toBeLessThanOrEqual(h - 72 + 0.5);
      const side = project(w, h, panelToWorld(a, [l.width / 2, l.height / 2, 0]));
      expect(side[0] - w / 2, `${w}x${h} half width`).toBeLessThanOrEqual(w / 2 - PHONE.side + 0.5);
      expect((foot[1] - top[1]) / l.height, `${w}x${h} px per metre`).toBeLessThanOrEqual(1700 + 1);
    }
  });

  it('a phone card is as wide as the phone sheet (the type stays 12 px or more)', () => {
    const l = layout('picker', { level: 0, levels: 21, narrow: true });
    const a = card(375, 812, l);
    const [xl] = project(375, 812, panelToWorld(a, [-l.width / 2, l.height / 2, 0]));
    const [xr] = project(375, 812, panelToWorld(a, [l.width / 2, l.height / 2, 0]));
    expect((xr - xl) / l.width).toBeCloseTo(phonePx(375), 0);
  });
});
