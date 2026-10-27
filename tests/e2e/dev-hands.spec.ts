import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { inComfortZone, interactables, type Vec3 } from '../../src/seat';

type Hand = { updatePinchValue(v: number): void };
type Device = { primaryInputMode: string; hands: { left?: Hand; right?: Hand } };

/** Starts an XR session in IWER with hand input switched on; returns the console errors seen. */
async function enterWithHands(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    delete (window as { XRWebGLBinding?: unknown }).XRWebGLBinding;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await page.getByRole('button', { name: 'Enter MR' }).click();
  await page.waitForFunction(() => window.__chrono?.handHint === true, undefined, { timeout: 10_000 });
  await page.evaluate(() => {
    (window as unknown as { IWER_DEVICE: Device }).IWER_DEVICE.primaryInputMode = 'hand';
  });
  await page.waitForFunction(() => window.__chrono?.handHint === false, undefined, { timeout: 10_000 });
  return errors;
}

const pinch = (page: Page, left: number, right: number) =>
  page.evaluate(
    ([l, r]) => {
      const { hands } = (window as unknown as { IWER_DEVICE: Device }).IWER_DEVICE;
      hands.left?.updatePinchValue(l!);
      hands.right?.updatePinchValue(r!);
    },
    [left, right],
  );

test('dev server: the hands hint hides when hands appear', async ({ page }) => {
  test.setTimeout(90_000); // software GL makes screenshots slow in XR
  const errors = await enterWithHands(page);
  await page.screenshot({ path: 'test-results/f6-dev-hands.png' });
  expect(errors).toEqual([]);
});

test('dev server: pinching both hands for a second recenters the tray once; one hand does not', async ({ page }) => {
  test.setTimeout(90_000); // the hold is timed in XR frame time, which lags wall-clock on software GL
  const errors = await enterWithHands(page);
  expect(await page.evaluate(() => window.__chrono?.recenters)).toBe(0);

  await pinch(page, 1, 1);
  await page.waitForFunction(() => window.__chrono?.recenters === 1, undefined, { timeout: 15_000 });
  // Still pinched: the hold fires once, not again.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__chrono?.recenters)).toBe(1);
  const pose = await page.evaluate(() => window.__chrono!.trayPose);
  expect(LEVELS.every((l) => interactables(l, { ...pose, position: [...pose.position] as Vec3 }).every(inComfortZone))).toBe(true);

  await pinch(page, 0, 0);
  await page.waitForTimeout(500);
  await pinch(page, 1, 0);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__chrono?.recenters)).toBe(1);
  expect(errors).toEqual([]);
});
