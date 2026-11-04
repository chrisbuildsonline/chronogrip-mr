import { expect, test } from './fixtures';

/** Phone: the Best times card is centred over the dark layer, so opening it and going back never moves the camera. */
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
  // The menu is centred over the dark layer, so the board's own view is not fitted for it.
  const card = (await page.evaluate(() => window.__chrono!.viewBoxes().card))!;
  expect(Math.abs((card[0] + card[2]) / 2 - 187.5), 'the board card is centred').toBeLessThanOrEqual(2);
  await click('back');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'title');
  expect((await view()).cam).toEqual(title.cam);
});
