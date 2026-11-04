import type { Page } from '@playwright/test';
import { calibrateByMouse } from './calibrate';

export const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/** A real mouse click on a shown panel button's screen position. */
export async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

async function place(page: Page, gear: string, axle: string) {
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
  const from = await page.evaluate((g) => window.__chrono!.toScreen(window.__chrono!.gears[g]!), gear);
  const to = await page.evaluate((a) => window.__chrono!.toScreen(window.__chrono!.axles[a]!), axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.waitForFunction((g) => window.__chrono!.held === g, gear);
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(([g, a]) => window.__chrono!.placements[g!] === a, [gear, axle]);
}

/** Solves the level on the board by dragging (the test hook knows the answer), calibrates, and waits for the complete card's Next. */
export async function solve(page: Page) {
  const solution = await page.evaluate(() => window.__chrono!.solution);
  for (const [gear, axle] of Object.entries(solution)) await place(page, gear, axle);
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'), undefined, { timeout: 15_000 });
  await frames(page);
}
