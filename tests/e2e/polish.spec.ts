import { expect, test, type Page } from '@playwright/test';
import { GHOST_PERIOD_S } from '../../src/ghost';
import { LEVELS } from '../../src/levels';
import { calibrateByMouse } from './calibrate';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/polish';

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

/** A few rendered frames, so a shot shows the state just reached. */
const frames = (page: Page, n = 4) =>
  page.evaluate((k) => new Promise((done) => {
    const next = (i: number) => (i <= 0 ? done(null) : requestAnimationFrame(() => next(i - 1)));
    next(k);
  }), n);

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

async function shot(page: Page, name: string) {
  await frames(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** Waits until the level 1 ghost hand is mid-carry in its loop (fully shown, gear in hand). */
const ghostMidCarry = (page: Page) =>
  page.waitForFunction((period) => {
    const u = ((performance.now() / 1000) % period) / period;
    return window.__chrono!.ghostHand && u > 0.32 && u < 0.5;
  }, GHOST_PERIOD_S);

/** A close crop round the regulator dial. */
async function dialShot(page: Page, name: string) {
  const [x, y] = await page.evaluate(() => window.__chrono!.toScreen(window.__chrono!.regulatorAt));
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: x - 90, y: y - 90, width: 180, height: 180 } });
}

/** The panel now up sits fully inside the 1280 x 720 view, with a little room to spare. */
async function inFrame(page: Page, screenName: string) {
  await frames(page, 2);
  const corners = await page.evaluate(() => window.__chrono!.panelCorners());
  expect(corners, `${screenName}: a panel is up`).toHaveLength(4);
  for (const [x, y] of corners) {
    expect(x, `${screenName} panel x`).toBeGreaterThanOrEqual(8);
    expect(x, `${screenName} panel x`).toBeLessThanOrEqual(1280 - 8);
    expect(y, `${screenName} panel y`).toBeGreaterThanOrEqual(8);
    expect(y, `${screenName} panel y`).toBeLessThanOrEqual(720 - 8);
  }
}

test('desktop 1280x720: every panel in frame, a real time on a quick solve, shots of each screen, no console errors', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);

  // Title, with the ghost hand partway through its carry.
  await inFrame(page, 'title');
  await ghostMidCarry(page);
  await page.screenshot({ path: `${OUT}/1-title.png` });

  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await inFrame(page, 'hud');
  await ghostMidCarry(page);
  await page.screenshot({ path: `${OUT}/2-play.png` });

  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await place(page, gear, axle);
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
  await shot(page, '3-calibrate');

  // Early in the hold: the arc must already show a visible fill.
  await calibrateByMouse(page, {
    onInBand: async () => {
      await frames(page, 2);
      await page.screenshot({ path: `${OUT}/4-inband.png` });
      await dialShot(page, '4-inband-dial');
    },
  });
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  await inFrame(page, 'complete');
  await shot(page, '5-complete');
  await dialShot(page, '5-complete-dial');

  // The time on the card is the level clock with tenths under 10 s, never a bare 0:00.
  const time = await page.evaluate(() => window.__chrono!.levelTime);
  expect(time).toBeGreaterThan(0);

  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await inFrame(page, 'select');
  await shot(page, '6-select');

  await click(page, 'level-2');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  await shot(page, '7-level2');

  await click(page, 'pause');
  await page.waitForFunction(() => window.__chrono!.flow === 'paused');
  await inFrame(page, 'paused');
  await shot(page, '8-paused');

  // Level 2 has the biggest parts on its strip, so its cards sit highest: the tallest one, complete, must still fit.
  await click(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  for (const [g, a] of Object.entries(LEVELS[1]!.solution)) await place(page, g, a);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  await inFrame(page, 'complete on level 2');
  await shot(page, '8b-complete-level2');

  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await inFrame(page, 'select on level 2');
  await click(page, 'level-5');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 4);
  await shot(page, '9-level5');
  console.log('render level 5', await page.evaluate(() => window.__chrono!.render));

  expect(errors).toEqual([]);
});
