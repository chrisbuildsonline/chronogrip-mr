import { expect, test, type Page } from './fixtures';
import { newGame } from './start';
import { calibrateByMouse } from './calibrate';

/** The stages as shipped: every level generated fresh. */
test.use({ classic: false });

const OUT = 'test-results/stages';
const RUN = 'chronogrip.run.v1';

async function open(page: Page, saves: Record<string, unknown> = {}) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript((all) => {
    for (const [k, v] of Object.entries(all)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v));
  }, saves);
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
const cardIs = (page: Page, s: string) => page.waitForFunction((x) => window.__chrono!.card?.screen === x, s, { timeout: 15_000 });
const backdrop = (page: Page, id: string) => page.waitForFunction((b) => window.__chrono!.scenery.backdrop === b, id, { timeout: 15_000 });

async function place(page: Page, gear: string, axle: string) {
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const from = await page.evaluate((g) => window.__chrono!.toScreen(window.__chrono!.gears[g]!), gear);
  const to = await page.evaluate((a) => window.__chrono!.toScreen(window.__chrono!.axles[a]!), axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.waitForFunction((g) => window.__chrono!.held === g, gear);
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(([g, a]) => window.__chrono!.placements[g!] === a, [gear, axle]);
}

/** Solves the level on the board (the test hook knows the answer); waits for the complete card's Next. */
async function solve(page: Page) {
  const solution = await page.evaluate(() => window.__chrono!.solution);
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'), undefined, { timeout: 15_000 });
  await frames(page);
}

test('New Game opens the stage picker; Hard plays "Hard · Level 1" on the movement backdrop', async ({ page }) => {
  const errors = await open(page);
  await backdrop(page, 'c2'); // the menus show the attic
  await click(page, 'start');
  await cardIs(page, 'stages');
  await page.screenshot({ path: `${OUT}/picker.png` });
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  await click(page, 'stage-hard');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Hard · Level 1');
  expect(await page.evaluate(() => ({ stage: window.__chrono!.stage, run: window.__chrono!.run }))).toEqual({ stage: 'hard', run: { stage: 'hard', cleared: 0, ms: 0 } });
  await backdrop(page, 'c3');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await page.screenshot({ path: `${OUT}/hard-play.png` });
  expect(errors).toEqual([]);
});

test('the backdrop follows the stage: Easy attic, Medium atelier, Hard movement, and the menus the attic', async ({ page }) => {
  const errors = await open(page);
  for (const [stage, bd, label] of [['easy', 'c2', 'Easy · Level 1'], ['medium', 'c1', 'Medium · Level 1'], ['hard', 'c3', 'Hard · Level 1']] as const) {
    await newGame(page, (id) => click(page, id), stage);
    expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe(label);
    await backdrop(page, bd);
    const s = await page.evaluate(() => window.__chrono!.scenery);
    expect(s.background, `${stage} has a texture background`).toBe(true);
    await click(page, 'pause');
    await cardIs(page, 'paused');
    expect(await words(page)).toContain(`${stage.toUpperCase()} · LEVEL 1`);
    await click(page, 'giveup');
    await cardIs(page, 'result');
    await backdrop(page, 'c2');
    await click(page, 'menu');
    await cardIs(page, 'title');
  }
  expect(errors).toEqual([]);
});

test('Continue resumes the stage and the level of the saved run', async ({ page }) => {
  const errors = await open(page, { [RUN]: { stage: 'hard', cleared: 3, ms: 90_000 } });
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores']);
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Hard · Level 4');
  await backdrop(page, 'c3');
  // The pause menu's Main menu keeps the run, and Continue keeps the stage.
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, 'menu');
  await cardIs(page, 'title');
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Hard · Level 4');
  expect(errors).toEqual([]);
});

test('finishing a stage: level 20 asks for a name, the time lands on that stage\'s board, and the High scores tabs switch stages', async ({ page }) => {
  const posts: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/chronogrip_scores**', (r) => {
    if (r.request().method() === 'POST') {
      posts.push(r.request().postDataJSON());
      return r.fulfill({ status: 201, body: '' });
    }
    return r.fulfill({ json: [] });
  });
  const errors = await open(page);
  await newGame(page, (id) => click(page, id), 'hard');
  await page.evaluate(() => window.__chrono!.jump(20));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Hard · Level 20');
  await solve(page);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Finish']);
  await click(page, 'next');
  await cardIs(page, 'initials');
  expect(await page.evaluate(() => window.__chrono!.initials)).toMatchObject({ board: 'campaign-hard' });
  await page.screenshot({ path: `${OUT}/name-entry.png` });
  await page.keyboard.type('hrd');
  await page.keyboard.press('Enter');
  await cardIs(page, 'title');
  const boards = (await page.evaluate(() => window.__chrono!.scores)).boards;
  expect(boards['campaign-hard']).toHaveLength(1);
  expect(boards['campaign-hard']![0]).toMatchObject({ name: 'HRD' });
  expect(boards['campaign-easy']).toEqual([]);
  expect(boards['campaign-medium']).toEqual([]);
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ level: 'campaign-hard', initials: 'HRD', step: 20 });

  // High scores opens on the stage last played; the stage tabs switch between the three boards.
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toEqual(expect.arrayContaining(['HARD · FASTEST RUNS', 'HRD', 'EASY', 'MEDIUM', 'HARD']));
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await page.screenshot({ path: `${OUT}/board-hard.png` });
  await click(page, 'tab-easy');
  await frames(page);
  expect(await words(page)).toEqual(expect.arrayContaining(['EASY · FASTEST RUNS', 'No finished runs yet.']));
  expect(await words(page)).not.toContain('HRD');
  await click(page, 'tab-medium');
  await frames(page);
  expect(await words(page)).toContain('MEDIUM · FASTEST RUNS');
  await click(page, 'tab-hard');
  await frames(page);
  expect(await words(page)).toContain('HRD');
  expect(errors).toEqual([]);
});
