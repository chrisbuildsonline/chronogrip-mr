import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import type { Vec3 } from '../../src/seat';

type Hand = { updatePinchValue(v: number): void; position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void } };
type Quat = { x: number; y: number; z: number; w: number; set(x: number, y: number, z: number, w: number): unknown; copy(q: unknown): unknown };
type Device = { primaryInputMode: string; position: { x: number; y: number; z: number }; quaternion: Quat; hands: { left?: Hand; right?: Hand } };

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

/**
 * Turns the emulated head to look at a world point. The emulator panel copies its own camera rig onto the
 * device quaternion every frame and does not expose the rig, so the quaternion's `copy` is wrapped to
 * re-apply the wanted orientation after each sync.
 */
async function lookAt(page: Page, target: Vec3) {
  await page.evaluate((t) => {
    const device = (window as unknown as { IWER_DEVICE: Device }).IWER_DEVICE;
    // The scene is in the local reference space, whose origin is the head's start pose, so the head sits at 0,0,0.
    const [dx, dy, dz] = t;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    // Yaw about Y, then pitch about X: q = qy * qx.
    const [sy, cy, sp, cp] = [Math.sin(yaw / 2), Math.cos(yaw / 2), Math.sin(pitch / 2), Math.cos(pitch / 2)];
    const q = device.quaternion as Quat & { __orig?: Quat['copy'] };
    const want: [number, number, number, number] = [cy * sp, sy * cp, -sy * sp, cy * cp];
    q.__orig ??= q.copy.bind(q);
    q.copy = (src: unknown) => {
      q.__orig!(src);
      q.set(...want);
      return q;
    };
    q.set(...want);
  }, target);
  await page.waitForTimeout(300);
}

const pinchRight = (page: Page, v: number) =>
  page.evaluate((value) => (window as unknown as { IWER_DEVICE: Device }).IWER_DEVICE.hands.right!.updatePinchValue(value), v);
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

test('dev server: head gaze, hand glow and valid-axle pulses', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await enterWithHands(page);
  expect(await page.evaluate(() => window.__chrono!.validAxles)).toEqual([]);

  // Gaze: the head looks at the loose gear, then at the empty axle.
  const gear = await page.evaluate((id) => window.__chrono!.gears[id]!, gearId);
  await lookAt(page, gear);
  await page.waitForFunction((id) => window.__chrono!.gazeTarget?.id === id && window.__chrono!.gazeTarget.kind === 'gear', gearId, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/f8-dev-gaze.png' });
  const axle = await page.evaluate((id) => window.__chrono!.axles[id]!, axleId);
  await lookAt(page, axle);
  await page.waitForFunction((id) => window.__chrono!.gazeTarget?.id === id && window.__chrono!.gazeTarget.kind === 'axle', axleId, { timeout: 10_000 });

  // Hand glow: carry a pinch point to the gear and open the hand without grabbing it.
  expect(await page.evaluate(() => window.__chrono!.handGlow)).toEqual([]);
  await pinchRight(page, 1);
  await page.waitForTimeout(400);
  await movePinchTo(page, gear);
  await pinchRight(page, 0);
  await page.waitForFunction((id) => window.__chrono!.handGlow.includes(id), gearId, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  await page.screenshot({ path: 'test-results/f8-dev-glow.png' });

  // Pinch it: the valid axles pulse and include the right one; the carrying hand's glow stops.
  await pinchRight(page, 1);
  await page.waitForFunction((id) => window.__chrono!.held === id, gearId, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.validAxles)).toContain(axleId);
  expect(await page.evaluate(() => window.__chrono!.handGlow)).toEqual([]);
  await page.screenshot({ path: 'test-results/f8-dev-pulse.png' });

  await movePinchTo(page, axle);
  await pinchRight(page, 0);
  await page.waitForFunction(() => window.__chrono!.held === null, undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [gearId]: axleId });
  expect(await page.evaluate(() => window.__chrono!.validAxles)).toEqual([]);
  expect(errors).toEqual([]);
});
