/**
 * The three stages: one table. Each stage is 20 levels climbing a curve on the generator's global difficulty scale
 * (0 = the gentlest puzzle src/random.ts makes, 1 = the hardest it can); the curves overlap. Par time follows the curve too.
 * This file imports nothing, so the generator, the timer and the menus can all read it.
 */
export type StageId = 'easy' | 'medium' | 'hard';
export type BackdropOf = 'c1' | 'c2' | 'c3';
/** The music themes (src/music.ts): the gentle music box, the mallet and plucks of the atelier, the clockwork ostinato. */
export type ThemeId = 'box' | 'marimba' | 'clockwork';

/** Levels in a stage. */
export const LEVELS_PER_STAGE = 20;

/** `curve`: [level, difficulty] breakpoints, linear between them (a jump between neighbouring levels is allowed). */
export const STAGES: readonly { id: StageId; name: string; hint: string; backdrop: BackdropOf; theme: ThemeId; curve: readonly (readonly [number, number])[] }[] = [
  { id: 'easy', name: 'Easy', hint: 'A gentle climb', backdrop: 'c2', theme: 'box', curve: [[1, 0.0], [20, 0.4]] },
  { id: 'medium', name: 'Medium', hint: 'Starts where Easy ends', backdrop: 'c1', theme: 'marimba', curve: [[1, 0.3], [20, 0.7]] },
  { id: 'hard', name: 'Hard', hint: 'For clockmakers', backdrop: 'c3', theme: 'clockwork', curve: [[1, 0.6], [10, 0.8], [11, 0.85], [20, 1.0]] },
];

export const STAGE_IDS: readonly StageId[] = STAGES.map((s) => s.id);
export const stageOf = (id: StageId) => STAGES.find((s) => s.id === id) ?? STAGES[0]!;
export const stageIndex = (id: StageId) => Math.max(0, STAGE_IDS.indexOf(id));
/** The backdrop the menus show. */
export const MENU_BACKDROP: BackdropOf = 'c2';
/** The music the menus play: Easy's. */
export const MENU_THEME: ThemeId = 'box';

/** The measured score the global scale spans: `scoreAt(0)` to `scoreAt(1)`, linear. */
export const SCORE_MIN = 1.5;
export const SCORE_MAX = 33;
export const clampD = (d: number): number => (Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0);
export const scoreAt = (d: number): number => SCORE_MIN + (SCORE_MAX - SCORE_MIN) * clampD(d);

/** A level number as a whole number in 1..20; anything else (NaN, a fraction, out of range) is pulled in. */
export const clampLevel = (n: number): number => (Number.isFinite(n) ? Math.min(LEVELS_PER_STAGE, Math.max(1, Math.round(n))) : 1);

/** The global difficulty of level n of a stage. */
export function dOf(stage: StageId, n: number): number {
  const c = stageOf(stage).curve;
  const l = clampLevel(n);
  for (let i = 1; i < c.length; i++) {
    const [l0, d0] = c[i - 1]!;
    const [l1, d1] = c[i]!;
    if (l <= l1) return d0 + ((d1 - d0) * (l - l0)) / (l1 - l0);
  }
  return c.at(-1)![1];
}

/** The measured score level n of a stage aims at. */
export const targetScore = (stage: StageId, n: number): number => scoreAt(dOf(stage, n));

/** Par time in seconds, a multiple of five, from the level's target score: 60 s plus 9 s a point, never under 120 s. Never drops within a stage. */
export const parOf = (stage: StageId, n: number): number => Math.ceil(Math.max(120, 60 + 9 * targetScore(stage, n)) / 5) * 5;

/** Seeds name a stage level by a kind 1..60 (stage index * 20 + level). */
export const KIND_MAX = STAGES.length * LEVELS_PER_STAGE;
export const kindOf = (stage: StageId, n: number): number => stageIndex(stage) * LEVELS_PER_STAGE + clampLevel(n);
export function stageLevelOfKind(kind: number): { stage: StageId; level: number } {
  const k = Math.min(KIND_MAX, Math.max(1, Math.round(kind))) - 1;
  return { stage: STAGES[Math.floor(k / LEVELS_PER_STAGE)]!.id, level: (k % LEVELS_PER_STAGE) + 1 };
}
export const dOfKind = (kind: number): number => {
  const { stage, level } = stageLevelOfKind(kind);
  return dOf(stage, level);
};

/** The Random level picker reuses the table: each choice plays one stage level. */
export const RANDOM_PICK: Record<'easy' | 'medium' | 'hard' | 'expert', { stage: StageId; level: number }> = {
  easy: { stage: 'easy', level: 10 },
  medium: { stage: 'medium', level: 10 },
  hard: { stage: 'hard', level: 5 },
  expert: { stage: 'hard', level: 20 },
};
