import { expect, test, type Page } from './fixtures';
import { decodeSeed } from '../../src/seed';
import { DIFFICULTY_LEVEL, difficultyOf, puzzleFor } from '../../src/random';
import { tinkerLevel } from '../../src/tinker';
import { calibrateByMouse } from './calibrate';

/** The generated Random levels as shipped: none of the hand-made ones. */
test.use({ classic: false });

const OUT = 'test-results/random';

async function open(page: Page, path = '/', size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
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
const words = (page: Page) => page.evaluate(() => window.__chrono!.labels().map((l) => l.text));
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

/** What the puzzle on the board looks like: where its axles are, what goes on them, how many gears. */
const layoutOf = (page: Page) => page.evaluate(() => JSON.stringify({ axles: window.__chrono!.axles, solution: window.__chrono!.solution, gears: window.__chrono!.gearCount }));

async function solve(page: Page) {
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  const solution = await page.evaluate(() => window.__chrono!.solution);
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'complete', undefined, { timeout: 15_000 });
  await frames(page);
}

test('desktop: Random level opens a picker (Easy, Medium, Hard, Expert), Hard plays a generated puzzle, and Play again is a new one at the same difficulty', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'random');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'picker');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Easy', 'Medium', 'Hard', 'Expert', 'Back']);
  expect(await words(page)).toContain('RANDOM LEVEL');
  await page.screenshot({ path: `${OUT}/picker.png` });
  await click(page, 'hard');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.random)).toMatchObject({ mode: true, difficulty: 'hard' });
  expect(await words(page)).toContain('RANDOM · HARD');
  const first = await layoutOf(page);
  const code = (await page.evaluate(() => window.__chrono!.seedCode))!;
  // The puzzle is as hard as Hard says: its measured difficulty is nearer level 15's than level 3's.
  const level = puzzleFor(decodeSeed(code)!, tinkerLevel);
  expect(Math.abs(difficultyOf(level) - 22.5), 'near the Hard target').toBeLessThan(6);
  expect(DIFFICULTY_LEVEL.hard).toBe(15);
  await page.screenshot({ path: `${OUT}/hard-play.png` });

  await solve(page);
  // Practice: no initials; Play again deals another puzzle at the same difficulty.
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Play again', 'Main menu']);
  expect(await words(page)).toContain('Random · Hard complete');
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelTime >= 0);
  expect(await page.evaluate(() => window.__chrono!.random)).toMatchObject({ mode: true, difficulty: 'hard' });
  expect(await layoutOf(page), 'Play again is a new puzzle').not.toBe(first);
  expect(errors).toEqual([]);
});

test('desktop: each difficulty plays and the pause card has Main menu, not Choose level', async ({ page }) => {
  const errors = await open(page);
  for (const d of ['easy', 'medium', 'expert']) {
    await page.goto('/');
    await page.waitForFunction(() => window.__chrono?.ready === true);
    await click(page, 'random');
    await click(page, d);
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');
    expect(await page.evaluate(() => window.__chrono!.random)).toMatchObject({ mode: true, difficulty: d });
  }
  await click(page, 'pause');
  await page.waitForFunction(() => window.__chrono!.flow === 'paused');
  const labels = await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label));
  expect(labels).toEqual(['Resume', 'Restart', 'Give up', 'Main menu', 'No timer']);
  expect(labels).not.toContain('Choose level');
  await click(page, 'menu');
  await page.waitForFunction(() => window.__chrono!.flow === 'title');
  expect(errors).toEqual([]);
});

test('phone 375x812: the Random level picker and a Random level card fit', async ({ page }) => {
  const errors = await open(page, '/', { width: 375, height: 812 });
  await click(page, 'random');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'picker');
  await frames(page);
  for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
    expect(b.rect[3] - b.rect[1], b.id).toBeGreaterThanOrEqual(44);
    expect(b.rect[0] >= 0 && b.rect[2] <= 375 && b.rect[1] >= 0 && b.rect[3] <= 812, `${b.id} on screen`).toBe(true);
  }
  for (const l of await page.evaluate(() => window.__chrono!.labels())) expect(l.height, `"${l.text}"`).toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: `${OUT}/picker-375.png` });
  await click(page, 'easy');
  await solve(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  await frames(page);
  const corners = await page.evaluate(() => window.__chrono!.panelCorners());
  const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  for (const l of await page.evaluate(() => window.__chrono!.labels())) {
    expect(l.left, `"${l.text}" inside the sheet`).toBeGreaterThanOrEqual(x0);
    expect(l.right, `"${l.text}" inside the sheet`).toBeLessThanOrEqual(x1);
    expect(l.height, `"${l.text}" is 12 px or more`).toBeGreaterThanOrEqual(12);
  }
  await page.screenshot({ path: `${OUT}/complete-375.png` });
  expect(errors).toEqual([]);
});
