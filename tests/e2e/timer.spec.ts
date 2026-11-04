import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { encodeSeed } from '../../src/seed';
import { dailySeed, tinkerLevel } from '../../src/tinker';
import { clock } from '../../src/ui';
import { parFor } from '../../src/timer';
import { calibrateByMouse } from './calibrate';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/timer';
const L1 = LEVELS[0]!;
const L1_PAR = parFor(L1);

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

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const words = (page: Page) => page.evaluate(() => window.__chrono!.labels().map((l) => l.text));
const timer = (page: Page) => page.evaluate(() => window.__chrono!.timer);

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

/** Starts the level up now (from the title) and waits for the HUD. */
async function start(page: Page) {
  if ((await page.evaluate(() => window.__chrono!.flow)) === 'title') await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'hud');
  await frames(page);
}

/** Places the solution, regulates the escapement and waits for the complete card. */
async function solve(page: Page, solution: Record<string, string>) {
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'complete');
  await frames(page);
}

test('desktop: a countdown ring shows on the HUD while playing, inside the card, and counts down', async ({ page }) => {
  const errors = await open(page);
  expect(await timer(page)).toMatchObject({ relaxed: false, par: L1_PAR });
  await start(page);
  const t = await timer(page);
  expect(t).toMatchObject({ relaxed: false, par: L1_PAR, ring: true, over: 0 });
  expect(t.left).toBeGreaterThan(L1_PAR - 5);
  const w = await words(page);
  expect(w).toContain('LEFT');
  expect(w.some((x) => /^\d+:\d\d$/.test(x))).toBe(true);
  // Every word, ring included, is inside the card and readable.
  const { card } = await page.evaluate(() => window.__chrono!.viewBoxes());
  for (const l of await page.evaluate(() => window.__chrono!.labels())) {
    expect(l.left, l.text).toBeGreaterThanOrEqual(card![0]);
    expect(l.right, l.text).toBeLessThanOrEqual(card![2]);
    expect(l.height, l.text).toBeGreaterThanOrEqual(9);
  }
  await page.evaluate(() => window.__chrono!.advanceClock(30));
  await page.waitForFunction((par) => window.__chrono!.timer.left <= par - 30, L1_PAR);
  await frames(page);
  // The card redraws at most a frame behind the clock, so allow the label to be a second off.
  const { left, shown } = await page.evaluate(() => ({ left: window.__chrono!.timer.left, shown: window.__chrono!.labels().map((l) => l.text) }));
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  expect(shown.some((x) => x === mmss(left) || x === mmss(left + 1))).toBe(true);
  await page.screenshot({ path: `${OUT}/hud-1440x900.png` });
  expect(errors).toEqual([]);
});

test('desktop: solved under par is a pass, saved, with the par on the card and Retry not offered', async ({ page }) => {
  const errors = await open(page);
  await start(page);
  await solve(page, L1.solution);
  const w = await words(page);
  expect(w).toEqual(expect.arrayContaining(['SOLVED', 'Level 1 complete', `PAR ${clock(L1_PAR)}`]));
  expect(w).not.toContain('OVER TIME');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['next', 'restart', 'levels']);
  expect(await page.evaluate(() => window.__chrono!.outcome)).toBe('pass');
  expect(await page.evaluate(() => window.__chrono!.outcomes)).toEqual({ l1: 'pass' });
  expect(await page.evaluate(() => Object.keys(window.__chrono!.progress.best))).toEqual(['l1']);
  await page.screenshot({ path: `${OUT}/pass-1440x900.png` });
  expect(errors).toEqual([]);
});

test('desktop: running out the clock still wakes the bird; the card says over time and Retry restarts the level', async ({ page }) => {
  const errors = await open(page);
  await start(page);
  await page.evaluate((s) => window.__chrono!.advanceClock(s), L1_PAR + 7);
  await page.waitForFunction(() => window.__chrono!.timer.over >= 7);
  await frames(page);
  const hud = await words(page); // real time keeps running on a slow machine, so the seconds over are 7 or a little more
  expect(hud).toContain('OVER');
  expect(hud.some((x) => /^\+0:\d\d$/.test(x))).toBe(true);
  expect((await timer(page)).left).toBe(0);
  expect(await words(page)).not.toContain('LEFT');
  await page.screenshot({ path: `${OUT}/hud-over-1440x900.png` });

  await solve(page, L1.solution);
  expect(await page.evaluate(() => window.__chrono!.automatonRunning)).toBe(true); // the bird woke
  const w = await words(page);
  expect(w).toEqual(expect.arrayContaining(['OVER TIME', 'Level 1 complete', `PAR ${clock(L1_PAR)}`]));
  expect(w).not.toContain('SOLVED');
  const buttons = await page.evaluate(() => window.__chrono!.buttons().map((b) => [b.id, b.label]));
  expect(buttons).toEqual([['restart', 'Retry'], ['next', 'Next'], ['levels', 'Levels']]);
  expect(await page.evaluate(() => window.__chrono!.outcome)).toBe('over');
  expect(await page.evaluate(() => window.__chrono!.outcomes)).toEqual({ l1: 'over' });
  expect(await page.evaluate(() => Object.keys(window.__chrono!.progress.best))).toEqual(['l1']); // the best time is kept either way
  await page.screenshot({ path: `${OUT}/over-1440x900.png` });

  await click(page, 'restart');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.levelTime)).toBeLessThan(3);
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({});
  expect(await timer(page)).toMatchObject({ ring: true, over: 0 });
  expect((await timer(page)).left).toBeGreaterThan(L1_PAR - 5);
  expect(await page.evaluate(() => window.__chrono!.outcome)).toBeNull();

  // A quick second run passes, and the pass replaces the over.
  await solve(page, L1.solution);
  expect(await words(page)).toContain('SOLVED');
  expect(await page.evaluate(() => window.__chrono!.outcomes)).toEqual({ l1: 'pass' });
  expect(errors).toEqual([]);
});

test('desktop: Relaxed hides the ring, never says over time, persists across a reload and toggles on the pause card', async ({ page }) => {
  const errors = await open(page);
  expect((await timer(page)).relaxed).toBe(false);
  expect(await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'relaxed')!.label)).toBe('No timer');
  await frames(page);
  await page.screenshot({ path: `${OUT}/title-off-1440x900.png` });
  await click(page, 'relaxed');
  await page.waitForFunction(() => window.__chrono!.timer.relaxed);
  expect(await page.evaluate(() => localStorage.getItem('chronogrip.relaxed.v1'))).toBe('1');
  await frames(page);
  await page.screenshot({ path: `${OUT}/relaxed-title-1440x900.png` });

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect((await timer(page)).relaxed).toBe(true);

  await start(page);
  expect(await timer(page)).toMatchObject({ relaxed: true, ring: false });
  expect(await words(page)).not.toContain('LEFT');
  await page.evaluate(() => window.__chrono!.advanceClock(100_000));
  await frames(page);
  expect(await words(page)).not.toContain('OVER');
  await solve(page, L1.solution);
  const w = await words(page);
  expect(w).toContain('SOLVED');
  expect(w.some((x) => /over time|^PAR/i.test(x))).toBe(false);
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.id))).toEqual(['next', 'restart', 'levels']);
  expect(await page.evaluate(() => window.__chrono!.outcome)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.outcomes)).toEqual({}); // relaxed runs are not marked
  expect(await page.evaluate(() => Object.keys(window.__chrono!.progress.best))).toEqual(['l1']);

  // Back on the pause card the toggle turns the timer on again, for the next level started.
  await click(page, 'restart');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__chrono!.paused);
  await frames(page);
  await page.screenshot({ path: `${OUT}/relaxed-paused-1440x900.png` });
  await click(page, 'relaxed');
  await page.waitForFunction(() => !window.__chrono!.timer.relaxed);
  expect(await page.evaluate(() => localStorage.getItem('chronogrip.relaxed.v1'))).toBe('0');
  await click(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page);
  expect(await timer(page)).toMatchObject({ relaxed: false, ring: true });
  expect(errors).toEqual([]);
});

test('desktop: the daily and a shared ?seed= puzzle get the par of their own difficulty', async ({ page }) => {
  const seed = 424242;
  const errors = await open(page, `/?seed=${encodeSeed(seed)}`);
  expect((await timer(page)).par).toBe(parFor(tinkerLevel(seed)));
  const errors2 = await open(page, '/');
  expect((await timer(page)).par).toBe(L1_PAR);
  await click(page, 'levels');
  await click(page, `level-${LEVELS.length + 1}`);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect((await timer(page)).par).toBe(parFor(tinkerLevel(dailySeed(new Date()))));
  expect(await words(page)).toContain('LEFT');
  expect([...errors, ...errors2]).toEqual([]);
});

for (const size of [{ width: 375, height: 812 }]) {
  test(`phone ${size.width}x${size.height}: the ring, the over-time card and the Relaxed toggle fit and read`, async ({ page }) => {
    const errors = await open(page, '/', size);
    const fits = async (what: string) => {
      const { card } = await page.evaluate(() => window.__chrono!.viewBoxes());
      for (const l of await page.evaluate(() => window.__chrono!.labels())) {
        expect(l.left, `${what} ${l.text}`).toBeGreaterThanOrEqual(card![0]);
        expect(l.right, `${what} ${l.text}`).toBeLessThanOrEqual(card![2]);
        expect(l.height, `${what} ${l.text}`).toBeGreaterThanOrEqual(11.5);
      }
      // The toggle's words (and its check disc) sit wholly inside the pill.
      const pill = (await page.evaluate(() => window.__chrono!.buttons())).find((b) => b.id === 'relaxed');
      const words = (await page.evaluate(() => window.__chrono!.labels())).find((l) => l.text === 'No timer');
      if (pill) {
        expect(words, `${what} toggle word`).toBeTruthy();
        expect(words!.left, `${what} toggle word`).toBeGreaterThanOrEqual(pill.rect[0] + 16); // room for the check disc before the words
        expect(words!.right, `${what} toggle word`).toBeLessThanOrEqual(pill.rect[2] - 5); // 5 px of air at the pill's end
      }
      for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
        expect(b.rect[0], `${what} ${b.id}`).toBeGreaterThanOrEqual(0);
        expect(b.rect[2], `${what} ${b.id}`).toBeLessThanOrEqual(size.width);
        expect(Math.min(b.rect[2] - b.rect[0], b.rect[3] - b.rect[1]), `${what} ${b.id}`).toBeGreaterThanOrEqual(40);
      }
    };
    await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'relaxed'));
    await fits('title');
    await page.screenshot({ path: `${OUT}/title-off-${size.width}x${size.height}.png` });
    await click(page, 'relaxed');
    await page.waitForFunction(() => window.__chrono!.timer.relaxed);
    await frames(page);
    await fits('title on');
    await page.screenshot({ path: `${OUT}/relaxed-${size.width}x${size.height}.png` });
    await click(page, 'relaxed');
    await page.waitForFunction(() => !window.__chrono!.timer.relaxed);
    await start(page);
    await fits('hud');
    await page.screenshot({ path: `${OUT}/hud-${size.width}x${size.height}.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__chrono!.paused);
    await frames(page);
    await fits('pause');
    await page.screenshot({ path: `${OUT}/paused-${size.width}x${size.height}.png` });
    await click(page, 'resume');
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');
    await page.evaluate((s) => window.__chrono!.advanceClock(s), L1_PAR + 5);
    await solve(page, L1.solution);
    await fits('over');
    expect(await words(page)).toContain('OVER TIME');
    await page.screenshot({ path: `${OUT}/over-${size.width}x${size.height}.png` });
    expect(errors).toEqual([]);
  });
}
