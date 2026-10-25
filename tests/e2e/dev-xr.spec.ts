import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { inComfortZone, interactables, type Vec3 } from '../../src/seat';

// Runs against the dev server (project "dev"), where the IWER emulator is injected.
test('dev server: emulator makes Enter MR work and starts an XR session', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // Desktop chromium has a native XRWebGLBinding that rejects IWER's fake session ("parameter 1 is not of
  // type 'XRSession'"); IWER does not polyfill it. Hiding it makes three fall back to XRWebGLLayer, which IWER does.
  await page.addInitScript(() => {
    delete (window as { XRWebGLBinding?: unknown }).XRWebGLBinding;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);

  expect(await page.evaluate(() => navigator.xr?.isSessionSupported('immersive-ar'))).toBe(true);

  const button = page.getByRole('button', { name: 'Enter MR' });
  await expect(button).toBeEnabled();
  await expect(page.locator('#enter-note')).toBeHidden();
  expect(await page.evaluate(() => window.__chrono?.xrPresenting)).toBe(false);

  await button.click();
  await page.waitForFunction(() => window.__chrono?.xrPresenting === true, undefined, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/f5-dev-xr.png' });

  expect(errors).toEqual([]);
});

const comfort = async (page: Page) => {
  const pose = await page.evaluate(() => window.__chrono!.trayPose);
  return LEVELS.every((l) => interactables(l, { ...pose, position: [...pose.position] as Vec3 }).every(inComfortZone));
};

/** Starts an XR session in IWER's synthetic living room (see vite.config.ts), whose planes are all out of reach of the seated head, so the tray takes the default pose. */
async function enterMr(page: Page) {
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
  expect(await page.evaluate(() => window.__chrono?.trayPlaced)).toBe('default');
  expect(await page.evaluate(() => window.__chrono?.handHint)).toBe(false);
  await page.getByRole('button', { name: 'Enter MR' }).click();
  await page.waitForFunction(() => window.__chrono?.xrPresenting === true, undefined, { timeout: 10_000 });
  // IWER has no hands by default: the first frame shows the hint.
  await page.waitForFunction(() => window.__chrono?.handHint === true, undefined, { timeout: 10_000 });
  await page.waitForTimeout(3500); // past the plane search window
  return errors;
}

test('dev server: with no usable plane the tray takes the default pose, in the comfort zone, and the hands hint shows', async ({ page }) => {
  const errors = await enterMr(page);
  await page.screenshot({ path: 'test-results/f6-dev-default.png' });
  expect(await page.evaluate(() => window.__chrono?.trayPlaced)).toBe('default');
  expect(await comfort(page)).toBe(true);
  expect(errors).toEqual([]);
});
