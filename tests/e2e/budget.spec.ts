import { expect, test, type Page } from './fixtures';
import { RENDER_BUDGET } from '../../src/budget';
import { CAMPAIGN } from '../../src/random';


async function click(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

/** Two rendered frames, so the counters are those of the level now on the board. */
const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

// The campaign as it ships: every level generated, none of the hand-made ones.
test.use({ classic: false });

test('every campaign level stays inside the render budget while playing', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);

  // Every campaign level, three generated puzzles each (a new one every time a level starts).
  for (let i = 0; i < CAMPAIGN * 3; i++) {
    await page.evaluate((n) => window.__chrono!.jump(n), (i % CAMPAIGN) + 1);
    await page.waitForFunction((n) => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === n, i % CAMPAIGN);
    await frames(page);
    const r = await page.evaluate(() => ({ id: window.__chrono!.levelId, ...window.__chrono!.render, workshop: window.__chrono!.scenery.parts.includes('workbench') }));
    // The workshop backdrop (src/scenery.ts) is up, so its cost is inside the numbers below.
    expect(r.workshop, `${r.id} workshop drawn`).toBe(true);
    expect(r.calls, `${r.id} draw calls`).toBeGreaterThan(0);
    expect(r.calls, `${r.id} draw calls`).toBeLessThanOrEqual(RENDER_BUDGET.calls);
    expect(r.triangles, `${r.id} triangles`).toBeLessThanOrEqual(RENDER_BUDGET.triangles);
  }
  expect(errors).toEqual([]);
});
