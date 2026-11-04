import type { Page } from '@playwright/test';

const settle = async (page: Page) => {
  // The camera eases between views; a drag started mid-ease would miss its gear.
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
};

/**
 * From the start panel into the level it shows: Continue (when there is progress) or New Game plays straight into a level,
 * no list: the level on the board behind the panel. `press` clicks (desktop) or pokes (XR) a panel button by id.
 */
export async function begin(page: Page, press: (id: string) => Promise<unknown>) {
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'start'));
  const id = await page.evaluate(() => (window.__chrono!.buttons().some((b) => b.id === 'continue') ? 'continue' : 'start'));
  await press(id);
  await page.waitForFunction(() => window.__chrono!.flow !== 'title');
  await settle(page);
}

/** From the start panel to the level list: into a level, Pause, Choose level. */
export async function toSelect(page: Page, press: (id: string) => Promise<unknown>) {
  await begin(page, press);
  await press('pause');
  await page.waitForFunction(() => window.__chrono!.flow === 'paused');
  await press('levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await settle(page);
}

/** From the start panel into level `n` (1-based) by the level list on the pause card. */
export async function choose(page: Page, press: (id: string) => Promise<unknown>, n: number) {
  await toSelect(page, press);
  await press(`level-${n}`);
  await page.waitForFunction(() => window.__chrono!.flow !== 'select');
  await settle(page);
}
