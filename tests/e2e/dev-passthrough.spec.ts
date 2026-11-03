import { expect, test, type Page } from '@playwright/test';
import { TRAY_POSE } from '../../src/seat';
import { device, nudge, pinch, type Device } from './hands';

// Runs against the dev server (project "dev"), where the IWER emulator is injected. Each test gets a fresh browser
// context, so it starts with nothing saved; page.reload() keeps localStorage, like a player coming back later.

const TRAY_KEY = 'chronogrip.tray.v1';
type Pose = { position: readonly [number, number, number]; tilt: number; yaw?: number };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Loads the game; see dev-xr.spec.ts for why XRWebGLBinding goes. */
async function open(page: Page) {
  await page.addInitScript(() => {
    delete (window as { XRWebGLBinding?: unknown }).XRWebGLBinding;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
}

type Sem = { trackedPlanes: Set<unknown> };
/**
 * A 80 x 60 cm table in IWER's synthetic room, 45 cm below and 40 cm ahead of the seated head (IWER's head stands at
 * 1.6 m, facing -Z; the local space starts at the head). The living room's own planes are all out of reach.
 */
async function addTable(page: Page) {
  await page.waitForFunction((d) => ((window as unknown as Record<string, { sem?: Sem }>)[d]?.sem?.trackedPlanes.size ?? 0) > 0, device, { timeout: 15_000 });
  await page.evaluate((d) => {
    const sem = (window as unknown as Record<string, { sem: Sem }>)[d]!.sem;
    const [x, y, z] = [0, 1.6 - 0.45, -0.4];
    const polygon = [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]].map(([px, pz]) => new DOMPointReadOnly(px, 0, pz, 1));
    const table = {
      transform: { matrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]), position: { x, y, z, w: 1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      polygon,
      semanticLabel: 'table',
    };
    sem.trackedPlanes.add(table);
    (window as unknown as { __table: unknown }).__table = table;
  }, device);
}

const removeTable = (page: Page) =>
  page.evaluate((d) => {
    const w = window as unknown as Record<string, unknown> & { __table: unknown };
    (w[d] as { sem: Sem }).sem.trackedPlanes.delete(w.__table);
  }, device);

async function enterMr(page: Page) {
  await page.getByRole('button', { name: 'Enter MR' }).click();
  await page.waitForFunction(() => window.__chrono?.xrPresenting === true, undefined, { timeout: 10_000 });
}

type Hook = NonNullable<Window['__chrono']>;
const chrono = <K extends keyof Hook>(page: Page, key: K) => page.evaluate((k) => window.__chrono![k as K], key) as Promise<Hook[K]>;
const rightTip = (page: Page) => page.evaluate(() => window.__chrono!.occluders.right!.indexTip);
const pose = (page: Page) => page.evaluate(() => window.__chrono!.trayPose) as Promise<Pose>;
const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), TRAY_KEY) as Promise<{ anchor?: string; source: string } | null>;
const savedAnchor = (page: Page, not?: string) =>
  page.waitForFunction(([k, old]) => {
    const a = (JSON.parse(localStorage.getItem(k!) ?? 'null') as { anchor?: string } | null)?.anchor;
    return a && a !== old ? a : null;
  }, [TRAY_KEY, not] as const, { timeout: 10_000 }).then((h) => h.jsonValue() as Promise<string>);

/** Lets the game draw a few more frames (it moves the cue in scene.onBeforeRender, so a change shows a frame later). */
const frames = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done())))));

/**
 * Pixels of the cue's amber and brass in a screenshot (base64 PNG), decoded in the page: warm hues, well saturated and
 * bright, so not the grey room, the white controllers or the dark walnut. Only the strips of the view left and right of
 * the board count: over the board the title's ghost hand carries a brass ghost gear about, a little further on in every
 * shot, and nothing else there moves. The cue shows as a difference between two shots of one pose.
 */
const brassPixels = (page: Page, png: string) =>
  page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const g = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
    g.drawImage(bitmap, 0, 0);
    const px = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const x = (i / 4) % bitmap.width;
      if (x > 0.28 * bitmap.width && x < 0.72 * bitmap.width) continue;
      const [r, gr, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
      const max = Math.max(r, gr, b);
      const min = Math.min(r, gr, b);
      if (max < 140 || max - min < 0.4 * max || max !== r) continue;
      const hue = (60 * (gr - b)) / (max - min);
      if (hue > 25 && hue < 55) n++;
    }
    return n;
  }, png);

/** Where the held cue is caught: early in the pulse, nearly at full strength, the band well clear of the board. */
const CUE_HOLD = 0.25;
/**
 * Brass pixels the held cue must add to the side strips of the 1280 x 720 shot. Measured: the ring adds about 19 600
 * (restored 14 300); a ring that stays under the board adds none.
 */
const CUE_PIXELS = { plane: 8_000, restored: 5_000 } as const;

/** The held cue's shot (saved to `path`) against one once it has gone, from the same pose: how many brass pixels it adds. */
async function cueContrast(page: Page, path: string) {
  await frames(page);
  const lit = (await page.screenshot({ path })).toString('base64');
  await page.evaluate(() => window.__chrono!.holdCue(null));
  await page.waitForFunction(() => window.__chrono?.placeCue.showing === false, undefined, { timeout: 10_000 });
  await frames(page);
  const gone = (await page.screenshot()).toString('base64');
  return (await brassPixels(page, lit)) - (await brassPixels(page, gone));
}

function expectSamePose(a: Pose, b: Pose) {
  a.position.forEach((v, i) => expect(v, `position[${i}]`).toBeCloseTo(b.position[i]!, 3));
  expect(a.tilt).toBeCloseTo(b.tilt, 3);
  expect(a.yaw ?? 0).toBeCloseTo(b.yaw ?? 0, 3);
}
const differs = (a: Pose, b: Pose) => Math.hypot(...a.position.map((v, i) => v - b.position[i]!)) > 0.02;

/** Plane places the tray and the placement is saved with a persistent anchor; returns the head-relative pose. */
async function placeOnTable(page: Page) {
  await open(page);
  await addTable(page);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayPlaced === 'plane', undefined, { timeout: 10_000 });
  const placed = await pose(page);
  expect(differs(placed, TRAY_POSE)).toBe(true);
  const anchor = await savedAnchor(page);
  return { placed, anchor };
}

test('dev server: a table plane places the tray and a brass ring pulses out from under it', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await addTable(page);
  expect(await chrono(page, 'placeCue')).toEqual({ kind: null, showing: false, count: 0 });
  // A software-GL frame (and a screenshot) can outlast the 1 s pulse, so the pulse is held at one moment for the shot.
  await page.evaluate((t) => window.__chrono!.holdCue(t), CUE_HOLD);
  await enterMr(page);
  await page.waitForFunction(() => (window.__chrono?.placeCue.count ?? 0) >= 1, undefined, { timeout: 10_000 });
  expect(await chrono(page, 'trayPlaced')).toBe('plane');
  expect(await chrono(page, 'placeCue')).toEqual({ kind: 'plane', showing: true, count: 1 });
  expect(await chrono(page, 'trayRestored')).toBeNull();
  // The ring is plain to see: it adds a broad sweep of amber and brass to the view, which is gone once it ends.
  expect(await cueContrast(page, 'test-results/f19/cue-plane.png')).toBeGreaterThan(CUE_PIXELS.plane);
  // It pulsed once.
  expect((await chrono(page, 'placeCue')).count).toBe(1);
  expect(errors).toEqual([]);
});

test('dev server: after a reload, Enter MR puts the tray back where the table placed it, from the persistent anchor', async ({ page }) => {
  const errors = watchErrors(page);
  const { placed } = await placeOnTable(page);
  expect((await saved(page))?.source).toBe('plane');

  // Come back later: a fresh page and a fresh session, and this time no table is detected.
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect(await chrono(page, 'trayRestored')).toBeNull();
  await page.evaluate((t) => window.__chrono!.holdCue(t), CUE_HOLD);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayRestored === 'anchor', undefined, { timeout: 10_000 });
  expectSamePose(await pose(page), placed);
  expect(await chrono(page, 'trayPlaced')).toBe('plane');
  expect(await chrono(page, 'placeCue')).toMatchObject({ kind: 'restored', showing: true });
  // Subtler, but there to see.
  expect(await cueContrast(page, 'test-results/f19/cue-restored.png')).toBeGreaterThan(CUE_PIXELS.restored);
  // No search runs over it: past the 3 s plane window it has not fallen back to the default.
  await page.waitForTimeout(3500);
  expectSamePose(await pose(page), placed);
  expect(await chrono(page, 'trayRestored')).toBe('anchor');
  expect(errors).toEqual([]);
});

test('dev server: without persistent anchors the saved head-relative pose is restored instead', async ({ page }) => {
  const errors = watchErrors(page);
  const { placed } = await placeOnTable(page);
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  // A runtime that cannot restore anchors (the WebXR anchors module without persistence).
  await page.evaluate(() => {
    const xr = navigator.xr!;
    const request = xr.requestSession.bind(xr);
    xr.requestSession = async (mode, init) => {
      const s = await request(mode, init);
      Object.defineProperty(s, 'restorePersistentAnchor', { value: undefined });
      return s;
    };
  });
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayRestored === 'saved', undefined, { timeout: 10_000 });
  expectSamePose(await pose(page), placed);
  expect((await chrono(page, 'placeCue')).kind).toBe('restored');
  await page.waitForTimeout(3500);
  expectSamePose(await pose(page), placed);
  expect(await chrono(page, 'trayRestored')).toBe('saved');
  expect(errors).toEqual([]);
});

test('dev server: a two-hand recenter re-places the tray and overwrites the saved pose', async ({ page }) => {
  const errors = watchErrors(page);
  const { placed, anchor } = await placeOnTable(page);
  await removeTable(page);
  await page.evaluate((d) => {
    (window as unknown as Record<string, Device>)[d]!.primaryInputMode = 'hand';
  }, device);
  await page.waitForFunction(() => window.__chrono?.handHint === false, undefined, { timeout: 10_000 });
  await pinch(page, 'left', 1);
  await pinch(page, 'right', 1);
  await page.waitForFunction(() => window.__chrono?.recenters === 1, undefined, { timeout: 15_000 });
  const recentered = await pose(page);
  expectSamePose(recentered, TRAY_POSE);
  expect(await chrono(page, 'trayRestored')).toBeNull();
  const next = await savedAnchor(page, anchor);
  expect(next).not.toBe(anchor);
  expect((await saved(page))?.source).toBe('default');

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayRestored === 'anchor', undefined, { timeout: 10_000 });
  expectSamePose(await pose(page), recentered);
  expect(differs(await pose(page), placed)).toBe(true);
  expect(errors).toEqual([]);
});

test('dev server: tracked hands get depth-only occluders that follow the joints, gone when the hands go', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.handHint === true, undefined, { timeout: 10_000 });
  expect(await chrono(page, 'occluders')).toEqual({ left: null, right: null });
  await page.evaluate((d) => {
    (window as unknown as Record<string, Device>)[d]!.primaryInputMode = 'hand';
  }, device);
  await page.waitForFunction(() => window.__chrono?.occluders.right !== null && window.__chrono?.occluders.left !== null, undefined, { timeout: 10_000 });
  // The occluder's index tip sits on the hand's index tip, and moves with the hand.
  await pinch(page, 'right', 1);
  await page.waitForFunction(() => window.__chrono!.pinchPoints.right !== null, undefined, { timeout: 10_000 });
  const tipNear = () =>
    page.evaluate(() => {
      const c = window.__chrono!;
      const [o, p] = [c.occluders.right!.indexTip, c.pinchPoints.right!];
      return Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]);
    });
  expect(await tipNear()).toBeLessThan(0.03);
  const before = (await rightTip(page)) as readonly number[];
  // Over the board, so the hand hides part of the tray in the screenshot.
  await nudge(page, [-0.2, -0.02, 0.05]);
  const after = (await rightTip(page)) as readonly number[];
  expect(after[0]! - before[0]!).toBeCloseTo(-0.2, 2);
  expect(await tipNear()).toBeLessThan(0.03);
  await page.screenshot({ path: 'test-results/f19/occlusion.png' });
  // Back to controllers: no hands, no occluders.
  await page.evaluate((d) => {
    (window as unknown as Record<string, Device>)[d]!.primaryInputMode = 'controller';
  }, device);
  await page.waitForFunction(() => window.__chrono?.occluders.right === null && window.__chrono?.occluders.left === null, undefined, { timeout: 10_000 });
  expect(errors).toEqual([]);
});
