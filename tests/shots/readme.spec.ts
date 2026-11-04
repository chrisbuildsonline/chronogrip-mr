import { test, type Page } from '@playwright/test';
import { GHOST_PERIOD_S } from '../../src/ghost';
import { LEVELS } from '../../src/levels';
import { calibrateByMouse } from '../e2e/calibrate';

// The README screenshots, at full resolution (?shots keeps the pixel ratio up on software GL). Run with `bun run screenshots`.
const OUT = 'docs';
/** The tray, its card and the bird, with a margin of the dark room round them (CSS px of the 1280 x 720 view). */
const CLIP = { x: 305, y: 0, width: 700, height: 700 };

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const screen = (page: Page, kind: 'gears' | 'axles', id: string) =>
  page.evaluate(([k, i]) => window.__chrono!.toScreen(window.__chrono![k as 'gears' | 'axles'][i!]!), [kind, id] as const);

async function place(page: Page, gear: string, axle: string) {
  const from = await screen(page, 'gears', gear);
  const to = await screen(page, 'axles', axle);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
}

type Held = { releaseFrames?: () => void };

/**
 * A screenshot of the moment `when` holds (`now` is the frame's start time, as the game reads it). A software-GL screenshot
 * takes seconds, longer than the ring pulse or a wing beat, so the page's animation frames are held for the shot. The game
 * moves things in scene.onBeforeRender, which three runs after it updates the world matrices, so a pose set in one frame is
 * drawn in the next: the hold starts one frame after the one where `when` first holds.
 */
async function shotWhen(page: Page, name: string, when: string) {
  await page.evaluate((src) => new Promise<void>((done) => {
    const holds = new Function('now', `return (${src});`) as (now: number) => boolean;
    const raf = window.requestAnimationFrame.bind(window);
    const queued: FrameRequestCallback[] = [];
    let held = false;
    let armed = false;
    window.requestAnimationFrame = (cb) => raf((t) => {
      if (held) return void queued.push(cb);
      const now = performance.now();
      cb(t);
      if (armed || !holds(now)) return;
      armed = true;
      // Queued after the game's next frame request, so it runs once that frame is drawn.
      raf(() => ((held = true), done()));
    });
    (window as Held).releaseFrames = () => {
      window.requestAnimationFrame = raf;
      for (const cb of queued.splice(0)) raf(cb);
    };
  }), when);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: CLIP });
  await page.evaluate(() => (window as Held).releaseFrames!());
}

test('README screenshots: title, a gear in hand mid-puzzle, level complete', async ({ page }) => {
  await page.goto('/?shots');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  // The loading card has faded out of the way.
  await page.locator('#loading').waitFor({ state: 'hidden' });
  // The page heading and Enter MR note sit in the corners, outside the crop; hidden so no clipped text shows at its edge.
  await page.addStyleTag({ content: '#title, #xr-entry { visibility: hidden !important; }' });

  // Title: the card over the tray, the level 1 ghost hand partway through its carry (ghost.ts loops on performance.now).
  await shotWhen(page, 'title', `(now / 1000 / ${GHOST_PERIOD_S}) % 1 > 0.36 && (now / 1000 / ${GHOST_PERIOD_S}) % 1 < 0.44`);

  // Mid-puzzle on level 2: one gear placed, the next carried by the mouse towards its axle, the axles it fits pulsing amber.
  await click(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'select');
  await click(page, 'level-2');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1);
  const [[firstGear, firstAxle], [gear, axle]] = Object.entries(LEVELS[1]!.solution) as [string, string][];
  await place(page, firstGear!, firstAxle!);
  await page.waitForFunction((g) => window.__chrono!.placements[g!] !== undefined, firstGear);
  const from = await screen(page, 'gears', gear!);
  const to = await screen(page, 'axles', axle!);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  const at = 0.65; // most of the way: the gear reads as lifted and in hand, and does not cover the rings
  await page.mouse.move(from[0] + (to[0] - from[0]) * at, from[1] + (to[1] - from[1]) * at, { steps: 10 });
  await page.waitForFunction(() => window.__chrono!.validAxles.length > 0);
  // The rings at the top of their pulse (main.ts: sin(now / 160)).
  await shotWhen(page, 'puzzle', 'Math.sin(now / 160) > 0.85');

  // Complete: drop it on its axle, calibrate, then catch the bird with its wings up over the complete card.
  await page.mouse.move(to[0], to[1], { steps: 4 });
  await page.mouse.up();
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'next'));
  await shotWhen(page, 'complete', 'window.__chrono.tickPhase % 1 < 0.05');
});
