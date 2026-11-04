import { expect, test, type Page } from './fixtures';
import { begin, choose } from './start';
import { LEVELS } from '../../src/levels';
import { calibrateByMouse } from './calibrate';

const KEY = 'chronogrip.progress.v1';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  return errors;
}

/** Saved progress in place before the page's own scripts run. */
const seed = (page: Page, raw: string) => page.addInitScript(([k, v]) => localStorage.setItem(k!, v!), [KEY, raw]);

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const label = (page: Page, id: string) => page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)?.label, id);

/** Two rendered frames, so the panel drawn for the current state is on screen. */
const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

async function place(page: Page, gear: string, axle: string) {
  const from = await screen(page, 'gears', gear);
  const to = await screen(page, 'axles', axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(([g, a]) => window.__chrono!.placements[g!] === a, [gear, axle]);
}

test('desktop: a solved level is saved, survives a reload and the title offers Continue', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.progress)).toEqual({ best: {} });
  expect(await label(page, 'start')).toBe('New Game');

  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.levelTime > 0);
  await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.flow === 'complete');
  const best = await page.evaluate(() => window.__chrono!.progress.best['l1']);
  expect(best).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__chrono!.newBest)).toBe(false); // a first solve is just solved

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect(await page.evaluate(() => window.__chrono!.progress.best['l1'])).toBe(best);
  expect(await label(page, 'continue')).toBe('Continue');
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-title-after-reload.png' });
  expect(errors).toEqual([]);
});

test('desktop: garbage in saved progress boots clean with no progress', async ({ page }) => {
  await seed(page, '{"best":{"l1":"fast",');
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.progress)).toEqual({ best: {} });
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  expect(await label(page, 'start')).toBe('New Game');
  expect(errors).toEqual([]);
});

test('desktop: with level 1 solved the title reads Continue and starts level 2; the Main menu button comes back to it', async ({ page }) => {
  await seed(page, JSON.stringify({ best: { l1: 30 } }));
  const errors = await open(page);
  expect(await label(page, 'continue')).toBe('Continue');
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2'); // the title board is the level Continue plays
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-title.png' });

  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.levelIndex)).toBe(1);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2');
  expect(await page.evaluate(() => window.__chrono!.ghostHand)).toBe(false);
  expect(errors).toEqual([]);
});

test('desktop: beating a saved time shows New best and saves the lower time', async ({ page }) => {
  await seed(page, JSON.stringify({ best: { l1: 999 } }));
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l2');
  await choose(page, (id) => click(page, id), 1);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === 'l1');
  await page.waitForFunction(() => window.__chrono!.levelTime > 0);
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  expect(await page.evaluate(() => window.__chrono!.newBest)).toBe(true);
  expect(await page.evaluate(() => window.__chrono!.progress.best['l1'])).toBeLessThan(999);
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY);
  expect(saved.best.l1).toBeLessThan(999);
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-newbest.png' });
  expect(errors).toEqual([]);
});

test('desktop: with levels 1-19 solved Continue plays level 20, a generated puzzle; solving it ends on Menu, which returns to the title', async ({ page }) => {
  await seed(page, JSON.stringify({ best: Object.fromEntries(Array.from({ length: 19 }, (_, i) => [`l${i + 1}`, 30])) }));
  const errors = await open(page);
  expect(await label(page, 'continue')).toBe('Continue');
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l20');
  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  expect(await page.evaluate(() => window.__chrono!.gearCount)).toBeGreaterThan(LEVELS[0]!.fixed.length + LEVELS[0]!.tray.length); // not a hand-made level
  await page.waitForFunction(() => window.__chrono!.levelTime > 0);
  const solution = await page.evaluate(() => window.__chrono!.solution);
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  expect(await label(page, 'next')).toBe('Menu');
  expect(await page.evaluate(() => window.__chrono!.progress.best['l20'])).toBeGreaterThan(0);
  await frames(page);
  await page.screenshot({ path: 'test-results/f12-l20-complete.png' });
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'title');
  expect(errors).toEqual([]);
});
