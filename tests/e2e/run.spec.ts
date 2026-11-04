import { expect, test, type Page } from './fixtures';
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
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await runOf(page)).toEqual({ kind: 'campaign', cleared: 0, ms: 0 });
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.card!.screen)).toBe('complete');
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Next']);
  // No puzzle code anywhere on the card.
  expect((await words(page)).some((w) => /code|link/i.test(w))).toBe(false);
  expect(await words(page)).toContain('Level 1 complete');
  expect((await runOf(page))!.cleared).toBe(1);
  await page.screenshot({ path: `${OUT}/complete.png` });
  expect(errors).toEqual([]);
});

test('desktop: the pause card is a column with Give up; Give up shows the result (1 level and the time), saves it on the Campaign board and sends it up', async ({ page }) => {
  const posts: unknown[] = [];
  await page.route('**/rest/v1/chronogrip_scores**', (r) => {
    if (r.request().method() === 'POST') {
      posts.push(r.request().postDataJSON());
      return r.fulfill({ status: 201, body: '' });
    }
    return r.fulfill({ json: [] });
  });
  const errors = await open(page);
  await click(page, 'start');
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
  await cardIs(page, 'initials');
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  expect(await page.evaluate(() => window.__chrono!.run), 'the run is over').toBeNull();
  const w = await words(page);
  expect(w).toContain('1 level');
  expect(w.some((x) => /^\d+:\d\d$/.test(x)), 'the total time is on the card').toBe(true);
  expect(await page.evaluate(() => window.__chrono!.initials)).toMatchObject({ board: 'campaign', rank: 1 });
  await page.screenshot({ path: `${OUT}/result.png` });
  await page.keyboard.type('run');
  await page.keyboard.press('Enter');
  await cardIs(page, 'title');
  const boards = (await page.evaluate(() => window.__chrono!.scores)).boards;
  expect(boards.campaign).toHaveLength(1);
  expect(boards.campaign![0]).toMatchObject({ name: 'RUN', cleared: 1 });
  expect(boards.campaign![0]!.ms).toBeGreaterThan(0);
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ level: 'campaign', initials: 'RUN', step: 1 });

  // The Campaign board shows it, first, as 1 / 20.
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toContain('Campaign');
  expect(await words(page)).toContain('RUN');
  expect(await words(page)).toContain('1 / 20');
  await page.screenshot({ path: `${OUT}/campaign-board.png` });
  expect(errors).toEqual([]);
});

test('desktop: Skip on the result card saves nothing, and a run that cleared nothing asks for nothing', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  // Nothing cleared: Give up goes straight to the title, no card.
  await pauseThen(page, 'giveup');
  await cardIs(page, 'title');
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect(await runOf(page)).toBeNull();

  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page);
  // The complete card has no pause: end the run from the next level.
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  await pauseThen(page, 'giveup');
  await cardIs(page, 'initials');
  await page.keyboard.press('Escape'); // Skip
  await cardIs(page, 'title');
  expect((await page.evaluate(() => window.__chrono!.scores)).boards.campaign).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('desktop: the time limit running out ends the run with the result card; with nothing cleared it is just the title and a line', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  // Out of time on level 1 with nothing cleared.
  await page.evaluate(() => window.__chrono!.advanceClock(1000));
  await cardIs(page, 'title');
  expect(await runOf(page)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.seedNote)).toContain('Time’s up');

  // Solve level 1, then run out of time on level 2: the result is 1 level.
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  await page.evaluate(() => window.__chrono!.advanceClock(2000));
  await cardIs(page, 'initials');
  expect(await words(page)).toContain('1 level');
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  await page.screenshot({ path: `${OUT}/timeout-result.png` });
  await page.keyboard.press('Escape');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('desktop: with No timer the clock never ends the run', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
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
  await click(page, 'start');
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
  expect(saved).toMatchObject({ kind: 'campaign', cleared: 1 });
  expect(saved.ms).toBeGreaterThanOrEqual(afterRestart.ms);

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores']);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2');
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  expect((await runOf(page))!.ms).toBe(saved.ms);
  expect(errors).toEqual([]);
});

test('desktop: Random level is a run too: solve one, Give up, and the result is 1 puzzle on that difficulty board', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'random');
  await click(page, 'hard');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await runOf(page)).toEqual({ kind: 'random-hard', cleared: 0, ms: 0 });
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.card!.screen)).toBe('complete');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Next']);
  await click(page, 'next'); // another puzzle at the same difficulty, the run goes on
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.random.difficulty === 'hard');
  expect((await runOf(page))!.cleared).toBe(1);
  await pauseThen(page, 'giveup');
  await cardIs(page, 'initials');
  expect(await words(page)).toContain('1 puzzle');
  expect(await page.evaluate(() => window.__chrono!.initials)).toMatchObject({ board: 'random-hard' });
  await page.keyboard.press('Enter'); // Save with the default initials
  await cardIs(page, 'title');
  expect((await page.evaluate(() => window.__chrono!.scores)).boards['random-hard']).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('desktop: winning level 20 ends the run: Finish shows the result, 20 levels', async ({ page }) => {
  const errors = await open(page, { kind: 'campaign', cleared: 19, ms: 600_000 });
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Finish']);
  await click(page, 'next');
  await cardIs(page, 'initials');
  expect(await words(page)).toContain('20 levels');
  expect(await page.evaluate(() => window.__chrono!.run)).toBeNull();
  await page.screenshot({ path: `${OUT}/won.png` });
  await page.keyboard.press('Enter');
  await cardIs(page, 'title');
  expect((await page.evaluate(() => window.__chrono!.scores)).boards.campaign![0]).toMatchObject({ cleared: 20 });
  expect(errors).toEqual([]);
});

test('phone 375x812: the pause card and the result card fit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors = await open(page);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.levelIndex === 1);
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await frames(page);
  for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
    expect(b.rect[3] - b.rect[1], b.id).toBeGreaterThanOrEqual(44);
    expect(b.rect[0] >= 0 && b.rect[2] <= 375 && b.rect[1] >= 0 && b.rect[3] <= 812, `${b.id} on screen`).toBe(true);
  }
  for (const l of await page.evaluate(() => window.__chrono!.labels())) expect(l.height, `"${l.text}"`).toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: `${OUT}/pause-375.png` });
  await click(page, 'giveup');
  await cardIs(page, 'initials');
  await frames(page);
  const corners = await page.evaluate(() => window.__chrono!.panelCorners());
  const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  for (const l of await page.evaluate(() => window.__chrono!.labels())) {
    expect(l.left, `"${l.text}"`).toBeGreaterThanOrEqual(x0);
    expect(l.right, `"${l.text}"`).toBeLessThanOrEqual(x1);
    expect(l.height, `"${l.text}"`).toBeGreaterThanOrEqual(12);
  }
  await page.screenshot({ path: `${OUT}/result-375.png` });
  expect(errors).toEqual([]);
});
