import { expect, test, type Page } from './fixtures';
import { LEVELS } from '../../src/levels';
import { decodeSeed } from '../../src/seed';
import { randomLevel, unpackSeed } from '../../src/random';
import { formatDate } from '../../src/scores';
import { clockTenths } from '../../src/ui';
import { calibrateByMouse } from './calibrate';
import { begin, choose } from './start';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/scores';
const KEY = 'chronogrip.scores.v1';
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
  await calibrateByMouse(page, { keepInitials: true });
  await page.waitForFunction(() => ['initials', 'complete'].includes(window.__chrono!.card?.screen ?? ''));
  await frames(page);
}

async function startLevel1(page: Page) {
  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'hud');
  await frames(page);
}

/** The Random puzzle on the board, rebuilt from its code. */
async function randomSolution(page: Page) {
  const seedCode = (await page.evaluate(() => window.__chrono!.seedCode))!;
  const n = decodeSeed(seedCode)!;
  return randomLevel(unpackSeed(n).step, n).solution;
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

const full = (ms0: number, step = 1000, date = '2026-10-01') => Array.from({ length: 10 }, (_, i) => ({ name: 'AAA', ms: ms0 + i * step, date }));

test('desktop: a first solve asks for initials (#1), Save writes them, and Best times shows the row after a reload', async ({ page }) => {
  const errors = await open(page);
  await startLevel1(page);
  await solve(page, L1.solution);
  await cardIs(page, 'initials');
  expect(await initials(page)).toMatchObject({ board: 'l1', rank: 1, letters: 'AAA', cursor: 0 });
  const w = await words(page);
  expect(w).toContain('#1 BEST TIMES');
  expect(w).toContain('Level 1');
  expect(w.some((x) => /^\d+:\d\d/.test(x)), 'the time').toBe(true);
  const ids = (await page.evaluate(() => window.__chrono!.buttons())).map((b) => b.id);
  expect(ids).toEqual(['up-0', 'down-0', 'up-1', 'down-1', 'up-2', 'down-2', 'save', 'skip']);
  await wordsClear(page, 'initials 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/initials-1440.png` });

  // Type the letters, fix the last with the arrows and with Backspace, then press Save.
  await page.keyboard.type('kim');
  expect(await initials(page)).toMatchObject({ letters: 'KIM', cursor: 3 });
  await click(page, 'up-2');
  expect(await initials(page)).toMatchObject({ letters: 'KIN', cursor: 2 });
  await click(page, 'down-2');
  expect((await initials(page))!.letters).toBe('KIM');
  await page.keyboard.type('x'); // the arrows picked slot 3, so typing replaces it
  expect(await initials(page)).toMatchObject({ letters: 'KIX', cursor: 3 });
  await page.keyboard.type('1');
  expect((await initials(page))!.letters, 'a digit types nothing').toBe('KIX');
  await page.keyboard.press('Backspace');
  expect((await initials(page))!.cursor, 'Backspace goes back a slot').toBe(2);
  await page.keyboard.type('x');
  expect((await initials(page))!.letters).toBe('KIX');
  await click(page, 'save');
  await cardIs(page, 'complete');
  expect(await initials(page)).toBeNull();
  const saved = await scores(page);
  expect(saved.boards.l1).toHaveLength(1);
  expect(saved.boards.l1![0]).toMatchObject({ name: 'KIX' });
  expect(saved.initials).toBe('KIX');
  expect(await words(page)).toContain('Level 1 complete');

  // A new visit: Best times from the title card shows it.
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await cardIs(page, 'title');
  expect((await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label)))).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores']);
  await click(page, 'scores');
  await cardIs(page, 'board');
  const row = saved.boards.l1![0]!;
  const shown = await words(page);
  expect(shown).toContain('High scores');
  expect(shown).toContain('Local'); // the tab strip: Local now, room beside it for the global board
  expect(shown).toContain('Level 1');
  expect(shown).toContain('KIX');
  expect(shown).toContain(clockTenths(row.ms / 1000));
  expect(shown).toContain(formatDate(row.date));
  expect(shown).not.toContain('No times yet. Solve level 1 to set one.');
  await wordsClear(page, 'board 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/board-1440.png` });
  // Back returns to the title card.
  await click(page, 'back');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('desktop: Enter saves the initials; Skip saves nothing, and the empty board says so', async ({ page }) => {
  const errors = await open(page);
  await startLevel1(page);
  await solve(page, L1.solution);
  await cardIs(page, 'initials');
  await click(page, 'skip');
  await cardIs(page, 'complete');
  expect((await scores(page)).boards.l1).toEqual([]);
  // Restart, solve again, and this time Enter saves.
  await click(page, 'restart');
  await solve(page, L1.solution);
  await cardIs(page, 'initials');
  await page.keyboard.type('ab');
  await page.keyboard.press('Enter');
  await cardIs(page, 'complete');
  expect((await scores(page)).boards.l1!.map((e) => e.name)).toEqual(['ABA']);
  expect((await scores(page)).initials).toBe('ABA');
  expect(errors).toEqual([]);

  // The last initials come back as the default next time.
  await click(page, 'restart');
  await solve(page, L1.solution);
  await cardIs(page, 'initials');
  expect(await initials(page)).toMatchObject({ letters: 'ABA', rank: expect.any(Number) });
  await page.keyboard.press('Escape'); // Esc is Skip
  await cardIs(page, 'complete');
  expect((await scores(page)).boards.l1).toHaveLength(1);
});

test('desktop: the empty board, the switcher through L1..L8 and Random, and it opens on the level last played', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toContain('Level 1');
  expect(await words(page)).toContain('No times yet. Solve level 1 to set one.');
  await page.screenshot({ path: `${OUT}/board-empty-1440.png` });
  const seen: string[] = [];
  for (let i = 0; i < 9; i++) {
    await click(page, 'board-next');
    await frames(page);
    seen.push((await words(page)).find((x) => /^(Level \d|Random)$/.test(x))!);
  }
  expect(seen).toEqual(['Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Random', 'Level 1']);
  await click(page, 'board-prev');
  await frames(page);
  expect(await words(page)).toContain('Random');
  expect(await words(page)).toContain('No times yet. Solve a Random puzzle to set one.');
  await click(page, 'board-prev');
  await frames(page);
  expect(await words(page)).toContain('No times yet. Solve level 8 to set one.');
  await page.keyboard.press('Escape'); // Esc is Back
  await cardIs(page, 'title');

  // Starting level 1 (touching a gear or pressing Start) leaves the board; going back, it opens on the level last played.
  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await click(page, 'pause');
  await click(page, 'levels');
  await click(page, 'level-3');
  await page.waitForFunction(() => window.__chrono!.levelIndex === 2);
  await click(page, 'pause');
  await click(page, 'levels');
  await click(page, 'back');
  await cardIs(page, 'title');
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toContain('Level 3');
  expect(await words(page)).toContain('No times yet. Solve level 3 to set one.');
  expect(errors).toEqual([]);
});

test('desktop: a slower solve against a full board skips the panel and writes nothing', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { l1: full(1000, 100) } });
  const errors = await open(page);
  expect((await scores(page)).boards.l1).toHaveLength(10);
  await startLevel1(page);
  await page.evaluate(() => window.__chrono!.advanceClock(5)); // a solve is quick; make it certainly slower than 1.9 s
  await solve(page, L1.solution);
  // Slower than all ten (the slowest is 1.9 s): straight to the complete card, nothing written.
  expect(await page.evaluate(() => window.__chrono!.card!.screen)).toBe('complete');
  expect(await initials(page)).toBeNull();
  expect((await scores(page)).boards.l1!.map((e) => e.ms)).toEqual(full(1000, 100).map((e) => e.ms));
  expect(await words(page)).toContain('Level 1 complete');
  expect(errors).toEqual([]);
});

test('desktop: against a full board, a solve faster than the slowest asks at its rank, and Save pushes the slowest off', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { l1: [...full(600_000).slice(0, 9), { name: 'SLO', ms: 3_600_000, date: '2026-10-01' }] } });
  const errors = await open(page);
  await startLevel1(page);
  await page.evaluate(() => window.__chrono!.advanceClock(1000)); // 16 min: slower than the nine, faster than SLO
  await solve(page, L1.solution);
  await cardIs(page, 'initials');
  expect(await initials(page)).toMatchObject({ rank: 10, letters: 'ZED' });
  expect(await words(page)).toContain('#10 BEST TIMES');
  await click(page, 'save');
  await cardIs(page, 'complete');
  const l1 = (await scores(page)).boards.l1!;
  expect(l1).toHaveLength(10);
  expect(l1.at(-1)).toMatchObject({ name: 'ZED' });
  expect(l1.some((e) => e.name === 'SLO')).toBe(false);
  expect(errors).toEqual([]);
});

test('desktop: a Random solve is saved with its step and shows as "Step N"', async ({ page }) => {
  const errors = await open(page);
  await choose(page, (id) => click(page, id), LEVELS.length + 2);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await solve(page, await randomSolution(page));
  await cardIs(page, 'initials');
  const w = await words(page);
  expect(w).toContain('Random · Step 1');
  expect(w).toContain('#1 BEST TIMES');
  expect(await initials(page)).toMatchObject({ board: 'random', rank: 1 });
  await page.keyboard.type('rnd');
  await page.keyboard.press('Enter');
  await cardIs(page, 'complete');
  const saved = (await scores(page)).boards.random!;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name: 'RND', step: 1 });
  // The Random run moved on a step or more; its saved board keeps the step that was solved.
  expect((await page.evaluate(() => window.__chrono!.random)).next).toBeGreaterThan(1);

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await click(page, 'scores');
  await cardIs(page, 'board');
  await click(page, 'board-prev'); // L1 wraps back to Random
  await frames(page);
  const shown = await words(page);
  expect(shown).toContain('Random');
  expect(shown).toContain('RND');
  expect(shown).toContain('Step 1');
  expect(shown).toContain(clockTenths(saved[0]!.ms / 1000));
  await wordsClear(page, 'random board 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/board-random-1440.png` });
  expect(errors).toEqual([]);
});

test('desktop: a full board shows one column of ten, ranked, with the date', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { l1: full(8000), random: Array.from({ length: 10 }, (_, i) => ({ name: 'BOB', step: 12 - (i >> 1), ms: 61000 + i * 1000, date: '2026-11-04' })) } });
  const errors = await open(page);
  await click(page, 'scores');
  await cardIs(page, 'board');
  const labels = await page.evaluate(() => window.__chrono!.labels());
  expect(labels.filter((l) => l.text === 'AAA')).toHaveLength(10);
  const ranks = labels.filter((l) => /^(10|[1-9])$/.test(l.text));
  expect(ranks.map((l) => l.text).sort()).toEqual(['1', '10', '2', '3', '4', '5', '6', '7', '8', '9']);
  // One column: the ranks share a left edge and run down, 1 to 10.
  const at = (r: string) => ranks.find((l) => l.text === r)!;
  for (let i = 1; i < 10; i++) {
    expect(at(String(i + 1)).y).toBeGreaterThan(at(String(i)).y + 10);
    expect(Math.abs(at(String(i + 1)).left - at('1').left)).toBeLessThan(2);
  }
  expect(labels.filter((l) => l.text === '1 Oct')).toHaveLength(10);
  const times = labels.filter((l) => /^\d+:\d\d/.test(l.text));
  expect(times).toHaveLength(10);
  expect(times.every((l) => /^\d+:\d\d\.\d$/.test(l.text)), 'one time format on every row').toBe(true);
  expect(new Set(times.map((l) => Math.round(l.right))).size, 'times right-aligned, one edge').toBe(1);
  await wordsClear(page, 'full board 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/board-full-1440.png` });
  await click(page, 'board-prev');
  await frames(page);
  expect((await words(page)).filter((x) => x === 'Step 12')).toHaveLength(2);
  await wordsClear(page, 'full random 1440', 9, 4);
  await page.screenshot({ path: `${OUT}/board-full-random-1440.png` });
  expect(errors).toEqual([]);
});

test('phone 375 x 812: the start panel fits its three buttons, and the board is legible with Back under the thumb', async ({ page }) => {
  await seed(page, { version: 1, initials: 'ZED', boards: { l1: full(8000), random: Array.from({ length: 10 }, (_, i) => ({ name: 'BOB', step: 12 - (i >> 1), ms: 61000 + i * 1000, date: '2026-11-04' })) } });
  const errors = await open(page, '/', PHONE);
  await cardIs(page, 'title');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  const pills = await page.evaluate(() => window.__chrono!.buttons());
  expect(pills.map((b) => b.id)).toEqual(['start', 'random', 'options', 'scores']);
  for (const b of pills) {
    expect(b.rect[2] - b.rect[0], `${b.id} is 44 px wide or more`).toBeGreaterThanOrEqual(44);
    expect(b.rect[3] - b.rect[1], `${b.id} is 44 px tall or more`).toBeGreaterThanOrEqual(44);
    expect(b.rect[0], `${b.id} is on screen`).toBeGreaterThanOrEqual(0);
    expect(b.rect[2], `${b.id} is on screen`).toBeLessThanOrEqual(PHONE.width);
    expect(b.rect[3], `${b.id} is on screen`).toBeLessThanOrEqual(PHONE.height);
  }
  for (const a of pills) for (const b of pills) {
    if (a === b) continue;
    const apart = a.rect[2] <= b.rect[0] || b.rect[2] <= a.rect[0] || a.rect[3] <= b.rect[1] || b.rect[3] <= a.rect[1];
    expect(apart, `${a.id} and ${b.id} do not overlap`).toBe(true);
  }
  const labels = await page.evaluate(() => window.__chrono!.labels());
  for (const name of ['New Game', 'Random level', 'Options', 'High scores']) {
    const l = labels.find((x) => x.text === name)!;
    expect(l.height, `${name} is 12 px or more`).toBeGreaterThanOrEqual(12);
    const b = pills.find((p) => p.label === name)!;
    expect(l.left, `${name} is inside its pill`).toBeGreaterThanOrEqual(b.rect[0]);
    expect(l.right, `${name} is inside its pill`).toBeLessThanOrEqual(b.rect[2]);
  }
  await wordsClear(page, 'title 375', 12, 4);
  await page.screenshot({ path: `${OUT}/title-375.png` });

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
  expect(await words(page)).toContain('Level 1');
  await page.screenshot({ path: `${OUT}/board-375.png` });
  await click(page, 'board-prev');
  await frames(page);
  expect(await words(page)).toContain('Random');
  await wordsClear(page, 'random board 375', 12, 4);
  await page.screenshot({ path: `${OUT}/board-random-375.png` });
  await click(page, 'board-next');
  await click(page, 'board-next'); // Level 2: empty
  await frames(page);
  expect(await words(page)).toContain('Level 2');
  await wordsClear(page, 'empty board 375', 12, 4);
  await page.screenshot({ path: `${OUT}/board-empty-375.png` });
  await click(page, 'back');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('phone 375 x 812: the initials panel fits, arrows are 44 px, Save and Skip are under the thumb', async ({ page }) => {
  const errors = await open(page, '/', PHONE);
  await startLevel1(page);
  await solve(page, L1.solution);
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
  await wordsClear(page, 'initials 375', 12, 4);
  await page.screenshot({ path: `${OUT}/initials-375.png` });
  await click(page, 'up-0');
  await click(page, 'up-0');
  expect((await initials(page))!.letters).toBe('CAA');
  await click(page, 'save');
  await cardIs(page, 'complete');
  expect((await scores(page)).boards.l1![0]).toMatchObject({ name: 'CAA' });
  expect(errors).toEqual([]);
});
