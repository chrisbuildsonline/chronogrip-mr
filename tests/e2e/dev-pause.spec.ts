import { expect, test } from './fixtures';
import { newGame } from './start';
import { PANEL_ZONE } from '../../src/ui';
import { inZone } from '../../src/seat';
import { device, enterWithHands, flow, poke, type Device } from './hands';

// Runs against the dev server (project "dev") with the IWER emulator: pause in a headset session.

const cardIs = (page: import('@playwright/test').Page, screen: string) =>
  page.waitForFunction((s) => window.__chrono!.card?.screen === s, screen, { timeout: 15_000 });

test('dev server: the headset menu or taking the headset off pauses with the board hidden and no penalty; Resume counts down and brings the board back', async ({ page }) => {
  const errors = await enterWithHands(page);
  await newGame(page, (id) => poke(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__chrono!.boardVisible)).toBe(true);

  // The Quest menu opens: the session is visible-blurred. The game pauses itself.
  await page.evaluate((d) => (window as unknown as Record<string, Device>)[d]!.updateVisibilityState('visible-blurred'), device);
  await page.waitForFunction(() => window.__chrono!.flow === 'paused', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.boardVisible)).toBe(false);
  expect(await page.evaluate(() => window.__chrono!.run), 'no penalty for a system pause').toMatchObject({ pauses: 0 });
  // Back in the game: still paused (the player resumes, with the countdown).
  await page.evaluate((d) => (window as unknown as Record<string, Device>)[d]!.updateVisibilityState('visible'), device);
  await cardIs(page, 'paused');
  const buttons = await page.evaluate(() => window.__chrono!.buttons());
  for (const b of buttons) expect(inZone(b.world, PANEL_ZONE), `${b.id} in the panel zone`).toBe(true);
  await poke(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.countdown !== null, undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.boardVisible)).toBe(false);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__chrono!.boardVisible)).toBe(true);
  expect(await page.evaluate(() => window.__chrono!.run)).toMatchObject({ pauses: 0 });

  // The in-world pause button is a manual pause: it costs 5 s.
  await poke(page, 'pause');
  await page.waitForFunction(() => window.__chrono!.flow === 'paused', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.run)).toMatchObject({ pauses: 1 });
  expect(await flow(page)).toBe('paused');
  expect(errors).toEqual([]);
});

test('dev server: the About card is reachable by poking, its Back and scroll arrows are in the panel zone', async ({ page }) => {
  const errors = await enterWithHands(page);
  await poke(page, 'about');
  await cardIs(page, 'about');
  for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
    expect(inZone(b.world, PANEL_ZONE), `${b.id} in the panel zone`).toBe(true);
    expect(Math.hypot(...b.world), `${b.id} within reach`).toBeLessThanOrEqual(0.6);
  }
  await poke(page, 'down-scroll');
  await page.waitForFunction(() => window.__chrono!.aboutScroll!.scroll > 0, undefined, { timeout: 10_000 });
  await poke(page, 'back');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});
