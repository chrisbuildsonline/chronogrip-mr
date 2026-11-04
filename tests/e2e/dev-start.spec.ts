import { expect, test } from './fixtures';

import { PANEL_ZONE } from '../../src/ui';
import { inZone } from '../../src/seat';
import { CLEAR, enterWithHands, flow, nudge, pinch, poke } from './hands';

// Runs against the dev server (project "dev") with the IWER emulator: the start panel in a headset session, with hands.

const card = (page: import('@playwright/test').Page) => page.evaluate(() => window.__chrono!.card?.screen);
const cardIs = (page: import('@playwright/test').Page, screen: string) =>
  page.waitForFunction((s) => window.__chrono!.card?.screen === s, screen, { timeout: 10_000 });

test('dev server: the start panel shows its three buttons inside the comfort zone, and each can be poked open and closed', async ({ page }) => {
  const errors = await enterWithHands(page);
  expect(await flow(page)).toBe('title');
  await page.waitForFunction(() => window.__chrono!.buttons().length === 4, undefined, { timeout: 15_000 });
  const buttons = await page.evaluate(() => window.__chrono!.buttons());
  expect(buttons.map((b) => [b.id, b.label])).toEqual([['start', 'New Game'], ['random', 'Random level'], ['options', 'Options'], ['scores', 'High scores']]);
  // The head sits at the origin: every button's centre is within the panel zone (yaw 35, pitch 18) and reach (60 cm).
  for (const b of buttons) {
    expect(inZone(b.world, PANEL_ZONE), `${b.id} in the panel zone`).toBe(true);
    expect(Math.hypot(...b.world), `${b.id} within reach`).toBeLessThanOrEqual(0.6);
  }
  await page.screenshot({ path: 'test-results/start/dev-start.png' });

  // Options: poke it open, see the grab line say pinch, poke Back.
  await poke(page, 'options');
  await cardIs(page, 'options');
  await pinch(page, 'right', 0);
  await nudge(page, CLEAR); // off the card: the next pinch must start on nothing, not press the button under the hand
  const options = await page.evaluate(() => window.__chrono!.buttons());
  expect(options.map((b) => b.id)).toEqual(['relaxed', 'sound', 'music', 'reset', 'back']);
  for (const b of options) expect(inZone(b.world, PANEL_ZONE), `${b.id} in the panel zone`).toBe(true);
  expect(await page.evaluate(() => window.__chrono!.labels().map((l) => l.text))).toContain('Grab a gear: pinch it, carry it, let go.');
  await page.screenshot({ path: 'test-results/start/dev-options.png' });
  // A poke on a switch flips it; Reset progress asks first and Keep it leaves everything as it was.
  await poke(page, 'relaxed');
  await page.waitForFunction(() => window.__chrono!.timer.relaxed, undefined, { timeout: 10_000 });
  await poke(page, 'relaxed');
  await page.waitForFunction(() => !window.__chrono!.timer.relaxed, undefined, { timeout: 10_000 });
  await poke(page, 'reset');
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'reset-yes'), undefined, { timeout: 10_000 });
  for (const b of await page.evaluate(() => window.__chrono!.buttons())) expect(inZone(b.world, PANEL_ZONE), `${b.id} in the panel zone`).toBe(true);
  await poke(page, 'reset-cancel');
  await page.waitForFunction(() => window.__chrono!.options?.confirm === false, undefined, { timeout: 10_000 });
  await poke(page, 'back');
  await cardIs(page, 'title');

  // High scores: poke it open and back.
  await poke(page, 'scores');
  await cardIs(page, 'board');
  expect(await page.evaluate(() => window.__chrono!.labels().map((l) => l.text))).toContain('LOCAL');
  const board = await page.evaluate(() => window.__chrono!.buttons());
  for (const b of board) expect(inZone(b.world, PANEL_ZONE), `${b.id} in the panel zone`).toBe(true);
  await poke(page, 'back');
  await cardIs(page, 'title');

  // Random level opens the difficulty picker, in the zone; New Game plays level 1 at once.
  await poke(page, 'random');
  await cardIs(page, 'picker');
  const picker = await page.evaluate(() => window.__chrono!.buttons());
  expect(picker.map((b) => b.id)).toEqual(['easy', 'medium', 'hard', 'expert', 'back']);
  for (const b of picker) expect(inZone(b.world, PANEL_ZONE), `${b.id} in the panel zone`).toBe(true);
  await poke(page, 'back');
  await cardIs(page, 'title');
  await poke(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  expect(await card(page)).toBe('hud');
  expect(errors).toEqual([]);
});
