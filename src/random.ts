import { checkLevel, type Level } from './levels';
import { build, fallbackLevel, int, mulberry32, valid, type Spec } from './tinker';

/**
 * Generated puzzles. Level n of the 20-level campaign (and each Random level difficulty) is a puzzle made fresh from a seed,
 * so it cannot be learned. A recipe (how many axles to fill, compound pairs, decoys, near-miss decoys, how tight the target
 * is) is interpolated from the level number; K candidates are built from the seed's own random stream, the ones that pass
 * `valid` are scored by `difficultyOf`, and the one closest to the level's target score is kept.
 * Everything here is pure: the same (n, seed) is always the same level.
 */

/** Levels in the campaign. */
export const CAMPAIGN = 20;
/** Valid candidates compared per puzzle, and the most attempts made to find them (hard recipes fail `valid` often). */
const CANDIDATES = 24;
const ATTEMPTS = 240;

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
/** The campaign level a Random level difficulty plays at. */
export const DIFFICULTY_LEVEL: Record<Difficulty, number> = { easy: 3, medium: 9, hard: 15, expert: 20 };

/** A level number as a whole number in 1..CAMPAIGN; anything else (NaN, a fraction, out of range) is pulled in. */
export const clampLevel = (n: number): number => (Number.isFinite(n) ? Math.min(CAMPAIGN, Math.max(1, Math.round(n))) : 1);
/** How far up the ramp level n stands: 0 at level 1, 1 at the last. */
const ramp = (n: number): number => (clampLevel(n) - 1) / (CAMPAIGN - 1);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The tray and the comfort zone hold only so many parts: past these counts difficulty grows through near-misses and a tighter target. */
const MAX_MIDS = 4;
const MAX_DECOYS = 4;
/** Compound pairs on neighbouring axles use both layers and begin to jam each other, so few of them stay valid. */
const MAX_COMPOUNDS = 2;

/** The easiest and hardest scores the ramp aims at; `targetScore` is linear between them. */
const SCORE_MIN = 1.5;
const SCORE_MAX = 25;
export const targetScore = (n: number): number => SCORE_MIN + (SCORE_MAX - SCORE_MIN) * ramp(n);

const log2Perms = (n: number, k: number): number => {
  let s = 0;
  for (let i = 0; i < k; i++) s += Math.log2(n - i);
  return s;
};

/**
 * How hard a puzzle measures: the log2 of the ways to put the tray's parts on the open slots (plausible wrong assignments),
 * plus a weight for each near-miss decoy (teeth within 3 of a part that belongs), each compound pair, a target that turns
 * against the driver, and a tight target. A pure function of the level.
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
  const tight = level.target.tolerance <= 0.5 ? 1 : 0;
  return perms + 1.5 * near + 2 * compound + 3 * flip + 2 * tight;
}

type Recipe = { mids: number; compounds: number; decoys: number; near: number; tol: number };

/** The recipe for level n, its knobs interpolated from the ramp with a little jitter from the seed's stream. */
function recipeFor(n: number, r: () => number): Recipe {
  const d = ramp(n);
  const mids = clamp(Math.round(1 + 2.6 * d + (r() - 0.5) * 1.4), 1, MAX_MIDS);
  const decoys = clamp(Math.round(1 + 3 * d + (r() - 0.5) * 1.6), 1, MAX_DECOYS);
  return {
    mids,
    decoys,
    compounds: clamp(Math.round(d * mids + (r() - 0.5) * 1.2), 0, Math.min(mids, MAX_COMPOUNDS)),
    near: clamp(Math.round(d * decoys * 1.3 + (r() - 0.5) * 1.2), 0, decoys),
    tol: d > 0.5 ? 0.5 : d > 0.25 ? 1 : 2,
  };
}

function attempt(n: number, id: string, r: () => number): Level | null {
  const rc = recipeFor(n, r);
  // Small gears are likelier, so longer chains still fit the tray and the parts strip.
  const z = () => Math.min(int(r, 10, 40), int(r, 10, 40));
  const compound = new Set<number>();
  while (compound.size < rc.compounds) compound.add(int(r, 0, rc.mids - 1));
  const mids = Array.from({ length: rc.mids }, (_, i) => ({ z: z(), out: compound.has(i) ? z() : undefined }));
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
    const off = int(r, 2, 3) * (r() < 0.5 ? -1 : 1);
    return { teeth: clamp(p.teeth + off, 8, 40), layer: p.layer };
  });
  const spec: Spec = {
    drv: z(), tgt: z(), mids, y: (r() - 0.5) * 0.1,
    rpm: [40, 60, 80, 90, 120][int(r, 0, 4)]! * (r() < 0.25 ? -1 : 1),
    decoys,
  };
  const built = build(id, spec, r);
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

/** The puzzle for level n and a seed: the valid candidate whose measured difficulty is nearest the level's target. */
export function randomLevel(n: number, seed: number): Level {
  const level = clampLevel(n);
  const id = `t${seed >>> 0}`;
  const r = mulberry32(seed);
  r();
  const want = targetScore(level);
  let best: { level: Level; gap: number } | null = null;
  for (let i = 0, found = 0; i < ATTEMPTS && found < CANDIDATES; i++) {
    const c = attempt(level, id, r);
    if (!c) continue;
    found++;
    const gap = Math.abs(difficultyOf(c) - want);
    if (!best || gap < best.gap) best = { level: c, gap };
  }
  // No valid candidate in the tries: the same seed one step easier, down to the known-good level.
  return best?.level ?? (level > 1 ? randomLevel(level - 1, seed) : fallbackLevel(id));
}

/**
 * A puzzle seed carries what it is in the top 5 bits and 27 random bits below. Top bits 0 is a plain tinker seed (a daily or
 * an old shared code); 1..20 is campaign level n; 21..24 is a Random level at easy, medium, hard or expert.
 */
const LOW_BITS = 27;
const LOW_MASK = 2 ** LOW_BITS - 1;
const KIND_MAX = CAMPAIGN + DIFFICULTIES.length;

/** A kind in 1..24: a campaign level number, or CAMPAIGN + 1 + the difficulty's index. */
export const kindOfDifficulty = (d: Difficulty): number => CAMPAIGN + 1 + DIFFICULTIES.indexOf(d);

export const packSeed = (kind: number, low: number): number => (clamp(Math.round(kind), 1, KIND_MAX) * 2 ** LOW_BITS + (low & LOW_MASK)) >>> 0;

/** The kind a seed carries (0 for a plain tinker seed) and its 27 low bits. */
export const unpackSeed = (seed: number): { kind: number; low: number } => ({ kind: Math.floor((seed >>> 0) / 2 ** LOW_BITS), low: (seed >>> 0) & LOW_MASK });

/** A fresh seed of a kind; `rnd` is Math.random at run time. */
export const freshSeed = (kind: number, rnd: () => number = Math.random): number => packSeed(kind, Math.floor(rnd() * 2 ** LOW_BITS));

/** The level number a kind plays at: itself in the campaign, the difficulty's level for a Random level. */
export const levelOfKind = (kind: number): number => (kind <= CAMPAIGN ? kind : DIFFICULTY_LEVEL[DIFFICULTIES[kind - CAMPAIGN - 1] ?? 'expert']);

/** Opens a puzzle code's seed: the generated puzzle it carries, else the plain tinker puzzle it always was. */
export function puzzleFor(seed: number, plain: (seed: number) => Level): Level {
  const { kind } = unpackSeed(seed);
  return kind === 0 || kind > KIND_MAX ? plain(seed) : randomLevel(levelOfKind(kind), seed);
}
