import { expect, test, type Page } from './fixtures';
import { choose } from './start';

import { RENDER_BUDGET } from '../../src/budget';
import { LEVELS } from '../../src/levels';

/** Screenshots land here for a look by eye (gitignored). */
const OUT = 'test-results/scenery';

/** The least mean luminance a gear may render at: polished brass measures 55 to 90, near-black brown about 25. */
const BRASS_FLOOR = 40;

const FACES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];

const frames = (page: Page, n = 3) =>
  page.evaluate((k) => new Promise((done) => {
    const next = (i: number) => (i <= 0 ? done(null) : requestAnimationFrame(() => next(i - 1)));
    next(k);
  }), n);

async function open(page: Page, w: number, h: number, requests: string[] = []) {
  page.on('request', (r) => requests.push(r.url()));
  await page.setViewportSize({ width: w, height: h });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await frames(page);
  return errors;
}

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

/** The scenery hook says: the bench is up under a texture background (the cubemap), no props, no fog. */
async function expectBackdrop(page: Page, id = 'c2') {
  await page.waitForFunction((b) => window.__chrono!.scenery.backdrop === b, id);
  const s = await page.evaluate(() => window.__chrono!.scenery);
  expect(s.mode).toBe('inline');
  expect([...s.parts].sort()).toEqual(expect.arrayContaining(['tray-stand', 'workbench']));
  expect(s.parts.length).toBeLessThanOrEqual(3);
  expect(s.background).toBe(true);
  expect(s.cube).toBe(true);
  expect(s.environment).toBe('stage');
  expect(s.fog).toBe(false);
  expect(s.tris).toBeLessThanOrEqual(1000);
}

test('desktop 1440x900: the attic cubemap behind the tray, title and a level in play', async ({ page }) => {
  const requests: string[] = [];
  const errors = await open(page, 1440, 900, requests);
  await expectBackdrop(page);
  for (const f of FACES) expect(requests.some((u) => u.endsWith(`/backdrops/c2_cube/${f}`)), f).toBe(true);
  expect(requests.some((u) => u.includes('_cube_1024') || u.includes('_pano'))).toBe(false);
  await page.screenshot({ path: `${OUT}/desktop-title.png` });
  await choose(page, () => Promise.resolve(), 2);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page, 6);
  await expectBackdrop(page);
  await page.screenshot({ path: `${OUT}/desktop-playing.png` });
  expect(errors).toEqual([]);
});

test('phone 375x812: the 1024 attic cubemap backs the tray without crowding the card', async ({ page }) => {
  const requests: string[] = [];
  const errors = await open(page, 375, 812, requests);
  await expectBackdrop(page);
  for (const f of FACES) expect(requests.some((u) => u.endsWith(`/backdrops/c2_cube_1024/${f}`)), f).toBe(true);
  expect(requests.some((u) => /\/c2_cube\//.test(u))).toBe(false);
  expect(requests.some((u) => /textures\/tray_albedo_1024\.jpg$/.test(u))).toBe(true);
  expect(requests.some((u) => /textures\/tray_albedo_2048\.jpg$/.test(u))).toBe(false);
  await page.screenshot({ path: `${OUT}/phone-title.png` });
  await choose(page, () => Promise.resolve(), 2);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await frames(page, 6);
  await expectBackdrop(page);
  await page.screenshot({ path: `${OUT}/phone-playing.png` });
  expect(errors).toEqual([]);
});

test('the tray is walnut PBR: albedo, normal and roughness maps, anisotropic filtering, a light clearcoat', async ({ page }) => {
  const errors = await open(page, 1440, 900);
  const w = await page.evaluate(() => window.__chrono!.trayWood);
  expect(w.physical).toBe(true);
  expect(w.map && w.normalMap && w.roughnessMap).toBe(true);
  expect(w.anisotropy).toBeGreaterThan(1);
  expect(w.normalScale).toBeLessThanOrEqual(0.4);
  expect(w.clearcoat).toBeLessThanOrEqual(0.2);
  expect(errors).toEqual([]);
});

test('the metals are polished brass lit by the stage environment', async ({ page }) => {
  const errors = await open(page, 1440, 900);
  await expectBackdrop(page);
  const m = await page.evaluate(() => window.__chrono!.metals);
  expect(m.metalness).toBeGreaterThanOrEqual(0.55); // some diffuse brass stays, so no gear goes black
  expect(m.metalness).toBeLessThan(1);
  expect(m.roughness).toBeGreaterThanOrEqual(0.28);
  expect(m.roughness).toBeLessThanOrEqual(0.55);
  expect(m.roughnessMap && m.normalMap).toBe(true);
  expect(m.environment).toBe(true);
  expect(errors).toEqual([]);
});

/** Mean luminance (0-255) of regions of one screenshot, measured in the page. */
async function brightness(page: Page, regions: { x: number; y: number; w: number; h: number }[]) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rs]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data as string}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return (rs as { x: number; y: number; w: number; h: number }[]).map((r) => {
        const px = g.getImageData(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)).data;
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
        return sum / (px.length / 4);
      });
    },
    [b64, regions] as const,
  );
}

test('every brass gear reads as brass, never near black, from three orbit angles', async ({ page }) => {
  const errors = await open(page, 1440, 900);
  await choose(page, () => Promise.resolve(), 5);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing');
  await page.waitForFunction(() => !window.__chrono!.cameraMoving);
  const seen: string[] = [];
  for (const [i, drag] of [[0, 0], [1, 140], [2, -300]] as const) {
    if (drag) {
      await page.mouse.move(720, 120);
      await page.mouse.down();
      await page.mouse.move(720 + drag, 120, { steps: 6 });
      await page.mouse.up();
    }
    await frames(page, 8);
    const gears = (await page.evaluate(() => window.__chrono!.gearScreens)).filter((g) => {
      const half = Math.max(6, Math.min(30, g.r));
      return g.x - half >= 0 && g.y - half >= 0 && g.x + half <= 1440 && g.y + half <= 900 && !(g.y < 260 && g.x > 400 && g.x < 830); // not under the HUD panel
    });
    const lums = await brightness(page, gears.map((g) => { const half = Math.max(6, Math.min(30, g.r)); return { x: g.x - half, y: g.y - half, w: 2 * half, h: 2 * half }; }));
    gears.forEach((g, k) => {
      seen.push(`angle ${i} ${g.id}: ${lums[k]!.toFixed(0)}`);
      expect(lums[k]!, `angle ${i} gear ${g.id}`).toBeGreaterThan(BRASS_FLOOR);
    });
    await page.screenshot({ path: `${OUT}/orbit-${i}.png` });
  }
  console.log(seen.join('\n'));
  expect(seen.length).toBeGreaterThan(6);
  expect(errors).toEqual([]);
});

test('level 5 with the backdrop up stays inside the render budget', async ({ page }) => {
  await open(page, 1440, 900);
  await choose(page, () => Promise.resolve(), LEVELS.findIndex((l) => l.id === 'l5') + 1);
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelId === 'l5');
  await frames(page, 4);
  await expectBackdrop(page);
  const r = await page.evaluate(() => window.__chrono!.render);
  console.log(`L5 with the backdrop: ${r.calls} draw calls, ${r.triangles} triangles`);
  expect(r.calls).toBeLessThanOrEqual(RENDER_BUDGET.calls);
  expect(r.triangles).toBeLessThanOrEqual(RENDER_BUDGET.triangles);
});
