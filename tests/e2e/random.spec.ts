import { expect, test, type Page } from './fixtures';
import { LEVELS } from '../../src/levels';
import { decodeSeed, encodeSeed } from '../../src/seed';
import { MAX_STEP, randomLevel, unpackSeed } from '../../src/random';
import { calibrateByMouse } from './calibrate';
import { begin } from './start';

/** Screenshots land here for a look by eye (gitignored with dist). */
const OUT = 'dist/f29-shots';
const SLOT = LEVELS.length + 2; // the Random tile: after the eight levels and the daily
const KEY = 'chronogrip.random.v1';

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
const random = (page: Page) => page.evaluate(() => window.__chrono!.random);

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

/**
 * Screen positions are only true once the camera has stopped (a phone eases the view when a card changes) and the gear is
 * at rest; so wait on that state, then check the pinch took the gear before dragging it.
 */
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

/** The puzzle on the board, rebuilt from its code the way a friend opening the link would get it. */
async function onBoard(page: Page) {
  const code = (await page.evaluate(() => window.__chrono!.seedCode))!;
  const seed = decodeSeed(code)!;
  return { code, seed, level: randomLevel(unpackSeed(seed).step, seed) };
}

/** Plays the Random puzzle up now to its complete card. */
async function solve(page: Page) {
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  const { level } = await onBoard(page);
  for (const [gear, axle] of Object.entries(level.solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'restart'));
  await frames(page);
}

/** On the level select card: "Random" is drawn at least as tall as "Daily", inside its own tile, with the run's step under or beside it. */
async function readsAsBigAsDaily(page: Page) {
  const labels = await page.evaluate(() => window.__chrono!.labels());
  const [random, daily] = [labels.find((l) => l.text === 'Random')!, labels.find((l) => l.text === 'Daily')!];
  expect(random.height, 'Random is as tall as Daily').toBeGreaterThanOrEqual(daily.height);
  expect(random.height, 'Random is readable').toBeGreaterThanOrEqual(12);
  const tile = (await page.evaluate(() => window.__chrono!.buttons())).find((b) => b.id === `level-${SLOT}`)!;
  expect(random.left).toBeGreaterThanOrEqual(tile.rect[0]);
  expect(random.right).toBeLessThanOrEqual(tile.rect[2]);
  const step = labels.find((l) => /^Step \d+$/.test(l.text))!;
  expect(step, 'the run\'s step is on the tile').toBeDefined();
  expect(step.left).toBeGreaterThanOrEqual(tile.rect[0]);
  expect(step.right).toBeLessThanOrEqual(tile.rect[2]);
}

/** Nothing on the HUD overlaps: the heading, the time, the countdown ring and its words, side by side. */
async function hudClear(page: Page, at: string) {
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const labels = await page.evaluate(() => window.__chrono!.labels());
  const corners = await page.evaluate(() => window.__chrono!.panelCorners());
  const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  const { ringSpan, ring } = await page.evaluate(() => window.__chrono!.timer);
  const card = (await page.evaluate(() => window.__chrono!.card))!;
  expect(ring, `${at}: the ring is up`).toBe(true);
  const px = (m: number) => x0 + (m / card.width) * (x1 - x0);
  // The level time is the leftmost clock reading; the ring's own seconds-left sits further right.
  const time = labels.filter((l) => /^\d+:\d\d/.test(l.text)).sort((a, b) => a.left - b.left)[0]!;
  expect(time, `${at}: a time`).toBeDefined();
  expect(time.right, `${at}: the time ${time.text} stops short of the ring`).toBeLessThanOrEqual(px(ringSpan[0]) - 4);
  const word = labels.find((l) => l.text === 'LEFT' || l.text === 'OVER')!;
  expect(word.left, `${at}: the ring's words start after it`).toBeGreaterThanOrEqual(px(ringSpan[1]));
  for (const a of labels) {
    for (const b of labels) {
      if (a === b || Math.abs(a.y - b.y) >= (a.height + b.height) / 2) continue; // only words that share a line can run into each other
      // 10 px apart at least: "RANDOM" 6 px from "TIME" reads as one word.
      expect(a.right + 10 <= b.left || b.right + 10 <= a.left, `${at}: "${a.text}" and "${b.text}" keep apart`).toBe(true);
    }
  }
  // The heading under the eyebrow (Step 12, Puzzle, Daily, the level number) is there and as readable as the other HUD words.
  const eyebrow = labels.find((l) => /^(RANDOM|SHARED|LEVEL)/.test(l.text))!;
  expect(eyebrow.height, `${at}: "${eyebrow.text}" is 12 px or more`).toBeGreaterThanOrEqual(12);
  if (eyebrow.text.startsWith('RANDOM')) {
    // Random's step is in its eyebrow line ("RANDOM · STEP 12"), with the time under it at the left.
    expect(eyebrow.text, `${at}: the step`).toMatch(/^RANDOM · STEP \d+$/);
    expect(Math.abs(time.left - eyebrow.left), `${at}: the time sits under the eyebrow`).toBeLessThan(3);
  } else {
    const heading0 = labels.find((l) => Math.abs(l.left - eyebrow.left) < 3 && l.y > eyebrow.y && l.y - eyebrow.y < 3 * eyebrow.height);
    expect(heading0, `${at}: a heading under "${eyebrow.text}"`).toBeDefined();
    expect(heading0!.height, `${at}: "${heading0!.text}" is 12 px or more`).toBeGreaterThanOrEqual(12);
  }
  const pause = (await page.evaluate(() => window.__chrono!.buttons())).find((b) => b.id === 'pause')!;
  for (const l of labels.filter((l) => l.left > word.left - 1 && l.y >= word.y - word.height)) expect(l.right + 4, `${at}: "${l.text}" stops short of the pause button`).toBeLessThanOrEqual(pause.rect[0]);
  const heading = labels.filter((l) => l.text !== time.text && l.y > time.y - time.height && l.y < time.y + time.height && l.right < time.left);
  for (const h of heading) expect(h.right, `${at}: "${h.text}" stops short of the time`).toBeLessThanOrEqual(time.left - 4);
  for (const l of labels) expect(l.right, `${at}: "${l.text}" is on the card`).toBeLessThanOrEqual(x1);
}

async function openRandom(page: Page) {
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await click(page, `level-${SLOT}`);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
}

test('desktop: Random is a tile after the daily; three solves in a row climb, and the code reopens the same puzzle', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await frames(page);
  const tiles = await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label));
  expect(tiles).toEqual(['Back', '1', '2', '3', '4', '5', '6', '7', '8', 'Daily', 'Random']);
  expect(await words(page)).toContain('0 of 9 solved'); // Random is endless, not a tenth level
  await readsAsBigAsDaily(page);
  await page.screenshot({ path: `${OUT}/select-1440x900.png` });
  await click(page, `level-${SLOT}`);

  const seen: number[] = [];
  let last = '';
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');
    const r = await random(page);
    expect(r).toMatchObject({ mode: true, slot: SLOT - 1 });
    seen.push(r.step);
    const hud = await words(page);
    expect(hud).toEqual(expect.arrayContaining([`RANDOM · STEP ${r.step}`]));
    expect(hud.some((w) => /^Level/.test(w) || w === 'Daily' || w === 'Puzzle')).toBe(false);
    const { code, seed } = await onBoard(page);
    expect(unpackSeed(seed).step).toBe(r.step); // the code carries the step
    expect(code).not.toBe(last);
    last = code;

    await solve(page);
    const done = await words(page);
    expect(done).toContain(`Random · Step ${r.step} complete`);
    expect(done).toContain(`Puzzle code ${code}`);
    const buttons = await page.evaluate(() => window.__chrono!.buttons().map((b) => [b.id, b.label]));
    expect(buttons).toEqual([['next', 'Next puzzle'], ['restart', 'Restart'], ['copy', 'Copy link']]);
    if (i === 0) await page.screenshot({ path: `${OUT}/complete-1440x900.png` });
    await click(page, 'next');
  }
  // Fast solves on the clock: each jumps two steps, so the steps climb.
  expect(seen).toEqual([1, 3, 5]);
  expect((await random(page)).next).toBe(7); // the third solve moved the run on to 7, and the fourth puzzle is its first
  // Nothing from Random went into level progress.
  expect(await page.evaluate(() => Object.keys(window.__chrono!.progress.best))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('chronogrip.progress.v1'))).toBeNull();
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)).toEqual({ step: 7, slow: false });
  expect(errors).toEqual([]);
});

test('desktop: the puzzle code on the complete card opens that exact Random puzzle via ?seed=', async ({ page }) => {
  const errors = await open(page);
  await openRandom(page);
  const want = await onBoard(page);
  await solve(page);
  expect(await words(page)).toContain(`Puzzle code ${want.code}`);
  const gears = await page.evaluate(() => ({ id: window.__chrono!.levelId, gears: window.__chrono!.gearCount, axles: Object.keys(window.__chrono!.axles) }));
  await page.goto(`/?seed=${want.code.toLowerCase()}`);
  await page.waitForFunction(() => window.__chrono?.ready === true);
  const got = await page.evaluate(() => ({ id: window.__chrono!.levelId, gears: window.__chrono!.gearCount, axles: Object.keys(window.__chrono!.axles), code: window.__chrono!.seedCode, note: window.__chrono!.seedNote }));
  expect(got).toEqual({ ...gears, code: want.code, note: null });
  expect(got.id).toBe(want.level.id);
  // It opens as a shared puzzle and plays through with the very same solution.
  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await words(page)).toEqual(expect.arrayContaining(['SHARED', 'Puzzle']));
  for (const [gear, axle] of Object.entries(want.level.solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'restart'));
  expect(errors).toEqual([]);
});

test('desktop: the step is saved, picked up on a reload and by the Random tile; over par twice eases it', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ step: 6, slow: false })), KEY);
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await openRandom(page);
  expect(await random(page)).toMatchObject({ mode: true, step: 6, next: 6 });

  // Over par: hold, marked slow. The Retry keeps the same puzzle and does not count twice.
  await page.evaluate(() => window.__chrono!.advanceClock(1000));
  const first = (await onBoard(page)).code;
  await solve(page);
  expect(await words(page)).toContain('OVER TIME');
  expect(await random(page)).toMatchObject({ step: 6, next: 6, slow: true });
  await click(page, 'restart'); // Retry
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect((await onBoard(page)).code).toBe(first);
  await page.evaluate(() => window.__chrono!.advanceClock(1000));
  await solve(page);
  expect(await random(page)).toMatchObject({ next: 6, slow: true });
  await page.screenshot({ path: `${OUT}/complete-over-1440x900.png` });
  // Next puzzle after a slow solve is the same step; a second slow solve on a new puzzle eases.
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await random(page)).toMatchObject({ step: 6 });
  await page.evaluate(() => window.__chrono!.advanceClock(1000));
  await solve(page);
  expect(await random(page)).toMatchObject({ next: 5, slow: false });
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY)).toEqual({ step: 5, slow: false });
  expect(errors).toEqual([]);
});

test('desktop: with No timer a solve is just one step on', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'options');
  await click(page, 'relaxed');
  await page.waitForFunction(() => window.__chrono!.timer.relaxed);
  await click(page, 'back');
  await openRandom(page);
  expect(await random(page)).toMatchObject({ step: 1 });
  await solve(page);
  expect(await random(page)).toMatchObject({ next: 2, slow: false });
  expect(await words(page)).not.toContain('OVER TIME');
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await random(page)).toMatchObject({ step: 2 });
  expect(errors).toEqual([]);
});

test('desktop: corrupt storage starts the run at step 1 without a console error', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, '{"step":'), KEY);
  const errors = await open(page);
  await openRandom(page);
  expect(await random(page)).toMatchObject({ step: 1, next: 1 });
  expect(errors).toEqual([]);
});

test('desktop: Random never changes the hand-made levels, the daily or the title', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.levelId)).toBe('l1');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['Start game', 'Options', 'High scores']);
  await click(page, 'start');
  await click(page, 'level-9');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await words(page)).toContain('Daily');
  expect((await random(page)).mode).toBe(false);
  expect(errors).toEqual([]);
});

test('phone 375x812: nothing on the HUD overlaps, for Random at its widest and for the other kinds of level', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, JSON.stringify({ step: 12, slow: false })), KEY);
  const errors = await open(page, '/', { width: 375, height: 812 });
  const cases: [string, () => Promise<void>][] = [
    ['Random step 12', async () => void (await click(page, 'start'), await click(page, `level-${SLOT}`))],
    ['Level 8', async () => void (await click(page, 'start'), await click(page, 'level-8'))],
    ['Daily', async () => void (await click(page, 'start'), await click(page, 'level-9'))],
  ];
  for (const [name, go] of cases) {
    await page.goto('/');
    await page.waitForFunction(() => window.__chrono?.ready === true);
    await go();
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');
    // The widest times: tenths under 10 s (0:08.8), and past ten minutes (12:34).
    for (const s of [0, 8.8, 754]) {
      await page.evaluate((k) => window.__chrono!.advanceClock(k), s);
      await hudClear(page, `${name} at +${s}s`);
    }
    if (name.startsWith('Random')) {
      expect(await words(page)).toEqual(expect.arrayContaining(['RANDOM · STEP 12']));
      await page.screenshot({ path: `${OUT}/hud-375x812.png` });
    }
  }
  // A shared puzzle's heading is "Puzzle", also beside the time.
  const code = encodeSeed(424242);
  await page.goto(`/?seed=${code}`);
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await begin(page, (id) => click(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await hudClear(page, 'Shared');
  expect(errors).toEqual([]);
});

test('phone 375x812: the Random bar and the Next puzzle sheet fit', async ({ page }) => {
  const size = { width: 375, height: 812 };
  const errors = await open(page, '/', size);
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const corners = await page.evaluate(() => window.__chrono!.panelCorners());
  const [x0, x1] = [Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0]))];
  const bar = (await page.evaluate(() => window.__chrono!.buttons())).find((b) => b.id === `level-${SLOT}`)!;
  expect(bar.label).toBe('Random');
  for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
    expect(b.rect[3] - b.rect[1], b.id).toBeGreaterThanOrEqual(44);
    expect(b.rect[0] >= x0 && b.rect[2] <= x1 && b.rect[1] >= 0 && b.rect[3] <= size.height, `${b.id} on the sheet`).toBe(true);
  }
  const word = (await page.evaluate(() => window.__chrono!.labels())).find((l) => l.text === 'Random')!;
  expect(word.height).toBeGreaterThanOrEqual(12);
  expect(word.left).toBeGreaterThanOrEqual(bar.rect[0]);
  expect(word.right).toBeLessThanOrEqual(bar.rect[2]);
  await readsAsBigAsDaily(page);
  await page.screenshot({ path: `${OUT}/select-375x812.png` });
  await click(page, `level-${SLOT}`);

  await solve(page);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const labels = await page.evaluate(() => window.__chrono!.labels());
  const cc = await page.evaluate(() => window.__chrono!.panelCorners());
  const [c0, c1] = [Math.min(...cc.map((c) => c[0])), Math.max(...cc.map((c) => c[0]))];
  expect(labels.map((l) => l.text)).toContain('Random · Step 1 complete');
  for (const l of labels) {
    expect(l.left, `"${l.text}" inside the sheet`).toBeGreaterThanOrEqual(c0);
    expect(l.right, `"${l.text}" inside the sheet`).toBeLessThanOrEqual(c1);
    expect(l.height, `"${l.text}" is 12 px or more`).toBeGreaterThanOrEqual(12);
  }
  for (const a of labels) {
    for (const b of labels) {
      if (a === b || Math.abs(a.y - b.y) > Math.max(a.height, b.height) * 0.8) continue;
      expect(a.right <= b.left || b.right <= a.left, `"${a.text}" and "${b.text}" do not overlap`).toBe(true);
    }
  }
  // The title stops short of the time and the amber check that comes before it on a pass (about 15 px).
  const title = labels.find((l) => l.text === 'Random · Step 1 complete')!;
  const time = labels.find((l) => /^\d+:\d\d/.test(l.text))!;
  expect(title.right, 'the title clears the check and the time').toBeLessThanOrEqual(time.left - 18);
  for (const b of await page.evaluate(() => window.__chrono!.buttons())) {
    const text = labels.find((l) => l.text === b.label)!;
    expect(text.left, `${b.id} label inside its pill`).toBeGreaterThanOrEqual(b.rect[0]);
    expect(text.right, `${b.id} label inside its pill`).toBeLessThanOrEqual(b.rect[2]);
    expect(b.rect[0] >= c0 && b.rect[2] <= c1, `${b.id} inside the sheet`).toBe(true);
  }
  await page.screenshot({ path: `${OUT}/complete-375x812.png` });
  await click(page, 'next');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect((await random(page)).step).toBe(3);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  expect(await words(page)).toEqual(expect.arrayContaining(['RANDOM · STEP 3']));
  await hudClear(page, 'Random step 3');
  expect(MAX_STEP).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
