import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { calibrateByMouse } from './calibrate';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/demo/desktop-${name}.png` });
const audio = (page: Page) => page.evaluate(() => ({ ...window.__chrono!.audio }));
const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

test('demo story (desktop): click Start, drag the escapement gear onto its axle, drag the regulator, the clockwork ticks to life', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;

  await test.step('Given the app is loaded and the title shows Enter MR and Start', async () => {
    await page.goto('/');
    await page.waitForFunction(() => window.__chrono?.ready === true);
    await expect(page.getByRole('button', { name: 'Enter MR' })).toBeVisible();
    expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
    await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'start'));
    expect(await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'start')!.label)).toMatch(/start/i);
    await page.waitForTimeout(1200); // let the ghost hand reach its pose
    await shot(page, '1-title');
  });

  await test.step('When the player clicks Start', async () => {
    const [x, y] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'start')!.screen);
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  });

  await test.step('Then level 1 is playing with the clock running', async () => {
    expect(await page.evaluate(() => window.__chrono!.levelIndex)).toBe(0);
    await page.waitForFunction(() => window.__chrono!.levelTime > 0);
    await shot(page, '2-playing');
  });

  await test.step('When they drag the level 1 gear onto its axle', async () => {
    const from = await screen(page, 'gears', gear);
    const to = await screen(page, 'axles', axle);
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 8 });
    expect(await page.evaluate(() => window.__chrono!.held)).toBe(gear);
    await shot(page, '3-carry');
    await page.mouse.up();
  });

  await test.step('Then the gear snaps on, calibration begins and the snap clicks', async () => {
    await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
    expect(await page.evaluate(() => window.__chrono!.placements)).toEqual(LEVELS[0]!.solution);
    await page.waitForFunction(() => window.__chrono!.audio.clicks > 0);
    expect((await audio(page)).state).toBe('running');
    await page.waitForFunction(() => window.__chrono!.audio.ticks > 0);
    await shot(page, '4-calibrate');
  });

  await test.step('When they drag the regulator knob onto the target', async () => {
    await calibrateByMouse(page);
  });

  await test.step('Then the bird runs, the chime plays and the complete card shows a time', async () => {
    await page.waitForFunction(() => window.__chrono!.flow === 'complete');
    expect(await page.evaluate(() => window.__chrono!.automatonRunning)).toBe(true);
    await page.waitForFunction(() => window.__chrono!.audio.chimes >= 1);
    await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
    expect(await page.evaluate(() => window.__chrono!.levelTime)).toBeGreaterThan(0);
    await page.waitForTimeout(600);
    await shot(page, '5-complete');
  });

  await test.step('Then the console has no errors', async () => {
    expect(errors).toEqual([]);
  });
});
