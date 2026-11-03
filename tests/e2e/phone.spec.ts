import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { DESKTOP_EYE, DESKTOP_TARGET, faceView } from '../../src/fit';
import { TRAY_POSE, type Vec3 } from '../../src/seat';
import { NARROW_W, layout, panelAnchor, panelToWorld, type Screen } from '../../src/ui';
import { calibrateByMouse } from './calibrate';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/phone';

type Box = readonly [x0: number, y0: number, x1: number, y1: number];
const overlap = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const domBox = async (page: Page, sel: string): Promise<Box> => {
  const b = (await page.locator(sel).boundingBox())!;
  return [b.x, b.y, b.x + b.width, b.y + b.height];
};

const frames = (page: Page, n = 3) =>
  page.evaluate((k) => new Promise((done) => {
    const next = (i: number) => (i <= 0 ? done(null) : requestAnimationFrame(() => next(i - 1)));
    next(k);
  }), n);

async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  return errors;
}

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
}

/**
 * The phone card now up: the narrow layout, a bottom sheet clear of the board and the header, every button at least
 * 44 px on its short side and every word at least 12 px on screen, the primary pill in the lower third.
 */
async function phoneCard(page: Page, w: number, h: number, name: Screen | 'calibrate') {
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const at = `${w}x${h} ${name}`;
  const card = await page.evaluate(() => window.__chrono!.card);
  expect(card, `${at}: a card is up`).not.toBeNull();

  const buttons = await page.evaluate(() => window.__chrono!.buttons());
  expect(buttons.length, `${at}: buttons`).toBeGreaterThan(0);
  for (const b of buttons) {
    const [x0, y0, x1, y1] = b.rect;
    expect(y1 - y0, `${at}: ${b.id} height`).toBeGreaterThanOrEqual(44);
    expect(x1 - x0, `${at}: ${b.id} width`).toBeGreaterThanOrEqual(44);
    expect(x0 >= 0 && y0 >= 0 && x1 <= w && y1 <= h, `${at}: ${b.id} on screen`).toBe(true);
  }
  const labels = await page.evaluate(() => window.__chrono!.labels());
  expect(labels.length, `${at}: words on the card`).toBeGreaterThan(0);
  for (const l of labels) expect(l.height, `${at}: "${l.text}"`).toBeGreaterThanOrEqual(12);
  expect(card!.width, `${at}: the phone layout`).toBeCloseTo(NARROW_W, 9);

  const boxes = await page.evaluate(() => window.__chrono!.viewBoxes());
  const c = boxes.card!;
  for (const [k, b] of Object.entries(boxes)) {
    expect(b![0] >= 0 && b![1] >= 0 && b![2] <= w && b![3] <= h, `${at}: ${k} on screen ${b!.map((v) => v.toFixed(0))}`).toBe(true);
  }
  for (const k of ['board', 'dial', 'bird'] as const) expect(overlap(boxes[k]!, c), `${at}: the card is clear of the ${k}`).toBe(false);
  for (const sel of ['#title', '#enter-mr', '#enter-note']) expect(overlap(await domBox(page, sel), c), `${at}: card clear of ${sel}`).toBe(false);
  // A bottom sheet: the card's foot is near the bottom edge, so its buttons are under the thumb.
  expect(c[3], `${at}: card along the bottom`).toBeGreaterThan(h - 40);
  // The board (with dial and bird) is not sunk onto the card under an empty sky: it sits midway in the room above the
  // tallest card of its kind (so it holds still from title to HUD to complete), with air above and below.
  const header = Math.max((await domBox(page, '#title'))[3], (await domBox(page, '#xr-entry'))[3]);
  const scene = [boxes.board!, boxes.dial!, boxes.bird!];
  const [above, below] = [Math.min(...scene.map((b) => b[1])) - header, c[1] - Math.max(...scene.map((b) => b[3]))];
  expect(above, `${at}: air over the board`).toBeGreaterThanOrEqual(12);
  expect(below, `${at}: air under the board`).toBeGreaterThanOrEqual(12);
  expect(above, `${at}: board not sunk onto the card (${above.toFixed(0)} px above, ${below.toFixed(0)} below)`).toBeLessThanOrEqual(below + 30);
  const primary = buttons.find((b) => ['start', 'next', 'resume'].includes(b.id));
  if (primary) expect(primary.screen[1], `${at}: primary pill in the lower third`).toBeGreaterThan((2 * h) / 3);
  await page.screenshot({ path: `${OUT}/${w}x${h}-${name}.png` });
  return labels;
}

for (const [w, h] of [[375, 812], [390, 844]] as const) {
  test(`phone ${w}x${h}: every card is a bottom sheet with 44 px buttons and 12 px words; every level tile in two rows and clickable`, async ({ page }) => {
    const errors = await open(page, w, h);
    // The page header's words are 12 px or more too.
    for (const sel of ['#title', '#enter-mr', '#enter-note']) {
      const px = await page.locator(sel).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(px, sel).toBeGreaterThanOrEqual(12);
    }

    await phoneCard(page, w, h, 'title');
    await click(page, 'levels');
    await page.waitForFunction(() => window.__chrono!.flow === 'select');
    await phoneCard(page, w, h, 'select');
    const tiles = (await page.evaluate(() => window.__chrono!.buttons())).filter((b) => b.id.startsWith('level-'));
    expect(tiles.map((t) => t.id)).toEqual(Array.from({ length: 9 }, (_, i) => `level-${i + 1}`));
    expect(new Set(tiles.map((t) => Math.round(t.screen[1]))).size, 'tiles in two rows').toBe(2);

    // Every tile is a working target: each one opens its level, and Pause, Levels comes back.
    for (let i = 1; i <= 9; i++) {
      await click(page, `level-${i}`);
      await page.waitForFunction((k) => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === k, i - 1);
      await click(page, 'pause');
      await page.waitForFunction(() => window.__chrono!.flow === 'paused');
      await click(page, 'levels');
      await page.waitForFunction(() => window.__chrono!.flow === 'select');
    }

    await click(page, 'level-1');
    await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 0);
    const hud = await phoneCard(page, w, h, 'hud');
    expect(hud.map((l) => l.text), 'the goal line is on the HUD').toContain('Turn the marked gear');
    await click(page, 'pause');
    await page.waitForFunction(() => window.__chrono!.flow === 'paused');
    await phoneCard(page, w, h, 'paused');
    await click(page, 'resume');
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');

    const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
    await place(page, gear, axle);
    await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
    await phoneCard(page, w, h, 'calibrate');
    await calibrateByMouse(page);
    await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
    await phoneCard(page, w, h, 'complete');
    await click(page, 'next');
    await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
    expect(errors).toEqual([]);
  });
}

test('desktop 1440x900: the cards are the wide ones, placed and sized as before', async ({ page }) => {
  const errors = await open(page, 1440, 900);
  const back = (() => {
    const v = DESKTOP_EYE.map((e, k) => e - DESKTOP_TARGET[k]!);
    const l = Math.hypot(...v);
    return v.map((x) => x / l) as unknown as Vec3;
  })();
  const check = async (name: Screen) => {
    await page.waitForFunction(() => !window.__chrono!.cameraMoving);
    await frames(page);
    const eye = await page.evaluate(() => window.__chrono!.cameraAt);
    eye.forEach((v, k) => expect(v, 'tuned eye').toBeCloseTo(DESKTOP_EYE[k]!, 4));
    const level = await page.evaluate(() => window.__chrono!.levelIndex);
    const wide = layout(name, { level, levels: LEVELS.length + 1, daily: true });
    const card = await page.evaluate(() => window.__chrono!.card);
    expect(card).toEqual({ screen: name, width: wide.width, height: wide.height });
    // Anchored above the board, face on to the camera, at full size: the corners land where they always have.
    const a = faceView(panelAnchor(LEVELS[level]!, TRAY_POSE), back);
    const want = await page.evaluate(
      (ps) => ps.map((p) => window.__chrono!.toScreen(p)),
      ([[-1, 0], [1, 0], [-1, 1], [1, 1]] as const).map(([sx, k]) => panelToWorld(a, [(sx * wide.width) / 2, k * wide.height, 0])),
    );
    const got = await page.evaluate(() => window.__chrono!.panelCorners());
    got.forEach((p, i) => p.forEach((v, k) => expect(Math.abs(v - want[i]![k]!), `${name} corner ${i}`).toBeLessThan(0.5)));
    // The desktop type scale: buttons 12.5 mm, body 13.5 mm (design/DESIGN.md).
    const labels = await page.evaluate(() => window.__chrono!.labels());
    for (const l of labels.filter((x) => ['Start', 'Resume', 'Restart'].includes(x.text))) expect(l.size, l.text).toBeCloseTo(0.0125, 6);
    for (const l of labels.filter((x) => x.text === 'Turn the marked gear')) expect(l.size, l.text).toBeCloseTo(0.0135, 6);
    await page.screenshot({ path: `${OUT}/1440x900-${name}.png` });
  };
  await check('title');
  await click(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await check('select');
  await click(page, 'level-1');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await check('hud');
  await click(page, 'pause');
  await page.waitForFunction(() => window.__chrono!.flow === 'paused');
  await check('paused');
  expect(errors).toEqual([]);
});
