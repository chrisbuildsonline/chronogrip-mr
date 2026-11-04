import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { CAMPAIGN } from '../../src/random';
import { addEntry, emptyScores, qualifies, type Entry } from '../../src/scores';
import { carried, clearedWords, loadRun, nextIndex, resultOf, saveRun, solvedLevel, startRun, won } from '../../src/run';
import { PANEL_ZONE, layout, menuAnchor, panelToWorld } from '../../src/ui';
import { inZone } from '../../src/seat';

const store = (raw: string | null) => ({ getItem: (k: string) => (k === 'chronogrip.run.v1' ? raw : null) });

describe('a run', () => {
  it('starts with nothing cleared and no time, on the board it scores on', () => {
    expect(startRun('campaign')).toEqual({ kind: 'campaign', cleared: 0, ms: 0 });
    expect(startRun('random-hard')).toEqual({ kind: 'random-hard', cleared: 0, ms: 0 });
  });

  it('a solve adds one cleared and its time; carried time adds time only', () => {
    let r = startRun('campaign');
    r = solvedLevel(r, 41.26);
    expect(r).toEqual({ kind: 'campaign', cleared: 1, ms: 41260 });
    r = carried(r, 10.5);
    expect(r).toEqual({ kind: 'campaign', cleared: 1, ms: 51760 });
    r = solvedLevel(r, 0.0004);
    expect(r.cleared).toBe(2);
    expect(r.ms).toBe(51760);
    expect(solvedLevel(r, -5).ms, 'a negative time adds nothing').toBe(r.ms);
  });

  it('the campaign is won at level 20, a Random run never; the next campaign level follows the cleared count', () => {
    let r = startRun('campaign');
    expect(nextIndex(r)).toBe(0);
    for (let i = 0; i < CAMPAIGN - 1; i++) r = solvedLevel(r, 10);
    expect(won(r)).toBe(false);
    expect(nextIndex(r)).toBe(CAMPAIGN - 1);
    r = solvedLevel(r, 10);
    expect(won(r)).toBe(true);
    expect(r.ms).toBe(CAMPAIGN * 10_000);
    let rnd = startRun('random-expert');
    for (let i = 0; i < 40; i++) rnd = solvedLevel(rnd, 5);
    expect(won(rnd)).toBe(false);
  });

  it('the result is the levels cleared and the total time plus the time on the level it ended on', () => {
    let r = startRun('campaign');
    r = solvedLevel(solvedLevel(r, 30), 45);
    expect(resultOf(r, 12.3)).toEqual({ board: 'campaign', cleared: 2, ms: 87300 });
    expect(resultOf(r, 0)).toEqual({ board: 'campaign', cleared: 2, ms: 75000 }); // won, or given up the instant a level began
    expect(resultOf(startRun('random-easy'), 99), 'a run that cleared nothing scores nothing, so there is no prompt').toBeNull();
    expect(resultOf(carried(startRun('campaign'), 50), 50), 'time alone is not a score').toBeNull();
  });

  it('words its result', () => {
    expect([clearedWords('campaign', 1), clearedWords('campaign', 3), clearedWords('random-hard', 1), clearedWords('random-hard', 7)]).toEqual(['1 level', '3 levels', '1 puzzle', '7 puzzles']);
  });
});

describe('ranking runs on the boards', () => {
  const run = (cleared: number, ms: number, name: string): Entry => ({ name, cleared, ms, date: '2026-11-04' });
  it('more cleared beats a faster run that cleared less, and a tie on cleared goes to the lower time', () => {
    let s = emptyScores();
    for (const e of [run(3, 20_000, 'AAA'), run(5, 300_000, 'BBB'), run(5, 200_000, 'CCC'), run(20, 900_000, 'DDD')]) s = addEntry(s, 'campaign', e);
    expect(s.boards.campaign!.map((e) => e.name)).toEqual(['DDD', 'CCC', 'BBB', 'AAA']);
    expect(qualifies(s, 'campaign', run(5, 250_000, 'EEE'))).toEqual({ ok: true, rank: 3 });
  });
  it('a result is an entry the board accepts: what resultOf gives, with a name and a day', () => {
    const r = resultOf(solvedLevel(startRun('random-medium'), 33), 4)!;
    const s = addEntry(emptyScores(), r.board, { name: 'ZED', date: '2026-11-04', cleared: r.cleared, ms: r.ms });
    expect(s.boards['random-medium']).toEqual([{ name: 'ZED', date: '2026-11-04', cleared: 1, ms: 37000 }]);
  });
});

describe('the saved run', () => {
  it('round trips through storage, and forgets with null', () => {
    const data: Record<string, string> = {};
    const mem = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
    const r = solvedLevel(startRun('random-hard'), 12);
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
    ['a board that does not exist', '{"kind":"l1","cleared":2,"ms":5}'],
    ['the old random board', '{"kind":"random","cleared":2,"ms":5}'],
    ['a fraction cleared', '{"kind":"campaign","cleared":1.5,"ms":5}'],
    ['negative cleared', '{"kind":"campaign","cleared":-1,"ms":5}'],
    ['a finished campaign (20 cleared)', '{"kind":"campaign","cleared":20,"ms":5}'],
    ['a negative time', '{"kind":"campaign","cleared":1,"ms":-5}'],
    ['a time that is not a number', '{"kind":"campaign","cleared":1,"ms":"x"}'],
  ])('loads %s as no run', (_n, raw) => {
    expect(loadRun(store(raw))).toBeNull();
  });

  it('never throws on broken storage', () => {
    const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    expect(loadRun(bad)).toBeNull();
    expect(() => saveRun(bad, startRun('campaign'))).not.toThrow();
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
