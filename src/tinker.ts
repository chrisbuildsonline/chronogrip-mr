import { PROPS } from './clockwork';
import { targetRate } from './escapement';
import { gearRadii } from './gear';
import { checkLevel, parseLevel, type Level, type LooseGear } from './levels';
import { PIN_RADIUS, footprints, inComfortZone, interactables, partsStrip } from './seat';
import type { Axle, PlacedGear } from './train';

/** One puzzle per local calendar day: YYYYMMDD. */
export const dailySeed = (d: Date): number => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** `levels` with its last level (the daily) swapped for the one for `now`'s date; the same list back while it is already today's. */
export function withDaily(levels: readonly Level[], now: Date): readonly Level[] {
  const seed = dailySeed(now);
  return levels.at(-1)?.id === `t${seed}` ? levels : [...levels.slice(0, -1), tinkerLevel(seed)];
}

type Rand = () => number;

function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const M = 0.004;
const mesh = (z1: number, z2: number) => (M * (z1 + z2)) / 2;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** A chain of axles in a row: driver, the axles to fill, target. `out` makes a middle axle a compound pair on layers L and 1 - L. */
type Spec = { drv: number; tgt: number; rpm: number; mids: { z: number; out?: number }[]; decoys: { teeth: number; layer: number }[]; y: number };

function build(id: string, s: Spec, r: Rand): Level {
  const axles: Axle[] = [{ id: 'a0', x: 0, y: 0 }];
  const fixed: PlacedGear[] = [{ id: 'drv', axle: 'a0', teeth: s.drv, layer: 0 }];
  const tray: LooseGear[] = [];
  const solution: Record<string, string> = {};
  let layer = 0;
  let out = s.drv;
  let rpm = s.rpm;
  const next = (z: number) => {
    axles.push({ id: `a${axles.length}`, x: axles[axles.length - 1]!.x + mesh(out, z), y: 0 });
    rpm *= -out / z;
  };
  s.mids.forEach((m, i) => {
    next(m.z);
    const axle = `a${i + 1}`;
    tray.push({ id: `g${i}`, teeth: m.z, layer });
    solution[`g${i}`] = axle;
    out = m.z;
    if (m.out) {
      layer = 1 - layer;
      tray.push({ id: `h${i}`, teeth: m.out, layer });
      solution[`h${i}`] = axle;
      out = m.out;
    }
  });
  next(s.tgt);
  fixed.push({ id: 'tgt', axle: `a${axles.length - 1}`, teeth: s.tgt, layer });
  const shift = axles[axles.length - 1]!.x / 2;
  for (const a of axles) [a.x, a.y] = [a.x - shift, s.y];
  s.decoys.forEach((d, i) => tray.push({ id: `d${i}`, ...d }));
  for (let i = tray.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [tray[i], tray[j]] = [tray[j]!, tray[i]!];
  }
  const target = Math.round(rpm * 10) / 10;
  return {
    id, name: 'Daily tinker', module: M, axles, fixed, driver: 'drv', rpm: s.rpm, tray,
    target: { gear: 'tgt', rpm: target, tolerance: Math.max(1, Math.round(Math.abs(target) / 50)) },
    escapement: { gear: 'tgt' },
    solution,
  };
}

/** Every rule the shipped levels are tested for, plus: unsolved when empty, and loose decoys alone never solve it. */
function valid(level: Level): boolean {
  try {
    parseLevel(level);
    const r = checkLevel(level, level.solution);
    if (!r.solved || Object.values(r.spins).includes('jammed') || checkLevel(level, {}).solved) return false;
    const rate = targetRate(level); // the regulator knob only reaches 1..5 ticks/s
    if (rate < 1.5 || rate > 4.5) return false;
    const pos = new Map(level.axles.map((a) => [a.id, a]));
    const tray = new Map(level.tray.map((t) => [t.id, t]));
    const placed = [...level.fixed, ...Object.entries(level.solution).map(([id, axle]) => ({ axle, teeth: tray.get(id)!.teeth }))];
    for (const g of placed) {
      const { tip } = gearRadii({ module: M, teeth: g.teeth });
      const p = pos.get(g.axle)!;
      if (Math.abs(p.x) + tip > 0.2 || Math.abs(p.y) + tip > 0.15) return false;
      if (PROPS.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= q.r + tip)) return false;
      if (level.axles.some((a) => a.id !== g.axle && Math.hypot(a.x - p.x, a.y - p.y) <= tip + PIN_RADIUS)) return false;
    }
    if (!interactables(level).every(inComfortZone)) return false;
    const prints = footprints(level);
    if (partsStrip(level).some((s) => prints.some((f) => Math.hypot(s.x - f.x, s.y - f.y) <= s.radius + f.radius))) return false;
    // Decoys on every axle, or left in the tray, must not solve it.
    const decoys = level.tray.filter((t) => !(t.id in level.solution));
    const spots = [undefined, ...level.axles.map((a) => a.id)];
    for (const a of spots) {
      for (const b of spots) {
        const place: Record<string, string> = {};
        if (a) place[decoys[0]!.id] = a;
        if (b && decoys[1]) place[decoys[1].id] = b;
        if (checkLevel(level, place).solved) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Known good: one idler between driver and target, like level 1. */
export const fallbackLevel = (id: string): Level =>
  build(id, { drv: 20, tgt: 20, rpm: 60, mids: [{ z: 30 }], decoys: [{ teeth: 24, layer: 0 }], y: 0 }, () => 0);

/** The same seed always gives the same level; a candidate is only used once `valid` passes it. */
export function tinkerLevel(seed: number): Level {
  const id = `t${seed >>> 0}`;
  const r = mulberry32(seed);
  r();
  for (let tries = 0; tries < 200; tries++) {
    // Small gears are likelier, so longer chains still fit the tray and the parts strip.
    const z = () => Math.min(int(r, 10, 40), int(r, 10, 40));
    const mids = Array.from({ length: int(r, 1, 3) }, () => ({ z: z(), out: r() < 0.35 ? z() : undefined }));
    const spec: Spec = {
      drv: z(), tgt: z(), mids, y: (r() - 0.5) * 0.1,
      rpm: [40, 60, 80, 90, 120][int(r, 0, 4)]! * (r() < 0.25 ? -1 : 1),
      decoys: Array.from({ length: int(r, 1, 2) }, () => ({ teeth: z(), layer: int(r, 0, 1) })),
    };
    const level = build(id, spec, r);
    if (valid(level)) return level;
  }
  return fallbackLevel(id);
}
