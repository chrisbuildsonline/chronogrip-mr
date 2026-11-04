import { expect, test, type Page } from '@playwright/test';
import { LEVELS } from '../../src/levels';
import { CLEAR, axleAt, carry, device, enterWithHands, gearAt, movePinchTo, nudge, pinch, pinchAt, poke, type Device } from './hands';
import { begin } from './start';

const [gearId, axleId] = Object.entries(LEVELS[0]!.solution)[0]!;

/** enterWithHands opens '/', so put the wanted query on the address before the app reads it. */
async function enter(page: Page, query: string) {
  await page.addInitScript((q) => {
    if (q && !location.search) history.replaceState(null, '', location.pathname + q);
  }, query);
  return enterWithHands(page);
}

for (const [query, mode] of [
  ['', 'iwsdk'],
  ['?grab=pinch', 'pinch'],
] as const) {
  test(`dev server (${mode}): a pinch carries a loose gear to its axle and drops it there`, async ({ page }) => {
    const errors = await enter(page, query);
    expect(await page.evaluate(() => window.__chrono!.grabMode)).toBe(mode);
    expect(await page.evaluate(() => window.__chrono!.grabVia)).toBeNull();

    await pinchAt(page, await gearAt(page, gearId));
    await page.waitForFunction((g) => window.__chrono!.held === g, gearId, { timeout: 10_000 });
    expect(await page.evaluate(() => window.__chrono!.grabVia)).toBe(mode);

    const axle = await axleAt(page, axleId);
    await movePinchTo(page, axle);
    const g = await gearAt(page, gearId);
    expect(Math.hypot(g[0] - axle[0], g[1] - axle[1], g[2] - axle[2])).toBeLessThan(0.012);

    await pinch(page, 'right', 0);
    await page.waitForFunction(() => window.__chrono!.held === null, undefined, { timeout: 10_000 });
    expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [gearId]: axleId });
    expect(await page.evaluate(() => window.__chrono!.solved)).toBe(true);
    expect(await page.evaluate(() => window.__chrono!.grabVia)).toBe(mode);
    expect(errors).toEqual([]);
  });
}

const setVisibility = (page: Page, s: string) => page.evaluate(([d, v]) => (window as unknown as Record<string, Device>)[d!]!.updateVisibilityState(v!), [device, s]);

test('dev server (iwsdk): a pinch on a panel button presses it, a pinch on the knob turns it, neither picks up a gear', async ({ page }) => {
  const errors = await enter(page, '');
  await page.waitForFunction(() => window.__chrono!.buttons().some((b) => b.id === 'scores'), undefined, { timeout: 15_000 });
  // High scores opens the board over the start panel; the same spot on the board card is empty, so the pinch ends there.
  await pinchAt(page, await page.evaluate(() => window.__chrono!.buttons().find((b) => b.id === 'scores')!.world));
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'board', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.grabVia)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.flow)).toBe('title');
  await pinch(page, 'right', 0);
  await poke(page, 'back');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'title', undefined, { timeout: 10_000 });
  await begin(page, (id) => poke(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  await pinch(page, 'right', 0);

  await carry(page, gearId, axleId);
  await page.waitForFunction(() => window.__chrono!.flow === 'calibrate', undefined, { timeout: 10_000 });
  await pinchAt(page, await page.evaluate(() => window.__chrono!.regulatorAt));
  await page.waitForFunction(() => window.__chrono!.turning === 'right', undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [gearId]: axleId });
  expect(errors).toEqual([]);
});

test('dev server (iwsdk): the headset menu mid-carry puts the gear back, and the next pinch still picks it up', async ({ page }) => {
  const errors = await enter(page, '');
  await begin(page, (id) => poke(page, id));
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  await pinch(page, 'right', 0);

  const home = await gearAt(page, gearId);
  await pinchAt(page, home);
  await page.waitForFunction((g) => window.__chrono!.held === g, gearId, { timeout: 10_000 });
  await movePinchTo(page, await axleAt(page, axleId));
  await setVisibility(page, 'visible-blurred');
  await page.waitForFunction(() => window.__chrono!.paused, undefined, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__chrono!.held)).toBeNull();
  const back = await gearAt(page, gearId);
  expect(Math.hypot(back[0] - home[0], back[1] - home[1], back[2] - home[2])).toBeLessThan(0.001);
  await setVisibility(page, 'visible');
  await page.waitForTimeout(300);
  // The hand is still pinching while paused: it must not drag the gear on.
  const still = await gearAt(page, gearId);
  expect(Math.hypot(still[0] - home[0], still[1] - home[1], still[2] - home[2])).toBeLessThan(0.001);

  await poke(page, 'resume');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  await pinch(page, 'right', 0);
  await nudge(page, CLEAR);
  await carry(page, gearId, axleId);
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [gearId]: axleId });
  expect(await page.evaluate(() => window.__chrono!.grabVia)).toBe('iwsdk');
  expect(errors).toEqual([]);
});

test("dev server (iwsdk): restarting and changing level leave only the new level's gears, back at their start spots", async ({ page }) => {
  const errors = await enter(page, '');
  await poke(page, 'start');
  await page.waitForFunction(() => window.__chrono!.flow === 'select', undefined, { timeout: 10_000 });
  await poke(page, 'level-2');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 1, undefined, { timeout: 10_000 });
  await pinch(page, 'right', 0);
  const [g2, a2] = Object.entries(LEVELS[1]!.solution)[0]!;
  const start = await page.evaluate(() => ({ gears: window.__chrono!.gears, count: window.__chrono!.gearCount }));
  await carry(page, g2, a2);
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [g2]: a2 });

  await setVisibility(page, 'visible-blurred');
  await page.waitForFunction(() => window.__chrono!.paused, undefined, { timeout: 10_000 });
  await setVisibility(page, 'visible');
  await poke(page, 'restart');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing', undefined, { timeout: 10_000 });
  const again = await page.evaluate(() => ({ gears: window.__chrono!.gears, count: window.__chrono!.gearCount, placements: window.__chrono!.placements }));
  expect(again.count).toBe(start.count);
  expect(again.placements).toEqual({});
  expect(Object.keys(again.gears).sort()).toEqual(Object.keys(start.gears).sort());
  for (const [id, p] of Object.entries(start.gears)) expect(Math.hypot(...p.map((v, i) => v - again.gears[id]![i]!) as [number, number, number])).toBeLessThan(1e-6);

  await pinch(page, 'right', 0);
  await nudge(page, CLEAR);
  await carry(page, g2, a2);
  expect(await page.evaluate(() => window.__chrono!.placements)).toEqual({ [g2]: a2 });

  await setVisibility(page, 'visible-blurred');
  await page.waitForFunction(() => window.__chrono!.paused, undefined, { timeout: 10_000 });
  await setVisibility(page, 'visible');
  await poke(page, 'levels');
  await page.waitForFunction(() => window.__chrono!.flow === 'select', undefined, { timeout: 10_000 });
  await poke(page, 'level-3');
  await page.waitForFunction(() => window.__chrono!.flow === 'playing' && window.__chrono!.levelIndex === 2, undefined, { timeout: 10_000 });
  const l3 = await page.evaluate(() => ({ ids: Object.keys(window.__chrono!.gears).sort(), count: window.__chrono!.gearCount, placements: window.__chrono!.placements }));
  expect(l3.ids).toEqual(LEVELS[2]!.tray.map((g) => g.id).sort());
  expect(l3.count).toBe(LEVELS[2]!.fixed.length + LEVELS[2]!.tray.length);
  expect(l3.placements).toEqual({});
  expect(errors).toEqual([]);
});
