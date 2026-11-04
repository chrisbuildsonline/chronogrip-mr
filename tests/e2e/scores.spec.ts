import { expect, test, type Page } from './fixtures';
import { LEVELS } from '../../src/levels';
import { clockTenths } from '../../src/ui';
import { calibrateByMouse } from './calibrate';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/scores';
const KEY = 'chronogrip.scores.v1';
const entry = (name: string, cleared: number, ms: number, date = '2026-10-01') => ({ name, cleared, ms, date });
const L1 = LEVELS[0]!;
const PHONE = { width: 375, height: 812 };

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

/** Seeds a save before the page loads, once: a reload keeps whatever the game has written since. */
const seed = (page: Page, data: unknown) =>
  page.addInitScript(([k, v]) => {
    if (!localStorage.getItem(k!)) localStorage.setItem(k!, v!);
  }, [KEY, JSON.stringify(data)] as const);

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const words = (page: Page) => page.evaluate(() => window.__chrono!.labels().map((l) => l.text));
const scores = (page: Page) => page.evaluate(() => window.__chrono!.scores);
const initials = (page: Page) => page.evaluate(() => window.__chrono!.initials);
const cardIs = (page: Page, screen: string) => page.waitForFunction((s) => window.__chrono!.card?.screen === s, screen);

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

/** Screen positions are only true once the camera has stopped and the gear is at rest. */
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

/** Solves the level up now and waits for whichever card follows: the initials panel or the complete card. */
async function solve(page: Page, solution: Record<string, string>) {
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'complete');
  await frames(page);
}


/** Every word is on the card, readable, and no two words on a line run into each other. */
async function wordsClear(page: Page, at: string, minHeight = 12, apart = 4) {
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const labels = await page.evaluate(() => window.__chrono!.labels());
  const corners = await page.evaluate(() => window.__chrono!.panelCorners());
  const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  for (const l of labels) {
    expect(l.height, `${at}: "${l.text}" is ${minHeight} px or more`).toBeGreaterThanOrEqual(minHeight);
    expect(l.left, `${at}: "${l.text}" is on the card`).toBeGreaterThanOrEqual(x0);
    expect(l.right, `${at}: "${l.text}" is on the card`).toBeLessThanOrEqual(x1);
  }
  for (const a of labels) {
    for (const b of labels) {
      if (a === b || Math.abs(a.y - b.y) >= (a.height + b.height) / 2) continue;
      expect(a.right + apart <= b.left || b.right + apart <= a.left, `${at}: "${a.text}" and "${b.text}" keep apart`).toBe(true);
    }
  }
}

/** New Game, level 1 solved, on to level 2, then Give up from the pause card: the run ends with 1 level cleared and the result card comes up (if it makes the board). */
async function oneLevelThenGiveUp(page: Page) {
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page, L1.solution);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, 'giveup');
  await page.waitForFunction(() => window.__chrono!.flow === 'title');
  await frames(page);
}

const full = (cleared: number, ms0: number, step = 1000) => Array.from({ length: 10 }, (_, i) => entry('AAA', cleared, ms0 + i * step));

test('desktop: a run that cleared a level asks for initials once, at its end (#1), Save writes them, and the Campaign board shows the row after a reload', async ({ page }) => {
  const errors = await open(page);
  await oneLevelThenGiveUp(page);
  await cardIs(page, 'initials');
  expect(await initials(page)).toMatchObject({ board: 'campaign', rank: 1, letters: 'AAA', cursor: 0 });
  const w = await words(page);
  expect(w).toContain('1 level');
  expect(w).toContain('RUN OVER · #1 BEST');
  await page.screenshot({ path: `${OUT}/result-1440.png` });
  await click(page, 'up-0');
  await click(page, 'down-1');
  await click(page, 'down-1');
  expect((await initials(page))!.letters).toBe('BYA');
  await page.keyboard.type('ki'); // typing fills the slot the last arrow chose, then the next
  expect((await initials(page))!.letters).toBe('BKI');
  expect((await initials(page))!.cursor).toBe(3);
  await click(page, 'save');
  await cardIs(page, 'title'); // Save goes back to the main menu
  const saved = (await scores(page)).boards.campaign!;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name: 'BKI', cleared: 1 });
  expect((await scores(page)).initials).toBe('BKI');

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await click(page, 'scores');
  await cardIs(page, 'board');
  const shown = await words(page);
  expect(shown).toEqual(expect.arrayContaining(['Campaign', 'BKI', '1 / 20', clockTenths(saved[0]!.ms / 1000)]));
  await wordsClear(page, 'campaign board 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/board-campaign-1440.png` });
  expect(errors).toEqual([]);
});

test('desktop: solving a level itself asks for no initials, and Skip saves nothing', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page, L1.solution);
  expect(await initials(page)).toBeNull();
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.levelIndex === 1);
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, 'giveup');
  await cardIs(page, 'initials');
  await page.keyboard.press('Escape'); // Skip
  await cardIs(page, 'title');
  expect((await scores(page)).boards.campaign).toEqual([]);
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toContain('No runs yet. Play the campaign to set one.');
  expect(errors).toEqual([]);
});

test('desktop: the board switcher goes Campaign, Random Easy, Medium, Hard, Expert and round; it opens on the board of the run last played', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toContain('Campaign');
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    await click(page, 'board-next');
    await frames(page);
    seen.push((await words(page)).find((x) => /^(Campaign|Random · \w+)$/.test(x))!);
  }
  expect(seen).toEqual(['Random · Easy', 'Random · Medium', 'Random · Hard', 'Random · Expert', 'Campaign']);
  await click(page, 'board-prev');
  await frames(page);
  expect(await words(page)).toContain('Random · Expert');
  expect(await words(page)).toContain('No runs yet. Finish a Random · Expert run to set one.');
  await page.keyboard.press('Escape'); // Esc is Back
  await cardIs(page, 'title');

  // Starting a Random hard run makes that the board the scores open on.
  await click(page, 'random');
  await click(page, 'hard');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await click(page, 'pause');
  await click(page, 'menu');
  await cardIs(page, 'title');
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toContain('Random · Hard');
  expect(errors).toEqual([]);
});

test('desktop: a run that does not make a full board asks for nothing and writes nothing', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { campaign: full(5, 8000) } });
  const errors = await open(page);
  await oneLevelThenGiveUp(page); // 1 level cleared: ranks under ten runs of 5
  expect(await page.evaluate(() => window.__chrono!.card?.screen)).toBe('title');
  expect(await initials(page)).toBeNull();
  expect((await scores(page)).boards.campaign).toEqual(full(5, 8000));
  expect(errors).toEqual([]);
});

test('desktop: against a full board, a run that cleared more asks at its rank, and Save pushes the last off', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { campaign: full(1, 8000, 1000) } });
  const errors = await open(page);
  await oneLevelThenGiveUp(page); // 1 level cleared in a few seconds: faster than 8:00, the same count: rank 1
  await cardIs(page, 'initials');
  expect(await initials(page)).toMatchObject({ rank: 1 });
  await click(page, 'save');
  await cardIs(page, 'title');
  const board = (await scores(page)).boards.campaign!;
  expect(board).toHaveLength(10);
  expect(board[0]).toMatchObject({ name: 'ZED', cleared: 1 });
  expect(board.at(-1)!.ms).toBe(8000 + 8 * 1000);
  expect(errors).toEqual([]);
});

test('desktop: a Random level run is saved on its difficulty board and shows there', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'random');
  await click(page, 'easy');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  const solution = await page.evaluate(() => window.__chrono!.solution);
  await solve(page, solution);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await click(page, 'pause');
  await click(page, 'giveup');
  await cardIs(page, 'initials');
  expect(await words(page)).toContain('1 puzzle');
  expect(await initials(page)).toMatchObject({ board: 'random-easy', rank: 1 });
  await page.keyboard.type('rnd');
  await page.keyboard.press('Enter');
  await cardIs(page, 'title');
  const saved = (await scores(page)).boards['random-easy']!;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name: 'RND', cleared: 1 });

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await click(page, 'scores');
  await cardIs(page, 'board');
  await click(page, 'board-next'); // Campaign to Random Easy
  await frames(page);
  const shown = await words(page);
  expect(shown).toEqual(expect.arrayContaining(['Random · Easy', 'RND', '1 solved', clockTenths(saved[0]!.ms / 1000)]));
  await wordsClear(page, 'random board 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/board-random-1440.png` });
  expect(errors).toEqual([]);
});

test('desktop: a full board shows one column of ten, ranked by levels cleared then time, with the date', async ({ page }) => {
  const rows = [entry('AAA', 20, 900_000), entry('BBB', 9, 400_000), entry('CCC', 9, 410_000), entry('DDD', 6, 100_000), ...Array.from({ length: 6 }, (_, i) => entry('EEE', 2, 50_000 + i * 1000))];
  await seed(page, { version: 1, initials: 'ZED', boards: { campaign: rows } });
  const errors = await open(page);
  await click(page, 'scores');
  await cardIs(page, 'board');
  const labels = await page.evaluate(() => window.__chrono!.labels());
  expect(labels.filter((l) => /^(AAA|BBB|CCC|DDD|EEE)$/.test(l.text)).map((l) => l.text)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', ...Array(6).fill('EEE')]);
  const ranks = labels.filter((l) => /^(10|[1-9])$/.test(l.text));
  expect(ranks.map((l) => l.text).sort()).toEqual(['1', '10', '2', '3', '4', '5', '6', '7', '8', '9']);
  const at = (r: string) => ranks.find((l) => l.text === r)!;
  for (let i = 1; i < 10; i++) {
    expect(at(String(i + 1)).y).toBeGreaterThan(at(String(i)).y + 10);
    expect(Math.abs(at(String(i + 1)).left - at('1').left)).toBeLessThan(2);
  }
  expect(labels.filter((l) => l.text === '1 Oct')).toHaveLength(10);
  expect(labels.filter((l) => l.text === '20 / 20')).toHaveLength(1);
  const times = labels.filter((l) => /^\d+:\d\d\.\d$/.test(l.text));
  expect(times).toHaveLength(10);
  expect(new Set(times.map((l) => Math.round(l.right))).size, 'times right-aligned, one edge').toBe(1);
  await wordsClear(page, 'full board 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/board-full-1440.png` });
  expect(errors).toEqual([]);
});

test('phone 375 x 812: the start panel fits, and the board is legible with Back under the thumb', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { campaign: full(7, 8000), 'random-expert': full(3, 61000) } });
  const errors = await open(page, '/', PHONE);
  await cardIs(page, 'title');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  const pills = await page.evaluate(() => window.__chrono!.buttons());
  expect(pills.map((b) => b.id)).toEqual(['start', 'random', 'options', 'scores']);
  for (const b of pills) {
    expect(b.rect[2] - b.rect[0], `${b.id} is 44 px wide or more`).toBeGreaterThanOrEqual(44);
    expect(b.rect[3] - b.rect[1], `${b.id} is 44 px tall or more`).toBeGreaterThanOrEqual(44);
    expect(b.rect[0] >= 0 && b.rect[2] <= PHONE.width && b.rect[3] <= PHONE.height, `${b.id} is on screen`).toBe(true);
  }
  await wordsClear(page, 'title 375', 12, 4);
  await click(page, 'scores');
  await cardIs(page, 'board');
  await wordsClear(page, 'board 375', 12, 4);
  const back = (await page.evaluate(() => window.__chrono!.buttons())).find((b) => b.id === 'back')!;
  expect(back.rect[1], 'Back is in the lower half, under the thumb').toBeGreaterThan(PHONE.height / 2);
  expect(back.rect[3]).toBeLessThanOrEqual(PHONE.height);
  for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
    expect(b.rect[2] - b.rect[0], `${b.id} wide`).toBeGreaterThanOrEqual(44);
    expect(b.rect[3] - b.rect[1], `${b.id} tall`).toBeGreaterThanOrEqual(44);
  }
  expect(await words(page)).toContain('Campaign');
  await page.screenshot({ path: `${OUT}/board-375.png` });
  await click(page, 'board-prev');
  await frames(page);
  expect(await words(page)).toContain('Random · Expert');
  await wordsClear(page, 'random board 375', 12, 4);
  await page.screenshot({ path: `${OUT}/board-random-375.png` });
  await click(page, 'back');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('phone 375 x 812: the result card fits, arrows are 44 px, Save and Skip are under the thumb', async ({ page }) => {
  const errors = await open(page, '/', PHONE);
  await oneLevelThenGiveUp(page);
  await cardIs(page, 'initials');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const buttons = await page.evaluate(() => window.__chrono!.buttons());
  expect(buttons.map((b) => b.id)).toEqual(['up-0', 'down-0', 'up-1', 'down-1', 'up-2', 'down-2', 'save', 'skip']);
  for (const b of buttons) {
    expect(b.rect[2] - b.rect[0], `${b.id} wide`).toBeGreaterThanOrEqual(44);
    expect(b.rect[3] - b.rect[1], `${b.id} tall`).toBeGreaterThanOrEqual(44);
    expect(b.rect[0]).toBeGreaterThanOrEqual(0);
    expect(b.rect[2]).toBeLessThanOrEqual(PHONE.width);
  }
  const save = buttons.find((b) => b.id === 'save')!;
  expect(save.rect[1], 'Save is in the lower half').toBeGreaterThan(PHONE.height / 2);
  expect(save.rect[3]).toBeLessThanOrEqual(PHONE.height);
  await wordsClear(page, 'result 375', 12, 4);
  await page.screenshot({ path: `${OUT}/result-375.png` });
  await click(page, 'up-0');
  await click(page, 'up-0');
  expect((await initials(page))!.letters).toBe('CAA');
  await click(page, 'save');
  await cardIs(page, 'title');
  expect((await scores(page)).boards.campaign![0]).toMatchObject({ name: 'CAA' });
  expect(errors).toEqual([]);
});
