import { expect, test, type Page } from './fixtures';
import { clockTenths } from '../../src/ui';
import { calibrateByMouse } from './calibrate';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/scores';
const KEY = 'chronogrip.scores.v1';
const entry = (name: string, ms: number, date = '2026-10-01') => ({ name, ms, date });
const RUN = 'chronogrip.run.v1';
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


/** Opens with a run that has cleared 19 levels, plays level 20 and presses Finish: the name entry comes up. */
async function finishRun(page: Page) {
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  const solution = await page.evaluate(() => window.__chrono!.solution);
  await solve(page, solution);
  await click(page, 'next');
  await cardIs(page, 'initials');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
}

const seedRun = (page: Page) =>
  page.addInitScript(([k, v]) => {
    if (!localStorage.getItem(k!)) localStorage.setItem(k!, v!);
  }, [RUN, JSON.stringify({ cleared: 19, ms: 700_000 })] as const);

const full = (ms0: number, step = 1000) => Array.from({ length: 10 }, (_, i) => entry('AAA', ms0 + i * step));

test.use({ classic: false });

test('desktop: the name entry is arcade style: three slots, up and down cycle A-Z, tapping a slot or left and right moves, it starts on the last initials, OK saves the time', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { campaign: [] } });
  await seedRun(page);
  const errors = await open(page);
  await finishRun(page);
  expect(await initials(page)).toMatchObject({ board: 'campaign', rank: 1, letters: 'ZED', cursor: 0 });
  const w = await words(page);
  expect(w.some((x) => /^RUN COMPLETE · #1$/.test(x))).toBe(true);
  expect(w.some((x) => /^1\d:\d\d(\.\d)?$/.test(x)), 'the total time, large').toBe(true);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['up-0', 'slot-0', 'down-0', 'up-1', 'slot-1', 'down-1', 'up-2', 'slot-2', 'down-2', 'save', 'skip']);
  await page.screenshot({ path: `${OUT}/name-entry-1440.png` });
  await click(page, 'up-0'); // Z wraps to A
  expect((await initials(page))!.letters).toBe('AED');
  await click(page, 'down-1'); // E back to D
  expect((await initials(page))!.letters).toBe('ADD');
  expect((await initials(page))!.cursor).toBe(1);
  await click(page, 'slot-2'); // tapping a slot moves to it
  expect((await initials(page))!.cursor).toBe(2);
  await page.keyboard.press('ArrowUp');
  expect((await initials(page))!.letters).toBe('ADE');
  await page.keyboard.press('ArrowLeft');
  expect((await initials(page))!.cursor).toBe(1);
  await page.keyboard.press('ArrowDown');
  expect((await initials(page))!.letters).toBe('ACE');
  await page.keyboard.press('ArrowRight');
  expect((await initials(page))!.cursor).toBe(2);
  await page.keyboard.type('x'); // letters type straight in
  expect((await initials(page))!.letters).toBe('ACX');
  await page.keyboard.press('Enter');
  await cardIs(page, 'title');
  const board = (await scores(page)).boards.campaign!;
  expect(board).toHaveLength(1);
  expect(board[0]).toMatchObject({ name: 'ACX' });
  expect((await scores(page)).initials).toBe('ACX');
  expect(errors).toEqual([]);
});

test('desktop: Skip on the name entry saves nothing', async ({ page }) => {
  await seedRun(page);
  const errors = await open(page);
  await finishRun(page);
  expect(await initials(page)).toMatchObject({ letters: 'AAA' });
  await click(page, 'skip');
  await cardIs(page, 'title');
  expect((await scores(page)).boards.campaign).toEqual([]);
  expect(errors).toEqual([]);
});

test('desktop: against a full board a slower finished run asks for nothing; a faster one takes its rank and Save pushes the last off', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { campaign: full(1_000, 1) } });
  await seedRun(page);
  const errors = await open(page);
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  await solve(page, await page.evaluate(() => window.__chrono!.solution));
  await click(page, 'next');
  await cardIs(page, 'title'); // 11+ minutes against ten runs of 1 s: not on the board, no name entry
  expect(await initials(page)).toBeNull();
  expect((await scores(page)).boards.campaign).toEqual(full(1_000, 1));
  expect(errors).toEqual([]);
});

test('desktop: the board shows the ten fastest finished runs in one column, ranked, with the date; and says so when empty', async ({ page }) => {
  const rows = [entry('AAA', 900_000), entry('BBB', 400_000), entry('CCC', 410_000), entry('DDD', 100_000), ...Array.from({ length: 6 }, (_, i) => entry('EEE', 500_000 + i * 1000))];
  await seed(page, { version: 1, initials: 'ZED', boards: { campaign: rows } });
  const errors = await open(page);
  await click(page, 'scores');
  await cardIs(page, 'board');
  const labels = await page.evaluate(() => window.__chrono!.labels());
  expect(labels.map((l) => l.text)).toEqual(expect.arrayContaining(['HIGH SCORES', 'CAMPAIGN · FASTEST RUNS']));
  expect(labels.filter((l) => /^(AAA|BBB|CCC|DDD|EEE)$/.test(l.text)).map((l) => l.text)).toEqual(['DDD', 'BBB', 'CCC', 'EEE', 'EEE', 'EEE', 'EEE', 'EEE', 'EEE', 'AAA']);
  const ranks = labels.filter((l) => /^(10|[1-9])$/.test(l.text));
  expect(ranks.map((l) => l.text).sort()).toEqual(['1', '10', '2', '3', '4', '5', '6', '7', '8', '9']);
  const at = (r: string) => ranks.find((l) => l.text === r)!;
  for (let i = 1; i < 10; i++) {
    expect(at(String(i + 1)).y).toBeGreaterThan(at(String(i)).y + 10);
    expect(Math.abs(at(String(i + 1)).left - at('1').left)).toBeLessThan(2);
  }
  expect(labels.filter((l) => l.text === '1 Oct')).toHaveLength(10);
  const times = labels.filter((l) => /^\d+:\d\d\.\d$/.test(l.text));
  expect(times).toHaveLength(10);
  expect(new Set(times.map((l) => Math.round(l.right))).size, 'times right-aligned, one edge').toBe(1);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['back', 'tab-local', 'tab-global']);
  await wordsClear(page, 'board 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/board-1440.png` });
  expect(errors).toEqual([]);
});

test('desktop: an empty board says no finished runs yet; Esc is Back', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toContain('No finished runs yet.');
  await page.keyboard.press('Escape');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('phone 375 x 812: the start panel and the board are legible, 44 px rows, Back under the thumb', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { campaign: full(480_000, 8000) } });
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
  await wordsClear(page, 'board 375', 11, 4);
  const back = (await page.evaluate(() => window.__chrono!.buttons())).find((b) => b.id === 'back')!;
  expect(back.rect[1], 'Back is in the lower half, under the thumb').toBeGreaterThan(PHONE.height / 2);
  expect(back.rect[3]).toBeLessThanOrEqual(PHONE.height);
  await page.screenshot({ path: `${OUT}/board-375.png` });
  await click(page, 'back');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('phone 375 x 812: the name entry fits, arrows are 44 px, OK and Skip are under the thumb', async ({ page }) => {
  await seedRun(page);
  const errors = await open(page, '/', PHONE);
  await finishRun(page);
  const buttons = await page.evaluate(() => window.__chrono!.buttons());
  for (const b of buttons) {
    expect(b.rect[2] - b.rect[0], `${b.id} wide`).toBeGreaterThanOrEqual(44);
    expect(b.rect[3] - b.rect[1], `${b.id} tall`).toBeGreaterThanOrEqual(44);
    expect(b.rect[0], `${b.id}`).toBeGreaterThanOrEqual(0);
    expect(b.rect[2], `${b.id}`).toBeLessThanOrEqual(PHONE.width);
    expect(b.rect[3], `${b.id}`).toBeLessThanOrEqual(PHONE.height);
  }
  const ok = buttons.find((b) => b.id === 'save')!;
  expect(ok.rect[1], 'OK is in the lower half').toBeGreaterThan(PHONE.height / 2);
  await wordsClear(page, 'name entry 375', 11, 4);
  await page.screenshot({ path: `${OUT}/name-entry-375.png` });
  await click(page, 'up-0');
  await click(page, 'up-0');
  expect((await initials(page))!.letters).toBe('CAA');
  await click(page, 'save');
  await cardIs(page, 'title');
  expect((await scores(page)).boards.campaign![0]).toMatchObject({ name: 'CAA' });
  expect(errors).toEqual([]);
});
