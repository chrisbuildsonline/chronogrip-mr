import { expect, test } from '@playwright/test';

test('home page renders canvas and title with a clean console', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');

  await expect(page).toHaveTitle(/ChronoGrip/);
  await expect(page.getByRole('heading', { name: 'ChronoGrip' })).toBeVisible();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/f1-home.png' });
  expect(errors).toEqual([]);
});
