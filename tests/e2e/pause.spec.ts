import { expect, test, type Page } from './fixtures';
import { newGame } from './start';
import { click, frames, solve } from './play';

/** Generated levels, as shipped. */
test.use({ classic: false });

const OUT = 'test-results/pause';
const RUN = 'chronogrip.run.v1';

async function open(page: Page, saves: Record<string, unknown> = {}, size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
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

const cardIs = (page: Page, s: string) => page.waitForFunction((x) => window.__chrono!.card?.screen === x, s, { timeout: 15_000 });
const words = (page: Page) => page.evaluate(() => window.__chrono!.labels().map((l) => l.text));
const playing = (page: Page) => page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 15_000 });

/** Starts the countdown by clicking Resume and returns the numbers seen on the way, with whether the board was ever drawn. */
async function resumeAndWatch(page: Page) {
  await click(page, 'resume');
  const seen: number[] = [];
  let boardShown = false;
  await page.waitForFunction(() => window.__chrono!.countdown !== null, undefined, { timeout: 5000 });
  for (let k = 0; k < 400; k++) {
    const s = await page.evaluate(() => ({ n: window.__chrono!.countdown, board: window.__chrono!.boardVisible, flow: window.__chrono!.flow, time: window.__chrono!.levelTime }));
    if (s.n === null) break;
    if (s.n >= 1 && seen.at(-1) !== s.n) seen.push(s.n);
    boardShown ||= s.board;
    expect(s.flow, 'the level stays paused while it counts').toBe('paused');
    await page.waitForTimeout(40);
  }
  await playing(page);
  return { seen, boardShown };
}

test('pausing hides the board, the subtitle says what it costs, and Resume counts 3, 2, 1 before the board and the clock come back', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.levelTime > 0.5);
  expect(await page.evaluate(() => window.__chrono!.boardVisible)).toBe(true);
  await click(page, 'pause');
  await cardIs(page, 'paused');
  expect(await page.evaluate(() => window.__chrono!.boardVisible), 'nothing of the puzzle is drawn while paused').toBe(false);
  expect(await words(page)).toContain('Pausing adds 0:05 to your time');
  await frames(page);
  await page.screenshot({ path: `${OUT}/paused.png` });
  const before = await page.evaluate(() => window.__chrono!.levelTime);

  const { seen, boardShown } = await resumeAndWatch(page);
  expect(seen, 'big numerals, in order').toEqual([3, 2, 1]);
  expect(boardShown, 'the board stays hidden through the countdown').toBe(false);
  expect(await page.evaluate(() => window.__chrono!.boardVisible)).toBe(true);
  const after = await page.evaluate(() => window.__chrono!.levelTime);
  expect(after - before, 'the level clock was stopped for the pause and the countdown').toBeLessThan(0.6);
  expect(await page.evaluate(() => window.__chrono!.run)).toMatchObject({ stage: 'easy', pauses: 1 });
  // The HUD says what the pauses have cost so far.
  await page.waitForFunction(() => window.__chrono!.labels().some((l) => l.text === '+0:05'));
  expect(errors).toEqual([]);
});

test('the countdown shows 3, 2, 1 on the card', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, 'resume');
  await cardIs(page, 'countdown');
  expect(await words(page)).toEqual(expect.arrayContaining(['GET READY']));
  expect((await words(page)).some((w) => /^[123]$/.test(w))).toBe(true);
  await page.screenshot({ path: `${OUT}/countdown.png` });
  await playing(page);
  expect(errors).toEqual([]);
});

test('each manual pause (button, Esc, P) adds 5 s to the total; a finished stage puts the total and "3 pauses (+0:15)" on the name entry and the board', async ({ page }) => {
  const errors = await open(page, { [RUN]: { stage: 'easy', cleared: 19, ms: 600_000, pauses: 0 } });
  await click(page, 'continue');
  await playing(page);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  // The pause button with the mouse, then Esc, then P.
  const [x, y] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'pause')!.screen);
  await page.mouse.click(x, y);
  await cardIs(page, 'paused');
  await resumeAndWatch(page);
  await page.keyboard.press('Escape');
  await cardIs(page, 'paused');
  await resumeAndWatch(page);
  await page.keyboard.press('p');
  await cardIs(page, 'paused');
  await page.keyboard.press('p');
  await playing(page);
  expect(await page.evaluate(() => window.__chrono!.run)).toMatchObject({ pauses: 3 });
  await solve(page);
  await click(page, 'next');
  await cardIs(page, 'initials');
  const w = await words(page);
  expect(w.some((t) => /^Total \d+:\d\d · 3 pauses \(\+0:15\)$/.test(t)), `the line is on the name entry: ${w.join(' | ')}`).toBe(true);
  await page.screenshot({ path: `${OUT}/name-entry.png` });
  await page.keyboard.type('pau');
  await page.keyboard.press('Enter');
  await cardIs(page, 'title');
  const entry = (await page.evaluate(() => window.__chrono!.scores)).boards['campaign-easy']![0]!;
  expect(entry.name).toBe('PAU');
  expect(entry.ms, 'level times plus 3 x 5 s').toBeGreaterThanOrEqual(600_000 + 15_000);
  expect(errors).toEqual([]);
});

test('Give up after pauses shows "Total … · 2 pauses (+0:10)" on the result card', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  for (let i = 0; i < 2; i++) {
    await click(page, 'pause');
    await cardIs(page, 'paused');
    if (i === 0) await resumeAndWatch(page);
  }
  await click(page, 'giveup');
  await cardIs(page, 'result');
  expect((await words(page)).some((t) => /^Total \d+:\d\d · 2 pauses \(\+0:10\)$/.test(t))).toBe(true);
  await page.screenshot({ path: `${OUT}/result.png` });
  expect(errors).toEqual([]);
});

test('Random level is practice: a pause costs nothing and says nothing about it', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'random');
  await click(page, 'easy');
  await playing(page);
  await click(page, 'pause');
  await cardIs(page, 'paused');
  expect(await words(page)).not.toContain('Pausing adds 0:05 to your time');
  expect(await page.evaluate(() => window.__chrono!.run)).toBeNull();
  expect(errors).toEqual([]);
});

test('the tab hidden pauses at once with the board hidden and no penalty; coming back shows the pause menu, and Resume counts down', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.levelTime > 0.3);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__chrono!.flow === 'paused');
  expect(await page.evaluate(() => window.__chrono!.boardVisible)).toBe(false);
  expect(await page.evaluate(() => window.__chrono!.run), 'no penalty for a system pause').toMatchObject({ pauses: 0 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await cardIs(page, 'paused');
  const { seen } = await resumeAndWatch(page);
  expect(seen).toEqual([3, 2, 1]);
  expect(await page.evaluate(() => window.__chrono!.run)).toMatchObject({ pauses: 0 });
  expect(errors).toEqual([]);
});

test('About opens from the start screen with the made-by line and the mechanics, scrolls, and Back returns', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['start', 'random', 'options', 'scores', 'about']);
  await click(page, 'about');
  await cardIs(page, 'about');
  const w = await words(page);
  expect(w.join(' ')).toContain('made by Chris for the Meta VR Start Developer Competition 2026');
  for (const part of ['WHAT IT IS', 'HOW TO PLAY', 'MECHANICS', 'CREDITS', 'Three stages of 20 levels, made fresh every time.', 'adds 0:05 to your time.']) expect(w.join(' ') + w.join('')).toContain(part.replace(/ +$/, ''));
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['back', 'up-scroll', 'down-scroll']);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await page.screenshot({ path: `${OUT}/about-top.png` });
  expect((await page.evaluate(() => window.__chrono!.aboutScroll))!.max, 'there is more to scroll to').toBeGreaterThan(0.05);
  await click(page, 'down-scroll');
  await page.waitForFunction(() => window.__chrono!.aboutScroll!.scroll > 0);
  await page.keyboard.press('ArrowDown');
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 600);
  await page.waitForFunction(() => { const a = window.__chrono!.aboutScroll!; return a.scroll >= a.max - 1e-6; });
  await frames(page);
  await page.screenshot({ path: `${OUT}/about-end.png` });
  await click(page, 'up-scroll');
  await click(page, 'back');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('phone 375x812: About fits, 44 px buttons, 12 px words', async ({ page }) => {
  const errors = await open(page, {}, { width: 375, height: 812 });
  await click(page, 'about');
  await cardIs(page, 'about');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
    expect(b.rect[0], b.id).toBeGreaterThanOrEqual(0);
    expect(b.rect[2], b.id).toBeLessThanOrEqual(375);
    expect(b.rect[3], b.id).toBeLessThanOrEqual(812);
    expect(b.rect[3] - b.rect[1], `${b.id} 44 px tall`).toBeGreaterThanOrEqual(44);
    expect(b.rect[2] - b.rect[0], `${b.id} 44 px wide`).toBeGreaterThanOrEqual(44);
  }
  for (const l of await page.evaluate(() => window.__chrono!.labels())) expect(l.height, `"${l.text}"`).toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: `${OUT}/about-375.png` });
  expect(errors).toEqual([]);
});
