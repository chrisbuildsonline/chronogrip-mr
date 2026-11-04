import { expect, test, type Page } from '@playwright/test';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/polish';
/** The @iwsdk/core chunk (about 5.5 MB): the long wait on a first load. */
const SDK_CHUNK = /\/assets\/world-initializer-[^/]*\.js$/;

const flowOf = (page: Page) => page.evaluate(() => window.__chrono?.flow);

test('a loading card shows from first paint until the world is up, then fades out of the way', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(SDK_CHUNK, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });

  // The SDK is still on its way: only the page's own markup and CSS can be showing.
  const card = page.locator('#loading');
  await expect(card).toBeVisible();
  await expect(card).toContainText('ChronoGrip');
  await expect(card).toContainText('Winding the clockwork');
  await expect(page.getByRole('status')).toContainText('Winding the clockwork');
  expect(await page.evaluate(() => window.__chrono)).toBeUndefined();
  await page.waitForTimeout(700); // past the card's rise-in
  await page.screenshot({ path: `${OUT}/0-loading.png` });

  release();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await expect(card).toBeHidden();
  // Nothing is left over the game: the middle of the view is the canvas, and the title card's Start takes a click.
  expect(await page.evaluate(() => document.elementFromPoint(640, 360)?.tagName)).toBe('CANVAS');
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'start'));
  await page.screenshot({ path: `${OUT}/0-title-after-load.png` });
  const [x, y] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'start')!.screen);
  await page.mouse.click(x, y);
  await expect.poll(() => flowOf(page)).toBe('select'); // Start game opens level select
});

test('a file that never arrives shows a readable error on the card, not an endless spinner', async ({ page }) => {
  await page.route(SDK_CHUNK, (route) => route.abort());
  await page.goto('/', { waitUntil: 'commit' });
  const card = page.locator('#loading');
  await expect(card).toHaveClass(/\bfailed\b/);
  await expect(card).toContainText('would not start');
  await expect(card).toContainText('Reload to try again');
  await expect(card).toBeVisible();
});

test('when World.create throws (no WebGL), the card says why', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/i.test(type) ? null : (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof get;
  });
  await page.goto('/', { waitUntil: 'commit' });
  const card = page.locator('#loading');
  await expect(card).toHaveClass(/\bfailed\b/);
  await expect(card).toContainText('would not start');
  await expect(card).toContainText(/WebGL/);
  await expect(card).toContainText('Reload to try again');
  await page.screenshot({ path: `${OUT}/0-loading-failed.png` });
});
