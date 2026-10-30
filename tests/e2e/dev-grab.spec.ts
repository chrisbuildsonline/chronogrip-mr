import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import type { Vec3 } from '../../src/seat';

type Hand = { updatePinchValue(v: number): void; position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void } };
type Device = { primaryInputMode: string; hands: { left?: Hand; right?: Hand } };

const level = LEVELS[0]!;
const [gearId, axleId] = Object.entries(level.solution)[0]!;

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
  await page.evaluate(() => {
    (window as unknown as { IWER_DEVICE: Device }).IWER_DEVICE.primaryInputMode = 'hand';
  });
  await page.waitForFunction(() => window.__chrono?.handHint === false, undefined, { timeout: 10_000 });
  return errors;
}

const pinchRight = (page: Page, v: number) =>
  page.evaluate((value) => (window as unknown as { IWER_DEVICE: Device }).IWER_DEVICE.hands.right!.updatePinchValue(value), v);

const gearAt = (page: Page) => page.evaluate((id) => window.__chrono!.gears[id]!, gearId);
const axleAt = (page: Page) => page.evaluate((id) => window.__chrono!.axles[id]!, axleId);
const rightPoint = (page: Page) => page.evaluate(() => window.__chrono!.pinchPoints.right);

/** Pinched right hand: shifts the hand so its pinch point lands on the target (the app reports the point). */
async function movePinchTo(page: Page, target: Vec3) {
  const from = (await rightPoint(page))!;
  await page.evaluate(
    ([dx, dy, dz]) => {
      // The emulator panel rewrites the device hand from its own handle every frame, so move the handle.
      const p = (window as unknown as { transformHandles: Map<string, { position: Hand['position'] }> }).transformHandles.get('right')!.position;
      p.set(p.x + dx!, p.y + dy!, p.z + dz!);
    },
    [target[0] - from[0], target[1] - from[1], target[2] - from[2]],
  );
  await page.waitForTimeout(400);
}

/** Pinches with the right hand out of reach, then releases, so the next pinch can start at the target. */
async function pinchAt(page: Page, target: Vec3) {
  await pinchRight(page, 1);
  await page.waitForTimeout(400);
  await movePinchTo(page, target);
  await pinchRight(page, 0);
  await page.waitForTimeout(300);
  await pinchRight(page, 1);
  await page.waitForTimeout(400);
}

const near = (a: readonly number[], b: readonly number[], m: number) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) < m;

test('dev server: pinching a loose gear carries it to its axle and solves level 1', async ({ page }) => {
  test.setTimeout(90_000); // software GL makes screenshots slow in XR
  const errors = await enterWithHands(page);
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.solved)).toBe(false);

  const start = await gearAt(page);
  await pinchAt(page, start);
  expect(await page.evaluate(() => window.__chrono!.held)).toBe(gearId);

  const axle = await axleAt(page);
  await movePinchTo(page, axle);
  expect(near(await gearAt(page), (await rightPoint(page))!, 0.005)).toBe(true);
  expect(near((await rightPoint(page))!, axle, 0.01)).toBe(true);
  await page.screenshot({ path: 'test-results/f7-dev-held.png' });

  await pinchRight(page, 0);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [gearId]: axleId });
  expect(await page.evaluate(() => window.__chrono!.solved)).toBe(true);
  await page.waitForFunction(([g, a]) => {
    const p = window.__chrono!.gears[g!]!;
    return Math.hypot(p[0] - a![0]!, p[1] - a![1]!, p[2] - a![2]!) < 0.001;
  }, [gearId, axle] as const, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/f7-dev-snapped.png' });

  // Solved goes on to calibrating the escapement: the board is locked, a pinch on the placed gear does not lift it.
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('calibrate');
  await pinchAt(page, axle);
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [gearId]: axleId });
  expect(errors).toEqual([]);
});

test('dev server: releasing far from any axle floats the gear back to the strip', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await enterWithHands(page);
  const start = await gearAt(page);
  await pinchAt(page, start);
  expect(await page.evaluate(() => window.__chrono!.held)).toBe(gearId);

  // Halfway between the middle and the last axle is 5 cm from both.
  const a1 = await axleAt(page);
  const far = await page.evaluate(() => window.__chrono!.axles['a2']!);
  await movePinchTo(page, [(a1[0] + far[0]) / 2, (a1[1] + far[1]) / 2, (a1[2] + far[2]) / 2]);
  await pinchRight(page, 0);
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({});
  expect(await page.evaluate(() => window.__chrono!.solved)).toBe(false);
  await page.waitForFunction(([g, s]) => {
    const p = window.__chrono!.gears[g!]!;
    return Math.hypot(p[0] - s![0]!, p[1] - s![1]!, p[2] - s![2]!) < 0.001;
  }, [gearId, start] as const, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/f7-dev-back.png' });
  expect(errors).toEqual([]);
});
