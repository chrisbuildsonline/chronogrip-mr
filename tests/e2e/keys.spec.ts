import { expect, test, type Page } from '@playwright/test';

const flowOf = (page: Page) => page.evaluate(() => window.__chrono!.flow);
const hasButton = (page: Page, id: string) => page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);

test('desktop: the canvas is labelled, Enter is the card primary, Esc pauses and resumes, held keys never repeat', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);

  // A screen reader hears what the canvas is.
  const canvas = page.locator('#app canvas');
  await expect(canvas).toHaveAttribute('role', 'img');
  await expect(page.getByRole('img', { name: /ChronoGrip.*clockwork puzzle/i })).toBeVisible();

  await hasButton(page, 'start');
  // A key held down (auto-repeat) presses nothing.
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true })));
  await page.waitForTimeout(200);
  expect(await flowOf(page)).toBe('title');
  // Esc on the title has nothing to pause.
  await page.keyboard.press('Escape');
  expect(await flowOf(page)).toBe('title');

  // Enter on the title is Start.
  await page.keyboard.press('Enter');
  await expect.poll(() => flowOf(page)).toBe('playing');
  // Esc pauses, Esc again resumes, Enter on the pause card is Resume.
  await page.keyboard.press('Escape');
  await expect.poll(() => flowOf(page)).toBe('paused');
  await page.keyboard.press('Escape');
  await expect.poll(() => flowOf(page)).toBe('playing');
  await page.keyboard.press('Escape');
  await expect.poll(() => flowOf(page)).toBe('paused');
  await hasButton(page, 'resume');
  await page.keyboard.press('Enter');
  await expect.poll(() => flowOf(page)).toBe('playing');

  // Pause, open Levels from the pause card, then Esc on level select goes back to the title.
  await page.keyboard.press('Escape');
  await hasButton(page, 'levels');
  const [x, y] = await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'levels')!.screen);
  await page.mouse.click(x, y);
  await expect.poll(() => flowOf(page)).toBe('select');
  await page.keyboard.press('Escape');
  await expect.poll(() => flowOf(page)).toBe('title');

  expect(errors).toEqual([]);
});
