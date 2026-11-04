import { expect, test } from '@playwright/test';

/** Phone: the Best times sheet lies over the foot of the board, so opening it and going back never moves the camera. */
test('phone 375 x 812: the board keeps its view when Best times opens and closes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  const click = async (id: string) => {
    await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
    const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
    await page.mouse.click(x, y);
  };
  const view = async () => {
    await page.waitForFunction(() => !window.__chrono!.cameraMoving);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    return page.evaluate(() => ({ cam: window.__chrono!.cameraAt, board: window.__chrono!.viewBoxes().board! }));
  };
  const title = await view();
  await click('scores');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'board');
  const board = await view();
  expect(board.cam).toEqual(title.cam);
  // The sheet does not cover the board: the board's foot is above the sheet's top edge.
  const card = (await page.evaluate(() => window.__chrono!.viewBoxes().card))!;
  expect(board.board[3]).toBeLessThanOrEqual(card[1] + 2);
  await click('back');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'title');
  expect((await view()).cam).toEqual(title.cam);
});
