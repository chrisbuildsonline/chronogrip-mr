import { expect, test, type Page } from '@playwright/test';
import { RENDER_BUDGET } from '../../src/budget';
import { LEVELS } from '../../src/levels';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/scenery';

const frames = (page: Page, n = 3) =>
  page.evaluate((k) => new Promise((done) => {
    const next = (i: number) => (i <= 0 ? done(null) : requestAnimationFrame(() => next(i - 1)));
    next(k);
  }), n);

async function open(page: Page, w: number, h: number) {
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

/** The scenery hook says: the workshop is up, with nothing hiding the page's own background behind it. */
async function expectWorkshop(page: Page) {
  const s = await page.evaluate(() => window.__chrono!.scenery);
  expect(s.mode).toBe('inline');
  for (const part of ['workbench', 'tray-stand', 'back-wall', 'shelves', 'shelf-props', 'bench-props', 'lamp', 'lamp-glow']) expect(s.parts, part).toContain(part);
  expect(s.parts.some((p) => p.startsWith('prop-'))).toBe(false);
  expect(s.background).toBe(false);
  expect(s.fog).toBe(true);
  expect(s.tris).toBeGreaterThan(500);
  expect(s.tris).toBeLessThanOrEqual(8000);
}

test('desktop 1440x900: a warm workshop behind the tray, title and a level in play', async ({ page }) => {
  const errors = await open(page, 1440, 900);
  await expectWorkshop(page);
  await page.screenshot({ path: `${OUT}/desktop-title.png` });
  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await click(page, 'level-2');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page, 6);
  await expectWorkshop(page);
  await page.screenshot({ path: `${OUT}/desktop-playing.png` });
  expect(errors).toEqual([]);
});

test('phone 375x812: the workshop backs the tray without crowding the card', async ({ page }) => {
  const errors = await open(page, 375, 812);
  await expectWorkshop(page);
  await page.screenshot({ path: `${OUT}/phone-title.png` });
  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await click(page, 'level-2');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page, 6);
  await expectWorkshop(page);
  await page.screenshot({ path: `${OUT}/phone-playing.png` });
  expect(errors).toEqual([]);
});

test('level 5 with the workshop up stays inside the render budget', async ({ page }) => {
  await open(page, 1440, 900);
  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await click(page, `level-${LEVELS.findIndex((l) => l.id === 'l5') + 1}`);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === 'l5');
  await frames(page, 4);
  await expectWorkshop(page);
  const r = await page.evaluate(() => window.__chrono!.render);
  console.log(`L5 with scenery: ${r.calls} draw calls, ${r.triangles} triangles`);
  expect(r.calls).toBeLessThanOrEqual(RENDER_BUDGET.calls);
  expect(r.triangles).toBeLessThanOrEqual(RENDER_BUDGET.triangles);
});
