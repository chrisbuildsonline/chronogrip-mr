import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { calibrateByMouse } from './calibrate';

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

/** Waits for a button on the shown panel, then clicks it with the mouse. */
async function click(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

async function place(page: Page, gear: string, axle: string) {
  const from = await screen(page, 'gears', gear);
  const to = await screen(page, 'axles', axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
}

test('desktop: title, start, solve level 1, complete card, next loads level 2', async ({ page }) => {
  test.setTimeout(90_000); // five screenshots on software GL
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(true);
  await page.waitForTimeout(1200); // let the ghost hand reach its carry pose
  await page.screenshot({ path: 'test-results/f9-title.png' });

  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.waitForFunction(() => window.__chrono!.levelTime > 0);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['pause']);
  await page.screenshot({ path: 'test-results/f9-playing.png' });

  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.flow === 'complete');
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(false);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/f9-complete.png' });

  // The board is locked on the complete card: the placed gear does not lift.
  const placed = await screen(page, 'gears', gear);
  await page.mouse.move(placed[0], placed[1]);
  await page.mouse.down();
  await page.mouse.move(placed[0] + 40, placed[1] + 40, { steps: 4 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  await page.mouse.up();

  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.levelIndex === 1 && window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2');
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({});
  expect(await page.evaluate(() => window.__chrono!.axleCount)).toBe(LEVELS[1]!.axles.length);
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(false);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/f9-level2.png' });
  expect(errors).toEqual([]);
});

test('desktop: level select reaches level 3; a hidden tab pauses and resume keeps the board', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page);
  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/f9-select.png' });
  await click(page, 'level-3');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 2);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l3');

  await place(page, 'p', 'b');
  await page.waitForFunction(() => window.__chrono!.placements['p'] === 'b');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__chrono!.paused);
  const t = await page.evaluate(() => window.__chrono!.levelTime);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__chrono!.levelTime)).toBe(t);
  expect(await page.evaluate(() => window.__chrono!.paused)).toBe(true); // stays paused until Resume
  await page.screenshot({ path: 'test-results/f9-paused.png' });

  await click(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ p: 'b' });
  await page.waitForFunction((t0) => window.__chrono!.levelTime > t0, t);
  expect(errors).toEqual([]);
});
