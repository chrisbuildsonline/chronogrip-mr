import { expect, test, type Page } from './fixtures';
import { newGame } from './start';


/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/menus';
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 },
] as const;

async function open(page: Page, size: { width: number; height: number }) {
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

const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
async function cardIs(page: Page, screen: string) {
  await page.waitForFunction((s) => window.__chrono!.card?.screen === s, screen);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
}
async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}
const scrim = (page: Page) => page.evaluate(() => window.__chrono!.scrim);
const rects = (page: Page) => page.evaluate(() => window.__chrono!.buttons().map((b) => ({ id: b.id, rect: b.rect })));
const centreX = (r: readonly number[]) => (r[0]! + r[2]!) / 2;
const centreY = (r: readonly number[]) => (r[1]! + r[3]!) / 2;

/** The card is the middle of the screen, and every button lies wholly on it. */
async function centred(page: Page, size: { width: number; height: number }, at: string) {
  const card = await page.evaluate(() => window.__chrono!.viewBoxes().card);
  expect(card, `${at} card`).not.toBeNull();
  expect(centreX(card!), `${at} card centred across`).toBeCloseTo(size.width / 2, -1);
  expect(Math.abs(centreY(card!) - size.height / 2), `${at} card centred down`).toBeLessThanOrEqual(6);
  expect(card![0], `${at} card on screen`).toBeGreaterThanOrEqual(0);
  expect(card![2], `${at} card on screen`).toBeLessThanOrEqual(size.width);
  expect(card![1], `${at} card on screen`).toBeGreaterThanOrEqual(0);
  expect(card![3], `${at} card on screen`).toBeLessThanOrEqual(size.height);
  for (const b of await rects(page)) {
    expect(b.rect[0], `${at} ${b.id}`).toBeGreaterThanOrEqual(card![0] - 1);
    expect(b.rect[2], `${at} ${b.id}`).toBeLessThanOrEqual(card![2] + 1);
    expect(b.rect[1], `${at} ${b.id}`).toBeGreaterThanOrEqual(card![1] - 1);
    expect(b.rect[3], `${at} ${b.id}`).toBeLessThanOrEqual(card![3] + 1);
  }
}

/** The ids stand in one column: one x centre (to a pixel), the y centres climbing down the screen in the order given. */
async function column(page: Page, ids: string[], at: string) {
  const all = await rects(page);
  const rs = ids.map((id) => all.find((b) => b.id === id)!);
  for (const r of rs) expect(r, `${at} has a button`).toBeDefined();
  for (const r of rs) expect(Math.abs(centreX(r.rect) - centreX(rs[0]!.rect)), `${at} ${r.id} shares the x centre`).toBeLessThanOrEqual(1);
  rs.forEach((r, i) => i && expect(centreY(r.rect), `${at} ${r.id} below ${rs[i - 1]!.id}`).toBeGreaterThan(centreY(rs[i - 1]!.rect)));
}

async function dark(page: Page, at: string) {
  const s = await scrim(page);
  expect(s.mode, `${at} full-view layer`).toBe('full');
  expect(s.opacity, `${at} opacity`).toBeCloseTo(0.9, 2);
}

for (const size of SIZES) {
  test(`${size.name}: the start, options and high scores menus are centred, stacked, on a 90% black layer`, async ({ page }) => {
    const errors = await open(page, size);
    await cardIs(page, 'title');
    await dark(page, 'title');
    await column(page, ['start', 'random', 'options', 'scores'], 'title');
    await centred(page, size, 'title');
    await page.screenshot({ path: `${OUT}/title-${size.name}.png` });

    await click(page, 'options');
    await cardIs(page, 'options');
    await dark(page, 'options');
    await column(page, ['relaxed', 'sound', 'music', 'reset', 'back'], 'options');
    await centred(page, size, 'options');
    await page.screenshot({ path: `${OUT}/options-${size.name}.png` });
    await click(page, 'back');
    await cardIs(page, 'title');
    await dark(page, 'title again');

    await click(page, 'scores');
    await cardIs(page, 'board');
    await dark(page, 'board');
    // The Local / Global control on top, then the rows and Back: all about the card's middle.
    const all = await rects(page);
    const by = (id: string) => all.find((b) => b.id === id)!.rect;
    const card = (await page.evaluate(() => window.__chrono!.viewBoxes().card))!;
    expect((centreX(by('tab-local')) + centreX(by('tab-global'))) / 2, 'the control is centred').toBeCloseTo(centreX(card), -1);
    expect(centreX(by('tab-local'))).toBeLessThan(centreX(by('tab-global')));
    expect(centreY(by('tab-local')), 'the control is on top').toBeLessThan(centreY(by('back')));
    expect((centreX(by('tab-easy')) + centreX(by('tab-hard'))) / 2, 'the stage tabs are centred').toBeCloseTo(centreX(card), -1);
    expect(centreY(by('tab-easy')), 'the stage tabs are over the control').toBeLessThan(centreY(by('tab-local')));
    await column(page, ['back'], 'board');
    expect(Math.abs(centreX(by('back')) - centreX(card))).toBeLessThanOrEqual(1);
    await centred(page, size, 'board');
    await page.screenshot({ path: `${OUT}/scores-${size.name}.png` });
    await click(page, 'back');
    await cardIs(page, 'title');
    expect(errors).toEqual([]);
  });

  test(`${size.name}: the Random level picker is a centred column on the dark layer, and the layer goes when a level starts and comes back with the menu`, async ({ page }) => {
    const errors = await open(page, size);
    await cardIs(page, 'title');
    await click(page, 'random');
    await cardIs(page, 'picker');
    await dark(page, 'picker');
    await column(page, ['easy', 'medium', 'hard', 'expert', 'back'], 'picker');
    await centred(page, size, 'picker');
    // Every button is reachable: wholly on screen and at least 44 px each way; the words are 12 px or more.
    for (const b of await rects(page)) {
      expect(b.rect[2] - b.rect[0], `${b.id} wide`).toBeGreaterThanOrEqual(44);
      expect(b.rect[3] - b.rect[1], `${b.id} tall`).toBeGreaterThanOrEqual(44);
    }
    for (const l of await page.evaluate(() => window.__chrono!.labels())) expect(l.height, `"${l.text}" is 12 px or more`).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: `${OUT}/picker-${size.name}.png` });
    await click(page, 'back');
    await cardIs(page, 'title');

    // New Game opens the stage picker: a menu on the layer, one centred column; a stage plays at once.
    await click(page, 'start');
    await cardIs(page, 'stages');
    await dark(page, 'stages');
    {
      // Three cards side by side (stacked on a phone), Back under them, all about the card's middle.
      const all = await rects(page);
      const cardsAt = ['stage-easy', 'stage-medium', 'stage-hard'].map((id) => all.find((b) => b.id === id)!.rect);
      if (size.width > size.height) cardsAt.forEach((r, i) => i && expect(centreX(r), `card ${i} right of card ${i - 1}`).toBeGreaterThan(centreX(cardsAt[i - 1]!)));
      else cardsAt.forEach((r, i) => i && expect(centreY(r), `card ${i} below card ${i - 1}`).toBeGreaterThan(centreY(cardsAt[i - 1]!)));
      expect(centreY(all.find((b) => b.id === 'back')!.rect), 'Back is under the cards').toBeGreaterThan(Math.max(...cardsAt.map(centreY)));
    }
    await centred(page, size, 'stages');
    await page.screenshot({ path: `${OUT}/stages-${size.name}.png` });
    await click(page, 'back');
    await cardIs(page, 'title');

    // New Game plays at once: the layer is gone; Pause is a menu on the layer; Main menu brings the title, and the layer, back.
    await newGame(page, (id) => click(page, id));
    await page.waitForFunction(() => window.__chrono!.flow === 'playing');
    await page.waitForFunction(() => !window.__chrono!.cameraMoving);
    expect((await scrim(page)).mode, 'no layer in play').toBeNull();
    await click(page, 'pause');
    await cardIs(page, 'paused');
    expect((await scrim(page)).mode, 'the pause card is a menu: on the dark layer').toBe('full');
    await click(page, 'menu');
    await cardIs(page, 'title');
    await dark(page, 'title again');
    expect(errors).toEqual([]);
  });
}
