import { expect, test, type Page } from './fixtures';
import { click } from './play';

/** Generated levels, as shipped. */
test.use({ classic: false });

const OUT = 'test-results/cards';

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

const cardIs = (page: Page, s: string) => page.waitForFunction((x) => window.__chrono!.card?.screen === x, s, { timeout: 15_000 });
const settle = (page: Page) => page.waitForFunction(() => !window.__chrono!.cameraMoving);
const cards = (page: Page) => page.evaluate(() => window.__chrono!.stageCards);
const screenOf = (page: Page, id: string) => page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);

async function openPicker(page: Page) {
  await click(page, 'start');
  await cardIs(page, 'stages');
  await settle(page);
  await page.waitForFunction(() => window.__chrono!.stageCards.visible);
}

test('desktop: the picker is three cards, none highlighted when it opens; hovering one lights only it, and leaving clears it', async ({ page }) => {
  const errors = await open(page);
  await openPicker(page);
  const c = await cards(page);
  expect(c.cards.map((x) => [x.id, x.hint])).toEqual([['stage-easy', 'A gentle climb'], ['stage-medium', 'Starts where Easy ends'], ['stage-hard', 'For clockmakers']]);
  expect(c.cards.every((x) => !x.hover && x.mix < 0.01)).toBe(true);
  expect(await page.evaluate(() => window.__chrono!.highlighted)).toBeNull();
  const ys = await page.evaluate(() => window.__chrono!.buttons().filter((b) => b.id.startsWith('stage-')).map((b) => [b.screen[0], b.screen[1]]));
  expect(new Set(ys.map((p) => Math.round(p![1]!))).size, 'side by side').toBe(1);
  ys.forEach((p, i) => i && expect(p![0]).toBeGreaterThan(ys[i - 1]![0]!));
  await page.screenshot({ path: `${OUT}/picker-1440.png` });

  const [mx, my] = await screenOf(page, 'stage-medium');
  await page.mouse.move(mx, my);
  await page.waitForFunction(() => window.__chrono!.highlighted === 'stage-medium');
  await page.waitForFunction(() => window.__chrono!.stageCards.cards[1]!.mix > 0.9);
  const lit = await cards(page);
  expect(lit.cards.map((x) => x.hover)).toEqual([false, true, false]);
  expect(lit.cards[1]!.brightness, 'the hovered art is brighter').toBeGreaterThan(lit.cards[0]!.brightness);
  expect(lit.cards[0]!.brightness, 'the others dim a little').toBeLessThan(0.9);
  expect(lit.cards[1]!.lift, 'it lifts 4 mm on top of its float of at most 3').toBeGreaterThan(0.004 * 0.9 - 0.003 - 1e-6);
  await page.screenshot({ path: `${OUT}/picker-hover-1440.png` });
  await page.mouse.move(20, 880);
  await page.waitForFunction(() => window.__chrono!.highlighted === null && window.__chrono!.stageCards.cards.every((x) => !x.hover));
  await page.waitForFunction(() => window.__chrono!.stageCards.cards.every((x) => x.mix < 0.05));
  expect(errors).toEqual([]);
});

test('desktop: clicking HARD starts "Hard · Level 1" on the movement backdrop', async ({ page }) => {
  const errors = await open(page);
  await openPicker(page);
  await click(page, 'stage-hard');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Hard · Level 1');
  await page.waitForFunction(() => window.__chrono!.scenery.backdrop === 'c3', undefined, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('no menu opens with a row selected: the main menu, options, high scores and the pause card show no highlight until hovered', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.highlighted)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.kbdFocus)).toBeNull();
  for (const id of ['options', 'scores', 'random']) {
    await click(page, id);
    await page.waitForFunction(() => window.__chrono!.card?.screen !== 'title');
    await settle(page);
    await page.mouse.move(5, 880);
    expect(await page.evaluate(() => window.__chrono!.highlighted), id).toBeNull();
    await click(page, 'back');
    await cardIs(page, 'title');
  }
  // Hovering a row lights it, and only it.
  const [x, y] = await screenOf(page, 'options');
  await page.mouse.move(x, y);
  await page.waitForFunction(() => window.__chrono!.highlighted === 'options');
  await page.mouse.move(5, 880);
  await page.waitForFunction(() => window.__chrono!.highlighted === null);
  // The pause card too.
  await click(page, 'start');
  await click(page, 'stage-easy');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await click(page, 'pause');
  await cardIs(page, 'paused');
  await page.mouse.move(5, 880);
  expect(await page.evaluate(() => window.__chrono!.highlighted)).toBeNull();
  expect(errors).toEqual([]);
});

test('keyboard: the first arrow starts at the top row, arrows walk, Enter activates, Esc goes back', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.highlighted)).toBeNull();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__chrono!.card!.screen), 'Enter alone selects nothing').toBe('title');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__chrono!.highlighted === 'start');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__chrono!.highlighted === 'random');
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => window.__chrono!.highlighted === 'start');
  await page.keyboard.press('Enter');
  await cardIs(page, 'stages');
  expect(await page.evaluate(() => window.__chrono!.highlighted), 'a new card starts with nothing selected').toBeNull();
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__chrono!.highlighted === 'stage-easy');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__chrono!.highlighted === 'stage-medium');
  await page.waitForFunction(() => window.__chrono!.stageCards.cards[1]!.hover);
  await page.keyboard.press('Escape');
  await cardIs(page, 'title');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => window.__chrono!.highlighted === 'start');
  await page.keyboard.press('Enter');
  await cardIs(page, 'stages');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__chrono!.highlighted === 'stage-hard');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  expect(await page.evaluate(() => window.__chrono!.hudLabel)).toBe('Hard · Level 1');
  expect(errors).toEqual([]);
});

test('phone 375x812: the cards stack, all three on screen, 44 px or more, none overlapping', async ({ page }) => {
  const errors = await open(page, { width: 375, height: 812 });
  await openPicker(page);
  const b = await page.evaluate(() => window.__chrono!.buttons());
  const stages = b.filter((x) => x.id.startsWith('stage-'));
  expect(stages).toHaveLength(3);
  for (const x of b) {
    expect(x.rect[0], x.id).toBeGreaterThanOrEqual(0);
    expect(x.rect[2], x.id).toBeLessThanOrEqual(375);
    expect(x.rect[1], x.id).toBeGreaterThanOrEqual(0);
    expect(x.rect[3], x.id).toBeLessThanOrEqual(812);
    expect(x.rect[3] - x.rect[1], `${x.id} 44 px tall`).toBeGreaterThanOrEqual(44);
  }
  stages.forEach((x, i) => i && expect(x.rect[1], 'stacked, top to bottom').toBeGreaterThanOrEqual(stages[i - 1]!.rect[3] - 1));
  expect(new Set(stages.map((x) => Math.round(x.screen[0]))).size, 'one column').toBe(1);
  await page.screenshot({ path: `${OUT}/picker-375.png` });
  expect(errors).toEqual([]);
});

test('motion: the cards float and the art pans; with reduced motion they stand still', async ({ page }) => {
  const errors = await open(page);
  await openPicker(page);
  const sample = async () => {
    const out: { lift: number[]; off: number[] }[] = [];
    for (let k = 0; k < 8; k++) {
      const c = await cards(page);
      out.push({ lift: c.cards.map((x) => x.lift), off: c.cards.map((x) => x.offset[0]) });
      await page.waitForTimeout(350);
    }
    return out;
  };
  expect((await cards(page)).reduced).toBe(false);
  // A slow software-GL frame can stall the loop for a while: wait until the cards are really moving before sampling.
  const first = (await cards(page)).cards[0]!.lift;
  await page.waitForFunction((v) => window.__chrono!.stageCards.cards[0]!.lift !== v, first, { timeout: 20_000 });
  const moving = await sample();
  for (let i = 0; i < 3; i++) {
    const lifts = moving.map((s) => s.lift[i]!);
    expect(Math.max(...lifts) - Math.min(...lifts), `card ${i} floats`).toBeGreaterThan(0.0008);
    expect(Math.max(...lifts) - Math.min(...lifts), 'a few millimetres at most').toBeLessThan(0.0075);
    const offs = moving.map((s) => s.off[i]!);
    expect(Math.max(...offs) - Math.min(...offs), `card ${i} art pans`).toBeGreaterThan(0.0005);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__chrono!.stageCards.reduced);
  await page.waitForTimeout(400);
  const still = await sample();
  for (let i = 0; i < 3; i++) {
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(still.map((s) => s.lift[i]!)), `card ${i} stands still`).toBeLessThan(1e-9);
    expect(spread(still.map((s) => s.off[i]!)), `card ${i} art stands still`).toBeLessThan(1e-9);
  }
  expect(errors).toEqual([]);
});
