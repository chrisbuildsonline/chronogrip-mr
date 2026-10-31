import { expect, test, type Page } from '@playwright/test';
import { RENDER_BUDGET } from '../../src/budget';

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

/** Two rendered frames, so the counters are those of the level now on the board. */
const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

test('every level and the daily stay inside the render budget while playing', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);

  for (let i = 0; i < 6; i++) {
    await click(page, 'levels');
    await page.waitForFunction(() => window.__chrono!.flow === 'select');
    await click(page, `level-${i + 1}`);
    await page.waitForFunction((n) => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === n, i);
    await frames(page);
    const r = await page.evaluate(() => ({ id: window.__chrono!.levelId, ...window.__chrono!.render }));
    expect(r.calls, `${r.id} draw calls`).toBeGreaterThan(0);
    expect(r.calls, `${r.id} draw calls`).toBeLessThanOrEqual(RENDER_BUDGET.calls);
    expect(r.triangles, `${r.id} triangles`).toBeLessThanOrEqual(RENDER_BUDGET.triangles);
    // Pause, then Levels, takes the next pass to level select.
    await click(page, 'pause');
    await page.waitForFunction(() => window.__chrono!.flow === 'paused');
  }
  expect(errors).toEqual([]);
});
