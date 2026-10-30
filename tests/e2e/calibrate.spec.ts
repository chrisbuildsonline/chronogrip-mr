import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { rateOf, startSetting } from '../../src/escapement';
import { calibrateByMouse } from './calibrate';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  return errors;
}

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

async function place(page: Page, gear: string, axle: string) {
  const from = await screen(page, 'gears', gear);
  const to = await screen(page, 'axles', axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
}

const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);

test('desktop: a solved train waits for the escapement; drag the regulator into the band, the bird runs, then the complete card', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page);
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await place(page, gear, axle);
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');

  // Calibrating: the clock has stopped, the knob starts clearly off the target, the bird is idle, the twist cue shows.
  const c = await page.evaluate(() => {
    const h = window.__chrono!;
    return { inBand: h.inBand, automatonRunning: h.automatonRunning, ghostTwist: h.ghostTwist, regulator: h.regulator, tickRate: h.tickRate };
  });
  expect(c.inBand).toBe(false);
  expect(c.automatonRunning).toBe(false);
  expect(c.ghostTwist).toBe(true);
  expect(c.regulator).toBeCloseTo(startSetting(LEVELS[0]!));
  expect(c.tickRate).toBeCloseTo(rateOf(startSetting(LEVELS[0]!)));
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['pause']);
  const t = await page.evaluate(() => window.__chrono!.levelTime);
  await page.waitForTimeout(1000); // the twist cue reaches its turned pose
  expect(await page.evaluate(() => window.__chrono!.levelTime)).toBe(t);
  await page.screenshot({ path: 'test-results/f10-calibrate.png' });

  // The board is locked while calibrating: the placed gear does not lift.
  const placed = await screen(page, 'gears', gear);
  await page.mouse.move(placed[0], placed[1]);
  await page.mouse.down();
  await page.mouse.move(placed[0] + 40, placed[1] + 40, { steps: 4 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  await page.mouse.move(placed[0], placed[1], { steps: 4 }); // that drag orbited the camera: put the view back
  await page.mouse.up();

  // A turn part of the way, then a hidden tab pauses; resume comes back to calibrating with the knob where it was.
  const at = await page.evaluate(() => window.__chrono!.toScreen(window.__chrono!.regulatorAt));
  await page.mouse.move(at[0], at[1]);
  await page.mouse.down();
  await page.mouse.move(at[0] + 40, at[1], { steps: 4 });
  await page.mouse.up();
  const part = await page.evaluate(() => window.__chrono!.regulator);
  expect(part).toBeGreaterThan(startSetting(LEVELS[0]!));
  expect(await page.evaluate(() => window.__chrono!.ghostTwist)).toBe(false); // the cue stops once the knob was turned
  await setVisibility(page, 'hidden');
  await page.waitForFunction(() => window.__chrono!.paused);
  await setVisibility(page, 'visible');
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'resume'));
  const [rx, ry] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'resume')!.screen);
  await page.mouse.click(rx, ry);
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
  expect(await page.evaluate(() => window.__chrono!.regulator)).toBe(part);

  // Read the panel on the first frame the bird runs, whatever the test's own pace under load.
  const buttonsAtCalibrated = page.evaluate(
    () =>
      new Promise<number>((done) => {
        const look = () => (window.__chrono!.automatonRunning ? done(window.__chrono!.buttons().length) : requestAnimationFrame(look));
        look();
      }),
  );
  await calibrateByMouse(page, {
    onInBand: async () => {
      await page.waitForTimeout(300); // the target arc fills while it is held
      await page.screenshot({ path: 'test-results/f10-inband.png' });
    },
  });
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('complete');
  expect(await page.evaluate(() => window.__chrono!.inBand)).toBe(true);
  // The reward plays before the card: the bird flaps and the train runs, no panel yet.
  expect(await buttonsAtCalibrated).toBe(0);
  await page.screenshot({ path: 'test-results/f10-calibrated.png' });
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  expect(await page.evaluate(() => window.__chrono!.automatonRunning)).toBe(true);
  await page.screenshot({ path: 'test-results/f10-complete.png' });
  expect(errors).toEqual([]);
});
