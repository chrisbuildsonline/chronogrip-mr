import { expect, test, type Page } from './fixtures';
import { choose } from './start';

import { RENDER_BUDGET } from '../../src/budget';
import { LEVELS } from '../../src/levels';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/scenery';

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

/** The scenery hook says: the bench is up under a texture background (the panorama), no props, no fog. */
async function expectBackdrop(page: Page, id = 'c2') {
  await page.waitForFunction((b) => window.__chrono!.scenery.backdrop === b, id);
  const s = await page.evaluate(() => window.__chrono!.scenery);
  expect(s.mode).toBe('inline');
  expect([...s.parts].sort()).toEqual(['tray-stand', 'workbench']);
  expect(s.background).toBe(true);
  expect(s.fog).toBe(false);
  expect(s.tris).toBeLessThanOrEqual(1000);
}

test('desktop 1440x900: the attic panorama behind the tray, title and a level in play', async ({ page }) => {
  const requests: string[] = [];
  const errors = await open(page, 1440, 900, requests);
  await expectBackdrop(page);
  expect(requests.some((u) => u.endsWith('/backdrops/c2_pano.jpg'))).toBe(true);
  expect(requests.some((u) => u.includes('_2048'))).toBe(false);
  await page.screenshot({ path: `${OUT}/desktop-title.png` });
  await choose(page, () => Promise.resolve(), 2);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page, 6);
  await expectBackdrop(page);
  await page.screenshot({ path: `${OUT}/desktop-playing.png` });
  expect(errors).toEqual([]);
});

test('phone 375x812: the 2048 attic panorama backs the tray without crowding the card', async ({ page }) => {
  const requests: string[] = [];
  const errors = await open(page, 375, 812, requests);
  await expectBackdrop(page);
  expect(requests.some((u) => u.endsWith('/backdrops/c2_pano_2048.jpg'))).toBe(true);
  expect(requests.some((u) => u.endsWith('/backdrops/c2_pano.jpg'))).toBe(false);
  await page.screenshot({ path: `${OUT}/phone-title.png` });
  await choose(page, () => Promise.resolve(), 2);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page, 6);
  await expectBackdrop(page);
  await page.screenshot({ path: `${OUT}/phone-playing.png` });
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
