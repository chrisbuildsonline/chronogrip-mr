import { describe, expect, it } from 'vitest';
import { PROPS } from '../../src/clockwork';
import { gearRadii } from '../../src/gear';
import { BADGE, badgeSpot, goalOf, goalText, rpmLabel } from '../../src/goal';
import { LEVELS, checkLevel, type Level } from '../../src/levels';
import { BOARD_MARGIN, PIN_RADIUS, TRAY_HALF } from '../../src/seat';
import { dailySeed, fallbackLevel, tinkerLevel } from '../../src/tinker';

const [L1, L2, L3] = LEVELS as [Level, Level, Level];

describe('goalOf', () => {
  it('reads the direction from the sign of the target rpm: + is anticlockwise as the player sees it (src/train.ts)', () => {
    expect(goalOf(L1, undefined)).toEqual({ dir: 'ccw', rpm: 60, matched: false });
    expect(goalOf(L2, undefined)).toEqual({ dir: 'cw', rpm: 60, matched: false });
    expect(goalOf(L3, undefined)).toEqual({ dir: 'ccw', rpm: 90, matched: false });
  });

  it('is matched only by a live spin within tolerance and turning the right way', () => {
    const { rpm, tolerance } = L2.target; // -60, 1
    expect(goalOf(L2, rpm).matched).toBe(true);
    expect(goalOf(L2, rpm + tolerance * 0.9).matched).toBe(true);
    expect(goalOf(L2, rpm - tolerance * 1.1).matched).toBe(false);
    expect(goalOf(L2, -rpm).matched).toBe(false);
    expect(goalOf(L2, 0).matched).toBe(false);
    expect(goalOf(L2, 'jammed').matched).toBe(false);
  });

  it('agrees with checkLevel on every level: matched by the solution, not by an empty board', () => {
    for (const level of LEVELS) {
      const tgt = level.target.gear;
      expect(goalOf(level, checkLevel(level, level.solution).spins[tgt]).matched, level.id).toBe(true);
      expect(goalOf(level, checkLevel(level, {}).spins[tgt]).matched, level.id).toBe(false);
    }
  });
});

describe('goal words', () => {
  it('says it plainly, with the turn arrow', () => {
    expect(goalText(goalOf(L1, undefined))).toBe('Turn the marked gear ↺ 60 rpm');
    expect(goalText(goalOf(L2, undefined))).toBe('Turn the marked gear ↻ 60 rpm');
  });

  it('prints whole rpm bare and a daily fraction to one place', () => {
    expect(rpmLabel(90)).toBe('90 rpm');
    expect(rpmLabel(37.5)).toBe('37.5 rpm');
    expect(rpmLabel(-45)).toBe('45 rpm');
  });
});

/** Gap from a circle centre to the badge rectangle centred at `at`. */
const gapTo = (at: { x: number; y: number }, c: { x: number; y: number }) =>
  Math.hypot(Math.max(0, Math.abs(c.x - at.x) - BADGE.w / 2), Math.max(0, Math.abs(c.y - at.y) - BADGE.h / 2));

const dailies = [fallbackLevel('t0'), ...Array.from({ length: 120 }, (_, d) => tinkerLevel(dailySeed(new Date(2026, 9, 1 + d))))];

describe('badgeSpot', () => {
  it('is big enough to read from the seat', () => {
    expect(BADGE.w).toBeGreaterThanOrEqual(0.07);
    expect(BADGE.h).toBeGreaterThanOrEqual(0.026);
  });

  for (const level of [...LEVELS, ...dailies]) {
    it(`${level.id}: sits on the board beside the target gear, clear of every pin, placed gear and the escapement`, () => {
      const at = badgeSpot(level);
      expect(at).not.toBeNull();
      const p = at!;
      expect(Math.abs(p.x) + BADGE.w / 2).toBeLessThanOrEqual(TRAY_HALF.x + BOARD_MARGIN - 0.002);
      expect(Math.abs(p.y) + BADGE.h / 2).toBeLessThanOrEqual(TRAY_HALF.y + BOARD_MARGIN - 0.002);

      const axle = new Map(level.axles.map((a) => [a.id, a]));
      const tray = new Map(level.tray.map((t) => [t.id, t]));
      const tip = (teeth: number) => gearRadii({ module: level.module, teeth }).tip;
      const gears = [
        ...level.fixed.map((f) => ({ ...axle.get(f.axle)!, id: f.id, r: tip(f.teeth) })),
        ...Object.entries(level.solution).map(([id, a]) => ({ ...axle.get(a)!, id, r: tip(tray.get(id)!.teeth) })),
      ];
      for (const g of gears) expect(gapTo(p, g), `${level.id}: badge vs gear ${g.id}`).toBeGreaterThan(g.r + 0.002);
      for (const a of level.axles) expect(gapTo(p, a), `${level.id}: badge vs pin ${a.id}`).toBeGreaterThan(PIN_RADIUS + 0.002);
      for (const q of PROPS) expect(gapTo(p, q), `${level.id}: badge vs prop at ${q.x}`).toBeGreaterThan(q.r);

      // Close enough to read as the target's label.
      const tgt = gears.find((g) => g.id === level.target.gear)!;
      expect(gapTo(p, tgt)).toBeLessThanOrEqual(tgt.r + 0.03);
    });
  }
});
