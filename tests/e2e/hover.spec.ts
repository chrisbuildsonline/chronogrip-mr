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

test('desktop: hovering a gear marks it as the gaze target; dragging pulses the valid axles', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.gazeTarget)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.validAxles)).toEqual([]);

  const from = await screen(page, 'gears', gearId);
  await page.mouse.move(from[0], from[1]);
  await page.waitForFunction((id) => window.__chrono!.gazeTarget?.id === id && window.__chrono!.gazeTarget.kind === 'gear', gearId);
  await page.screenshot({ path: 'test-results/f8-hover-gear.png' });

  // An empty axle is a target too.
  const empty = await screen(page, 'axles', axleId);
  await page.mouse.move(empty[0], empty[1]);
  await page.waitForFunction((id) => window.__chrono!.gazeTarget?.id === id && window.__chrono!.gazeTarget.kind === 'axle', axleId);

  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(from[0] + 20, from[1] + 20, { steps: 5 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBe(gearId);
  await page.waitForFunction(() => window.__chrono!.validAxles.length > 0);
  expect(await page.evaluate(() => window.__chrono!.validAxles)).toContain(axleId);
  await page.screenshot({ path: 'test-results/f8-pulse.png' });

  await page.mouse.up();
  await page.waitForFunction(() => window.__chrono!.validAxles.length === 0);
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(errors).toEqual([]);
});
