import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import type { Vec3 } from '../../src/seat';
import { twistRight, twistToTarget } from './calibrate';

type Hand = { updatePinchValue(v: number): void; position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void } };
type Device = { primaryInputMode: string; hands: { left?: Hand; right?: Hand }; updateVisibilityState(s: string): void; activeSession?: { end(): Promise<void> } };
const device = 'IWER_DEVICE';

/** Starts an XR session in IWER with hand input switched on; returns the console errors seen. */
async function enterWithHands(page: Page) {
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
  await page.getByRole('button', { name: 'Enter MR' }).click();
  await page.waitForFunction(() => window.__chrono?.handHint === true, undefined, { timeout: 10_000 });
  await page.evaluate((d) => {
    (window as unknown as Record<string, Device>)[d]!.primaryInputMode = 'hand';
  }, device);
  await page.waitForFunction(() => window.__chrono?.handHint === false, undefined, { timeout: 10_000 });
  return errors;
}

const pinch = (page: Page, side: 'left' | 'right', v: number) =>
  page.evaluate(([d, s, value]) => (window as unknown as Record<string, Device>)[d as string]!.hands[s as 'left' | 'right']!.updatePinchValue(value as number), [device, side, v] as const);
const rightPoint = (page: Page) => page.evaluate(() => window.__chrono!.pinchPoints.right);
const flow = (page: Page) => page.evaluate(() => window.__chrono!.flow);

/** Shifts the right hand by a world offset. */
async function nudge(page: Page, d: Vec3) {
  await page.evaluate(([dx, dy, dz]) => {
    // The emulator panel rewrites the device hand from its own handle every frame, so move the handle.
    const p = (window as unknown as { transformHandles: Map<string, { position: Hand['position'] }> }).transformHandles.get('right')!.position;
    p.set(p.x + dx!, p.y + dy!, p.z + dz!);
  }, d);
  await page.waitForTimeout(400);
}

/** Pinched right hand: shifts the hand so its pinch point lands on the target (the app reports the point). */
async function movePinchTo(page: Page, target: Vec3) {
  const from = (await rightPoint(page))!;
  await nudge(page, [target[0] - from[0], target[1] - from[1], target[2] - from[2]]);
}

/** Up and towards the player, clear of every gear, so the next pinch starts on nothing. */
const CLEAR: Vec3 = [0, 0.1, 0.15];

/** Pinches with the right hand where it is, then releases, so the next pinch can start at the target. */
async function pinchAt(page: Page, target: Vec3) {
  await pinch(page, 'right', 1);
  await page.waitForTimeout(400);
  await movePinchTo(page, target);
  await pinch(page, 'right', 0);
  await page.waitForTimeout(300);
  await pinch(page, 'right', 1);
  await page.waitForTimeout(400);
}

/** Pokes a panel button: the fingertip comes in from 6 cm in front of it and touches its face. */
async function poke(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id, { timeout: 15_000 });
  const w = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.world, id);
  if (!(await rightPoint(page))) {
    await pinch(page, 'right', 1);
    await page.waitForFunction(() => window.__chrono!.pinchPoints.right !== null, undefined, { timeout: 10_000 });
  }
  const k = 1 - 0.06 / Math.hypot(...w); // the head is at the origin, the panel faces it
  await movePinchTo(page, [w[0] * k, w[1] * k, w[2] * k]);
  await movePinchTo(page, w);
}

const gearAt = (page: Page, id: string) => page.evaluate((g) => window.__chrono!.gears[g]!, id);
const axleAt = (page: Page, id: string) => page.evaluate((a) => window.__chrono!.axles[a]!, id);

/** Carries a gear by hand from where it rests onto an axle. */
async function carry(page: Page, gear: string, axle: string) {
  await pinchAt(page, await gearAt(page, gear));
  await page.waitForFunction((g) => window.__chrono!.held === g, gear, { timeout: 10_000 });
  await movePinchTo(page, await axleAt(page, axle));
  await pinch(page, 'right', 0);
  await page.waitForFunction(() => window.__chrono!.held === null, undefined, { timeout: 10_000 });
  await nudge(page, CLEAR);
}

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

  await poke(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => ({ placements: window.__chrono!.placements, gears: window.__chrono!.gears }))).toEqual(board);
  expect(await page.evaluate(() => window.__chrono!.levelTime)).toBeLessThan(t + 1);

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
