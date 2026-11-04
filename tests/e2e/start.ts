import type { Page } from '@playwright/test';

/**
 * From the start panel into the level it shows: Start game / Continue opens level select, then the tile of the level on the
 * board behind the panel (the one Continue plays). `press` clicks (desktop) or pokes (XR) a panel button by id.
 */
export async function begin(page: Page, press: (id: string) => Promise<unknown>) {
  const tile = await page.evaluate(() => `level-${window.__chrono!.levelIndex + 1}`);
  await press('start');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await press(tile);
  // The camera eases from level select to the level's view; a drag started mid-ease would miss its gear.
  await page.waitForFunction(() => window.__chrono!.flow !== 'select');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
}
