import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { CAMPAIGN } from '../../src/random';
import { carried, loadRun, nextIndex, reached, saveRun, solvedLevel, startRun, won } from '../../src/run';
import { PANEL_ZONE, layout, menuAnchor, panelToWorld } from '../../src/ui';
import { inZone } from '../../src/seat';

const store = (raw: string | null) => ({ getItem: (k: string) => (k === 'chronogrip.run.v1' ? raw : null) });

describe('a run', () => {
  it('starts with nothing cleared and no time', () => {
    expect(startRun('medium')).toEqual({ stage: 'medium', cleared: 0, ms: 0 });
  });

  it('a solve adds one cleared and its time; carried time adds time only', () => {
    let r = startRun('medium');
    r = solvedLevel(r, 41.26);
    expect(r).toEqual({ stage: 'medium', cleared: 1, ms: 41260 });
    r = carried(r, 10.5);
    expect(r).toEqual({ stage: 'medium', cleared: 1, ms: 51760 });
    r = solvedLevel(r, 0.0004);
    expect(r.cleared).toBe(2);
    expect(r.ms).toBe(51760);
    expect(solvedLevel(r, -5).ms, 'a negative time adds nothing').toBe(r.ms);
  });

  it('is won at level 20; the next level follows the cleared count; the total is the score', () => {
    let r = startRun('medium');
    expect(nextIndex(r)).toBe(0);
    for (let i = 0; i < CAMPAIGN - 1; i++) r = solvedLevel(r, 10);
    expect(won(r)).toBe(false);
    expect(nextIndex(r)).toBe(CAMPAIGN - 1);
    r = solvedLevel(r, 10);
    expect(won(r)).toBe(true);
    expect(r.ms).toBe(CAMPAIGN * 10_000);
  });

  it('a run that ends early reached the level it was on, with the time on it counted in', () => {
    let r = solvedLevel(solvedLevel(startRun('medium'), 30), 45);
    expect(reached(r, 12.3)).toEqual({ level: 3, ms: 87300 });
    expect(reached(startRun('medium'), 5)).toEqual({ level: 1, ms: 5000 });
    expect(reached(carried(startRun('medium'), 50), 0)).toEqual({ level: 1, ms: 50000 });
    for (let i = 0; i < 25; i++) r = solvedLevel(r, 1);
    expect(reached(r, 0).level, 'never past level 20').toBe(CAMPAIGN);
  });
});

describe('the saved run', () => {
  it('round trips through storage with its stage, and forgets with null', () => {
    const data: Record<string, string> = {};
    const mem = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
    const r = solvedLevel(startRun('medium'), 12);
    saveRun(mem, r);
    expect(Object.keys(data)).toEqual(['chronogrip.run.v1']);
    expect(loadRun(mem)).toEqual(r);
    saveRun(mem, null);
    expect(loadRun(mem)).toBeNull();
  });

  it.each([
    ['nothing', null],
    ['junk', 'not json'],
    ['an array', '[]'],
    ['a fraction cleared', '{"stage":"easy","cleared":1.5,"ms":5}'],
    ['negative cleared', '{"stage":"easy","cleared":-1,"ms":5}'],
    ['a finished stage (20 cleared)', '{"stage":"easy","cleared":20,"ms":5}'],
    ['a negative time', '{"stage":"easy","cleared":1,"ms":-5}'],
    ['a time that is not a number', '{"stage":"easy","cleared":1,"ms":"x"}'],
    ['a run saved before the stages (no stage)', '{"cleared":3,"ms":5}'],
    ['an unknown stage', '{"stage":"insane","cleared":3,"ms":5}'],
  ])('loads %s as no run', (_n, raw) => {
    expect(loadRun(store(raw))).toBeNull();
  });

  it('never throws on broken storage', () => {
    const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    expect(loadRun(bad)).toBeNull();
    expect(() => saveRun(bad, startRun('medium'))).not.toThrow();
    expect(() => saveRun(bad, null)).not.toThrow();
    expect(loadRun(null)).toBeNull();
  });
});

describe('the pause card in XR', () => {
  it('hangs low enough that every button, edge to edge, is in the panel zone and reach', () => {
    const l = layout('paused', { level: 0, levels: 21 });
    for (const level of LEVELS) {
      const a = menuAnchor(l, level);
      for (const b of l.buttons) {
        for (const x of [b.x - b.w / 2, b.x, b.x + b.w / 2]) {
          for (const y of [b.y - b.h / 2, b.y + b.h / 2]) {
            const w = panelToWorld(a, [x, y, 0]);
            expect(inZone(w, PANEL_ZONE), `${level.id} ${b.id}`).toBe(true);
            expect(Math.hypot(...w)).toBeLessThanOrEqual(0.6);
          }
        }
      }
    }
  });
});
