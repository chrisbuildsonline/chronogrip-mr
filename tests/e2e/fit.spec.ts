import { expect, test, type Page } from './fixtures';
import { LEVELS } from '../../src/levels';
import { calibrateByMouse } from './calibrate';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/fit';
const TUNED_EYE = [0.107, 0.225, 0.364];

type Box = readonly [x0: number, y0: number, x1: number, y1: number];
const overlap = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const domBox = async (page: Page, sel: string): Promise<Box | null> => {
  const b = await page.locator(sel).boundingBox();
  return b && [b.x, b.y, b.x + b.width, b.y + b.height];
};

const frames = (page: Page, n = 3) =>
  page.evaluate((k) => new Promise((done) => {
    const next = (i: number) => (i <= 0 ? done(null) : requestAnimationFrame(() => next(i - 1)));
    next(k);
  }), n);

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

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

/** Board, dial, bird and the card up now all inside the viewport; the header clear of the card and of itself. */
async function fits(page: Page, w: number, h: number, state: string) {
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const boxes = await page.evaluate(() => window.__chrono!.viewBoxes());
  expect(boxes.card, `${state}: a card is up`).not.toBeNull();
  for (const [name, b] of Object.entries(boxes)) {
    const at = `${w}x${h} ${state}: ${name} ${b!.map((v) => v.toFixed(0)).join(',')}`;
    expect(b![0], at).toBeGreaterThanOrEqual(0);
    expect(b![1], at).toBeGreaterThanOrEqual(0);
    expect(b![2], at).toBeLessThanOrEqual(w);
    expect(b![3], at).toBeLessThanOrEqual(h);
  }
  const title = (await domBox(page, '#title'))!;
  const pill = (await domBox(page, '#enter-mr'))!;
  const note = await domBox(page, '#enter-note');
  const card = boxes.card!;
  expect(overlap(title, card), `${w}x${h} ${state}: card clear of the wordmark`).toBe(false);
  expect(overlap(pill, card), `${w}x${h} ${state}: card clear of Enter MR`).toBe(false);
  expect(overlap(pill, title), `${w}x${h}: Enter MR clear of the wordmark`).toBe(false);
  expect(pill[0] >= 0 && pill[2] <= w, `${w}x${h}: Enter MR on screen`).toBe(true);
  if (note) {
    expect(overlap(note, card), `${w}x${h} ${state}: note clear of the card`).toBe(false);
    expect(overlap(note, title), `${w}x${h}: note clear of the wordmark`).toBe(false);
    expect(note[2] <= w && note[3] <= h, `${w}x${h}: note on screen`).toBe(true);
  }
  await page.screenshot({ path: `${OUT}/${w}x${h}-${state}.png` });
}

/** The card's face is square to the camera: its projected corners make a rectangle-like quad, no keystone. */
async function square(page: Page, w: number, h: number) {
  const [bl, br, tl, tr] = await page.evaluate(() => window.__chrono!.panelCorners());
  const bottom = br![0] - bl![0];
  const top = tr![0] - tl![0];
  // Seen face on, the top and bottom edges match in length and the sides stand upright (within 2 %).
  expect(Math.abs(top - bottom) / bottom, `${w}x${h}: top and bottom edges match`).toBeLessThan(0.02);
  expect(Math.abs(tl![0] - bl![0]) / bottom, `${w}x${h}: left side upright`).toBeLessThan(0.02);
}

for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]] as const) {
  test(`desktop ${w}x${h}: the board, dial, bird and every card fit; the header stays clear; no console errors`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto('/');
    await page.waitForFunction(() => window.__chrono?.ready === true);

    // Landscape keeps the tuned camera; portrait backs off along the same line.
    const eye = await page.evaluate(() => window.__chrono!.cameraAt);
    const dist = (p: readonly number[]) => Math.hypot(p[0]! - 0.015, p[1]! + 0.08, p[2]! + 0.36);
    if (w > h) eye.forEach((v, k) => expect(v, 'tuned eye').toBeCloseTo(TUNED_EYE[k]!, 4));
    else expect(dist(eye)).toBeGreaterThan(dist(TUNED_EYE) * 1.05);

    await fits(page, w, h, 'title');
    await square(page, w, h);
    await click(page, 'start');
    await page.waitForFunction(() => window.__chrono!.flow === 'select');
    await fits(page, w, h, 'select');
    await square(page, w, h);
    // The wide level select card needs more room than the others: a phone-width window eases back for it.
    const select = dist(await page.evaluate(() => window.__chrono!.cameraAt));
    if (w > h) expect(select).toBeCloseTo(dist(TUNED_EYE), 4);
    else expect(select).toBeGreaterThan(dist(eye) * (w < 500 ? 1.05 : 1));
    await click(page, 'level-1');
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');
    await fits(page, w, h, 'hud');
    const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
    await place(page, gear, axle);
    await calibrateByMouse(page);
    await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
    await fits(page, w, h, 'complete');
    await square(page, w, h);

    // Level 5 has the widest parts strip: the camera refits for it on load, and backs off again only where it must.
    const before = dist(await page.evaluate(() => window.__chrono!.cameraAt));
    await click(page, 'levels');
    await page.waitForFunction(() => window.__chrono!.flow === 'select');
    await click(page, 'level-5');
    await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 4);
    await fits(page, w, h, 'level5');
    const after = dist(await page.evaluate(() => window.__chrono!.cameraAt));
    if (w > h) expect(after).toBeCloseTo(before, 4);
    else expect(after).toBeGreaterThanOrEqual(before - 1e-9); // the phone title card is two pill rows tall, so on a phone level 1 may already sit as far back as level 5 needs
    expect(errors).toEqual([]);
  });
}

test('desktop: turning the window to portrait and back refits the camera', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(() => Math.hypot(...window.__chrono!.cameraAt.map((v, k) => v - [0.015, -0.08, -0.36][k]!)) > 1);
  await fits(page, 375, 812, 'resized-title');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction((e) => window.__chrono!.cameraAt.every((v, k) => Math.abs(v - e[k]!) < 1e-4), TUNED_EYE);
});
