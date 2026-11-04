import { expect, test, type Page } from './fixtures';
import { newGame } from './start';
import { click, frames, solve } from './play';

/** Generated levels, as shipped. */
test.use({ classic: false });

const OUT = 'test-results/progress';

async function open(page: Page, size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  return errors;
}

const cardIs = (page: Page, s: string) => page.waitForFunction((x) => window.__chrono!.card?.screen === x, s, { timeout: 15_000 });
const progress = (page: Page) => page.evaluate(() => window.__chrono!.progress);
const layoutOf = (page: Page) => page.evaluate(() => JSON.stringify([window.__chrono!.levelId, window.__chrono!.solution, window.__chrono!.axles, window.__chrono!.gears]));
const playing = (page: Page) => page.waitForFunction(() => window.__chrono!.flow === 'playing');

test('desktop 1440x900: the header shows "EASY · LEVEL 1 / 20" and a bar, then level 2 after a solve; hidden on the menus', async ({ page }) => {
  const errors = await open(page);
  expect(await progress(page), 'hidden on the start screen').toBeNull();
  await expect(page.locator('#progress')).toBeHidden();
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.progress !== null);
  expect(await progress(page)).toEqual({ text: 'EASY · LEVEL 1 / 20', filled: 1, bar: true });
  await expect(page.locator('#progress')).toBeVisible();
  expect(await page.locator('#progress .bar i').count()).toBe(20);
  expect(await page.locator('#progress').getAttribute('aria-live')).toBe('polite');
  // Left of Enter MR, clear of the logo.
  const [bar, enter, logo] = await Promise.all(['#progress', '#enter-mr', '#title'].map((q) => page.locator(q).boundingBox()));
  expect(bar!.x + bar!.width, 'left of the button').toBeLessThanOrEqual(enter!.x);
  expect(bar!.x, 'right of the logo').toBeGreaterThanOrEqual(logo!.x + logo!.width);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await page.screenshot({ path: `${OUT}/desktop-level1.png` });
  await solve(page);
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.levelIndex === 1 && window.__chrono!.flow === 'playing');
  expect(await progress(page)).toEqual({ text: 'EASY · LEVEL 2 / 20', filled: 2, bar: true });
  await page.screenshot({ path: `${OUT}/desktop-level2.png` });
  expect(errors).toEqual([]);
});

test('desktop: a real click on the pause button opens the pause menu; Main menu keeps the run, and Continue is the same stage and level', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id), 'medium');
  await page.evaluate(() => window.__chrono!.jump(5));
  await page.waitForFunction(() => window.__chrono!.levelIndex === 4 && window.__chrono!.flow === 'playing');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  // The mouse, at the button's own screen position: no hook press.
  const [x, y] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'pause')!.screen);
  await page.mouse.click(x, y);
  await cardIs(page, 'paused');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Resume', 'Restart', 'Give up', 'Main menu', 'No timer']);
  expect(await progress(page), 'the pause menu is a menu: no header progress').toBeNull();
  await page.screenshot({ path: `${OUT}/paused.png` });
  await click(page, 'menu');
  await cardIs(page, 'title');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores']);
  expect(await page.evaluate(() => window.__chrono!.run)).toMatchObject({ stage: 'medium' });
  await click(page, 'continue');
  await playing(page);
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Medium · Level 1'); // jump does not clear levels: the run resumes where it was cleared
  expect(await progress(page)).toEqual({ text: 'MEDIUM · LEVEL 1 / 20', filled: 1, bar: true });
  expect(errors).toEqual([]);
});

test('desktop: Esc and P pause and resume a level; Esc on a menu goes back one menu; P on a menu does nothing', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.press('p');
  expect(await page.evaluate(() => window.__chrono!.flow), 'P on the start screen does nothing').toBe('title');
  await newGame(page, (id) => click(page, id));
  for (const key of ['Escape', 'p', 'P']) {
    await page.keyboard.press(key);
    await page.waitForFunction(() => window.__chrono!.flow === 'paused');
    await page.keyboard.press(key === 'Escape' ? 'Escape' : key);
    await playing(page);
  }
  // On the pause menu P resumes; Esc on Options (over the title) goes back to the title.
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await click(page, 'menu');
  await cardIs(page, 'title');
  await click(page, 'options');
  await cardIs(page, 'options');
  await page.keyboard.press('p');
  await cardIs(page, 'options');
  await page.keyboard.press('Escape');
  await cardIs(page, 'title');
  expect(errors).toEqual([]);
});

test('desktop: Restart is a new puzzle at the same level, and the run clock keeps counting', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.levelTime > 1);
  const before = await layoutOf(page);
  await page.keyboard.press('Escape');
  await cardIs(page, 'paused');
  await click(page, 'restart');
  await playing(page);
  await page.waitForFunction(() => window.__chrono!.levelTime < 1);
  const after = await layoutOf(page);
  expect(after).not.toBe(before);
  expect(await page.evaluate(() => window.__chrono!.levelIndex)).toBe(0);
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Easy · Level 1');
  expect((await page.evaluate(() => window.__chrono!.run))!.ms, 'the time on the first puzzle still counts').toBeGreaterThan(900);
  expect(errors).toEqual([]);
});

test('Random level shows "RANDOM · HARD" with no bar', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'random');
  await click(page, 'hard');
  await playing(page);
  await page.waitForFunction(() => window.__chrono!.progress !== null);
  expect(await progress(page)).toEqual({ text: 'RANDOM · HARD', filled: 0, bar: false });
  await expect(page.locator('#progress .bar')).toBeHidden();
  expect(errors).toEqual([]);
});

test('phone 375x812: the compact "E · 2/20" sits under the logo, clear of the logo and the button', async ({ page }) => {
  const errors = await open(page, { width: 375, height: 812 });
  await newGame(page, (id) => click(page, id));
  await page.evaluate(() => window.__chrono!.jump(2));
  await page.waitForFunction(() => window.__chrono!.levelIndex === 1 && window.__chrono!.flow === 'playing');
  await expect(page.locator('#progress')).toBeVisible();
  expect(await page.locator('#progress .short').innerText()).toBe('E · 2/20');
  const [box, enter, logo] = await Promise.all(['#progress', '#enter-mr', '#title'].map((q) => page.locator(q).boundingBox()));
  const apart = (a: NonNullable<typeof box>, b: NonNullable<typeof box>) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  expect(apart(box!, logo!), 'clear of the logo').toBe(true);
  expect(apart(box!, enter!), 'clear of the button').toBe(true);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await page.screenshot({ path: `${OUT}/phone.png` });
  expect(errors).toEqual([]);
});
