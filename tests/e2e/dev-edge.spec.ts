import { expect, test, type Page } from './fixtures';
import { footprint, type Pt } from '../../src/edge';
import { device } from './hands';

// Runs against the dev server (project "dev"), where the IWER emulator is injected. A table plane turned about Y gets the
// tray turned to its near edge; one too small for the tray leaves it at the default spot with fit 'small'.

const deg = Math.PI / 180;
type Sem = { trackedPlanes: Set<unknown> };
type Pose = { position: readonly [number, number, number]; tilt: number; yaw?: number };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function open(page: Page) {
  await page.addInitScript(() => {
    delete (window as { XRWebGLBinding?: unknown }).XRWebGLBinding;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
}

/**
 * A width x depth table in IWER's synthetic room, 45 cm below and 45 cm ahead of the seated head (IWER's head stands at
 * 1.6 m, facing -Z; the local space starts at the head), turned `yaw` radians about Y.
 */
async function addTable(page: Page, width: number, depth: number, yaw: number) {
  await page.waitForFunction((d) => ((window as unknown as Record<string, { sem?: Sem }>)[d]?.sem?.trackedPlanes.size ?? 0) > 0, device, { timeout: 15_000 });
  await page.evaluate(
    ([d, w, dp, a]) => {
      const sem = (window as unknown as Record<string, { sem: Sem }>)[d as string]!.sem;
      const [x, y, z] = [0, 1.6 - 0.45, -0.45];
      const [c, s] = [Math.cos(a as number), Math.sin(a as number)];
      const polygon = [[-(w as number) / 2, -(dp as number) / 2], [(w as number) / 2, -(dp as number) / 2], [(w as number) / 2, (dp as number) / 2], [-(w as number) / 2, (dp as number) / 2]].map(([px, pz]) => new DOMPointReadOnly(px, 0, pz, 1));
      const table = {
        transform: { matrix: new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]), position: { x, y, z, w: 1 }, orientation: { x: 0, y: Math.sin((a as number) / 2), z: 0, w: Math.cos((a as number) / 2) } },
        polygon,
        semanticLabel: 'table',
      };
      sem.trackedPlanes.add(table);
    },
    [device, width, depth, yaw] as const,
  );
}

async function enterMr(page: Page) {
  await page.getByRole('button', { name: 'Enter MR' }).click();
  await page.waitForFunction(() => window.__chrono?.xrPresenting === true, undefined, { timeout: 10_000 });
}

/** True if every point of the quad is inside the polygon (even-odd; the tray tests only need the corners). */
function allInside(poly: readonly Pt[], quad: readonly Pt[]) {
  return quad.every(([x, z]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i]!;
      const [xj, zj] = poly[j]!;
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  });
}

const pose = (page: Page) => page.evaluate(() => window.__chrono!.trayPose) as Promise<Pose>;

for (const turn of [11, -11]) {
  test(`dev server: a table turned ${turn} degrees turns the tray to its edge, on the table`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page);
    await addTable(page, 0.8, 0.6, turn * deg);
    await enterMr(page);
    await page.waitForFunction(() => window.__chrono?.trayPlaced === 'plane', undefined, { timeout: 10_000 });
    expect(await page.evaluate(() => window.__chrono!.trayFit)).toBe('edge');
    // Relative to the head, which faces -Z: the tray yaw is the table's, within a degree.
    const yaw = await page.evaluate(() => window.__chrono!.trayYaw);
    expect(Math.abs(yaw - turn * deg)).toBeLessThan(1 * deg);
    const placed = await pose(page);
    expect(placed.yaw).toBe(yaw);
    const outline = (await page.evaluate(() => window.__chrono!.tableOutline)) as Pt[];
    expect(outline).toHaveLength(4);
    expect(allInside(outline, footprint(placed))).toBe(true);
    expect(await page.evaluate(() => window.__chrono!.tableNote)).toBeNull();
    expect(errors).toEqual([]);
  });
}

test('dev server: the turned tray comes back turned after a reload, from the persistent anchor', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await addTable(page, 0.8, 0.6, 11 * deg);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayFit === 'edge', undefined, { timeout: 10_000 });
  const placed = await pose(page);
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('chronogrip.tray.v1') ?? 'null') as { anchor?: string } | null)?.anchor, undefined, { timeout: 10_000 });
  const saved = (await page.evaluate(() => JSON.parse(localStorage.getItem('chronogrip.tray.v1') ?? 'null'))) as { fit?: string; pose: Pose };
  expect(saved.fit).toBe('edge');
  expect(saved.pose.yaw!).toBeCloseTo(placed.yaw!, 6);

  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayRestored === 'anchor', undefined, { timeout: 10_000 });
  const back = await pose(page);
  expect(back.yaw!).toBeCloseTo(placed.yaw!, 2);
  expect(await page.evaluate(() => window.__chrono!.trayFit)).toBe('edge');
  expect(errors).toEqual([]);
});

test('dev server: both floating pills are wider than their text plus padding, and the same width', async ({ page }) => {
  await open(page);
  const pills = await page.evaluate(() => window.__chrono!.pills);
  expect(pills.map((p) => p.text)).toEqual(['Put the controllers down and use your hands', 'Table’s a bit small, tray kept in easy reach']);
  for (const p of pills) expect(p.textWidth + 2 * p.padding).toBeLessThanOrEqual(p.width + 1e-9);
  expect(pills[0]!.width).toBe(pills[1]!.width);
});

test('dev server: a table too small for the tray leaves it at the default spot and says so', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await addTable(page, 0.3, 0.3, 10 * deg);
  await enterMr(page);
  await page.waitForFunction(() => window.__chrono?.trayFit === 'small', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.trayPlaced)).toBe('default');
  expect(await page.evaluate(() => window.__chrono!.trayYaw)).toBe(0);
  expect(await page.evaluate(() => window.__chrono!.tableOutline)).toHaveLength(4);
  // The short honest line shows above the card.
  await page.waitForFunction(() => window.__chrono?.tableNote === 'Table’s a bit small, tray kept in easy reach', undefined, { timeout: 5_000 });
  await page.screenshot({ path: 'test-results/edge/small-table.png' });
  await page.waitForTimeout(3500); // past the plane search window: it stays small
  expect(await page.evaluate(() => window.__chrono!.trayFit)).toBe('small');
  expect(await page.evaluate(() => window.__chrono!.tableNote)).not.toBeNull();
  expect(errors).toEqual([]);
});
