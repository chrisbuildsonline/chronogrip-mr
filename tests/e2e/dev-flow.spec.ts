import { expect, test } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { twistRight, twistToTarget } from './calibrate';
import { CLEAR, axleAt, carry, device, enterWithHands, flow, gearAt, movePinchTo, nudge, pinch, pinchAt, poke, type Device } from './hands';

test('dev server: poke Start, the ghost hand shows until the first grab, solve level 1 by hand, Next', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await enterWithHands(page);
  const t0 = Date.now();
  expect(await flow(page)).toBe('title');
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(true);
  await page.screenshot({ path: 'test-results/f9-dev-title.png' });

  await poke(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(true);
  await pinch(page, 'right', 0);

  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await pinchAt(page, await gearAt(page, gear));
  await page.waitForFunction((g) => window.__chrono!.held === g, gear, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(false);
  await movePinchTo(page, await axleAt(page, axle));
  await pinch(page, 'right', 0);
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate', undefined, { timeout: 10_000 });
  // First gear placed within 30 s, by the level clock (wall-clock under parallel software GL is no measure of play).
  expect(await page.evaluate(() => window.__chrono!.levelTime)).toBeLessThan(30);
  expect(Date.now() - t0).toBeLessThan(60_000);
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [gear]: axle });

  // Calibrate: the twist cue shows over the knob; pinch the knob, roll the wrist into the band and hold.
  expect(await page.evaluate(() => window.__chrono!.ghostTwist)).toBe(true);
  expect(await page.evaluate(() => window.__chrono!.inBand)).toBe(false);
  await nudge(page, CLEAR);
  await pinchAt(page, await page.evaluate(() => window.__chrono!.regulatorAt));
  await page.waitForFunction(() => window.__chrono!.turning === 'right', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.ghostTwist)).toBe(false);
  await page.screenshot({ path: 'test-results/f10-dev-calibrate.png' });
  const before = await page.evaluate(() => window.__chrono!.regulator);
  await twistRight(page, await twistToTarget(page));
  await page.waitForFunction(() => window.__chrono!.inBand, undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.regulator)).toBeGreaterThan(before);
  await page.waitForFunction(() => window.__chrono!.flow === 'complete', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.automatonRunning)).toBe(true);
  await pinch(page, 'right', 0);
  await page.waitForFunction(() => window.__chrono!.turning === null, undefined, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/f10-dev-calibrated.png' });
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'), undefined, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/f9-dev-complete.png' });

  await poke(page, 'next');
  await page.waitForFunction(() => window.__chrono!.levelIndex === 1 && window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({});
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(false);
  expect(errors).toEqual([]);
});

test('dev server: the headset menu pauses mid-level; the board and the clock hold until Resume; session end pauses', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await enterWithHands(page);
  await poke(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select', undefined, { timeout: 10_000 });
  await poke(page, 'level-2');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1, undefined, { timeout: 10_000 });
  await pinch(page, 'right', 0);

  await carry(page, 'i1', 'a1');
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ i1: 'a1' });
  // Carry a second gear, then the system menu opens mid-carry: it goes straight back to the strip.
  const home = await gearAt(page, 'i2');
  await pinchAt(page, home);
  await page.waitForFunction(() => window.__chrono!.held === 'i2', undefined, { timeout: 10_000 });
  await movePinchTo(page, await axleAt(page, 'a3'));
  await page.evaluate((d) => (window as unknown as Record<string, Device>)[d]!.updateVisibilityState('visible-blurred'), device);
  await page.waitForFunction(() => window.__chrono!.paused, undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  const board = await page.evaluate(() => ({ placements: window.__chrono!.placements, gears: window.__chrono!.gears }));
  expect(board.placements).toEqual({ i1: 'a1' });
  expect(Math.hypot(...board.gears['i2']!.map((v, i) => v - home[i]!) as [number, number, number])).toBeLessThan(0.001);
  const t = await page.evaluate(() => window.__chrono!.levelTime);

  await page.waitForTimeout(1500);
  await page.evaluate((d) => (window as unknown as Record<string, Device>)[d]!.updateVisibilityState('visible'), device);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__chrono!.paused)).toBe(true);
  expect(await page.evaluate(() => window.__chrono!.levelTime)).toBe(t);
  await page.screenshot({ path: 'test-results/f9-dev-paused.png' });

  const resumeAt = Date.now();
  await poke(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => ({ placements: window.__chrono!.placements, gears: window.__chrono!.gears }))).toEqual(board);
  // the bound is the real time since Resume, so the 2 s spent paused can't sneak in
  const resumed = (await page.evaluate(() => window.__chrono!.levelTime)) - t;
  expect(resumed).toBeGreaterThanOrEqual(0);
  expect(resumed).toBeLessThan((Date.now() - resumeAt) / 1000 + 0.25);

  await page.evaluate((d) => (window as unknown as Record<string, Device>)[d]!.activeSession!.end(), device);
  await page.waitForFunction(() => window.__chrono!.xrPresenting === false, undefined, { timeout: 10_000 });
  expect(await flow(page)).toBe('paused');
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ i1: 'a1' });
  expect(errors).toEqual([]);
});

test('dev server: a two-hand pinch while one hand carries a gear does not recenter', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await enterWithHands(page);
  const [gear] = Object.entries(LEVELS[0]!.solution)[0]!;
  await pinchAt(page, await gearAt(page, gear));
  await page.waitForFunction((g) => window.__chrono!.held === g, gear, { timeout: 10_000 });
  await pinch(page, 'left', 1);
  await page.waitForFunction(() => window.__chrono!.pinchPoints.left !== null, undefined, { timeout: 10_000 });
  await page.waitForTimeout(4000);
  expect(await page.evaluate(() => window.__chrono!.recenters)).toBe(0);
  expect(await page.evaluate(() => window.__chrono!.held)).toBe(gear);

  // Control: once the gear is let go, the same two-hand pinch does recenter.
  await pinch(page, 'right', 0);
  await page.waitForFunction(() => window.__chrono!.held === null, undefined, { timeout: 10_000 });
  await nudge(page, CLEAR);
  await pinch(page, 'right', 1);
  await page.waitForFunction(() => window.__chrono!.recenters === 1, undefined, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(errors).toEqual([]);
});
