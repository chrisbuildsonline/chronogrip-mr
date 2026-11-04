import { expect, test, type Page } from './fixtures';
import { begin, choose, toSelect } from './start';
import { LEVELS } from '../../src/levels';
import { encodeSeed } from '../../src/seed';
import { dailySeed, tinkerLevel } from '../../src/tinker';
import { calibrateByMouse } from './calibrate';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/seed';
const SEED = 424242;
const CODE = encodeSeed(SEED);

async function open(page: Page, path: string, size = { width: 1440, height: 900 }) {
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

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

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

/** Plays the level up now to its complete card. */
async function solve(page: Page, solution: Record<string, string>) {
  if ((await page.evaluate(() => window.__chrono!.flow)) === 'title') await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'restart'));
  await frames(page);
}

const words = (page: Page) => page.evaluate(() => window.__chrono!.labels().map((l) => l.text));

test('desktop: ?seed=CODE opens that exact puzzle; the complete card shows the code and Copy link copies the link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const want = tinkerLevel(SEED);
  const errors = await open(page, `/?seed=${CODE.toLowerCase()}`);
  const got = await page.evaluate(() => ({ id: window.__chrono!.levelId, gears: window.__chrono!.gearCount, axles: window.__chrono!.axleCount, flow: window.__chrono!.flow, index: window.__chrono!.levelIndex, code: window.__chrono!.seedCode, note: window.__chrono!.seedNote }));
  expect(got).toEqual({ id: want.id, gears: want.fixed.length + want.tray.length, axles: want.axles.length, flow: 'title', index: LEVELS.length, code: CODE, note: null });
  expect(await page.evaluate(() => Object.keys(window.__chrono!.axles))).toEqual(want.axles.map((a) => a.id));

  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.waitForFunction(() => window.__chrono!.labels().some((l) => l.text === 'Puzzle'));
  const hud = await words(page);
  expect(hud).toEqual(expect.arrayContaining(['SHARED', 'Puzzle']));
  expect(hud.some((w) => /^Level/.test(w) || w === 'Daily')).toBe(false);
  await solve(page, want.solution);
  expect(await words(page)).toContain(`Puzzle code ${CODE}`);
  expect(await words(page)).toContain('Shared puzzle complete'); // a friend's puzzle is not "Level 9" and not the daily
  expect((await words(page)).some((w) => /^(Level 9|Daily)/.test(w))).toBe(false);
  const ids = await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id));
  expect(ids).toEqual(['next', 'restart', 'copy']);
  // The daily slot is the seeded puzzle: its time is saved under its own id, nothing else is touched.
  expect(await page.evaluate(() => Object.keys(window.__chrono!.progress.best))).toEqual([want.id]);
  await page.screenshot({ path: `${OUT}/complete-1440x900.png` });

  expect(await page.evaluate(() => window.__chrono!.copy)).toEqual({ state: 'idle', link: null });
  await click(page, 'copy');
  await page.waitForFunction(() => window.__chrono!.copy.state === 'copied');
  const link = await page.evaluate(() => `${location.origin}${location.pathname}?seed=`);
  expect(await page.evaluate(() => window.__chrono!.copy.link)).toBe(`${link}${CODE}`);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${link}${CODE}`);
  await frames(page);
  expect(await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'copy')!.label)).toBe('Copied');
  await page.screenshot({ path: `${OUT}/copied-1440x900.png` });
  await page.waitForFunction(() => window.__chrono!.buttons().find((b) => b.id === 'copy')!.label === 'Copy link', null, { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('desktop: when the clipboard fails, Copy link shows the link text instead', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
  });
  const daily = tinkerLevel(dailySeed(new Date()));
  const errors = await open(page, '/');
  await choose(page, (id) => click(page, id), LEVELS.length + 1);
  await solve(page, daily.solution);
  expect(await words(page)).toContain(`Puzzle code ${encodeSeed(dailySeed(new Date()))}`);
  expect(await words(page)).toContain('Daily complete'); // today's daily keeps its name
  await click(page, 'copy');
  await page.waitForFunction(() => window.__chrono!.copy.state === 'failed');
  await frames(page);
  const link = await page.evaluate(() => window.__chrono!.copy.link);
  expect(link).toBe(`http://localhost:4173/?seed=${encodeSeed(dailySeed(new Date()))}`);
  const labels = await page.evaluate(() => window.__chrono!.labels());
  expect(labels.map((l) => l.text)).toContain(link);
  for (const l of labels) expect(l.height, l.text).toBeGreaterThanOrEqual(9);
  await page.screenshot({ path: `${OUT}/copy-failed-1440x900.png` });
  expect(errors).toEqual([]);
});

test('desktop: a hand-made level has no puzzle code and no Copy link', async ({ page }) => {
  const errors = await open(page, '/');
  await choose(page, (id) => click(page, id), 1);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.seedCode)).toBeNull();
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  await frames(page);
  expect((await words(page)).some((w) => w.startsWith('Puzzle code'))).toBe(false);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['next', 'restart', 'levels']);
  expect(errors).toEqual([]);
});

for (const bad of ['', 'nope!', 'ZZZZZZZZZ', 'abc']) {
  test(`desktop: a bad seed (${JSON.stringify(bad)}) shows a friendly note and the normal game, with no console errors`, async ({ page }) => {
    const errors = await open(page, `/?seed=${encodeURIComponent(bad)}`);
    expect(await page.evaluate(() => window.__chrono!.seedNote)).toBe('That puzzle code didn’t work. Pick any level to play.');
    expect(await page.evaluate(() => window.__chrono!.seedCode)).toBeNull();
    expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l1'); // the normal game, as without a seed
    await page.screenshot({ path: `${OUT}/bad-seed-1440x900.png` });
    await choose(page, (id) => click(page, id), LEVELS.length + 1);
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');
    expect(await page.evaluate(() => window.__chrono!.levelId)).toBe(tinkerLevel(dailySeed(new Date())).id);
    expect(errors).toEqual([]);
  });
}

for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`${size.width}x${size.height}: the shared puzzle's level-select tile reads Shared and fits; the daily's still reads Daily`, async ({ page }) => {
    const errors = await open(page, `/?seed=${CODE}`, size);
    await toSelect(page, (id) => click(page, id));
    await page.waitForFunction(() => window.__chrono!.flow === 'select');
    await page.waitForFunction(() => window.__chrono!.labels().some((l) => l.text === 'Shared'));
    await frames(page);
    const tile = (await page.evaluate(() => window.__chrono!.buttons())).find((b) => b.id === `level-${LEVELS.length + 1}`)!;
    expect(tile.label).toBe('Shared');
    const word = (await page.evaluate(() => window.__chrono!.labels())).find((l) => l.text === 'Shared')!;
    expect(word.left).toBeGreaterThanOrEqual(tile.rect[0]);
    expect(word.right).toBeLessThanOrEqual(tile.rect[2]);
    expect(word.height).toBeGreaterThanOrEqual(size.width < 500 ? 12 : 9);
    await page.screenshot({ path: `${OUT}/select-${size.width}x${size.height}.png` });
    expect(errors).toEqual([]);

    await page.goto('/');
    await page.waitForFunction(() => window.__chrono?.ready === true);
    await toSelect(page, (id) => click(page, id));
    expect(await page.evaluate((id) => window.__chrono!.buttons().find((b) => b.id === id)!.label, `level-${LEVELS.length + 1}`)).toBe('Daily');
  });
}

test('desktop: no ?seed= means no note', async ({ page }) => {
  await open(page, '/');
  expect(await page.evaluate(() => window.__chrono!.seedNote)).toBeNull();
});

test('phone 375x812: the code line and the Copy link pill fit the bottom sheet', async ({ page }) => {
  const want = tinkerLevel(SEED);
  const errors = await open(page, `/?seed=${CODE}`, { width: 375, height: 812 });
  await solve(page, want.solution);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const labels = await page.evaluate(() => window.__chrono!.labels());
  const line = labels.find((l) => l.text === `Puzzle code ${CODE}`);
  expect(line, 'the code line is on the sheet').toBeDefined();
  expect(line!.height).toBeGreaterThanOrEqual(12);
  expect(labels.map((l) => l.text)).toContain('Shared puzzle complete');
  const corners = await page.evaluate(() => window.__chrono!.panelCorners());
  const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  for (const l of labels) {
    expect(l.left, `"${l.text}" inside the sheet (left)`).toBeGreaterThanOrEqual(x0);
    expect(l.right, `"${l.text}" inside the sheet (right)`).toBeLessThanOrEqual(x1);
    expect(l.height, `"${l.text}" is 12 px or more`).toBeGreaterThanOrEqual(12);
  }
  for (const a of labels) {
    for (const b of labels) {
      if (a === b || Math.abs(a.y - b.y) > Math.max(a.height, b.height) * 0.8) continue;
      expect(a.right <= b.left || b.right <= a.left, `"${a.text}" and "${b.text}" do not overlap`).toBe(true);
    }
  }
  const buttons = await page.evaluate(() => window.__chrono!.buttons());
  expect(buttons.map((b) => b.id)).toEqual(['next', 'restart', 'copy']);
  for (const b of buttons) {
    const text = labels.find((l) => l.text === b.label)!;
    expect(text.left, `${b.id} label inside its pill`).toBeGreaterThanOrEqual(b.rect[0]);
    expect(text.right, `${b.id} label inside its pill`).toBeLessThanOrEqual(b.rect[2]);
    expect(b.rect[0] >= x0 && b.rect[2] <= x1, `${b.id} inside the sheet`).toBe(true);
    expect(b.rect[3] - b.rect[1]).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `${OUT}/complete-375x812.png` });
  expect(errors).toEqual([]);
});
