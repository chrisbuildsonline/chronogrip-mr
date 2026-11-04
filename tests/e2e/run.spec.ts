import { expect, test, type Page } from './fixtures';
import { newGame } from './start';
import { calibrateByMouse } from './calibrate';

/** The campaign as shipped: every level generated fresh. */
test.use({ classic: false });

const OUT = 'test-results/run';
const RUN = 'chronogrip.run.v1';

async function open(page: Page, saved?: unknown) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  if (saved !== undefined) await page.addInitScript(([k, v]) => !localStorage.getItem(k as string) && localStorage.setItem(k as string, JSON.stringify(v)), [RUN, saved]);
  await page.goto('/');
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
const runOf = (page: Page) => page.evaluate(() => window.__chrono!.run);
const cardIs = (page: Page, s: string) => page.waitForFunction((x) => window.__chrono!.card?.screen === x, s, { timeout: 15_000 });

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

/** Solves the level on the board; waits for the complete card. */
async function solve(page: Page) {
  const solution = await page.evaluate(() => window.__chrono!.solution);
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'), undefined, { timeout: 15_000 });
  await frames(page);
}

/** Pause, then a pause card button. */
async function pauseThen(page: Page, id: string) {
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, id);
}

test('desktop: solving level 1 shows no initials card, only Next; the run has cleared one', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await runOf(page)).toEqual({ stage: 'easy', cleared: 0, ms: 0 });
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.card!.screen)).toBe('complete');
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Next']);
  expect((await words(page)).some((w) => /code|link/i.test(w))).toBe(false);
  expect(await words(page)).toContain('Level 1 complete');
  expect((await runOf(page))!.cleared).toBe(1);
  await page.screenshot({ path: `${OUT}/complete.png` });
  expect(errors).toEqual([]);
});

test('desktop: Give up shows a short result card (Level 2 reached and the time) with New Game and Main menu: no name entry, nothing saved or sent', async ({ page }) => {
  const posts: unknown[] = [];
  await page.route('**/rest/v1/chronogrip_scores**', (r) => {
    if (r.request().method() === 'POST') {
      posts.push(r.request().postDataJSON());
      return r.fulfill({ status: 201, body: '' });
    }
    return r.fulfill({ json: [] });
  });
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);

  await click(page, 'pause');
  await cardIs(page, 'paused');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Resume', 'Restart', 'Give up', 'Main menu', 'No timer']);
  expect((await page.evaluate(() => window.__chrono!.scrim)).mode, 'the pause card is a menu on the dark layer').toBe('full');
  await page.screenshot({ path: `${OUT}/pause.png` });
  await click(page, 'giveup');
  await cardIs(page, 'result');
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  expect(await page.evaluate(() => window.__chrono!.run), 'the run is over').toBeNull();
  const w = await words(page);
  expect(w).toContain('LEVEL 2 REACHED');
  expect(w.some((x) => /^\d+:\d\d(\.\d)?$/.test(x)), 'the total time is on the card').toBe(true);
  expect(await page.evaluate(() => window.__chrono!.initials), 'no name entry for an unfinished run').toBeNull();
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['New Game', 'Main menu']);
  await page.screenshot({ path: `${OUT}/result.png` });
  await click(page, 'menu');
  await cardIs(page, 'title');
  expect((await page.evaluate(() => window.__chrono!.scores)).boards['campaign-easy']).toEqual([]);
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});

test('desktop: the result card New Game starts a fresh run at level 1', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await pauseThen(page, 'giveup');
  await cardIs(page, 'result');
  expect(await words(page)).toContain('LEVEL 1 REACHED');
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 0);
  expect(await runOf(page)).toEqual({ stage: 'easy', cleared: 0, ms: 0 });
  expect(errors).toEqual([]);
});

test('desktop: the time limit running out ends the run with the result card, no name entry', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  await page.evaluate(() => window.__chrono!.advanceClock(2000));
  await cardIs(page, 'result');
  expect(await words(page)).toContain('LEVEL 2 REACHED');
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect(await runOf(page)).toBeNull();
  await page.screenshot({ path: `${OUT}/timeout-result.png` });
  expect(errors).toEqual([]);
});

test('desktop: with No timer the clock never ends the run', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, 'relaxed');
  await click(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.evaluate(() => window.__chrono!.advanceClock(5000));
  await frames(page);
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('playing');
  expect(await runOf(page)).not.toBeNull();
  expect(errors).toEqual([]);
});

test('desktop: Main menu leaves the run saved with the time spent; Continue resumes it on the next level; Restart is a new puzzle and keeps the clock counting', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page);
  const afterOne = (await runOf(page))!;
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  const layoutOf = () => page.evaluate(() => JSON.stringify({ a: window.__chrono!.axles, s: window.__chrono!.solution }));
  const first = await layoutOf();
  await page.evaluate(() => window.__chrono!.advanceClock(7));
  await pauseThen(page, 'restart');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  expect(await layoutOf(), 'Restart is a new puzzle of the same level').not.toBe(first);
  const afterRestart = (await runOf(page))!;
  expect(afterRestart.cleared).toBe(1);
  expect(afterRestart.ms - afterOne.ms, 'the 7 s spent still count').toBeGreaterThanOrEqual(7000);

  await pauseThen(page, 'menu');
  await cardIs(page, 'title');
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), RUN);
  expect(saved).toMatchObject({ cleared: 1 });
  expect(saved.ms).toBeGreaterThanOrEqual(afterRestart.ms);

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores', 'About']);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2');
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  expect((await runOf(page))!.ms).toBe(saved.ms);
  expect(errors).toEqual([]);
});

test('desktop: Random level is practice: no run, no score; Next gives another puzzle; Give up and the Main menu just leave', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'random');
  await click(page, 'hard');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await runOf(page)).toBeNull();
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.card!.screen)).toBe('complete');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Play again', 'Main menu']);
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.random.difficulty === 'hard');
  expect(await runOf(page)).toBeNull();
  await pauseThen(page, 'giveup');
  await cardIs(page, 'title'); // no result card for practice
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect((await page.evaluate(() => window.__chrono!.scores)).boards).toEqual({ 'campaign-easy': [], 'campaign-medium': [], 'campaign-hard': [] });
  expect(errors).toEqual([]);
});

test('desktop: finishing level 20 is the only way to a name: Finish asks for three letters, OK saves the time and sends step 20', async ({ page }) => {
  const posts: unknown[] = [];
  await page.route('**/rest/v1/chronogrip_scores**', (r) => {
    if (r.request().method() === 'POST') {
      posts.push(r.request().postDataJSON());
      return r.fulfill({ status: 201, body: '' });
    }
    return r.fulfill({ json: [] });
  });
  const errors = await open(page, { stage: 'medium', cleared: 19, ms: 600_000 });
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Finish']);
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  await click(page, 'next');
  await cardIs(page, 'initials');
  expect(await page.evaluate(() => window.__chrono!.run)).toBeNull();
  const w = await words(page);
  expect(w.some((x) => /^RUN COMPLETE/.test(x))).toBe(true);
  expect(w.some((x) => /^1\d:\d\d(\.\d)?$/.test(x)), 'the total time, about 10 minutes and more, large').toBe(true);
  await page.screenshot({ path: `${OUT}/name-entry.png` });
  await page.keyboard.type('zed');
  await page.keyboard.press('Enter');
  await cardIs(page, 'title');
  const board = (await page.evaluate(() => window.__chrono!.scores)).boards['campaign-medium']!;
  expect(board).toHaveLength(1);
  expect(board[0]).toMatchObject({ name: 'ZED' });
  expect(board[0]!.ms).toBeGreaterThanOrEqual(600_000);
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ level: 'campaign-medium', initials: 'ZED', step: 20 });
  expect(errors).toEqual([]);
});

test('phone 375x812: the pause card, the result card and the name entry fit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.levelIndex === 1);
  const fits = async (name: string) => {
    await frames(page);
    for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
      expect(b.rect[3] - b.rect[1], `${name} ${b.id}`).toBeGreaterThanOrEqual(44);
      expect(b.rect[0] >= 0 && b.rect[2] <= 375 && b.rect[1] >= 0 && b.rect[3] <= 812, `${name} ${b.id} on screen`).toBe(true);
    }
    const corners = await page.evaluate(() => window.__chrono!.panelCorners());
    const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
    for (const l of await page.evaluate(() => window.__chrono!.labels())) {
      expect(l.height, `${name} "${l.text}"`).toBeGreaterThanOrEqual(12);
      expect(l.left, `${name} "${l.text}"`).toBeGreaterThanOrEqual(x0);
      expect(l.right, `${name} "${l.text}"`).toBeLessThanOrEqual(x1);
    }
    await page.screenshot({ path: `${OUT}/${name}-375.png` });
  };
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await fits('pause');
  await click(page, 'giveup');
  await cardIs(page, 'result');
  await fits('result');
  expect(errors).toEqual([]);
});
