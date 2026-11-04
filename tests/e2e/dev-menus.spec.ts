import { expect, test } from './fixtures';
import { enterWithHands, poke } from './hands';


// Runs against the dev server (project "dev") with the IWER emulator: in a headset session the menus must not black out
// the view (passthrough is a rule), so a dark backing panel sits just behind the card instead of a full-view layer.

const cardIs = (page: import('@playwright/test').Page, screen: string) =>
  page.waitForFunction((s) => window.__chrono!.card?.screen === s, screen, { timeout: 10_000 });
const scrim = (page: import('@playwright/test').Page) => page.evaluate(() => window.__chrono!.scrim);

test('dev server: in a headset every menu has a 90% backing panel behind its card and no full-view blackout, and play has neither', async ({ page }) => {
  const errors = await enterWithHands(page);
  await cardIs(page, 'title');
  await page.waitForFunction(() => window.__chrono!.scrim.mode === 'backing', undefined, { timeout: 10_000 });
  expect(await scrim(page)).toMatchObject({ mode: 'backing', backingOpacity: 0.9 });
  const card = await page.evaluate(() => window.__chrono!.card!);
  // The backing is the card and a margin, not the view: the card is a hand-sized panel.
  expect(card.width).toBeLessThan(0.5);
  await page.screenshot({ path: 'test-results/menus/dev-title.png' });

  await poke(page, 'options');
  await cardIs(page, 'options');
  expect((await scrim(page)).mode).toBe('backing');
  await poke(page, 'back');
  await cardIs(page, 'title');
  await poke(page, 'scores');
  await cardIs(page, 'board');
  expect((await scrim(page)).mode).toBe('backing');
  await poke(page, 'back');
  await cardIs(page, 'title');
  await poke(page, 'random');
  await cardIs(page, 'picker');
  expect((await scrim(page)).mode).toBe('backing');
  await page.screenshot({ path: 'test-results/menus/dev-picker.png' });
  // The difficulty picker is a centred column, every button in the panel zone.
  const xs = await page.evaluate(() => [...new Set(window.__chrono!.buttons().map((b) => b.screen[0]!.toFixed(0)))]);
  expect(xs.length).toBe(1);
  await poke(page, 'back');
  await cardIs(page, 'title');
  await poke(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  expect(await scrim(page)).toMatchObject({ mode: null });
  expect(errors).toEqual([]);
});
