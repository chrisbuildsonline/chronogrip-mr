import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { dailySeed, tinkerLevel } from '../../src/tinker';
import { calibrateByMouse } from './calibrate';

const KEY = 'chronogrip.progress.v1';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  return errors;
}

/** Saved progress in place before the page's own scripts run. */
const seed = (page: Page, raw: string) => page.addInitScript(([k, v]) => localStorage.setItem(k!, v!), [KEY, raw]);

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const label = (page: Page, id: string) => page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)?.label, id);

/** Two rendered frames, so the panel drawn for the current state is on screen. */
const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

async function place(page: Page, gear: string, axle: string) {
  const from = await screen(page, 'gears', gear);
  const to = await screen(page, 'axles', axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(([g, a]) => window.__chrono!.placements[g!] === a, [gear, axle]);
}

test('desktop: a solved level is saved, survives a reload and shows its best time on its tile', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.progress)).toEqual({ best: {} });
  expect(await label(page, 'start')).toBe('Start');

  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.levelTime > 0);
  await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.flow === 'complete');
  const best = await page.evaluate(() => window.__chrono!.progress.best['l1']);
  expect(best).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__chrono!.newBest)).toBe(false); // a first solve is just solved

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect(await page.evaluate(() => window.__chrono!.progress.best['l1'])).toBe(best);
  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-select.png' });
  expect(errors).toEqual([]);
});

test('desktop: garbage in saved progress boots clean with no progress', async ({ page }) => {
  await seed(page, '{"best":{"l1":"fast",');
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.progress)).toEqual({ best: {} });
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  expect(await label(page, 'start')).toBe('Start');
  expect(errors).toEqual([]);
});

test('desktop: with level 1 solved the title reads Continue and starts level 2; Back leaves level select', async ({ page }) => {
  await seed(page, JSON.stringify({ best: { l1: 30 } }));
  const errors = await open(page);
  expect(await label(page, 'start')).toBe('Continue');
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2'); // the title board is the level Continue plays
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-title.png' });

  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await click(page, 'back');
  await page.waitForFunction(() => window.__chrono!.flow === 'title');
  expect(await label(page, 'start')).toBe('Continue');

  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.levelIndex)).toBe(1);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2');
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(false);
  expect(errors).toEqual([]);
});

test('desktop: beating a saved time shows New best and saves the lower time', async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, JSON.stringify({ best: { l1: 999 } }));
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2');
  await click(page, 'levels');
  await click(page, 'level-1');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === 'l1');
  await page.waitForFunction(() => window.__chrono!.levelTime > 0);
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  expect(await page.evaluate(() => window.__chrono!.newBest)).toBe(true);
  expect(await page.evaluate(() => window.__chrono!.progress.best['l1'])).toBeLessThan(999);
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY);
  expect(saved.best.l1).toBeLessThan(999);
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-newbest.png' });
  expect(errors).toEqual([]);
});

test("desktop: the Daily tile plays today's tinker puzzle through to its complete card", async ({ page }) => {
  test.setTimeout(120_000);
  const daily = tinkerLevel(dailySeed(new Date()));
  const errors = await open(page);
  await click(page, 'levels');
  expect(await label(page, 'level-6')).toBe('Daily');
  await click(page, 'level-6');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 5);
  const got = await page.evaluate(() => ({ id: window.__chrono!.levelId, gears: window.__chrono!.gearCount, axles: window.__chrono!.axleCount }));
  expect(got.id).toMatch(/^t/);
  expect(got).toEqual({ id: daily.id, gears: daily.fixed.length + daily.tray.length, axles: daily.axles.length });
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(false);
  await page.waitForFunction(() => window.__chrono!.levelTime > 0);
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-daily-hud.png' });

  for (const [gear, axle] of Object.entries(daily.solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  expect(await label(page, 'next')).toBe('Levels');
  expect(await page.evaluate((id) => window.__chrono!.progress.best[id], daily.id)).toBeGreaterThan(0);
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-daily-complete.png' });
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  expect(errors).toEqual([]);
});
