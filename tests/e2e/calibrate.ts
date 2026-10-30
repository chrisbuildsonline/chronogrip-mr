import type { Page } from '@playwright/test';
import { DRAG_FULL_PX, TWIST_FULL, settingOf } from '../../src/escapement';

/** Setting still to go to land on the target rate. */
const toTarget = (page: Page) => page.evaluate(() => ({ setting: window.__chrono!.regulator, target: window.__chrono!.targetRate })).then(({ setting, target }) => settingOf(target) - setting);

/** Desktop: presses the regulator knob and drags sideways onto the target; holds until calibrated, then lets go. */
export async function calibrateByMouse(page: Page, opts: { onInBand?: () => Promise<void> } = {}) {
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
  const at = await page.evaluate(() => window.__chrono!.toScreen(window.__chrono!.regulatorAt));
  const dx = (await toTarget(page)) * DRAG_FULL_PX;
  await page.mouse.move(at[0], at[1]);
  await page.mouse.down();
  await page.waitForFunction(() => window.__chrono!.turning === 'mouse');
  await page.mouse.move(at[0] + dx, at[1], { steps: 12 });
  await page.waitForFunction(() => window.__chrono!.inBand);
  await opts.onInBand?.();
  await page.waitForFunction(() => window.__chrono!.automatonRunning);
  await page.mouse.up();
}

type Q = { x: number; y: number; z: number; w: number };
type Handle = { quaternion: Q & { multiply(q: unknown): void; clone(): Q & { set(x: number, y: number, z: number, w: number): unknown } }; getWorldQuaternion<T>(q: T): T };

/**
 * XR (IWER): rolls the right wrist about its fingers by `radians` (clockwise seen along the fingers is positive),
 * in a few steps, by turning the emulator's hand handle about the fingers axis (the tracked wrist's -Z) in its own frame.
 */
export async function twistRight(page: Page, radians: number, steps = 8) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate((a) => {
      const [x, y, z, w] = window.__chrono!.wrists.right!;
      const handle = (window as unknown as { transformHandles: Map<string, Handle> }).transformHandles.get('right')!;
      const h = handle.getWorldQuaternion(handle.quaternion.clone());
      /** v rotated by the quaternion (u, s). */
      const rot = (v: number[], u: number[], s: number) => {
        const c = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        const cc = [u[1]! * c[2]! - u[2]! * c[1]!, u[2]! * c[0]! - u[0]! * c[2]!, u[0]! * c[1]! - u[1]! * c[0]!];
        return v.map((vi, k) => vi + 2 * s * c[k]! + 2 * cc[k]!);
      };
      const fingersWorld = rot([0, 0, -1], [x, y, z], w);
      const f = rot(fingersWorld, [-h.x, -h.y, -h.z], h.w); // into the handle's frame
      const s = Math.sin(a / 2) / Math.hypot(f[0]!, f[1]!, f[2]!);
      handle.quaternion.multiply(handle.quaternion.clone().set(f[0]! * s, f[1]! * s, f[2]! * s, Math.cos(a / 2)));
    }, radians / steps);
    await page.waitForTimeout(80);
  }
}

/** XR: the wrist roll still needed to land on the target, radians. */
export const twistToTarget = async (page: Page) => (await toTarget(page)) * TWIST_FULL;
