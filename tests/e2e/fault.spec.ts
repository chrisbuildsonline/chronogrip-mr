import { expect, test, type Page } from './fixtures';
import { choose } from './start';
import { C } from '../../src/palette';
import { FAULT_WORDS } from '../../src/fault';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/f24';

async function open(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
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
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

async function playLevel(page: Page, n: number, id: string) {
  await choose(page, (id) => click(page, id), n);
  await page.waitForFunction((l) => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === l && !window.__chrono!.cameraMoving, id);
}

const frames = (page: Page, n = 4) =>
  page.evaluate((k) => new Promise((done) => {
    const next = (i: number) => (i <= 0 ? done(null) : requestAnimationFrame(() => next(i - 1)));
    next(k);
  }), n);

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

/** Drags a gear by the mouse from where it lies to a page point; resolves once the drop has settled. */
async function drag(page: Page, gear: string, to: [number, number]) {
  const from = await screen(page, 'gears', gear);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__chrono!.held === null);
}

async function place(page: Page, gear: string, axle: string) {
  await drag(page, gear, await screen(page, 'axles', axle));
  await page.waitForFunction(([g, a]) => window.__chrono!.placements[g!] === a, [gear, axle]);
}

const cue = (page: Page) => page.evaluate(() => window.__chrono!.cue);
const goal = (page: Page) => page.evaluate(() => window.__chrono!.goal!);

/** Warm red pixels (the jam red, never the brass, walnut or amber) in a crop of the view round a page point. */
const redPixels = (page: Page, at: [number, number], half: number, path: string) =>
  redIn(page, { x: Math.max(0, Math.round(at[0] - half)), y: Math.max(0, Math.round(at[1] - half)), width: 2 * half, height: 2 * half }, path);

async function redIn(page: Page, clip: { x: number; y: number; width: number; height: number }, path: string) {
  const png = (await page.screenshot({ path, clip })).toString('base64');
  return page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const g = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
    g.drawImage(bitmap, 0, 0);
    const px = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let red = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [r, gr, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
      const max = Math.max(r, gr, b);
      const min = Math.min(r, gr, b);
      if (max !== r || r < 110 || max - min < 0.5 * max) continue;
      const hue = (60 * (gr - b)) / (max - min);
      if (hue < 18) red++;
    }
    return red;
  }, png);
}

/** Red pixels on the whole HUD card. */
const hudRed = async (page: Page, path: string) => {
  const c = await page.evaluate(() => window.__chrono!.panelCorners());
  const [x0, y0] = [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1]))];
  const [x1, y1] = [Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))];
  return redIn(page, { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1 - x0), height: Math.ceil(y1 - y0) }, path);
};

test('desktop: a gear that jams the train shakes, tints the locked gears red and says so on the HUD; taking it off clears it all', async ({ page }) => {
  const errors = await open(page);
  // Level 4, the jam trap: a 20 on `tr` meshes both the driver and its neighbour, an odd loop of three.
  await playLevel(page, 4, 'l4');
  expect(await cue(page)).toMatchObject({ jammed: [], wrongWay: false, shakes: 0 });
  const home = await screen(page, 'gears', 't2');
  await frames(page);
  const gearAt = await screen(page, 'axles', 'a1'); // the fixed gear `e`
  const before = await redPixels(page, gearAt, 60, `${OUT}/jam-before-crop.png`);
  const hudBefore = await hudRed(page, `${OUT}/jam-hud-before.png`);

  await place(page, 't2', 'tr');
  await page.waitForFunction(() => window.__chrono!.cue.jammed.length > 0);
  const jam = await cue(page);
  expect(jam.jammed).toEqual(['drv', 'e', 't2']);
  expect(jam.wrongWay).toBe(false);
  // One shake for the placement that jammed it, and then the gears hold still.
  expect(jam.shakes).toBe(1);
  await page.waitForFunction(() => !window.__chrono!.cue.shaking);
  // Each locked gear is tinted, and the tint does not leak onto any other gear.
  const tint = (await cue(page)).tint;
  for (const id of ['drv', 'e', 't2']) expect(tint[id], id).toBeGreaterThan(0.5);
  for (const id of ['tgt', 't1', 't3']) expect(tint[id], id).toBe(0);
  expect((await goal(page)).text).toBe(FAULT_WORDS.jammed.join(' '));

  await frames(page);
  await page.screenshot({ path: `${OUT}/jam-1440.png` });
  const after = await redPixels(page, gearAt, 60, `${OUT}/jam-after-crop.png`);
  expect(after, 'red on the jammed gear').toBeGreaterThan(Math.max(200, 5 * before));
  expect(await hudRed(page, `${OUT}/jam-hud-after.png`), 'red words on the HUD').toBeGreaterThan(hudBefore + 40);

  // The same state on a phone.
  await page.setViewportSize({ width: 375, height: 812 });
  await frames(page, 6);
  await page.screenshot({ path: `${OUT}/jam-375.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await frames(page, 6);

  // Taking the gear off clears it at once: no jam, no tint anywhere, the goal back on the HUD.
  await drag(page, 't2', home);
  await page.waitForFunction(() => !('t2' in window.__chrono!.placements));
  const clear = await cue(page);
  expect(clear.jammed).toEqual([]);
  expect(Object.values(clear.tint).every((t) => t === 0)).toBe(true);
  expect((await goal(page)).text).toBe('Turn the marked gear ↻ 60 rpm');
  await frames(page);
  expect(await redPixels(page, gearAt, 60, `${OUT}/jam-cleared-crop.png`)).toBeLessThan(Math.max(40, 2 * before));
  expect(errors).toEqual([]);
});

test('desktop: a train that turns the target the wrong way turns the badge arrow and ring red and says so; fixing it clears it', async ({ page }) => {
  const errors = await open(page);
  // Level 2: the big idler on `mid` turns the target at the right speed, the wrong way.
  await playLevel(page, 2, 'l2');
  const home = await screen(page, 'gears', 'big');
  expect((await goal(page)).ring).toBe(C.amber);
  await frames(page);
  const badgeAt = await page.evaluate(() => window.__chrono!.toScreen(window.__chrono!.goal!.at));
  const before = await redPixels(page, badgeAt, 60, `${OUT}/wrong-before-crop.png`);
  const hudBefore = await hudRed(page, `${OUT}/wrong-hud-before.png`);

  await place(page, 'big', 'mid');
  await page.waitForFunction(() => window.__chrono!.cue.wrongWay);
  expect((await cue(page)).jammed).toEqual([]);
  const g = await goal(page);
  expect(g.matched).toBe(false);
  expect(g.ring).toBe(C.jam);
  expect(g.text).toBe(FAULT_WORDS.wrongWay.join(' '));
  // No gear is tinted: nothing is jammed.
  expect(Object.values((await cue(page)).tint).every((t) => t === 0)).toBe(true);

  await frames(page);
  await page.screenshot({ path: `${OUT}/wrong-way-1440.png` });
  const after = await redPixels(page, badgeAt, 60, `${OUT}/wrong-after-crop.png`);
  expect(after, 'red arrow and ring at the badge').toBeGreaterThan(before + 40);
  expect(await hudRed(page, `${OUT}/wrong-hud-after.png`), 'red words on the HUD').toBeGreaterThan(hudBefore + 40);

  await page.setViewportSize({ width: 375, height: 812 });
  await frames(page, 6);
  await page.screenshot({ path: `${OUT}/wrong-way-375.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await frames(page, 6);

  // Take the shortcut off: the cue clears and the goal is back.
  await drag(page, 'big', home);
  await page.waitForFunction(() => !('big' in window.__chrono!.placements));
  expect((await cue(page)).wrongWay).toBe(false);
  expect((await goal(page)).ring).toBe(C.amber);
  expect((await goal(page)).text).toBe('Turn the marked gear ↻ 60 rpm');

  // Then the two idlers: matched, the badge goes amber.
  await place(page, 'i1', 'a1');
  await place(page, 'i2', 'a2');
  await page.waitForFunction(() => window.__chrono!.goal!.matched);
  expect((await cue(page)).wrongWay).toBe(false);
  expect(errors).toEqual([]);
});
