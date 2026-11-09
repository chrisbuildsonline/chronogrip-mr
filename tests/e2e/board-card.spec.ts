import { expect, test, type Page } from './fixtures';

/** The High scores card: one centred axis, a fixed-height table, no jump between Local and Global. Screenshots land in OUT. */
const OUT = 'test-results/board-card';
const KEY = 'chronogrip.scores.v1';
const URL = '**/rest/v1/chronogrip_scores**';
const row = (name: string, ms: number, cleared?: number, date = '2026-11-01') => ({ name, ms, date, posted: true, ...(cleared ? { cleared } : {}) });
const MIXED = [row('ZED', 600_000), row('AMY', 700_000), row('BOB', 90_000, 12), row('CAT', 120_000, 7), row('DAN', 80_000, 7), row('EVE', 50_000, 1)];
const SIZES = [
  ['1440x900', { width: 1440, height: 900 }],
  ['1280x720', { width: 1280, height: 720 }],
  ['phone', { width: 375, height: 812 }],
] as const;

async function open(page: Page, size: { width: number; height: number }, rows: unknown[] = MIXED) {
  await page.setViewportSize(size);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(([k, v]) => !localStorage.getItem(k!) && localStorage.setItem(k!, v!), [KEY, JSON.stringify({ version: 1, initials: 'ZED', boards: { 'campaign-easy': rows } })] as const);
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await click(page, 'scores');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'board');
  return errors;
}
async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}
const unveiled = (page: Page) => page.waitForFunction(() => !document.getElementById('loading') || getComputedStyle(document.getElementById('loading')!).opacity === '0' || getComputedStyle(document.getElementById('loading')!).visibility === 'hidden');
const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const words = (page: Page) => page.evaluate(() => window.__chrono!.labels().map((l) => l.text));
async function settle(page: Page) {
  await unveiled(page);
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  await frames(page);
}
/** The card's height in page px and the horizontal centre of its title, the stage tab row, the Local/Global switch and Back. */
async function geometry(page: Page) {
  await settle(page);
  return page.evaluate(() => {
    const c = window.__chrono!;
    const corners = c.panelCorners();
    const ys = corners.map((p) => p[1]);
    const xs = corners.map((p) => p[0]);
    const mid = (a: number, b: number) => (a + b) / 2;
    const rects = (ids: string[]) => c.buttons().filter((b) => ids.includes(b.id)).map((b) => b.rect);
    const span = (r: number[][]) => mid(Math.min(...r.map((x) => x[0]!)), Math.max(...r.map((x) => x[2]!)));
    const title = c.labels().find((l) => l.text === 'HIGH SCORES')!;
    return {
      height: Math.max(...ys) - Math.min(...ys),
      panel: mid(Math.min(...xs), Math.max(...xs)),
      title: mid(title.left, title.right),
      stages: span(rects(['tab-easy', 'tab-medium', 'tab-hard'])),
      switch: span(rects(['tab-local', 'tab-global'])),
      back: span(rects(['back'])),
      heights: ['tab-easy', 'tab-local'].map((id) => { const r = c.buttons().find((b) => b.id === id)!.rect; return r[3] - r[1]; }),
    };
  });
}
const aligned = (g: Awaited<ReturnType<typeof geometry>>) => {
  for (const k of ['title', 'stages', 'switch', 'back'] as const) expect(Math.abs(g[k] - g.panel), `${k} is on the card's centre axis`).toBeLessThanOrEqual(4);
};

for (const [name, size] of SIZES) {
  test(`${name}: one centred axis, the same card height on Local and Global, empty and full; rows with levels`, async ({ page }) => {
    await page.route(URL, (r) => r.fulfill({ json: [] }));
    const errors = await open(page, size);
    const local = await geometry(page);
    aligned(local);
    expect(Math.abs(local.heights[0]! - local.heights[1]!), 'both pill rows are the same height').toBeLessThanOrEqual(2);
    const w = await words(page);
    expect(w).toEqual(expect.arrayContaining(["20/20", "L8", "L13", "L2", "HIGH SCORES"]));
    // ranked: 20/20 first, then L13, then L8 (fast before slow), then L2
    const rank = await page.evaluate(() => window.__chrono!.labels().filter((l) => /^(ZED|AMY|BOB|CAT|DAN|EVE)$/.test(l.text)).sort((a, b) => a.y - b.y).map((l) => l.text));
    expect(rank).toEqual(['ZED', 'AMY', 'BOB', 'DAN', 'CAT', 'EVE']);
    await page.screenshot({ path: `${OUT}/local-rows-${name}.png` });

    await click(page, 'tab-global');
    await page.waitForFunction(() => window.__chrono!.labels().some((l) => /No global runs yet/.test(l.text)));
    const empty = await geometry(page);
    aligned(empty);
    expect(Math.abs(empty.height - local.height), 'no jump between Local and Global').toBeLessThanOrEqual(1);
    const msg = await page.evaluate(() => window.__chrono!.labels().find((l) => /No global runs yet/.test(l.text))!);
    expect(Math.abs((msg.left + msg.right) / 2 - empty.panel), 'the empty line is centred').toBeLessThanOrEqual(4);
    await page.screenshot({ path: `${OUT}/global-empty-${name}.png` });

    // an empty local board is the same height again
    await click(page, 'tab-medium');
    await click(page, 'tab-local');
    await page.waitForFunction(() => window.__chrono!.labels().some((l) => /No finished runs/.test(l.text)));
    expect(Math.abs((await geometry(page)).height - local.height)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test('global loading and offline lines sit in the table area, and the card keeps its height', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(URL, async (r) => {
    if (r.request().method() === 'POST') return r.fulfill({ status: 201, body: '' });
    await gate;
    return r.fulfill({ status: 500, body: '{}' });
  });
  const errors = await open(page, { width: 1440, height: 900 });
  const local = await geometry(page);
  await click(page, 'tab-global');
  await page.waitForFunction(() => window.__chrono!.labels().some((l) => /^Loading/.test(l.text)));
  const loading = await geometry(page);
  expect(Math.abs(loading.height - local.height)).toBeLessThanOrEqual(1);
  aligned(loading);
  await page.screenshot({ path: `${OUT}/global-loading-1440x900.png` });
  release();
  await page.waitForFunction(() => window.__chrono!.labels().some((l) => /offline/.test(l.text)));
  const off = await geometry(page);
  expect(Math.abs(off.height - local.height)).toBeLessThanOrEqual(1);
  expect(await words(page)).toEqual(expect.arrayContaining(['ZED', '20/20']));
  await page.screenshot({ path: `${OUT}/global-offline-1440x900.png` });
  // the browser logs the stubbed 500 itself; that is the offline state under test, not an app error
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('global rows show partial runs by level next to a finished one', async ({ page }) => {
  await page.route(URL, (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ status: 201, body: '' })
      : r.fulfill({ json: [
          { initials: 'WIN', seconds: 500.5, step: 20, created_at: '2026-11-02T10:00:00Z' },
          { initials: 'PAR', seconds: 90, step: 7, created_at: '2026-11-03T10:00:00Z' },
        ] }),
  );
  const errors = await open(page, { width: 375, height: 812 });
  await click(page, 'tab-global');
  await page.waitForFunction(() => window.__chrono!.labels().some((l) => l.text === 'WIN'));
  expect(await words(page)).toEqual(expect.arrayContaining(['WIN', '20/20', 'PAR', 'L8', '1:30.0']));
  aligned(await geometry(page));
  await page.screenshot({ path: `${OUT}/global-rows-phone.png` });
  expect(errors).toEqual([]);
});
