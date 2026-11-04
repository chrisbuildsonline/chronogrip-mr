import { expect, test, type Page } from './fixtures';
import { begin, beginByMouse } from './start';
import { GHOST_TWIST_S } from '../../src/ghost';
import { LEVELS } from '../../src/levels';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/hints';

type Box = readonly [x0: number, y0: number, x1: number, y1: number];

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

/** Every rendered frame over one full twist loop: the ghost hand's box (null while faded out) and the dial face's box. */
const sampleTwist = (page: Page) =>
  page.evaluate((ms) => new Promise<{ ghost: Box | null; face: Box | null }[]>((done) => {
    const out: { ghost: Box | null; face: Box | null }[] = [];
    const end = performance.now() + ms;
    const next = () => {
      out.push({ ghost: window.__chrono!.ghostBox(), face: window.__chrono!.dialFaceBox() });
      if (performance.now() < end) requestAnimationFrame(next);
      else done(out);
    };
    requestAnimationFrame(next);
  }), GHOST_TWIST_S * 1000 + 200);

const overlap = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

for (const [w, h] of [[1440, 900], [1280, 720], [375, 812]] as const) {
  test(`desktop ${w}x${h}: the calibrate ghost hand twists beside the dial, never over its face`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = await open(page);
    await beginByMouse(page); // the menus cover the board: into level 1 first
    const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
    await place(page, gear, axle);
    await page.waitForFunction(() => window.__chrono!.flow === 'calibrate' && window.__chrono!.ghostTwist && !window.__chrono!.cameraMoving);

    const samples = await sampleTwist(page);
    const shown = samples.filter((s) => s.ghost && s.face);
    expect(shown.length, 'the ghost hand shows during the loop').toBeGreaterThan(3);
    const over = shown.filter((s) => overlap(s.ghost!, s.face!)).map((s) => `ghost ${s.ghost!.map((v) => v.toFixed(0))} over face ${s.face!.map((v) => v.toFixed(0))}`);
    expect(over, 'the ghost hand stays clear of the dial face all loop').toEqual([]);
    await page.waitForFunction((period) => ((performance.now() / 1000) % period) / period > 0.55 && ((performance.now() / 1000) % period) / period < 0.7, GHOST_TWIST_S);
    await page.screenshot({ path: `${OUT}/${w}x${h}-calibrate.png` });
    const [x, y] = await page.evaluate(() => window.__chrono!.toScreen(window.__chrono!.regulatorAt));
    await page.screenshot({ path: `${OUT}/${w}x${h}-calibrate-dial.png`, clip: { x: Math.max(0, x - 120), y: Math.max(0, y - 120), width: Math.min(300, w - Math.max(0, x - 120)), height: 240 } });
    expect(errors).toEqual([]);
  });
}

test('desktop: the "Drag to look around" note fades after the first drag and stays gone', async ({ page }) => {
  const errors = await open(page);
  const look = page.locator('#enter-note .cg-more');
  const opacity = () => look.evaluate((el) => Number(getComputedStyle(el).opacity));
  await expect(look).toBeVisible();
  expect(await opacity()).toBeGreaterThan(0);

  // A drag on the dark room in the bottom left corner orbits the camera.
  const eye = await page.evaluate(() => window.__chrono!.cameraAt);
  await page.mouse.move(80, 650);
  await page.mouse.down();
  await page.mouse.move(180, 640, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__chrono!.cameraAt)).not.toEqual(eye);
  await expect.poll(opacity, { timeout: 3000 }).toBe(0);
  await page.screenshot({ path: `${OUT}/note-faded.png`, clip: { x: 980, y: 0, width: 300, height: 130 } });

  // It does not come back on later steps of the flow.
  await begin(page, async (id) => {
    await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
    const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
    await page.mouse.click(x, y);
  });
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  const [gear, axle] = Object.entries(LEVELS[0]!.solution)[0]!;
  await place(page, gear, axle);
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
  expect(await opacity()).toBe(0);
  expect(errors).toEqual([]);
});
