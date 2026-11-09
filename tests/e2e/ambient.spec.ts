import { expect, test, type Page } from './fixtures';
import { newGame } from './start';
import { click, frames } from './play';

/** The stages as shipped: every level generated fresh. */
test.use({ classic: false });

const OUT = 'test-results/ambient';

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
const ambient = (page: Page) => page.evaluate(() => window.__chrono!.ambient);
const cardIs = (page: Page, s: string) => page.waitForFunction((x) => window.__chrono!.card?.screen === x, s, { timeout: 15_000 });

test('every stage in play has its ambient parts; the menus and the result card have none', async ({ page }) => {
  const errors = await open(page);
  expect(await ambient(page), 'the start screen').toBeNull();
  for (const stage of ['easy', 'medium', 'hard'] as const) {
    await newGame(page, (id) => click(page, id), stage);
    await page.waitForFunction((s) => window.__chrono!.ambient?.stage === s, stage);
    await frames(page);
    const a = (await ambient(page))!;
    expect(a.parts, stage).toBeGreaterThanOrEqual(4);
    expect(a.visible).toBe(true);
    expect(a.bgMul).toBeGreaterThan(0.85);
    expect(a.bgMul).toBeLessThan(1.1);
    await page.screenshot({ path: `${OUT}/${stage}.png` });
    await click(page, 'pause');
    await cardIs(page, 'paused');
    expect((await ambient(page))?.stage, 'a paused level keeps its (frozen) parts').toBe(stage);
    await click(page, 'giveup');
    await cardIs(page, 'result');
    expect(await ambient(page), 'the result card is a menu').toBeNull();
    await click(page, 'menu');
    await cardIs(page, 'title');
    expect(await ambient(page)).toBeNull();
  }
  expect(errors).toEqual([]);
});

test('the parts move with time in play, and stand still while paused and through the resume countdown', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id), 'medium');
  await page.waitForFunction(() => window.__chrono!.ambient !== null);
  const moving = (await ambient(page))!;
  await page.waitForFunction((p) => window.__chrono!.ambient!.pose !== p, moving.pose);
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await frames(page);
  const a = (await ambient(page))!;
  await page.waitForTimeout(1000);
  const b = (await ambient(page))!;
  expect(b.pose, 'positions do not change across a second of pause').toBe(a.pose);
  expect(b.beats).toBe(a.beats);
  expect(b.seconds).toBe(a.seconds);
  await click(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.countdown !== null);
  const c = (await ambient(page))!;
  await page.waitForTimeout(500);
  expect((await ambient(page))!.pose, 'frozen through the countdown too').toBe(c.pose);
  expect(c.beats).toBeCloseTo(a.beats, 6);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.countdown === null);
  await page.waitForFunction((p) => window.__chrono!.ambient!.pose !== p, c.pose);
  expect(errors).toEqual([]);
});

test('reduced motion leaves the parts at rest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page);
  await newGame(page, (id) => click(page, id), 'easy');
  await page.waitForFunction(() => window.__chrono!.ambient !== null);
  const a = (await ambient(page))!;
  await page.waitForTimeout(1500);
  const b = (await ambient(page))!;
  expect(b.seconds).toBeGreaterThan(a.seconds); // the clocks run, the parts do not
  expect(b.pose).toBe(a.pose);
  expect(b.bgMul).toBe(1);
  expect(errors).toEqual([]);
});

test('phone 375x812: the parts are there, trimmed, and the page is clean', async ({ page }) => {
  const errors = await open(page, { width: 375, height: 812 });
  await newGame(page, (id) => click(page, id), 'hard');
  await page.waitForFunction(() => window.__chrono!.ambient?.stage === 'hard');
  await frames(page);
  const hard = (await ambient(page))!;
  expect(hard.parts, "no haze puffs on a phone").toBe(3);
  await page.screenshot({ path: `${OUT}/phone-hard.png` });
  expect(errors).toEqual([]);
});

test('desktop 1920x1080: Easy, Medium and Hard each show their parts (screenshots for a look by eye)', async ({ page }) => {
  const errors = await open(page, { width: 1920, height: 1080 });
  for (const stage of ['easy', 'medium', 'hard'] as const) {
    await newGame(page, (id) => click(page, id), stage);
    await page.waitForFunction((s) => window.__chrono!.ambient?.stage === s, stage);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/1920-${stage}.png` });
    await click(page, 'pause');
    await cardIs(page, 'paused');
    await click(page, 'giveup');
    await cardIs(page, 'result');
    await click(page, 'menu');
    await cardIs(page, 'title');
  }
  expect(errors).toEqual([]);
});

test('Hard: turning the view 320 px never swings an ambient part in front of the tray or the HUD card', async ({ page }) => {
  const errors = await open(page);
  await newGame(page, (id) => click(page, id), 'hard');
  await page.waitForFunction(() => window.__chrono!.ambient?.stage === 'hard');
  // The cluster used to float 1.5 m out between the eye and the bench (world z -0.56): a turn put a big dark gear over the tray and
  // the card. Every part must stay past the bench's back edge and farther from the eye than the tray, in the turned view too, so the
  // tray and the card are always drawn in front of it, as of the painted backdrop.
  const check = async (label: string) => {
    const { tray, parts } = await page.evaluate(() => window.__chrono!.ambientBoxes());
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) {
      expect(p.maxZ, `${label}: a part reaches z ${p.maxZ.toFixed(2)}, past the bench's back edge is -0.95`).toBeLessThan(-0.95);
      expect(p.near, `${label}: a part comes within ${p.near.toFixed(2)} m of the eye, the tray is ${tray.toFixed(2)} m`).toBeGreaterThan(tray);
    }
  };
  await check('default view');
  await page.mouse.move(300, 820);
  await page.mouse.down();
  await page.mouse.move(-20, 820, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  await frames(page);
  await page.screenshot({ path: `${OUT}/hard-turned.png` });
  await check('turned 320 px left');
  expect(errors).toEqual([]);
});

/** Crops of the Easy clock hub (second hand on, and the bare backdrop) for a look by eye: test-results/hub/<name>.png and <name>-bare.png. */
test.describe('the Easy second hand on the clock hub', () => {
  const HUB_OUT = 'test-results/hub';
  const SIZE = 280;

  async function crops(page: Page, name: string, w: number, h: number) {
    await page.addStyleTag({ content: '#xr-entry, #progress, #title { visibility: hidden !important }' }); // the header sits over the hub at 1440
    await page.waitForTimeout(700);
    const a = (await page.evaluate(() => window.__chrono!.ambient))!;
    const [ax, ay] = a.anchor;
    const onScreen = ax > 0 && ax < w && ay > 0 && ay < h;
    if (!onScreen) return { name, anchor: a.anchor, shot: false };
    const clip = { x: Math.max(0, Math.min(w - SIZE, ax - SIZE / 2)), y: Math.max(0, Math.min(h - SIZE, ay - SIZE / 2)), width: SIZE, height: SIZE };
    await page.screenshot({ path: `${HUB_OUT}/${name}.png`, clip });
    await page.evaluate(() => window.__chrono!.setAmbientVisible(false));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${HUB_OUT}/${name}-bare.png`, clip });
    await page.evaluate(() => window.__chrono!.setAmbientVisible(true));
    return { name, anchor: a.anchor, shot: true };
  }

  test.use({ classic: false });
  test('hub crops: the default view, the four orbit clamp corners, zoom 0.8x and 1.45x, 1920x1080 and a phone', async ({ page }) => {
    const errors = await open(page);
    await newGame(page, (id) => click(page, id), 'easy');
    await page.waitForFunction(() => window.__chrono!.ambient?.stage === 'easy');
    const made: Awaited<ReturnType<typeof crops>>[] = [];
    const drag = async (from: [number, number], to: [number, number]) => {
      await page.mouse.move(...from);
      await page.mouse.down();
      await page.mouse.move(...to, { steps: 12 });
      await page.mouse.up();
    };
    const settle = async () => {
      await page.waitForTimeout(900);
      await frames(page);
    };
    made.push(await crops(page, 'default-1440', 1440, 900));
    for (const [name, sx, sy] of [['corner-up-left', -1, -1], ['corner-up-right', 1, -1], ['corner-down-left', -1, 1], ['corner-down-right', 1, 1]] as const) {
      for (let i = 0; i < 3; i++) await drag([720 - sx * 300, 450 - sy * 250], [720 + sx * 300, 450 + sy * 250]);
      await settle();
      made.push(await crops(page, name, 1440, 900));
      await page.keyboard.press('r');
      await page.waitForTimeout(900);
    }
    for (const [name, dir] of [['zoom-0.8x', -1], ['zoom-1.45x', 1]] as const) {
      await page.mouse.move(300, 700);
      for (let i = 0; i < 40; i++) await page.mouse.wheel(0, dir * 400);
      await settle();
      made.push(await crops(page, name, 1440, 900));
      await page.keyboard.press('r');
      await page.waitForTimeout(900);
    }
    console.log('HUB crops: ' + JSON.stringify(made));
    // the hub is on screen at the default view, and the hand is on it
    expect(made[0]!.shot).toBe(true);
    expect(errors).toEqual([]);
  });

  for (const [w, h] of [[1920, 1080], [375, 812]] as const) {
    test(`hub crop at ${w}x${h}`, async ({ page }) => {
      const errors = await open(page, { width: w, height: h });
      await newGame(page, (id) => click(page, id), 'easy');
      await page.waitForFunction(() => window.__chrono!.ambient?.stage === 'easy');
      const c = await crops(page, `default-${w}x${h}`, w, h);
      console.log('HUB crops: ' + JSON.stringify([c]));
      if (w > 500) expect(c.shot).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
