import { expect, test, type Page } from './fixtures';
import { choose } from './start';
import { LEVELS } from '../../src/levels';
import { calibrateByMouse } from './calibrate';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/f20';

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
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

const label = (page: Page, id: string) => page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)?.label, id);

const frames = (page: Page, n = 4) =>
  page.evaluate((k) => new Promise((done) => {
    const next = (i: number) => (i <= 0 ? done(null) : requestAnimationFrame(() => next(i - 1)));
    next(k);
  }), n);

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

/** Page pixel position of the goal badge's centre and of the target gear's. */
const badgeOnScreen = (page: Page) =>
  page.evaluate(() => {
    const g = window.__chrono!.goal!;
    return { badge: window.__chrono!.toScreen(g.at), gear: window.__chrono!.toScreen(g.gear) };
  });

/**
 * Cream (the badge face) and amber (its matched face) pixels in a crop of the view round the badge, decoded in the page.
 * Neither colour is in the walnut, the steel pins or the brass gears: cream is bright and nearly grey-free warm white,
 * amber is a saturated orange-yellow brighter than any brass in shadow.
 */
async function badgePixels(page: Page, at: [number, number], path: string) {
  const clip = { x: Math.round(at[0] - 70), y: Math.round(at[1] - 40), width: 140, height: 80 };
  const png = (await page.screenshot({ path, clip })).toString('base64');
  return page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const g = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
    g.drawImage(bitmap, 0, 0);
    const px = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let cream = 0;
    let amber = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [r, gr, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
      const max = Math.max(r, gr, b);
      const min = Math.min(r, gr, b);
      if (min > 205 && max - min < 40 && r >= b) cream++;
      if (max === r && max > 185 && max - min > 0.55 * max) {
        const hue = (60 * (gr - b)) / (max - min);
        if (hue > 28 && hue < 48) amber++;
      }
    }
    return { cream, amber };
  }, png);
}

test('desktop: the target gear carries a goal badge that turns amber once the train matches it', async ({ page }) => {
  const errors = await open(page);
  await choose(page, (id) => click(page, id), 2);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === 'l2');
  expect(await page.evaluate(() => {
    const g = window.__chrono!.goal!;
    return { dir: g.dir, rpm: g.rpm, matched: g.matched, text: g.text };
  })).toEqual({ dir: 'cw', rpm: 60, matched: false, text: 'Turn the marked gear ↻ 60 rpm' });

  await frames(page);
  await page.screenshot({ path: `${OUT}/badge-level2.png` });
  const { badge, gear } = await badgeOnScreen(page);
  // Beside the target gear, not across the board.
  expect(Math.hypot(badge[0] - gear[0], badge[1] - gear[1])).toBeLessThan(110);
  const before = await badgePixels(page, badge, `${OUT}/badge-level2-crop.png`);
  expect(before.cream, 'cream badge face').toBeGreaterThan(500);

  for (const [g, a] of Object.entries(LEVELS[1]!.solution)) await place(page, g, a);
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate');
  expect(await page.evaluate(() => window.__chrono!.goal!.matched)).toBe(true);
  await frames(page);
  await page.waitForTimeout(1300); // the solve flash (1.2 s) is amber too: let it fade before counting
  await page.screenshot({ path: `${OUT}/badge-level2-matched.png` });
  const after = await badgePixels(page, (await badgeOnScreen(page)).badge, `${OUT}/badge-level2-matched-crop.png`);
  expect(after.amber, 'amber matched face').toBeGreaterThan(500);
  expect(after.amber).toBeGreaterThan(3 * before.amber);
  expect(after.cream).toBeLessThan(before.cream / 2);
  expect(errors).toEqual([]);
});

const NEXT: Record<string, string> = { l6: 'l7', l7: 'l8', l8: 'l9' };

for (const [i, level] of LEVELS.entries()) {
  if (i < 5) continue;
  test(`desktop: level ${i + 1} (${level.name}) solves through to its complete card, and Next goes on`, async ({ page }) => {
    const errors = await open(page);
    await choose(page, () => Promise.resolve(), i + 1);
    expect(await page.evaluate(() => window.__chrono!.levelId)).toBe(level.id);
    const goal = await page.evaluate(() => window.__chrono!.goal!);
    expect(goal.dir).toBe(level.target.rpm > 0 ? 'ccw' : 'cw');
    expect(goal.rpm).toBe(Math.abs(level.target.rpm));
    expect(goal.matched).toBe(false);
    await frames(page);
    await page.screenshot({ path: `${OUT}/${level.id}-play.png` });
    const { badge } = await badgeOnScreen(page);
    expect((await badgePixels(page, badge, `${OUT}/${level.id}-badge.png`)).cream).toBeGreaterThan(500);

    for (const [g, a] of Object.entries(level.solution)) await place(page, g, a);
    await calibrateByMouse(page);
    await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
    expect(await page.evaluate(() => window.__chrono!.goal!.matched)).toBe(true);
    expect(await label(page, 'next')).toBe('Next');
    await frames(page);
    await page.screenshot({ path: `${OUT}/${level.id}-complete.png` });

    await click(page, 'next');
    await page.waitForFunction((id) => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === id, NEXT[level.id]!);
    expect(await page.evaluate(() => window.__chrono!.levelIndex)).toBe(i + 1);
    expect(errors).toEqual([]);
  });
}
