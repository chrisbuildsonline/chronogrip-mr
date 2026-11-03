import { PROPS } from './clockwork';
import { gearRadii } from './gear';
import { meetsTarget, type Level } from './levels';
import { BOARD_MARGIN, PIN_RADIUS, TRAY_HALF } from './seat';
import type { GearSpin } from './train';

/** What the badge on the target gear says: the turn as the player sees it, the rpm, and whether the train meets it. */
export type Goal = { dir: 'cw' | 'ccw'; rpm: number; matched: boolean };

/** + rpm is anticlockwise seen from the player (src/train.ts, and gears turn about the tray normal in src/main.ts). */
export const goalOf = (level: Level, spin: GearSpin | undefined): Goal => ({
  dir: level.target.rpm > 0 ? 'ccw' : 'cw',
  rpm: Math.abs(level.target.rpm),
  matched: meetsTarget(level.target, spin),
});

/** Whole rpm bare, a daily's fraction to one place. */
export const rpmLabel = (rpm: number) => {
  const r = Math.abs(rpm);
  return `${Number.isInteger(r) ? r : r.toFixed(1)} rpm`;
};

export const arrowOf = (dir: Goal['dir']) => (dir === 'cw' ? '↻' : '↺');

/** The HUD's goal line, in plain words (the HUD draws the arrow as an icon). */
export const goalText = (goal: Goal) => `Turn the marked gear ${arrowOf(goal.dir)} ${rpmLabel(goal.rpm)}`;

/** The badge's size on the board, level metres: big enough to read from the seat and the desktop camera. */
export const BADGE = { w: 0.084, h: 0.032 } as const;
/** Clear board round the badge, metres. */
const CLEAR = 0.004;

type Circle = { x: number; y: number; r: number };

/** Gap between a circle's centre and the badge's rectangle centred at `p`. */
const gapTo = (p: { x: number; y: number }, c: { x: number; y: number }) =>
  Math.hypot(Math.max(0, Math.abs(c.x - p.x) - BADGE.w / 2), Math.max(0, Math.abs(c.y - p.y) - BADGE.h / 2));

/**
 * Where the goal badge lies on the board, level metres: beside the target gear (closest first, a little nearer the
 * player preferred), on the board, clear of every pin, every fixed and solution gear, the dial, balance wheel and bird.
 * Spots also clear of the biggest tray gear on every free axle are tried first, so a wrong guess does not cover it either.
 * Null if the target is not a fixed gear or nothing fits.
 */
export function badgeSpot(level: Level): { x: number; y: number } | null {
  const target = level.fixed.find((f) => f.id === level.target.gear);
  if (!target) return null;
  const tip = (teeth: number) => gearRadii({ module: level.module, teeth }).tip;
  const axle = new Map(level.axles.map((a) => [a.id, a]));
  const tray = new Map(level.tray.map((g) => [g.id, g]));
  const centre = axle.get(target.axle)!;
  const hard: Circle[] = [
    ...level.axles.map((a) => ({ x: a.x, y: a.y, r: PIN_RADIUS })),
    ...level.fixed.map((f) => ({ ...axle.get(f.axle)!, r: tip(f.teeth) })),
    ...Object.entries(level.solution).map(([id, a]) => ({ ...axle.get(a)!, r: tip(tray.get(id)!.teeth) })),
    ...PROPS,
  ];
  const biggest = Math.max(0, ...level.tray.map((g) => tip(g.teeth)));
  const soft: Circle[] = level.axles.filter((a) => !level.fixed.some((f) => f.axle === a.id)).map((a) => ({ x: a.x, y: a.y, r: biggest }));
  const lim = { x: TRAY_HALF.x + BOARD_MARGIN - 0.005 - BADGE.w / 2, y: TRAY_HALF.y + BOARD_MARGIN - 0.005 - BADGE.h / 2 };

  const candidates: { x: number; y: number; score: number }[] = [];
  const r0 = tip(target.teeth) + CLEAR;
  for (let deg = 0; deg < 360; deg += 5) {
    const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
    const reach = Math.abs(c) * (BADGE.w / 2) + Math.abs(s) * (BADGE.h / 2);
    for (let extra = 0; extra <= 0.024; extra += 0.002) {
      const p = { x: centre.x + (r0 + extra + reach) * c, y: centre.y + (r0 + extra + reach) * s };
      if (Math.abs(p.x) > lim.x || Math.abs(p.y) > lim.y) continue;
      candidates.push({ ...p, score: gapTo(p, centre) + 0.006 * (1 + s) });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  const clear = (p: { x: number; y: number }, set: Circle[]) => set.every((q) => gapTo(p, q) > q.r + CLEAR);
  const pick = candidates.find((p) => clear(p, hard) && clear(p, soft)) ?? candidates.find((p) => clear(p, hard));
  return pick ? { x: pick.x, y: pick.y } : null;
}
