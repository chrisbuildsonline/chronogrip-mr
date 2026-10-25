import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';

const level = LEVELS[0]!;
const [gearId, axleId] = Object.entries(level.solution)[0]!;

async function open(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await page.waitForTimeout(500);
  return errors;
}

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

async function drag(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 5 });
  await page.mouse.move(to[0], to[1], { steps: 5 });
}

test('desktop: dragging the loose gear onto its axle snaps it and solves the level', async ({ page }) => {
  const errors = await open(page);
  const from = await screen(page, 'gears', gearId);
  const to = await screen(page, 'axles', axleId);
  await drag(page, from, to);
  expect(await page.evaluate(() => window.__chrono!.held)).toBe(gearId);
  await page.screenshot({ path: 'test-results/f7-drag.png' });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [gearId]: axleId });
  expect(await page.evaluate(() => window.__chrono!.solved)).toBe(true);
  await page.screenshot({ path: 'test-results/f7-snapped.png' });

  // Lift it off again: the axle is freed at once; dropped in empty space it floats back to the strip.
  await drag(page, to, [to[0], to[1] + 140]);
  expect(await page.evaluate(() => window.__chrono!.held)).toBe(gearId);
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({});
  await page.mouse.up();
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({});
  expect(await page.evaluate(() => window.__chrono!.solved)).toBe(false);
  expect(errors).toEqual([]);
});

test('desktop: dropping a gear in empty space sends it back to the strip; dragging empty space orbits', async ({ page }) => {
  const errors = await open(page);
  const from = await screen(page, 'gears', gearId);
  const home = await page.evaluate((id) => window.__chrono!.gears[id]!, gearId);
  await drag(page, from, [from[0] - 200, from[1] + 260]);
  expect(await page.evaluate(() => window.__chrono!.held)).toBe(gearId);
  await page.mouse.up();
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({});
  expect(await page.evaluate((id) => window.__chrono!.gears[id]!, gearId)).toEqual(home);

  // Empty canvas corner: no gear held, the camera moves.
  const cam = () => page.evaluate(() => window.__chrono!.toScreen(window.__chrono!.axles['a0']!));
  const before = await cam();
  await page.mouse.move(20, 400);
  await page.mouse.down();
  await page.mouse.move(220, 420, { steps: 8 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await cam();
  expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeGreaterThan(5);
  await page.screenshot({ path: 'test-results/f7-back.png' });
  expect(errors).toEqual([]);
});
