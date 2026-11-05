import { expect, test, type Page } from './fixtures';
import { device, type Device } from './hands';

// Runs against the dev server (project "dev"), where the IWER emulator is injected. In immersive-ar the passthrough is
// the background: the panorama and bench must be gone and only a few small props may stand on the real table.

const OUT = 'test-results/scenery';

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
/** A 80 x 60 cm table in IWER's synthetic room, 45 cm below and 40 cm ahead of the seated head (see dev-passthrough.spec.ts). */
async function addTable(page: Page) {
  await page.waitForFunction((d) => ((window as unknown as Record<string, { sem?: Sem }>)[d]?.sem?.trackedPlanes.size ?? 0) > 0, device, { timeout: 15_000 });
  await page.evaluate((d) => {
    const sem = (window as unknown as Record<string, { sem: Sem }>)[d]!.sem;
    const [x, y, z] = [0, 1.6 - 0.45, -0.4];
    const polygon = [[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]].map(([px, pz]) => new DOMPointReadOnly(px, 0, pz, 1));
    sem.trackedPlanes.add({
      transform: { matrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]), position: { x, y, z, w: 1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      polygon,
      semanticLabel: 'table',
    });
  }, device);
}

async function enterMr(page: Page) {
  await page.getByRole('button', { name: 'Enter MR' }).click();
  await page.waitForFunction(() => window.__chrono?.xrPresenting === true, undefined, { timeout: 10_000 });
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done())))));
const scenery = (page: Page) => page.evaluate(() => window.__chrono!.scenery);

const BACKDROP = ['workbench', 'tray-stand'];
const PROPS = ['prop-oil-can', 'prop-screwdriver', 'prop-loupe', 'prop-gear-dish'];

test('immersive-ar without a table: passthrough stays the whole background, no backdrop, no fog, nothing drawn but the game', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  // Before the session: the inline bench, with the panorama as the background.
  await page.waitForFunction(() => window.__chrono!.scenery.backdrop === 'c2');
  expect((await scenery(page)).background).toBe(true);
  expect((await scenery(page)).parts).toEqual(expect.arrayContaining(BACKDROP));
  await enterMr(page);
  await frames(page);
  const s = await scenery(page);
  expect(s.mode).toBe('xr');
  expect(s.background).toBe(false);
  expect(s.cube).toBe(false);
  expect(s.fog).toBe(false);
  expect(s.clearAlpha).toBe(0);
  for (const part of BACKDROP) expect(s.parts, part).not.toContain(part);
  // No table found yet: no props either, so nothing would float in the room.
  expect(s.parts).toEqual([]);
  expect(await page.evaluate((d) => (window as unknown as Record<string, Device>)[d]!.activeSession!.environmentBlendMode, device)).not.toBe('opaque');
  await page.screenshot({ path: `${OUT}/xr-no-table.png` });
  expect(errors).toEqual([]);
});

test('immersive-ar with a table: only the four small props stand beside the tray, still no backdrop', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await addTable(page);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayPlaced === 'plane', undefined, { timeout: 10_000 });
  await frames(page);
  const s = await scenery(page);
  expect(s.mode).toBe('xr');
  expect(s.background).toBe(false);
  expect(s.fog).toBe(false);
  expect(s.clearAlpha).toBe(0);
  expect([...s.parts].sort()).toEqual([...PROPS].sort());
  for (const part of BACKDROP) expect(s.parts, part).not.toContain(part);
  expect(s.tris).toBeLessThanOrEqual(1500);
  await page.screenshot({ path: `${OUT}/xr-props.png` });
  expect(errors).toEqual([]);
});

test('leaving immersive-ar brings the bench and panorama back, and the props go', async ({ page }) => {
  await open(page);
  await addTable(page);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayPlaced === 'plane', undefined, { timeout: 10_000 });
  await page.evaluate((d) => (window as unknown as Record<string, Device>)[d]!.activeSession!.end(), device);
  await page.waitForFunction(() => window.__chrono?.xrPresenting === false, undefined, { timeout: 10_000 });
  await frames(page);
  const s = await scenery(page);
  expect(s.mode).toBe('inline');
  expect(s.parts).toEqual(expect.arrayContaining(BACKDROP));
  expect(s.parts.some((p) => p.startsWith('prop-'))).toBe(false);
  expect(s.fog).toBe(false);
  expect(s.background).toBe(true);
});
