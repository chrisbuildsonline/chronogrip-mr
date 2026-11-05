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
