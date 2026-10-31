import { expect, test } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { twistRight, twistToTarget } from './calibrate';
import { CLEAR, axleAt, device, enterWithHands, flow, gearAt, movePinchTo, nudge, pinch, pinchAt, poke, type Device } from './hands';

const shot = (page: import('@playwright/test').Page, name: string) => page.screenshot({ path: `test-results/demo/${name}.png` });
const audio = (page: import('@playwright/test').Page) => page.evaluate(() => ({ ...window.__chrono!.audio }));

test('demo story (headset): seated, pinch the escapement gear in passthrough, twist to calibrate, the clockwork ticks to life', async ({ page }) => {
  test.setTimeout(120_000); // software GL
  let errors: string[] = [];
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  let clicksBefore = 0;

  await test.step('Given the app is loaded and Enter MR is pressed with hands on', async () => {
    errors = await enterWithHands(page);
    expect(await page.evaluate(() => window.__chrono!.xrPresenting)).toBe(true);
    // Passthrough: the session blends the render over the real world (an opaque blend would be a VR session).
    expect(await page.evaluate((d) => (window as unknown as Record<string, Device>)[d]!.activeSession!.environmentBlendMode, device)).toBe('alpha-blend');
    expect(['plane', 'default']).toContain(await page.evaluate(() => window.__chrono!.trayPlaced));
    expect(await flow(page)).toBe('title');
    await page.waitForTimeout(1200); // let the ghost hand reach its pose
    await shot(page, '1-title');
  });

  await test.step('When the player pokes Start', async () => {
    await poke(page, 'start');
    await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  });

  await test.step('Then level 1 is playing and the ghost hand shows the first move', async () => {
    expect(await flow(page)).toBe('playing');
    expect(await page.evaluate(() => window.__chrono!.levelIndex)).toBe(0);
    expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(true);
    await shot(page, '2-playing');
  });

  await test.step('When they pinch the level 1 gear and carry it onto its axle', async () => {
    await pinch(page, 'right', 0);
    await pinchAt(page, await gearAt(page, gear));
    await page.waitForFunction((g) => window.__chrono!.held === g, gear, { timeout: 10_000 });
    clicksBefore = (await audio(page)).clicks;
    await movePinchTo(page, await axleAt(page, axle));
    await shot(page, '3-carry');
    await pinch(page, 'right', 0);
    await page.waitForFunction(() => window.__chrono!.flow === 'calibrate', undefined, { timeout: 10_000 });
  });

  await test.step('Then the gear is on its axle, calibration begins and the snap clicks', async () => {
    expect(await flow(page)).toBe('calibrate');
    expect(await page.evaluate(() => window.__chrono!.placements)).toEqual(LEVELS[0]!.solution);
    await page.waitForFunction(() => window.__chrono!.audio.clicks > 0, undefined, { timeout: 10_000 });
    const a = await audio(page);
    expect(a.state).toBe('running');
    expect(a.clicks).toBeGreaterThan(clicksBefore);
    await shot(page, '4-calibrate');
  });

  let ticksBefore = 0;
  await test.step('When they pinch the regulator knob and roll the wrist onto the target', async () => {
    ticksBefore = (await audio(page)).ticks;
    await nudge(page, CLEAR);
    await pinchAt(page, await page.evaluate(() => window.__chrono!.regulatorAt));
    await page.waitForFunction(() => window.__chrono!.turning === 'right', undefined, { timeout: 10_000 });
    await twistRight(page, await twistToTarget(page));
    await page.waitForFunction(() => window.__chrono!.inBand, undefined, { timeout: 10_000 });
    await page.waitForFunction(() => window.__chrono!.automatonRunning, undefined, { timeout: 10_000 });
    await page.waitForFunction(() => window.__chrono!.flow === 'complete', undefined, { timeout: 10_000 });
    await shot(page, '5-alive');
  });

  await test.step('Then the clockwork is alive: ticking, chiming, level complete with a time', async () => {
    expect(await page.evaluate(() => window.__chrono!.inBand)).toBe(true);
    expect(await page.evaluate(() => window.__chrono!.automatonRunning)).toBe(true);
    const a = await audio(page);
    expect(a.ticks).toBeGreaterThan(ticksBefore);
    expect(a.chimes).toBeGreaterThanOrEqual(1);
    expect(await flow(page)).toBe('complete');
    await pinch(page, 'right', 0);
    await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'), undefined, { timeout: 10_000 });
    expect(await page.evaluate(() => window.__chrono!.levelTime)).toBeGreaterThan(0);
    await shot(page, '6-complete');
  });

  await test.step('Then the console has no errors', async () => {
    expect(errors).toEqual([]);
  });
});
