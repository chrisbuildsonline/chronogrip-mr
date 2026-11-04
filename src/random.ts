import { targetRate } from './escapement';
import { checkLevel, type Level } from './levels';
import { KIND_MAX, LEVELS_PER_STAGE, clampD, dOfKind, scoreAt } from './stages';
import { build, fallbackLevel, int, mulberry32, valid, type Spec } from './tinker';

/**
 * Generated puzzles. Every stage level (and each Random level difficulty) is a puzzle made fresh from a seed, so it cannot be
 * learned. A recipe (how many axles to fill, compound pairs, decoys, near-miss decoys, a forced direction flip, how tight the
 * target is) is interpolated from the global difficulty (src/stages.ts); K candidates are built from the seed's own random stream, the ones that pass
 * `valid` are scored by `difficultyOf`, and the one closest to the level's target score is kept.
 * Everything here is pure: the same (n, seed) is always the same level.
 */

/** Valid candidates compared per puzzle, and the most attempts made to find them (hard recipes fail `valid` often). */
const CANDIDATES = 40;
const ATTEMPTS = 600;

/** Levels in a stage (the old name, still used by the run and flow). */
export const CAMPAIGN = LEVELS_PER_STAGE;

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The tray and the comfort zone hold only so many parts: past these counts difficulty grows through near-misses, flips and a tighter target. */
const MAX_MIDS = 5;
const MAX_DECOYS = 5;
/** Loose gears in the tray at most (the render budget holds to 12 gears with the two fixed ones). */
const MAX_TRAY = 9;
/** Compound pairs on neighbouring axles use both layers and begin to jam each other, so few of them stay valid. */
const MAX_COMPOUNDS = 3;
const M = 0.004;

const log2Perms = (n: number, k: number): number => {
  let s = 0;
  for (let i = 0; i < k; i++) s += Math.log2(n - i);
  return s;
};

/**
 * How hard a puzzle measures: the log2 of the ways to put the tray's parts on the open slots (plausible wrong assignments),
 * plus a weight for each near-miss decoy (teeth within 3 of a part that belongs, and one tooth off in a tight window), each
 * compound pair, a target that turns against the driver, and a tight (0.5 rpm) or tighter (0.3) target. A pure function of the level.
 */
export function difficultyOf(level: Level): number {
  const placed = Object.keys(level.solution).length;
  const perms = log2Perms(level.tray.length, placed);
  const parts = level.tray.filter((g) => g.id in level.solution);
  const decoys = level.tray.filter((g) => !(g.id in level.solution));
  const near = decoys.filter((d) => parts.some((p) => Math.abs(p.teeth - d.teeth) <= 3)).length;
  const onAxle = new Map<string, number>();
  for (const axle of Object.values(level.solution)) onAxle.set(axle, (onAxle.get(axle) ?? 0) + 1);
  const compound = [...onAxle.values()].filter((c) => c > 1).length;
  const flip = Math.sign(level.target.rpm) !== Math.sign(level.rpm) ? 1 : 0;
  const tol = level.target.tolerance;
  // A decoy one tooth off only counts where the window is tight, so the hand-made levels' score stays as it was.
  const veryNear = tol > 0.5 ? 0 : decoys.filter((d) => parts.some((p) => Math.abs(p.teeth - d.teeth) <= 1)).length;
  const tight = (tol <= 0.5 ? 1 : 0) + (tol <= 0.3 ? 1 : 0);
  return perms + 1.5 * near + veryNear + 2 * compound + 3 * flip + 2 * tight;
}

type Recipe = { mids: number; compounds: number; decoys: number; near: number; tol: number; offMin: number; flip: boolean };

/** The recipe at global difficulty d, its knobs interpolated with a little jitter from the seed's stream. */
function recipeFor(d: number, r: () => number): Recipe {
  let mids = clamp(Math.round(1 + 4 * d + (r() - 0.5) * 1.4), 1, MAX_MIDS);
  // An even number of idler axles means an odd number of meshes: the target turns against the driver. The likelier the higher up.
  const flip = r() < clamp((d - 0.5) / 0.4, 0, 1);
  if (flip && mids % 2) mids -= 1;
  const compounds = clamp(Math.round(1.1 * d * mids + (r() - 0.5) * 1.2), 0, Math.min(Math.ceil(mids / 2), MAX_COMPOUNDS));
  const decoys = clamp(Math.round(1 + 3.6 * d + (r() - 0.5) * 1.6), 1, Math.min(MAX_DECOYS, MAX_TRAY - mids - compounds));
  return {
    mids,
    decoys,
    compounds,
    near: clamp(Math.round(d * decoys * 1.4 + (r() - 0.5) * 1.2), 0, decoys),
    // From 0.6 up the near-misses sit one or two teeth off the real part, not two or three.
    offMin: d > 0.6 ? 1 : 2,
    tol: d > 0.85 ? 0.3 : d > 0.5 ? 0.5 : d > 0.25 ? 1 : 2,
    flip,
  };
}

function attempt(target: number, id: string, r: () => number): Level | null {
  // Each candidate aims a little off the target, so the pool spans the scores around it and the nearest one can be picked.
  const d = clampD(target + (r() - 0.5) * 0.3);
  const rc = recipeFor(d, r);
  // Small gears are likelier, so longer chains still fit the tray and the parts strip.
  const z = () => Math.min(int(r, 10, 40), int(r, 10, 40));
  // Compound pairs on neighbouring axles collide unless the sizes happen to suit, so they are spread out where the chain allows.
  const compound = new Set<number>();
  for (let tries = 0; compound.size < rc.compounds; tries++) {
    const i = int(r, 0, rc.mids - 1);
    if (tries < 30 && (compound.has(i - 1) || compound.has(i + 1))) continue;
    compound.add(i);
  }
  const mids = Array.from({ length: rc.mids }, (_, i) => ({ z: z(), out: compound.has(i) ? z() : undefined }));
  const rpm = [40, 60, 80, 90, 120][int(r, 0, 4)]! * (r() < 0.25 ? -1 : 1);
  let drv = z();
  let tgt = z();
  // The chain runs along the tray: shrink its biggest gear until it fits (src/tinker.ts valid), then keep the target size
  // only if the regulator can reach the rate, trying a few other sizes first.
  const fit = () => {
    for (let guard = 0; guard < 60; guard++) {
      const outs = [drv, ...mids.map((m) => m.out ?? m.z)];
      const ins = [...mids.map((m) => m.z), tgt];
      const width = outs.reduce((sum, o, i) => sum + (M * (o + ins[i]!)) / 2, 0);
      if (width / 2 + M * (Math.max(drv, tgt) / 2 + 1) <= 0.19) return;
      const slots = [() => drv, () => tgt, ...mids.flatMap((m) => [() => m.z, ...(m.out ? [() => m.out!] : [])])];
      const big = Math.max(...slots.map((get) => get()));
      if (big <= 10) return;
      if (drv === big) drv--;
      else if (tgt === big) tgt--;
      else {
        const m = mids.find((x) => x.z === big || x.out === big)!;
        if (m.z === big) m.z--;
        else m.out!--;
      }
    }
  };
  for (let k = 0; k < 10; k++) {
    fit();
    const probe = build(id, { drv, tgt, mids, y: 0, rpm, decoys: [] }, r);
    if (targetRate(probe) >= 1.5 && targetRate(probe) <= 4.5) break;
    tgt = z();
  }
  // The parts that belong, with the layer each lands on (a compound pair flips it), for the decoys that look like them.
  const parts: { teeth: number; layer: number }[] = [];
  let layer = 0;
  for (const m of mids) {
    parts.push({ teeth: m.z, layer });
    if (m.out) {
      layer = 1 - layer;
      parts.push({ teeth: m.out, layer });
    }
  }
  const decoys = Array.from({ length: rc.decoys }, (_, i) => {
    if (i >= rc.near) return { teeth: z(), layer: int(r, 0, 1) };
    const p = parts[int(r, 0, parts.length - 1)]!;
    const off = int(r, rc.offMin, 3) * (r() < 0.5 ? -1 : 1);
    return { teeth: clamp(p.teeth + off, 8, 40), layer: p.layer };
  });
  const spec: Spec = {
    drv, tgt, mids, y: (r() - 0.5) * 0.1,
    rpm,
    decoys,
  };
  const built = build(id, spec, r);
  if (rc.flip && Math.sign(built.target.rpm) === Math.sign(built.rpm)) return null;
  const level: Level = { ...built, name: 'Puzzle', target: { ...built.target, tolerance: rc.tol } };
  if (!valid(level) || !decoysFail(level)) return null;
  return level;
}

/** A near-miss decoy standing in for the part it imitates must not solve it: the answer stays the one built. */
function decoysFail(level: Level): boolean {
  const spare = level.tray.filter((g) => !(g.id in level.solution));
  for (const d of spare) {
    for (const [id, axle] of Object.entries(level.solution)) {
      const part = level.tray.find((g) => g.id === id)!;
      if (part.layer !== d.layer || Math.abs(part.teeth - d.teeth) > 3) continue;
      const { [id]: _gone, ...rest } = level.solution;
      void _gone;
      if (checkLevel(level, { ...rest, [d.id]: axle }).solved) return false;
    }
  }
  return true;
}

/** The puzzle at global difficulty d and a seed: the valid candidate whose measured difficulty is nearest `scoreAt(d)`. */
export function randomLevel(d: number, seed: number): Level {
  const dd = clampD(d);
  const id = `t${seed >>> 0}`;
  const r = mulberry32(seed);
  r();
  // Scores come in steps, so each puzzle aims a little either side of the target (up to half a point): across seeds the average still tracks the curve smoothly.
  const want = scoreAt(dd) + (r() - 0.5);
  let best: { level: Level; gap: number } | null = null;
  for (let i = 0, found = 0; i < ATTEMPTS && found < CANDIDATES; i++) {
    const c = attempt(dd, id, r);
    if (!c) continue;
    found++;
    const gap = Math.abs(difficultyOf(c) - want);
    if (!best || gap < best.gap) best = { level: c, gap };
  }
  // No valid candidate in the tries: the same seed a little easier, down to the known-good level.
  return best?.level ?? (dd > 0 ? randomLevel(Math.max(0, dd - 0.1), seed) : fallbackLevel(id));
}

/**
 * A puzzle seed carries what it is in the top 6 bits and 26 random bits below. Top bits 0 is a plain tinker seed (a daily or
 * an old shared code); 1..60 is a stage level (stage index * 20 + level, src/stages.ts), which also covers the Random picks.
 */
const LOW_BITS = 26;
const LOW_MASK = 2 ** LOW_BITS - 1;

export const packSeed = (kind: number, low: number): number => (clamp(Math.round(kind), 1, KIND_MAX) * 2 ** LOW_BITS + (low & LOW_MASK)) >>> 0;

/** The kind a seed carries (0 for a plain tinker seed) and its 26 low bits. */
export const unpackSeed = (seed: number): { kind: number; low: number } => ({ kind: Math.floor((seed >>> 0) / 2 ** LOW_BITS), low: (seed >>> 0) & LOW_MASK });

/** A fresh seed of a kind; `rnd` is Math.random at run time. */
export const freshSeed = (kind: number, rnd: () => number = Math.random): number => packSeed(kind, Math.floor(rnd() * 2 ** LOW_BITS));

/** Opens a puzzle code's seed: the generated puzzle it carries, else the plain tinker puzzle it always was. */
export function puzzleFor(seed: number, plain: (seed: number) => Level): Level {
  const { kind } = unpackSeed(seed);
  return kind === 0 || kind > KIND_MAX ? plain(seed) : randomLevel(dOfKind(kind), seed);
}
