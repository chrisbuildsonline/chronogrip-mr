import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { calibrateByMouse } from './calibrate';

const audio = (page: Page) => page.evaluate(() => ({ ...window.__chrono!.audio }));

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

test('desktop: sound unlocks on the first click, a snap clicks, calibrating ticks, calibrated chimes', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);

  // Nothing is created before a gesture.
  expect(['none', 'suspended']).toContain((await audio(page)).state);

  // A real click on the canvas unlocks it (empty corner of the view: no gear, no button).
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + 5, box.y + box.height - 5);
  await page.waitForFunction(() => window.__chrono!.audio.state === 'running');

  // Snapping the gear onto its axle clicks, and a good placement does not grind.
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  const from = await screen(page, 'gears', gear);
  const to = await screen(page, 'axles', axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
  expect((await audio(page)).clicks).toBe(1);
  expect((await audio(page)).grinds).toBe(0);

  // Calibrating ticks at the live rate; calibrated chimes once.
  await page.waitForFunction(() => window.__chrono!.audio.ticks > 0);
  expect((await audio(page)).chimes).toBe(0);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.flow === 'complete');
  await page.waitForFunction(() => window.__chrono!.audio.chimes === 1);
  const done = await audio(page);
  expect(done.state).toBe('running');
  expect(done.ticks).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

test('desktop: a gear that jams the train snaps with a click and grinds', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);

  // Level 2: the 40-tooth gear on the middle axle is too big for the train, and jams it.
  await click(page, 'levels');
  await click(page, 'level-2');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === 'l2');
  await page.waitForFunction(() => window.__chrono!.audio.state === 'running');
  const from = await screen(page, 'gears', 'big');
  const to = await screen(page, 'axles', 'a1');
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__chrono!.placements['big'] === 'a1');
  await page.waitForFunction(() => window.__chrono!.audio.grinds === 1);
  expect((await audio(page)).clicks).toBe(1);
  expect(await page.evaluate(() => window.__chrono!.solved)).toBe(false);
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('playing');
  expect(errors).toEqual([]);
});

test('desktop: pausing suspends the audio and resuming brings it back', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);

  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.waitForFunction(() => window.__chrono!.audio.state === 'running');

  await click(page, 'pause');
  await page.waitForFunction(() => window.__chrono!.flow === 'paused');
  await page.waitForFunction(() => window.__chrono!.audio.state === 'suspended');

  await click(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.waitForFunction(() => window.__chrono!.audio.state === 'running');
  expect(errors).toEqual([]);
});
