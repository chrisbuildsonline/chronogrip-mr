import { expect, test, type Page } from './fixtures';
import { calibrateByMouse } from './calibrate';

const OUT = 'test-results/global';
const URL = '**/rest/v1/chronogrip_scores**';
const row = (initials: string, seconds: number, step = 20, created_at = '2026-11-03T09:00:00Z') => ({ initials, seconds, step, created_at });
const GOOD = [row('AAB', 8.5), row('BOB', 12.3), row('CAT', 61.5)];

async function open(page: Page, size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
  const errors: string[] = [];
  page.on('console', (m) => {
    // Chromium itself logs a failed load (the stubbed 500) as an error; the game's own code must add none.
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  return errors;
}

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const words = (page: Page) => page.evaluate(() => window.__chrono!.labels().map((l) => l.text));

/** The named line's box meets no other word's box on the card. */
async function noOverlap(page: Page, text: string) {
  const labels = await page.evaluate(() => window.__chrono!.labels());
  const note = labels.find((l) => l.text === text)!;
  expect(note, text).toBeTruthy();
  for (const o of labels) {
    if (o === note) continue;
    const apart = o.right <= note.left || o.left >= note.right || Math.abs(o.y - note.y) >= (o.height + note.height) / 2;
    expect(apart, `"${text}" clear of "${o.text}"`).toBe(true);
  }
}

/** Both tab labels are at least as big as Back's, and the segments are pills. */
async function tabsReadable(page: Page) {
  const labels = await page.evaluate(() => window.__chrono!.labels());
  for (const w of ['LOCAL', 'GLOBAL']) expect(labels.find((l) => l.text === w)!.height, w).toBeGreaterThanOrEqual(11);
  for (const b of (await page.evaluate(() => window.__chrono!.buttons())).filter((b) => b.id.startsWith('tab-'))) expect(b.rect[2] - b.rect[0], b.id).toBeGreaterThan(b.rect[3] - b.rect[1]);
}

async function openGlobal(page: Page) {
  await click(page, 'scores');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'board');
  await click(page, 'tab-global');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
}

test('the GLOBAL tab shows the rows the backend sends', async ({ page }) => {
  await page.route(URL, (r) => r.fulfill({ json: GOOD }));
  const errors = await open(page);
  await openGlobal(page);
  await expect.poll(() => words(page)).toEqual(expect.arrayContaining(['LOCAL', 'GLOBAL', 'AAB', 'BOB', 'CAT', '0:08.5', '0:12.3', '1:01.5', '3 Nov']));
  await tabsReadable(page);
  await page.screenshot({ path: `${OUT}/desktop-global.png` });
  await page.setViewportSize({ width: 375, height: 812 });
  await frames(page);
  await expect.poll(() => words(page)).toEqual(expect.arrayContaining(['GLOBAL', 'AAB']));
  await page.screenshot({ path: `${OUT}/phone-global.png` });
  expect(errors).toEqual([]);
});

test('the LOCAL tab goes back to this device', async ({ page }) => {
  await page.route(URL, (r) => r.fulfill({ json: GOOD }));
  await open(page);
  await openGlobal(page);
  await click(page, 'tab-local');
  await frames(page);
  const w = await words(page);
  expect(w).not.toContain('BOB');
  expect(w.some((t) => t.startsWith('No finished runs'))).toBe(true);
});

test('a completed run is posted with its total time and step 20, and appears on the GLOBAL board', async ({ page }) => {
  const posts: Record<string, unknown>[] = [];
  const rows = [...GOOD];
  await page.route(URL, async (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON() as { initials: string; seconds: number };
      posts.push(body);
      rows.push(row(body.initials, body.seconds));
      rows.sort((a, b) => a.seconds - b.seconds);
      return r.fulfill({ status: 201, body: '' });
    }
    return r.fulfill({ json: rows });
  });
  await page.addInitScript(([k, v]) => {
    if (!localStorage.getItem(k!)) localStorage.setItem(k!, v!);
  }, ['chronogrip.run.v1', JSON.stringify({ stage: 'medium', cleared: 19, ms: 400_000 })] as const);
  const errors = await open(page);
  await click(page, 'continue');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 19);
  const solution = await page.evaluate(() => window.__chrono!.solution);
  for (const [gear, axle] of Object.entries(solution)) {
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
  await calibrateByMouse(page);
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'cleared');
  expect(await page.evaluate(() => window.__chrono!.initials), 'no initials after a level').toBeNull();
  await click(page, 'next'); // Continue
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'initials');
  await click(page, 'save');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ level: 'campaign-medium', initials: 'AAA', seconds: expect.any(Number), step: 20 });
  expect(Object.keys(posts[0]!).sort()).toEqual(['initials', 'level', 'seconds', 'step']);
  expect((posts[0] as { seconds: number }).seconds).toBeGreaterThan(400);
  // A fresh load opens on the title; the new row is on the GLOBAL board.
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await openGlobal(page);
  await expect.poll(() => words(page)).toEqual(expect.arrayContaining(['AAA', 'AAB']));
  await page.screenshot({ path: `${OUT}/desktop-posted.png` });
  expect(errors).toEqual([]);
});

test('a backend failure shows the local rows and one quiet line', async ({ page }) => {
  await page.route(URL, (r) => r.fulfill({ status: 500, body: '{"message":"boom"}' }));
  const errors = await open(page);
  await page.evaluate(() =>
    localStorage.setItem('chronogrip.scores.v1', JSON.stringify({ version: 1, initials: 'ZZZ', boards: { 'campaign-easy': [{ name: 'ZED', ms: 509000, date: '2026-11-01' }] } })),
  );
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await openGlobal(page);
  await expect.poll(() => words(page)).toEqual(expect.arrayContaining(['ZED', '8:29.0', 'Global scores offline · your runs']));
  expect(await words(page)).not.toContain('Loading global scores');
  await noOverlap(page, 'Global scores offline · your runs');
  await page.screenshot({ path: `${OUT}/desktop-offline.png` });
  await page.setViewportSize({ width: 375, height: 812 });
  await frames(page);
  await noOverlap(page, 'Global scores offline · your runs');
  await page.screenshot({ path: `${OUT}/phone-offline.png` });
  expect(errors).toEqual([]);
});
