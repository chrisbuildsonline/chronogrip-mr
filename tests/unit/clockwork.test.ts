import { describe, expect, it } from 'vitest';
import { BIRD, PROPS } from '../../src/clockwork';
import { gearRadii } from '../../src/gear';
import { LEVELS, type Level } from '../../src/levels';
import { TRAY_POSE, footprints, partsStrip, type Circle } from '../../src/seat';
import { dailySeed, fallbackLevel, tinkerLevel } from '../../src/tinker';

/**
 * The bird stands upright on a tray tilted far edge up, so seen face on (along the tray normal, as from the seat) it
 * covers a strip running from its post up the board by height * sin(tilt), `radius` either side.
 */
const lean = BIRD.height * Math.sin(TRAY_POSE.tilt);
const gapToBird = (c: { x: number; y: number }) => Math.hypot(c.x - BIRD.x, c.y - Math.min(Math.max(c.y, BIRD.y), BIRD.y + lean)) - BIRD.radius;

/** Everything on the board: pins, fixed gears, the solution's gears in place and every loose gear resting on the strip. */
function parts(level: Level): Circle[] {
  const at = new Map(level.axles.map((a) => [a.id, a]));
  const placed = Object.entries(level.solution).map(([id, axle]) => {
    const teeth = level.tray.find((t) => t.id === id)!.teeth;
    return { id, x: at.get(axle)!.x, y: at.get(axle)!.y, radius: gearRadii({ module: level.module, teeth }).tip };
  });
  return [...footprints(level), ...placed, ...partsStrip(level)];
}

const dailies = [fallbackLevel('t0'), ...Array.from({ length: 120 }, (_, d) => tinkerLevel(dailySeed(new Date(2026, 9, 1 + d))))];

describe('automaton bird', () => {
  it('stands clear of every gear and axle on every level, before and after the solve', () => {
    for (const level of LEVELS) {
      for (const c of parts(level)) expect(gapToBird(c) - c.radius, `${level.id}: ${c.id}`).toBeGreaterThan(0.004);
    }
  });

  it('stands clear of every gear and axle on the daily puzzles', () => {
    for (const level of dailies) {
      for (const c of parts(level)) expect(gapToBird(c) - c.radius, `${level.id}: ${c.id}`).toBeGreaterThan(0.004);
    }
  });

  it('stands clear of the escapement dial and balance wheel', () => {
    const escapement = PROPS.filter((p) => p.x !== BIRD.x || p.y !== BIRD.y);
    expect(escapement).toHaveLength(2);
    for (const p of escapement) expect(gapToBird(p) - p.r).toBeGreaterThan(0);
  });
});
