import { expect, test, type Page } from './fixtures';
import { calibrateByMouse } from './calibrate';

/** The campaign as shipped: every level generated fresh each time it is played. */
test.use({ classic: false });

const OUT = 'test-results/campaign';

async function open(page: Page, path = '/') {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(path);
  await page.waitForFunction(() => window.__chrono?.ready === true);
  return errors;
}

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);
const layoutOf = (page: Page) => page.evaluate(() => JSON.stringify({ axles: window.__chrono!.axles, solution: window.__chrono!.solution, gears: window.__chrono!.gearCount }));

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

/** Solves the level on the board and waits for the complete card. */
async function solve(page: Page) {
  const solution = await page.evaluate(() => window.__chrono!.solution);
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  await frames(page);
}

test('desktop: New Game is level 1; a solve goes to level 2, a different puzzle; there is no level list or Choose level anywhere', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['New Game', 'Random level', 'Options', 'High scores']);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 0);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l1');
  const l1 = await layoutOf(page);
  await page.screenshot({ path: `${OUT}/l1.png` });

  // Pause: Resume, Restart, Main menu, No timer; no Choose level.
  await click(page, 'pause');
  await page.waitForFunction(() => window.__chrono!.flow === 'paused');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Resume', 'Restart', 'Main menu', 'No timer']);
  await click(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');

  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Next', 'Retry', 'Copy link']);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2');
  expect(await layoutOf(page), 'level 2 is a different puzzle').not.toBe(l1);
  await page.screenshot({ path: `${OUT}/l2.png` });
  expect(errors).toEqual([]);
});

test('desktop: Retry gives a new puzzle at the same difficulty; a restart from the pause card keeps the same one', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  const first = await layoutOf(page);
  // Restart from the pause card puts the same puzzle back.
  await click(page, 'pause');
  await click(page, 'restart');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await layoutOf(page)).toBe(first);
  // Over par, then solved: Retry leads and deals a new puzzle of level 1.
  await page.evaluate(() => window.__chrono!.advanceClock(1000));
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => [b.id, b.label]))).toEqual([['restart', 'Retry'], ['next', 'Next'], ['copy', 'Copy link']]);
  await click(page, 'restart');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 0);
  expect(await layoutOf(page), 'Retry is a new puzzle').not.toBe(first);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l1');
  expect(errors).toEqual([]);
});

test('desktop: a puzzle code reopens the exact puzzle', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  const code = (await page.evaluate(() => window.__chrono!.seedCode))!;
  expect(code).toMatch(/^[0-9A-Z]{4,7}$/);
  const layout = await layoutOf(page);
  await open(page, `/?seed=${code}`);
  await click(page, 'continue'); // a shared puzzle is on the title as its own button
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await layoutOf(page)).toBe(layout);
  expect(errors).toEqual([]);
});

test('desktop: level 20 is generated and solvable by the hooks, and a bigger puzzle than level 1', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  const gears1 = await page.evaluate(() => window.__chrono!.gearCount);
  await page.evaluate(() => window.__chrono!.jump(20));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  expect(await page.evaluate(() => window.__chrono!.gearCount)).toBeGreaterThan(gears1);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await page.screenshot({ path: `${OUT}/l20.png` });
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.progress.best['l20'])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'next')!.label)).toBe('Menu');
  expect(errors).toEqual([]);
});
