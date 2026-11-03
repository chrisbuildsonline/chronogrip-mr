import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, placeTray } from '../../src/anchor';
import { CUE_COLORS, CUE_MS, cueAt, cueFor, cueSpot } from '../../src/cue';
import { C } from '../../src/palette';
import { worldToTray } from '../../src/seat';
import srcCue from '../../src/cue.ts?raw';

const onTable = placeTray([{ orientation: 'horizontal', position: [0, -0.45, -0.4] }]);

describe('which placements show the "table found" cue', () => {
  it('a plane placing the tray shows the full cue, from the search or a recenter', () => {
    expect(cueFor('search', onTable)).toBe('plane');
    expect(cueFor('recenter', onTable)).toBe('plane');
  });

  it('a restored pose shows the subtler cue, whatever placed it first', () => {
    expect(cueFor('saved', onTable)).toBe('restored');
    expect(cueFor('anchor', onTable)).toBe('restored');
    expect(cueFor('saved', DEFAULT_PLACEMENT)).toBe('restored');
  });

  it('the default fallback shows nothing', () => {
    expect(cueFor('search', DEFAULT_PLACEMENT)).toBeNull();
    expect(cueFor('recenter', DEFAULT_PLACEMENT)).toBeNull();
  });
});

describe('the pulse', () => {
  it('lasts about a second', () => {
    expect(CUE_MS.plane).toBeGreaterThanOrEqual(800);
    expect(CUE_MS.plane).toBeLessThanOrEqual(1300);
    expect(cueAt('plane', -1).visible).toBe(false);
    expect(cueAt('plane', CUE_MS.plane + 1).visible).toBe(false);
    expect(cueAt('plane', CUE_MS.plane / 2).visible).toBe(true);
  });

  it('expands and fades: grows all the way, fades in fast and out slowly', () => {
    const at = (t: number) => cueAt('plane', t * CUE_MS.plane);
    const ts = [0.05, 0.2, 0.4, 0.6, 0.8, 0.95];
    for (let i = 1; i < ts.length; i++) expect(at(ts[i]!).scale).toBeGreaterThan(at(ts[i - 1]!).scale);
    expect(at(0.95).scale).toBeGreaterThan(1.4 * at(0.02).scale);
    expect(at(0.2).opacity).toBeGreaterThan(0.8);
    for (let i = 2; i < ts.length; i++) expect(at(ts[i]!).opacity).toBeLessThan(at(ts[i - 1]!).opacity);
    expect(at(0.99).opacity).toBeLessThan(0.1);
  });

  it('a second, fainter echo ring follows the first', () => {
    const mid = cueAt('plane', CUE_MS.plane * 0.5);
    expect(mid.echo.opacity).toBeGreaterThan(0);
    expect(mid.echo.opacity).toBeLessThan(mid.opacity);
    expect(mid.echo.scale).toBeLessThan(mid.scale);
    expect(cueAt('plane', 10).echo.opacity).toBe(0);
  });

  it('the restored cue is subtler: fainter, and it grows less', () => {
    const peak = (k: 'plane' | 'restored') => Math.max(...Array.from({ length: 50 }, (_, i) => cueAt(k, (i / 50) * CUE_MS[k]).opacity));
    expect(peak('restored')).toBeLessThan(0.75 * peak('plane'));
    expect(peak('restored')).toBeGreaterThan(0.3);
    const growth = (k: 'plane' | 'restored') => cueAt(k, 0.95 * CUE_MS[k]).scale / cueAt(k, 0.02 * CUE_MS[k]).scale;
    expect(growth('restored')).toBeLessThan(growth('plane'));
  });
});

describe('where the cue sits', () => {
  // Flat on a table under a raised tray it would hide behind the board and below the view; in the board's plane, just
  // under its top, it shows as a halo growing out past the rim, wherever the tray stands.
  it.each([
    ['a plane placement', onTable],
    ['the default pose', DEFAULT_PLACEMENT],
  ] as const)('in the tray plane, centred, just under the board top: %s', (_, p) => {
    const s = cueSpot(p);
    const [x, y, lift] = worldToTray(s.position, p.pose);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(lift).toBeLessThan(0);
    expect(lift).toBeGreaterThan(-0.018);
    expect(s.tilt).toBe(p.pose.tilt);
    expect(s.yaw).toBe(p.pose.yaw ?? 0);
  });
});

describe('cue colours', () => {
  it('come from the palette only', () => {
    expect(Object.values(CUE_COLORS).every((c) => (Object.values(C) as string[]).includes(c))).toBe(true);
    expect(CUE_COLORS.ring).toBe(C.amber);
    expect(srcCue).not.toMatch(/#[0-9a-f]{3,8}\b|0x[0-9a-f]{6}/i);
  });
});
