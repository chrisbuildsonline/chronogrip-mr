import { expect, test, type Page } from './fixtures';
import { newGame } from './start';
import { click, frames } from './play';

test.use({ classic: false });

const OUT = 'test-results/orbit';

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
const view = (page: Page) => page.evaluate(() => window.__chrono!.view);
const drag = async (page: Page, from: [number, number], to: [number, number]) => {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 12 });
  await page.mouse.up();
};
const settle = async (page: Page) => {
  await page.waitForTimeout(900); // damping carries the last drag on for a moment
  await frames(page);
};
const inFrame = (v: Awaited<ReturnType<typeof view>>, w: number, h: number) =>
  v.tray[0] > 0 && v.tray[0] < w && v.tray[1] > 0 && v.tray[1] < h && Number.isFinite(v.tray[0]);

test('c3\'s drags (up 260 px, then left 200 px on the empty bench) never lose the tray or sink the camera into the bench', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  const start = await view(page);
  expect(inFrame(start, 1440, 900)).toBe(true);
  await drag(page, [200, 820], [200, 560]);
  await drag(page, [200, 560], [0, 560]);
  await settle(page);
  const v = await view(page);
  expect(inFrame(v, 1440, 900), `the tray centre is at ${v.tray}`).toBe(true);
  expect(v.camera[1], 'above the bench top').toBeGreaterThan(v.benchY + 0.05);
  expect((await page.evaluate(() => window.__chrono!.ambient!.anchor))[0], 'the ambient parts stay sane').toBeGreaterThan(-5000);
  await page.screenshot({ path: `${OUT}/after-c3-drags.png` });
  // And hard the other way, and every direction at once: the same.
  for (const [a, b] of [[[700, 500], [700, 900]], [[700, 500], [1400, 500]], [[700, 500], [700, 0]], [[700, 500], [0, 900]]] as const) {
    await drag(page, [a[0], a[1]], [b[0], b[1]]);
    await drag(page, [a[0], a[1]], [b[0], b[1]]);
  }
  await settle(page);
  const w = await view(page);
  expect(inFrame(w, 1440, 900), `after many drags the tray centre is at ${w.tray}`).toBe(true);
  expect(w.camera[1]).toBeGreaterThan(w.benchY + 0.05);
  expect(w.distance).toBeGreaterThan(0.3);
  expect(w.distance).toBeLessThan(2.5);
  expect(errors).toEqual([]);
});

test('the wheel only dollies within a range, and the right button does not pan', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  const start = await view(page);
  await page.mouse.move(300, 700);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -400);
  await settle(page);
  const near = await view(page);
  expect(near.distance).toBeGreaterThan(start.distance * 0.5);
  for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 400);
  await settle(page);
  const far = await view(page);
  expect(far.distance).toBeLessThan(start.distance * 2);
  await page.mouse.move(300, 700);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(600, 500, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await settle(page);
  const after = await view(page);
  for (let i = 0; i < 3; i++) expect(after.target[i]!, 'the target stays put (no pan)').toBeCloseTo(start.target[i]!, 6);
  expect(errors).toEqual([]);
});

test('R and a double-click on empty space ease the camera back to the start view', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id));
  const start = await view(page);
  await drag(page, [200, 820], [260, 700]);
  await settle(page);
  const turned = await view(page);
  expect(Math.hypot(turned.camera[0] - start.camera[0], turned.camera[1] - start.camera[1], turned.camera[2] - start.camera[2])).toBeGreaterThan(0.02);
  await page.keyboard.press('r');
  await page.waitForTimeout(1200);
  const back = await view(page);
  for (let i = 0; i < 3; i++) expect(back.camera[i]!).toBeCloseTo(start.camera[i]!, 2);
  await drag(page, [200, 820], [100, 700]);
  await settle(page);
  await page.mouse.dblclick(150, 860);
  await page.waitForTimeout(1200);
  const again = await view(page);
  for (let i = 0; i < 3; i++) expect(again.camera[i]!).toBeCloseTo(start.camera[i]!, 2);
  expect(errors).toEqual([]);
});

test('hover and click still work after orbiting (menu buttons and a gear in play)', async ({ page }) => {
  const errors = await open(page);
  await drag(page, [200, 820], [300, 760]);
  await settle(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'start'));
  const [x, y] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'start')!.screen);
  await page.mouse.move(x, y);
  await page.waitForFunction(() => window.__chrono!.highlighted === 'start');
  await page.mouse.click(x, y);
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'stages');
  const [sx, sy] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'stage-easy')!.screen);
  await page.mouse.click(sx, sy);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await settle(page);
  await drag(page, [200, 820], [260, 780]);
  await settle(page);
  const [px, py] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'pause')!.screen);
  await page.mouse.click(px, py);
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'paused');
  expect(errors).toEqual([]);
});

test('phone 375x812: a touch drag on the bench orbits within the limits and the tray stays in frame', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await newGame(page, async (id) => {
    await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
    const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
    await page.touchscreen.tap(x, y);
  });
  const start = await view(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  for (const [from, to] of [[[60, 700], [60, 480]], [[60, 480], [330, 480]], [[330, 700], [20, 300]]] as const) {
    await touch('touchStart', from[0], from[1]);
    for (let i = 1; i <= 12; i++) await touch('touchMove', from[0] + ((to[0] - from[0]) * i) / 12, from[1] + ((to[1] - from[1]) * i) / 12);
    await touch('touchEnd', 0, 0);
  }
  await settle(page);
  const v = await view(page);
  expect(inFrame(v, 375, 812), `the tray centre is at ${v.tray}`).toBe(true);
  expect(v.camera[1]).toBeGreaterThan(v.benchY + 0.05);
  expect(Math.hypot(v.camera[0] - start.camera[0], v.camera[1] - start.camera[1], v.camera[2] - start.camera[2]), 'the touch drag did orbit').toBeGreaterThan(0.01);
  expect(Math.abs(v.distance - start.distance)).toBeLessThan(start.distance);
  await page.screenshot({ path: `${OUT}/phone-after-drags.png` });
  expect(errors).toEqual([]);
  await ctx.close();
});

const angleBetween = (a: readonly number[], b: readonly number[]) => (Math.acos(Math.min(1, Math.max(-1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180) / Math.PI;

for (const stage of ['easy', 'medium', 'hard'] as const) {
  test(`${stage}: the ambient parts stay locked to the panorama at every corner of the orbit clamp (same direction from the eye, within 0.5 degrees)`, async ({ page }) => {
    const errors = await open(page);
    await newGame(page, (id) => click(page, id), stage);
    await page.waitForFunction((s) => window.__chrono!.ambient?.stage === s, stage);
    const dirs = () => page.evaluate(() => window.__chrono!.ambientDirections());
    // Hold the beat so a part that moves with the music does not read as drift: parts are compared by their anchors (their groups), which never move.
    const fixed = stage === 'medium' ? 3 : 2; // the static anchors: Easy hub + rays, Medium wall gears + pendulum + shaft, Hard's two corner clusters (the gull and the haze drift on purpose)
    const home = (await dirs()).slice(0, fixed);
    expect(home.length).toBe(fixed);
    const corners: [string, [number, number], number][] = [
      ['up-left', [-1, -1], 0],
      ['up-right', [1, -1], -30],
      ['down-left', [-1, 1], 30],
      ['down-right', [1, 1], 0],
    ];
    for (const [name, [sx, sy], wheel] of corners) {
      // far past the clamp, several times, so the camera sits at the corner
      for (let i = 0; i < 3; i++) await drag(page, [720 - sx * 300, 450 - sy * 250], [720 + sx * 300, 450 + sy * 250]);
      for (let i = 0; i < Math.abs(wheel); i++) await page.mouse.wheel(0, wheel < 0 ? -400 : 400);
      await settle(page);
      const v = await view(page);
      const now = (await dirs()).slice(0, fixed);
      now.forEach((d, i) => expect(angleBetween(d, home[i]!), `${stage} part ${i} at the ${name} corner (camera ${v.camera.map((x) => x.toFixed(2))}, ${v.distance.toFixed(2)} m)`).toBeLessThan(0.5));
      // Occlusion: the bench and the tray must win over the parts. A solid part never reaches into the bench slab (top at benchY, back
      // edge z -0.95, x +-1.7) and none comes nearer the eye than the tray.
      const { tray, parts } = await page.evaluate(() => window.__chrono!.ambientBoxes());
      for (const [i, p] of parts.entries()) {
        const intoBench = p.minY < v.benchY && p.maxZ > -0.95 && p.minZ < 0.59;
        expect(intoBench, `${stage} solid part ${i} at the ${name} corner reaches into the bench (y from ${p.minY.toFixed(2)}, z ${p.minZ.toFixed(2)}..${p.maxZ.toFixed(2)})`).toBe(false);
        expect(p.near, `${stage} solid part ${i} at the ${name} corner comes within ${p.near.toFixed(2)} m of the eye (the tray is ${tray.toFixed(2)})`).toBeGreaterThan(tray);
      }
      await page.keyboard.press('r');
      await page.waitForTimeout(900);
    }
    expect(errors).toEqual([]);
  });
}
