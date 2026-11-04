import { beforeAll, describe, expect, it } from 'vitest';
import { parseLevel, type Level } from '../../src/levels';
import { CAMPAIGN, difficultyOf, randomLevel } from '../../src/random';
import { inComfortZone, interactables } from '../../src/seat';
import { LEVELS_PER_STAGE, MENU_BACKDROP, STAGES, dOf, parOf, scoreAt, targetScore, type StageId } from '../../src/stages';
import { valid } from '../../src/tinker';

const SEEDS = Array.from({ length: 50 }, (_, i) => (i + 1) * 7919);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ids = STAGES.map((s) => s.id);
const levels = Array.from({ length: LEVELS_PER_STAGE }, (_, i) => i + 1);

describe('the stage table', () => {
  it('has Easy, Medium and Hard with the hints, 20 levels each, the old campaign length', () => {
    expect(STAGES.map((s) => [s.name, s.hint])).toEqual([
      ['Easy', 'A gentle climb'],
      ['Medium', 'Starts where Easy ends'],
      ['Hard', 'For clockmakers'],
    ]);
    expect(LEVELS_PER_STAGE).toBe(20);
    expect(CAMPAIGN).toBe(20);
  });

  it('every curve stays on the 0..1 scale and never drops from one level to the next', () => {
    for (const id of ids) {
      const ds = levels.map((n) => dOf(id, n));
      ds.forEach((d, i) => {
        expect(d, `${id} l${i + 1}`).toBeGreaterThanOrEqual(0);
        expect(d, `${id} l${i + 1}`).toBeLessThanOrEqual(1);
        if (i) expect(d, `${id} l${i + 1}`).toBeGreaterThan(ds[i - 1]!);
      });
    }
  });

  it('the curves overlap and climb: Easy 0 to 0.4, Medium 0.3 to 0.7, Hard 0.6 to 1 with l11-l20 from 0.85', () => {
    expect([dOf('easy', 1), dOf('easy', 20)]).toEqual([0, 0.4]);
    expect([dOf('medium', 1), dOf('medium', 20)].map((d) => +d.toFixed(2))).toEqual([0.3, 0.7]);
    expect([dOf('hard', 1), dOf('hard', 20)]).toEqual([0.6, 1]);
    expect(dOf('hard', 11)).toBeCloseTo(0.85, 6);
    expect(dOf('medium', 1)).toBeLessThan(dOf('easy', 20));
    expect(dOf('hard', 1)).toBeLessThan(dOf('medium', 20));
  });

  it('par is a multiple of five, at least 120 s, never drops within a stage and climbs from stage to stage', () => {
    for (const id of ids) {
      const pars = levels.map((n) => parOf(id, n));
      pars.forEach((p, i) => {
        expect(p % 5).toBe(0);
        expect(p).toBeGreaterThanOrEqual(120);
        if (i) expect(p, `${id} l${i + 1}`).toBeGreaterThanOrEqual(pars[i - 1]!);
      });
    }
    expect(parOf('hard', 20)).toBeGreaterThan(parOf('medium', 20));
    expect(parOf('medium', 20)).toBeGreaterThan(parOf('easy', 20));
  });

  it('each stage has its own backdrop (Easy attic, Medium atelier, Hard movement) and the menus show the attic', () => {
    expect(STAGES.map((s) => s.backdrop)).toEqual(['c2', 'c1', 'c3']);
    expect(MENU_BACKDROP).toBe('c2');
  });
});

describe('the generated stages: 20 levels x 50 seeds each', () => {
  const batch = {} as Record<StageId, Level[][]>;
  beforeAll(() => {
    for (const id of ids) batch[id] = levels.map((n) => SEEDS.map((s) => randomLevel(dOf(id, n), s)));
  }, 900_000);

  it('every level passes the level rules, valid() (perf bounds included) and the XR comfort cone, within the part budget', () => {
    for (const id of ids) {
      batch[id].forEach((row, i) => {
        for (const l of row) {
          const tag = `${id} l${i + 1} ${l.id}`;
          expect(() => parseLevel(l), tag).not.toThrow();
          expect(valid(l), `${tag} valid`).toBe(true);
          expect(interactables(l).every(inComfortZone), `${tag} comfort`).toBe(true);
          // The render budget (src/budget.ts) holds to 12 gears.
          expect(l.fixed.length + l.tray.length, `${tag} gears`).toBeLessThanOrEqual(12);
        }
      });
    }
  }, 60_000);

  it('the mean measured score rises strictly with the level inside every stage', () => {
    for (const id of ids) {
      const means = batch[id].map((row) => mean(row.map(difficultyOf)));
      means.forEach((m, i) => i && expect(m, `${id} l${i + 1} over l${i}`).toBeGreaterThan(means[i - 1]!));
    }
  }, 60_000);

  it('Easy l20 is easier than Hard l1 on average; every Hard l11-l20 mean tops every Medium mean', () => {
    const m = (id: StageId, n: number) => mean(batch[id][n - 1]!.map(difficultyOf));
    expect(m('easy', 20)).toBeLessThan(m('hard', 1));
    const topMedium = Math.max(...levels.map((n) => m('medium', n)));
    for (let n = 11; n <= 20; n++) expect(m('hard', n), `hard l${n}`).toBeGreaterThan(topMedium);
  }, 60_000);

  it('each level lands near its target score, and the stages overlap as the table says', () => {
    for (const id of ids) levels.forEach((n) => expect(Math.abs(mean(batch[id][n - 1]!.map(difficultyOf)) - targetScore(id, n)), `${id} l${n}`).toBeLessThan(2.5));
    expect(targetScore('easy', 1)).toBe(scoreAt(0));
  }, 60_000);
});
