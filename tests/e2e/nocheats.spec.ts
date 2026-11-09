import { expect, test } from './fixtures';

// A normal build (no DEV_MODE) has no cheat panel and ships none of its code: the flag folds to false and the import is dropped.
test('the production build has no cheat panel and no cheat code', async ({ page, request }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect(await page.locator('#chronogrip-cheats').count()).toBe(0);
  expect(await page.evaluate(() => window.__chronoDev === undefined)).toBe(true);
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\.js(\?|$)/.test(n)));
  expect(scripts.length).toBeGreaterThan(0);
  for (const src of scripts) expect(await (await request.get(src)).text()).not.toMatch(/chronogrip-cheats|__chronoDev/);
});
