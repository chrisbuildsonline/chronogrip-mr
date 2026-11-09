import { test, type Page } from '@playwright/test';

import { calibrateByMouse } from '../e2e/calibrate';

// The README screenshots: the whole 1440 x 900 window, with ?shots for the full look (the high quality tier, full pixel ratio on
// software GL). Run with `bun run screenshots`. The global scores backend is stubbed, so nothing reaches the real table.
const OUT = 'docs';
const RUN = 'chronogrip.run.v1';
/** A Hard run with 19 levels cleared in 31:47, so the title offers Continue and level 20 is next. */
const SAVED_RUN = { stage: 'hard', cleared: 19, ms: 1_907_000 };

const frames = (page: Page, n = 2) =>
  page.evaluate((k) => new Promise<void>((done) => {
    const step = (i: number) => (i <= 0 ? done() : requestAnimationFrame(() => step(i - 1)));
    step(k);
  }), n);

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const cardIs = (page: Page, s: string) => page.waitForFunction((x) => window.__chrono!.card?.screen === x, s, { timeout: 60_000 });

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

async function place(page: Page, gear: string, axle: string) {
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const from = await screen(page, 'gears', gear);
  const to = await screen(page, 'axles', axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.waitForFunction((g) => window.__chrono!.held === g, gear);
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(([g, a]) => window.__chrono!.placements[g!] === a, [gear, axle]);
}

/** A still frame: the mouse parked in a corner (no hover highlight), a moment for the cards and the camera to settle. */
async function shot(page: Page, name: string) {
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await page.waitForTimeout(1500);
  await frames(page, 3);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('README screenshots: title menu, stage picker, Hard in play, stage cleared', async ({ page }) => {
  await page.route('**/rest/v1/chronogrip_scores**', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, body: '' }) : r.fulfill({ json: [] })));
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [RUN, JSON.stringify(SAVED_RUN)] as const);
  await page.goto('/?shots');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__chrono!.scenery.backdrop === 'c2');
  await page.mouse.move(4, 896);

  // The title menu, with the saved run's Continue on top.
  await cardIs(page, 'title');
  await shot(page, 'title');

  // Continue: Hard level 20, the Iron Tower behind it. One gear placed, the next carried towards its axle, the axles it fits ringed amber.
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  await page.waitForFunction(() => window.__chrono!.scenery.backdrop === 'c3' && window.__chrono!.ambient?.stage === 'hard');
  const parts = Object.entries(await page.evaluate(() => window.__chrono!.solution)) as [string, string][];
  const [[firstGear, firstAxle], [gear, axle]] = parts;
  await place(page, firstGear!, firstAxle!);
  await frames(page);
  const from = await screen(page, 'gears', gear!);
  const to = await screen(page, 'axles', axle!);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.waitForFunction((g) => window.__chrono!.held === g, gear);
  await page.mouse.move(from[0] + (to[0] - from[0]) * 0.65, from[1] + (to[1] - from[1]) * 0.65, { steps: 10 });
  await page.waitForFunction(() => window.__chrono!.validAxles.length > 0);
  await page.waitForTimeout(800);
  await frames(page, 3);
  await page.screenshot({ path: `${OUT}/puzzle.png` });

  // Finish the train, regulate the escapement: the stage is cleared, the confetti comes down, then the stage-cleared card.
  await page.mouse.move(to[0], to[1], { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(([g, a]) => window.__chrono!.placements[g!] === a, [gear, axle]);
  for (const [g, a] of parts.slice(2)) await place(page, g, a);
  await calibrateByMouse(page);
  await cardIs(page, 'cleared');
  await page.mouse.move(4, 896);
  await shot(page, 'cleared');

  // Continue goes to the name entry; Skip saves nothing. Then New Game: the three stage cards.
  await click(page, 'next');
  await cardIs(page, 'initials');
  await click(page, 'skip');
  await cardIs(page, 'title');
  await click(page, 'start');
  await cardIs(page, 'stages');
  await page.mouse.move(4, 896);
  await shot(page, 'stages');
});
