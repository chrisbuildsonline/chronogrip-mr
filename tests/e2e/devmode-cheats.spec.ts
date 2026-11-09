import { expect, test } from './fixtures';

// Served from a DEV_MODE=on build (playwright.config.ts, project devmode). The cheats run the real flow.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
});

const settled = (page: import('@playwright/test').Page) => page.waitForFunction(() => !window.__chrono!.cameraMoving);

test('the panel opens from its pill and plays any level of a stage', async ({ page }) => {
  const pill = page.locator('#chronogrip-cheats .pill');
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page.locator('#chronogrip-cheats .card')).toBeVisible();
  await page.locator('[data-cheat="stage"]').selectOption('medium');
  await page.locator('[data-cheat="level"]').fill('7');
  await page.locator('[data-cheat="jump"]').click();
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 6);
  expect(await page.evaluate(() => window.__chrono!.run)).toMatchObject({ stage: 'medium', cleared: 6 });
});

test('Solve level goes through the real complete card and Next plays the following level', async ({ page }) => {
  await page.evaluate(() => window.__chronoDev!.jump(3, 'easy'));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 2);
  await page.locator('#chronogrip-cheats .pill').click();
  await page.locator('[data-cheat="solve"]').click();
  await page.waitForFunction(() => window.__chrono!.flow === 'complete' && window.__chrono!.card?.screen === 'complete');
  expect(await page.evaluate(() => window.__chrono!.run!.cleared)).toBe(3); // the run counted it
  expect(await page.evaluate(() => window.__chrono!.celebration.fanfares)).toBe(0); // level 3 is no stage clear
  await settled(page);
  const [x, y] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'next')!.screen);
  await page.mouse.click(x, y);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 3);
});

test('Clear stage: level 20 solved plays the celebration, then Continue asks for a name', async ({ page }) => {
  await page.mouse.click(5, 5); // a real click unlocks the audio, so the fanfare plays (and counts)
  await page.locator('#chronogrip-cheats .pill').click();
  await page.locator('[data-cheat="stage"]').selectOption('hard');
  await page.locator('[data-cheat="clear"]').click();
  await page.waitForFunction(() => window.__chrono!.flow === 'complete' && window.__chrono!.levelIndex === 19);
  const c = await page.evaluate(() => window.__chrono!.celebration);
  expect(c.fanfares).toBe(1);
  expect(c.at).toBeGreaterThan(0);
  expect(c.flying).toBe(!c.calm); // gear confetti unless reduced motion
  expect(c.gears).toBe(48);
  expect(await page.evaluate(() => window.__chrono!.run)).toMatchObject({ stage: 'hard', cleared: 20 });
  // the confetti lands and the burst ends within its 4.5 s; then the stage-cleared card over a dark layer (72%) that fades in
  await page.waitForFunction(() => !window.__chrono!.celebration.flying, null, { timeout: 15_000 });
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'cleared');
  await page.waitForFunction(() => window.__chrono!.scrim.mode === 'full' && Math.abs(window.__chrono!.scrim.opacity - 0.72) < 1e-6);
  await settled(page);
  const [x, y] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'next')!.screen);
  await page.mouse.click(x, y);
  await page.waitForFunction(() => window.__chrono!.flow === 'title' && window.__chrono!.run === null);
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'initials');
  // Save keeps it on this device only: a cheated run never posts to the global board.
  const posts: string[] = [];
  page.on('request', (r) => r.method() === 'POST' && /chronogrip_scores/.test(r.url()) && posts.push(r.url()));
  await settled(page);
  const [sx, sy] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'save')!.screen);
  await page.mouse.click(sx, sy);
  await page.waitForFunction(() => window.__chrono!.card?.screen !== 'initials');
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
});

test('reduced motion: the celebration is calm, the sound and the card only', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await page.mouse.click(5, 5); // unlocks the audio
  await page.evaluate(() => window.__chronoDev!.clearStage('easy'));
  await page.waitForFunction(() => window.__chrono!.flow === 'complete' && window.__chrono!.levelIndex === 19);
  const c = await page.evaluate(() => window.__chrono!.celebration);
  expect(c).toMatchObject({ calm: true, flying: false, fanfares: 1 });
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'cleared');
  await ctx.close();
});

test('Clear stage: the board fades away at once, so the celebration plays over an empty bench', async ({ page }) => {
  await page.mouse.click(5, 5);
  await page.locator('#chronogrip-cheats .pill').click();
  await page.locator('[data-cheat="clear"]').click();
  await page.waitForFunction(() => window.__chrono!.flow === 'complete' && window.__chrono!.levelIndex === 19);
  const t0 = Date.now();
  await page.waitForFunction(() => window.__chrono!.boardHidden === 1, null, { timeout: 5_000 });
  expect(Date.now() - t0, 'gone by about 1.8 s after the solve').toBeLessThan(1_800);
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'cleared', null, { timeout: 15_000 });
});
