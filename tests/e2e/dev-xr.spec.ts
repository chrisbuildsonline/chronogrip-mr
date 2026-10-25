import { expect, test } from '@playwright/test';

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
