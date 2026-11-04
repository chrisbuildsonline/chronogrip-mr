import { expect, test, type Page } from './fixtures';
import { choose } from './start';
import { LEVELS } from '../../src/levels';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/start';
const RUN = 'chronogrip.run.v1';
const SCORES = 'chronogrip.scores.v1';
const RELAXED = 'chronogrip.relaxed.v1';
const SOUND = 'chronogrip.sound.v1';
const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 375, height: 812 };

async function open(page: Page, size = WIDE, path = '/') {
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

/** Saves in place before the page's own scripts run, once: a reload keeps whatever the game has written since. */
const seed = (page: Page, saves: Record<string, unknown>) =>
  page.addInitScript((all) => {
    for (const [k, v] of Object.entries(all)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v));
  }, saves);

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const words = (page: Page) => page.evaluate(() => window.__chrono!.labels().map((l) => l.text));
const ids = (page: Page) => page.evaluate(() => window.__chrono!.buttons().map((b) => b.id));
const labelsOf = (page: Page) => page.evaluate(() => window.__chrono!.buttons().map((b) => b.label));
const cardIs = async (page: Page, screen: string) => {
  await page.waitForFunction((s) => window.__chrono!.card?.screen === s, screen);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
};
const store = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** Every word is 12 px or more on a phone, on the card, and every button is 44 px or more tall and wholly on screen. */
async function phoneFits(page: Page, at: string) {
  const buttons = await page.evaluate(() => window.__chrono!.buttons());
  for (const b of buttons) {
    expect(b.rect[3] - b.rect[1], `${at} ${b.id} is 44 px tall or more`).toBeGreaterThanOrEqual(44);
    expect(b.rect[2] - b.rect[0], `${at} ${b.id} is 44 px wide or more`).toBeGreaterThanOrEqual(44);
    expect(b.rect[0], `${at} ${b.id} on screen`).toBeGreaterThanOrEqual(0);
    expect(b.rect[2], `${at} ${b.id} on screen`).toBeLessThanOrEqual(PHONE.width);
    expect(b.rect[3], `${at} ${b.id} on screen`).toBeLessThanOrEqual(PHONE.height);
  }
  for (const a of buttons) for (const b of buttons) {
    if (a === b || (a.id.startsWith('tab-') && b.id.startsWith('tab-'))) continue; // the two segments of one control touch
    expect(a.rect[2] <= b.rect[0] || b.rect[2] <= a.rect[0] || a.rect[3] <= b.rect[1] || b.rect[3] <= a.rect[1], `${at} ${a.id} and ${b.id} do not overlap`).toBe(true);
  }
  const corners = await page.evaluate(() => window.__chrono!.panelCorners());
  const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  for (const l of await page.evaluate(() => window.__chrono!.labels())) {
    expect(l.height, `${at} "${l.text}" is 12 px or more`).toBeGreaterThanOrEqual(12);
    expect(l.left, `${at} "${l.text}" on the card`).toBeGreaterThanOrEqual(x0);
    expect(l.right, `${at} "${l.text}" on the card`).toBeLessThanOrEqual(x1);
  }
}

test('desktop 1440x900: the start panel has three buttons, and each reaches its panel and Back returns', async ({ page }) => {
  const errors = await open(page);
  await cardIs(page, 'title');
  expect(await ids(page)).toEqual(['start', 'random', 'options', 'scores']);
  expect(await labelsOf(page)).toEqual(['New Game', 'Random level', 'Options', 'High scores']);
  const w = await words(page);
  expect(w).toEqual(expect.arrayContaining(['CHRONOGRIP', 'A CLOCKWORK PUZZLE']));
  await page.screenshot({ path: `${OUT}/start-1440.png` });

  // Start game: level select, and its Back returns to the start panel.
  await click(page, 'random');
  await cardIs(page, 'picker');
  expect(await ids(page)).toEqual(['easy', 'medium', 'hard', 'expert', 'back']);
  expect(await labelsOf(page)).toEqual(['Easy', 'Medium', 'Hard', 'Expert', 'Back']);
  await click(page, 'back');
  await cardIs(page, 'title');

  // Options: the settings in one place, with a static grab line, and Back.
  await click(page, 'options');
  await cardIs(page, 'options');
  expect(await ids(page)).toEqual(['relaxed', 'sound', 'music', 'reset', 'back']);
  expect(await labelsOf(page)).toEqual(['No timer', 'Sound', 'Music', 'Reset progress', 'Back']);
  expect(await words(page)).toEqual(expect.arrayContaining(['OPTIONS', 'Grab a gear: click and drag it.']));
  await page.screenshot({ path: `${OUT}/options-1440.png` });
  await click(page, 'back');
  await cardIs(page, 'title');

  // High scores: the existing board, with a Local tab and room beside it.
  await click(page, 'scores');
  await cardIs(page, 'board');
  expect(await words(page)).toEqual(expect.arrayContaining(['HIGH SCORES', 'LOCAL', 'EASY · FASTEST RUNS']));
  await page.screenshot({ path: `${OUT}/scores-1440.png` });
  await click(page, 'back');
  await cardIs(page, 'title');

  // The old title pills are gone: no stray Levels or No timer next to the three buttons.
  expect(await ids(page)).toEqual(['start', 'random', 'options', 'scores']);
  expect(errors).toEqual([]);
});

test('phone 375x812: the start panel is a centred column of 44 px buttons', async ({ page }) => {
  const errors = await open(page, PHONE);
  await cardIs(page, 'title');
  expect(await labelsOf(page)).toEqual(['New Game', 'Random level', 'Options', 'High scores']);
  await phoneFits(page, 'start');
  await page.screenshot({ path: `${OUT}/start-375.png` });

  await click(page, 'options');
  await cardIs(page, 'options');
  await phoneFits(page, 'options');
  expect(await words(page)).toContain('Grab a gear: touch and drag it.');
  await page.screenshot({ path: `${OUT}/options-375.png` });
  await click(page, 'reset');
  await cardIs(page, 'options');
  expect(await ids(page)).toEqual(['reset-yes', 'reset-cancel', 'back']);
  await phoneFits(page, 'options confirm');
  await page.screenshot({ path: `${OUT}/options-confirm-375.png` });
  await click(page, 'reset-cancel');
  await click(page, 'back');
  await cardIs(page, 'title');

  await click(page, 'scores');
  await cardIs(page, 'board');
  await phoneFits(page, 'scores');
  expect(await words(page)).toContain('LOCAL');
  await page.screenshot({ path: `${OUT}/scores-375.png` });
  await click(page, 'back');
  await cardIs(page, 'title');

  await click(page, 'random');
  await cardIs(page, 'picker');
  await phoneFits(page, 'picker');
  expect(errors).toEqual([]);
});

test('desktop: No timer and Sound persist after a reload, and sound off keeps the board silent', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => ({ relaxed: window.__chrono!.timer.relaxed, sound: window.__chrono!.soundOn }))).toEqual({ relaxed: false, sound: true });
  await click(page, 'options');
  await cardIs(page, 'options');
  expect(await page.evaluate(() => window.__chrono!.options)).toEqual({ confirm: false, relaxed: false, sound: true, music: true });
  await click(page, 'relaxed');
  await click(page, 'sound');
  await page.waitForFunction(() => window.__chrono!.timer.relaxed && !window.__chrono!.soundOn);
  expect(await page.evaluate(() => window.__chrono!.options)).toEqual({ confirm: false, relaxed: true, sound: false, music: true });
  expect(await store(page, RELAXED)).toBe('1');
  expect(await store(page, SOUND)).toBe('0');
  await frames(page);
  await page.screenshot({ path: `${OUT}/options-on-1440.png` });

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect(await page.evaluate(() => ({ relaxed: window.__chrono!.timer.relaxed, sound: window.__chrono!.soundOn }))).toEqual({ relaxed: true, sound: false });
  await click(page, 'options');
  await cardIs(page, 'options');
  expect(await page.evaluate(() => window.__chrono!.options)).toMatchObject({ relaxed: true, sound: false });

  // Sound off: a snapped gear makes no click.
  await click(page, 'back');
  await choose(page, (id) => click(page, id), 1);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  const from = await page.evaluate((g) => window.__chrono!.toScreen(window.__chrono!.gears[g]!), gear);
  const to = await page.evaluate((a) => window.__chrono!.toScreen(window.__chrono!.axles[a]!), axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
  expect(await page.evaluate(() => window.__chrono!.audio)).toMatchObject({ clicks: 0, ticks: 0, grinds: 0, chimes: 0 });

  // Turning sound back on is saved too.
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await click(page, 'options');
  await click(page, 'sound');
  await page.waitForFunction(() => window.__chrono!.soundOn);
  expect(await store(page, SOUND)).toBe('1');
  expect(errors).toEqual([]);
});

test('desktop: Reset progress asks first, Keep it changes nothing, and Reset now forgets the saved run but keeps the high scores', async ({ page }) => {
  const board = { version: 1, initials: 'KIM', boards: { 'campaign-medium': [{ name: 'KIM', ms: 590000, date: '2026-10-01' }] } };
  await seed(page, { [RUN]: { stage: 'medium', cleared: 2, ms: 85000 }, [SCORES]: board });
  const errors = await open(page);
  expect(await labelsOf(page)).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores']);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l3'); // the board is the level Continue plays (two cleared)

  await click(page, 'options');
  await cardIs(page, 'options');
  await click(page, 'reset');
  await cardIs(page, 'options');
  expect(await page.evaluate(() => window.__chrono!.options)).toMatchObject({ confirm: true });
  expect(await ids(page)).toEqual(['reset-yes', 'reset-cancel', 'back']);
  expect(await labelsOf(page)).toEqual(['Reset now', 'Keep it', 'Back']);
  expect(await words(page)).toEqual(expect.arrayContaining(['RESET?', 'Clears the saved run. Best times stay.']));
  // Nothing is gone yet.
  expect(await page.evaluate(() => window.__chrono!.run)).toEqual({ stage: 'medium', cleared: 2, ms: 85000 });
  await page.screenshot({ path: `${OUT}/options-confirm-1440.png` });

  // Keep it: back to the options as they were, progress untouched.
  await click(page, 'reset-cancel');
  await cardIs(page, 'options');
  expect(await page.evaluate(() => window.__chrono!.options)).toMatchObject({ confirm: false });
  expect(await ids(page)).toEqual(['relaxed', 'sound', 'music', 'reset', 'back']);
  expect(await page.evaluate(() => window.__chrono!.run)).toEqual({ stage: 'medium', cleared: 2, ms: 85000 });

  // Back leaves the confirm too: opening Options again starts from the plain card.
  await click(page, 'reset');
  await cardIs(page, 'options');
  await click(page, 'back');
  await cardIs(page, 'title');
  expect(await labelsOf(page)).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores']);
  await click(page, 'options');
  await cardIs(page, 'options');
  expect(await page.evaluate(() => window.__chrono!.options)).toMatchObject({ confirm: false });

  // Reset now: the start panel is back, reading New Game, on level 1.
  await click(page, 'reset');
  await cardIs(page, 'options');
  await click(page, 'reset-yes');
  await cardIs(page, 'title');
  expect(await labelsOf(page)).toEqual(['New Game', 'Random level', 'Options', 'High scores']);
  expect(await page.evaluate(() => window.__chrono!.run)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l1');
  expect(await page.evaluate(() => localStorage.getItem('chronogrip.run.v1'))).toBeNull();
  // The high scores are a separate store and stay.
  expect((await page.evaluate(() => window.__chrono!.scores)).boards['campaign-medium']).toEqual(board.boards['campaign-medium']);
  await page.screenshot({ path: `${OUT}/start-after-reset-1440.png` });

  expect(errors).toEqual([]);
});

test('desktop: arrow then Enter on the start panel opens the stage picker, and the first card plays Easy; Esc leaves Options and High scores', async ({ page }) => {
  const errors = await open(page);
  await cardIs(page, 'title');
  await click(page, 'options');
  await cardIs(page, 'options');
  await page.keyboard.press('Escape');
  await cardIs(page, 'title');
  await click(page, 'scores');
  await cardIs(page, 'board');
  await page.keyboard.press('Escape');
  await cardIs(page, 'title');
  // Nothing is selected when the menu opens: Enter alone does nothing; the first arrow reaches the top row.
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__chrono!.card!.screen)).toBe('title');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await cardIs(page, 'stages');
  await page.keyboard.press('Escape');
  await cardIs(page, 'title');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await cardIs(page, 'stages');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Easy · Level 1');
  expect(errors).toEqual([]);
});

test('desktop 1440x900: New Game opens the stage picker, three cards side by side with Back under them; Back returns', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
  await cardIs(page, 'stages');
  expect(await ids(page)).toEqual(['stage-easy', 'stage-medium', 'stage-hard', 'back']);
  expect(await labelsOf(page)).toEqual(['Easy', 'Medium', 'Hard', 'Back']);
  expect(await words(page)).toEqual(expect.arrayContaining(['CHOOSE A STAGE', 'NEW GAME']));
  expect((await page.evaluate(() => window.__chrono!.stageCards)).cards.map((c) => c.hint)).toEqual(['A gentle climb', 'Starts where Easy ends', 'For clockmakers']);
  const pos = await page.evaluate(() => window.__chrono!.buttons().map((b) => b.screen));
  expect(new Set(pos.slice(0, 3).map((p) => Math.round(p[1]))).size, 'the cards share a row').toBe(1);
  pos.slice(0, 3).forEach((p, i) => i && expect(p[0]).toBeGreaterThan(pos[i - 1]![0]));
  expect(pos[3]![1], 'Back is under them').toBeGreaterThan(pos[0]![1]);
  await page.screenshot({ path: `${OUT}/stages-1440.png` });
  await click(page, 'back');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('phone 375x812: the stage picker fits, 44 px rows, every word 12 px or more', async ({ page }) => {
  const errors = await open(page, PHONE);
  await click(page, 'start');
  await cardIs(page, 'stages');
  await phoneFits(page, 'stages');
  await page.screenshot({ path: `${OUT}/stages-375.png` });
  expect(errors).toEqual([]);
});
