import type { Page } from '@playwright/test';
import type { Vec3 } from '../../src/seat';

export type Hand = { updatePinchValue(v: number): void; position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void } };
export type Device = {
  primaryInputMode: string;
  hands: { left?: Hand; right?: Hand };
  updateVisibilityState(s: string): void;
  activeSession?: { end(): Promise<void>; environmentBlendMode: string };
};
export const device = 'IWER_DEVICE';

/** Starts an XR session in IWER with hand input switched on; returns the console errors seen. */
export async function enterWithHands(page: Page) {
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

export const pinch = (page: Page, side: 'left' | 'right', v: number) =>
  page.evaluate(([d, s, value]) => (window as unknown as Record<string, Device>)[d as string]!.hands[s as 'left' | 'right']!.updatePinchValue(value as number), [device, side, v] as const);
export const rightPoint = (page: Page) => page.evaluate(() => window.__chrono!.pinchPoints.right);
export const flow = (page: Page) => page.evaluate(() => window.__chrono!.flow);

/** Shifts the right hand by a world offset. */
export async function nudge(page: Page, d: Vec3) {
  await page.evaluate(([dx, dy, dz]) => {
    // The emulator panel rewrites the device hand from its own handle every frame, so move the handle.
    const p = (window as unknown as { transformHandles: Map<string, { position: Hand['position'] }> }).transformHandles.get('right')!.position;
    p.set(p.x + dx!, p.y + dy!, p.z + dz!);
  }, d);
  await page.waitForTimeout(400);
}

/** Pinched right hand: shifts the hand so its pinch point lands on the target (the app reports the point). */
export async function movePinchTo(page: Page, target: Vec3) {
  const from = (await rightPoint(page))!;
  await nudge(page, [target[0] - from[0], target[1] - from[1], target[2] - from[2]]);
}

/** Up and towards the player, clear of every gear, so the next pinch starts on nothing. */
export const CLEAR: Vec3 = [0, 0.1, 0.15];

/** Pinches with the right hand where it is, then releases, so the next pinch can start at the target. */
export async function pinchAt(page: Page, target: Vec3) {
  await pinch(page, 'right', 1);
  await page.waitForTimeout(400);
  await movePinchTo(page, target);
  await pinch(page, 'right', 0);
  await page.waitForTimeout(300);
  await pinch(page, 'right', 1);
  await page.waitForTimeout(400);
}

/** Pokes a panel button: the fingertip comes in from 6 cm in front of it and touches its face. */
export async function poke(page: Page, id: string) {
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

export const gearAt = (page: Page, id: string) => page.evaluate((g) => window.__chrono!.gears[g]!, id);
export const axleAt = (page: Page, id: string) => page.evaluate((a) => window.__chrono!.axles[a]!, id);

/** Carries a gear by hand from where it rests onto an axle. */
export async function carry(page: Page, gear: string, axle: string) {
  await pinchAt(page, await gearAt(page, gear));
  await page.waitForFunction((g) => window.__chrono!.held === g, gear, { timeout: 10_000 });
  await movePinchTo(page, await axleAt(page, axle));
  await pinch(page, 'right', 0);
  await page.waitForFunction(() => window.__chrono!.held === null, undefined, { timeout: 10_000 });
  await nudge(page, CLEAR);
}
