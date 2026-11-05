import { expect, test, type Page } from './fixtures';
import { choose } from './start';

import { RENDER_BUDGET } from '../../src/budget';
import { LEVELS } from '../../src/levels';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/scenery';

const FACES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];

const frames = (page: Page, n = 3) =>
  page.evaluate((k) => new Promise((done) => {
    const next = (i: number) => (i <= 0 ? done(null) : requestAnimationFrame(() => next(i - 1)));
    next(k);
  }), n);

async function open(page: Page, w: number, h: number, requests: string[] = []) {
  page.on('request', (r) => requests.push(r.url()));
  await page.setViewportSize({ width: w, height: h });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await frames(page);
  return errors;
}

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

/** The scenery hook says: the bench is up under a texture background (the cubemap), no props, no fog. */
async function expectBackdrop(page: Page, id = 'c2') {
  await page.waitForFunction((b) => window.__chrono!.scenery.backdrop === b, id);
  const s = await page.evaluate(() => window.__chrono!.scenery);
  expect(s.mode).toBe('inline');
  expect([...s.parts].sort()).toEqual(expect.arrayContaining(['tray-stand', 'workbench']));
  expect(s.parts.length).toBeLessThanOrEqual(3);
  expect(s.background).toBe(true);
  expect(s.cube).toBe(true);
  expect(s.environment).toBe('stage');
  expect(s.fog).toBe(false);
  expect(s.tris).toBeLessThanOrEqual(1000);
}

test('desktop 1440x900: the attic cubemap behind the tray, title and a level in play', async ({ page }) => {
  const requests: string[] = [];
  const errors = await open(page, 1440, 900, requests);
  await expectBackdrop(page);
  for (const f of FACES) expect(requests.some((u) => u.endsWith(`/backdrops/c2_cube/${f}`)), f).toBe(true);
  expect(requests.some((u) => u.includes('_cube_1024') || u.includes('_pano'))).toBe(false);
  await page.screenshot({ path: `${OUT}/desktop-title.png` });
  await choose(page, () => Promise.resolve(), 2);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page, 6);
  await expectBackdrop(page);
  await page.screenshot({ path: `${OUT}/desktop-playing.png` });
  expect(errors).toEqual([]);
});

test('phone 375x812: the 1024 attic cubemap backs the tray without crowding the card', async ({ page }) => {
  const requests: string[] = [];
  const errors = await open(page, 375, 812, requests);
  await expectBackdrop(page);
  for (const f of FACES) expect(requests.some((u) => u.endsWith(`/backdrops/c2_cube_1024/${f}`)), f).toBe(true);
  expect(requests.some((u) => /\/c2_cube\//.test(u))).toBe(false);
  expect(requests.some((u) => /textures\/tray_albedo_1024\.jpg$/.test(u))).toBe(true);
  expect(requests.some((u) => /textures\/tray_albedo_2048\.jpg$/.test(u))).toBe(false);
  await page.screenshot({ path: `${OUT}/phone-title.png` });
  await choose(page, () => Promise.resolve(), 2);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page, 6);
  await expectBackdrop(page);
  await page.screenshot({ path: `${OUT}/phone-playing.png` });
  expect(errors).toEqual([]);
});

test('the tray is walnut PBR: albedo, normal and roughness maps, anisotropic filtering, a light clearcoat', async ({ page }) => {
  const errors = await open(page, 1440, 900);
  const w = await page.evaluate(() => window.__chrono!.trayWood);
  expect(w.physical).toBe(true);
  expect(w.map && w.normalMap && w.roughnessMap).toBe(true);
  expect(w.anisotropy).toBeGreaterThan(1);
  expect(w.normalScale).toBeLessThanOrEqual(0.4);
  expect(w.clearcoat).toBeLessThanOrEqual(0.2);
  expect(errors).toEqual([]);
});

test('the metals are polished brass lit by the stage environment', async ({ page }) => {
  const errors = await open(page, 1440, 900);
  await expectBackdrop(page);
  const m = await page.evaluate(() => window.__chrono!.metals);
  expect(m.metalness).toBe(1);
  expect(m.roughness).toBeGreaterThanOrEqual(0.28);
  expect(m.roughness).toBeLessThanOrEqual(0.45);
  expect(m.roughnessMap && m.normalMap).toBe(true);
  expect(m.environment).toBe(true);
  expect(errors).toEqual([]);
});

test('level 5 with the backdrop up stays inside the render budget', async ({ page }) => {
  await open(page, 1440, 900);
  await choose(page, () => Promise.resolve(), LEVELS.findIndex((l) => l.id === 'l5') + 1);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === 'l5');
  await frames(page, 4);
  await expectBackdrop(page);
  const r = await page.evaluate(() => window.__chrono!.render);
  console.log(`L5 with the backdrop: ${r.calls} draw calls, ${r.triangles} triangles`);
  expect(r.calls).toBeLessThanOrEqual(RENDER_BUDGET.calls);
  expect(r.triangles).toBeLessThanOrEqual(RENDER_BUDGET.triangles);
});
