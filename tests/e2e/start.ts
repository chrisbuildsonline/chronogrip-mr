import type { Page } from '@playwright/test';

const settle = async (page: Page) => {
  // The camera eases between views; a drag started mid-ease would miss its gear.
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
};

/**
 * From the start panel into the level it shows: Continue (when there is progress) or New Game plays straight into a level,
 * no list. `press` clicks (desktop) or pokes (XR) a panel button by id.
 */
export async function begin(page: Page, press: (id: string) => Promise<unknown>) {
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'start'));
  const id = await page.evaluate(() => (window.__chrono!.buttons().some((b) => b.id === 'continue') ? 'continue' : 'start'));
  await press(id);
  await page.waitForFunction(() => window.__chrono!.flow !== 'title');
  await settle(page);
}

/** `begin` with the mouse: for a spec that opens the page and wants a level on the board to drag at. */
export const beginByMouse = (page: Page) =>
  begin(page, async (id) => {
    await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
    const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
    await page.mouse.click(x, y);
  });

/** Plays campaign level `n` (1-based) at once, through the test hook (there is no level list in the game). With the classic flag, 1-8 are the hand-made levels. */
export async function choose(page: Page, _press: (id: string) => Promise<unknown>, n: number) {
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await page.evaluate((k) => window.__chrono!.jump(k), n);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await settle(page);
}
