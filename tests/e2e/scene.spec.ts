import { expect, test } from '@playwright/test';

test('seated scene renders gears, shows Enter MR and a clean console', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');

  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  const hook = await page.evaluate(() => window.__chrono);
  expect(hook?.levelId).toBe('l1');
  expect(hook?.gearCount ?? 0).toBeGreaterThan(0);
  expect(hook?.axleCount).toBe(3);

  const button = page.getByRole('button', { name: 'Enter MR' });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(page.getByText(/needs a Quest browser/i)).toBeVisible();

  await page.waitForTimeout(1000);
  const shot = await page.screenshot({ path: 'test-results/f5-scene.png' });

  // Not blank: decode the screenshot in the page and count distinct colours and brass-ish pixels.
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    let warm = 0;
    for (let i = 0; i < d.length; i += 4 * 17) {
      const r = d[i]!, g = d[i + 1]!, b2 = d[i + 2]!;
      seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b2 >> 3));
      if (r > 120 && r > b2 * 1.4 && g > b2) warm++;
    }
    return { distinct: seen.size, warm };
  }, shot.toString('base64'));
  expect(stats.distinct).toBeGreaterThan(40);
  expect(stats.warm).toBeGreaterThan(50);

  expect(errors).toEqual([]);
});
