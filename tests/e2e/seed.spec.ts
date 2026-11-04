import { expect, test, type Page } from './fixtures';
import { begin, choose } from './start';
import { LEVELS } from '../../src/levels';
import { encodeSeed } from '../../src/seed';
import { tinkerLevel } from '../../src/tinker';
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

test('desktop: ?seed=CODE opens that exact puzzle; the complete card shows no code or link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const want = tinkerLevel(SEED);
  const errors = await open(page, `/?seed=${CODE.toLowerCase()}`);
  const got = await page.evaluate(() => ({ id: window.__chrono!.levelId, gears: window.__chrono!.gearCount, axles: window.__chrono!.axleCount, flow: window.__chrono!.flow, index: window.__chrono!.levelIndex, code: window.__chrono!.seedCode, note: window.__chrono!.seedNote }));
  expect(got).toEqual({ id: want.id, gears: want.fixed.length + want.tray.length, axles: want.axles.length, flow: 'title', index: 20, code: CODE, note: null });
  expect(await page.evaluate(() => Object.keys(window.__chrono!.axles))).toEqual(want.axles.map((a) => a.id));

  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.waitForFunction(() => window.__chrono!.labels().some((l) => l.text === 'Puzzle'));
  const hud = await words(page);
  expect(hud).toEqual(expect.arrayContaining(['SHARED', 'Puzzle']));
  expect(hud.some((w) => /^Level/.test(w))).toBe(false);
  await solve(page, want.solution);
  expect((await words(page)).some((w) => /code|link/i.test(w)), 'no puzzle code or link anywhere on the card').toBe(false);
  expect(await words(page)).toContain('Shared puzzle complete'); // a friend's puzzle is not a numbered level
  expect((await words(page)).some((w) => /^Level/.test(w))).toBe(false);
  const ids = await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id));
  expect(ids).toEqual(['restart', 'menu']);
  // A shared puzzle is no part of a run: nothing is saved for it.
  expect(await page.evaluate(() => window.__chrono!.run)).toBeNull();
  await page.screenshot({ path: `${OUT}/complete-1440x900.png` });

  expect(errors).toEqual([]);
});

test('desktop: a hand-made level card has Next only, and no code', async ({ page }) => {
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
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['next', 'restart']);
  expect(errors).toEqual([]);
});

for (const bad of ['', 'nope!', 'ZZZZZZZZZ', 'abc']) {
  test(`desktop: a bad seed (${JSON.stringify(bad)}) shows a friendly note and the normal game, with no console errors`, async ({ page }) => {
    const errors = await open(page, `/?seed=${encodeURIComponent(bad)}`);
    expect(await page.evaluate(() => window.__chrono!.seedNote)).toBe('That puzzle code didn’t work. Start a new game instead.');
    expect(await page.evaluate(() => window.__chrono!.seedCode)).toBeNull();
    expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l1'); // the normal game, as without a seed
    await page.screenshot({ path: `${OUT}/bad-seed-1440x900.png` });
    await begin(page, (id) => click(page, id));
    expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l1');
    expect(errors).toEqual([]);
  });
}

for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`${size.width}x${size.height}: a shared puzzle is the title's primary button, Shared puzzle, above New Game, and it fits`, async ({ page }) => {
    const errors = await open(page, `/?seed=${CODE}`, size);
    await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'continue'));
    await frames(page);
    const buttons = await page.evaluate(() => window.__chrono!.buttons());
    expect(buttons.map((b) => [b.id, b.label])).toEqual([['continue', 'Shared puzzle'], ['start', 'New Game'], ['random', 'Random level'], ['options', 'Options'], ['scores', 'High scores']]);
    for (const b of buttons) {
      expect(b.rect[3] - b.rect[1], `${b.id} tall`).toBeGreaterThanOrEqual(44);
      expect(b.rect[0] >= 0 && b.rect[2] <= size.width && b.rect[1] >= 0 && b.rect[3] <= size.height, `${b.id} on screen`).toBe(true);
    }
    const word = (await page.evaluate(() => window.__chrono!.labels())).find((l) => l.text === 'Shared puzzle')!;
    expect(word.left).toBeGreaterThanOrEqual(buttons[0]!.rect[0]);
    expect(word.right).toBeLessThanOrEqual(buttons[0]!.rect[2]);
    expect(word.height).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: `${OUT}/title-${size.width}x${size.height}.png` });
    expect(errors).toEqual([]);
  });
}

test('desktop: no ?seed= means no note', async ({ page }) => {
  await open(page, '/');
  expect(await page.evaluate(() => window.__chrono!.seedNote)).toBeNull();
});

test('phone 375x812: the shared puzzle complete card fits the bottom sheet, with no code line', async ({ page }) => {
  const want = tinkerLevel(SEED);
  const errors = await open(page, `/?seed=${CODE}`, { width: 375, height: 812 });
  await solve(page, want.solution);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const labels = await page.evaluate(() => window.__chrono!.labels());
  expect(labels.some((l) => /code|link/i.test(l.text)), 'no code line').toBe(false);
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
  expect(buttons.map((b) => b.id)).toEqual(['restart', 'menu']);
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
