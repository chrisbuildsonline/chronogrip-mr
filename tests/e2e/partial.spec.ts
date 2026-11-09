import { expect, test, type Page } from './fixtures';
import { newGame } from './start';
import { calibrateByMouse } from './calibrate';

/** The campaign as shipped: every level generated fresh. */
test.use({ classic: false });

const OUT = 'test-results/partial';
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


const KEY = 'chronogrip.scores.v1';

/** Stubs the global backend: posts are recorded and accepted, the board is empty. */
async function stub(page: Page) {
  const posts: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/chronogrip_scores**', (r) => {
    if (r.request().method() === 'POST') {
      posts.push(r.request().postDataJSON());
      return r.fulfill({ status: 201, body: '' });
    }
    return r.fulfill({ json: [] });
  });
  return posts;
}

/** A new Easy run with `n` levels solved, then on level n + 1. */
async function runWith(page: Page, n: number) {
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  for (let i = 0; i < n; i++) {
    await solve(page);
    await click(page, 'next');
    await page.waitForFunction((k) => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === k, i + 1);
  }
}

test('desktop: the time running out on level 3 with 2 cleared asks for a name, and the stage board shows the row with its level', async ({ page }) => {
  const posts = await stub(page);
  const errors = await open(page);
  await runWith(page, 2);
  await page.evaluate(() => window.__chrono!.advanceClock(2000));
  await cardIs(page, 'initials');
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  const w = await words(page);
  expect(w.some((x) => /^LEVEL 3 REACHED/.test(x)), 'a Level 3 reached line above the entry').toBe(true);
  expect(w.some((x) => /^\d+:\d\d(\.\d)?$/.test(x)), 'the total time').toBe(true);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('loading')!).visibility === 'hidden');
  await page.screenshot({ path: `${OUT}/name-entry-timeout.png` });
  await page.keyboard.type('zed');
  await page.keyboard.press('Enter');
  await cardIs(page, 'title');
  const row = (await page.evaluate(() => window.__chrono!.scores)).boards['campaign-easy']![0]!;
  expect(row).toMatchObject({ name: 'ZED', cleared: 2 });
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ level: 'campaign-easy', initials: 'ZED', step: 2 });
  await click(page, 'scores');
  await cardIs(page, 'board');
  const b = await words(page);
  expect(b).toContain('ZED');
  expect(b, 'the level reached on the row').toContain('L3');
  await frames(page);
  await page.screenshot({ path: `${OUT}/board-after-timeout.png` });
  expect(errors).toEqual([]);
});

test('desktop: Give up with a level cleared also asks for a name; Skip saves nothing', async ({ page }) => {
  const posts = await stub(page);
  const errors = await open(page);
  await runWith(page, 1);
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, 'giveup');
  await cardIs(page, 'initials');
  expect((await words(page)).some((x) => /^LEVEL 2 REACHED/.test(x))).toBe(true);
  await click(page, 'skip');
  await cardIs(page, 'title');
  expect((await page.evaluate(() => window.__chrono!.scores)).boards['campaign-easy']).toEqual([]);
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});

test('desktop: running out on level 1 (nothing cleared) gets no name entry, only the result card', async ({ page }) => {
  const posts = await stub(page);
  const errors = await open(page);
  await runWith(page, 0);
  await page.evaluate(() => window.__chrono!.advanceClock(2000));
  await cardIs(page, 'result');
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect(await words(page)).toContain('LEVEL 1 REACHED');
  expect((await page.evaluate(() => window.__chrono!.scores)).boards['campaign-easy']).toEqual([]);
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});

test('desktop: with No timer a run given up after a level keeps the result card, no entry', async ({ page }) => {
  await stub(page);
  await page.addInitScript(() => localStorage.setItem('chronogrip.relaxed.v1', '1'));
  const errors = await open(page);
  await runWith(page, 1);
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, 'giveup');
  await cardIs(page, 'result');
  expect(await page.evaluate(() => window.__chrono!.initials)).toBeNull();
  expect(errors).toEqual([]);
});

test('an unposted local score is sent on boot, once, and marked posted', async ({ page }) => {
  const posts = await stub(page);
  await page.addInitScript(([k, v]) => !localStorage.getItem(k!) && localStorage.setItem(k!, v!), [KEY, JSON.stringify({ version: 1, initials: 'OLD', boards: { 'campaign-hard': [{ name: 'OLD', ms: 480_000, date: '2026-11-01' }, { name: 'DEV', ms: 400_000, date: '2026-11-01', dev: true }] } })] as const);
  const errors = await open(page);
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ level: 'campaign-hard', initials: 'OLD', step: 20 });
  await expect.poll(() => page.evaluate(() => window.__chrono!.scores.boards['campaign-hard']!.map((e) => `${e.name}:${!!e.posted}`))).toEqual(['DEV:false', 'OLD:true']);
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(1);
  expect(errors).toEqual([]);
});
