import { describe, expect, it } from 'vitest';
import { LEVELS, type Level } from '../../src/levels';
import { createClock } from '../../src/flow';
import { dailySeed, tinkerLevel } from '../../src/tinker';
import { loadRelaxed, outcomeOf, parFor, saveRelaxed, timerView } from '../../src/timer';

const tinkers = Array.from({ length: 80 }, (_, i) => tinkerLevel(dailySeed(new Date(2026, 0, 1 + i))));
const place = (l: Level) => Object.keys(l.solution).length;

describe('parFor', () => {
  it('is a whole number of seconds in steps of five for every level and 80 dailies', () => {
    for (const l of [...LEVELS, ...tinkers]) {
      const p = parFor(l);
      expect(Number.isInteger(p) && p % 5 === 0 && p > 0, l.id).toBe(true);
    }
  });

  it('is generous on level 1: at least 90 s, and the most time per placed gear of any level', () => {
    const l1 = LEVELS[0]!;
    expect(parFor(l1)).toBeGreaterThanOrEqual(90);
    for (const l of LEVELS.slice(1)) expect(parFor(l1) / place(l1), l.id).toBeGreaterThanOrEqual(parFor(l) / place(l));
  });

  it('never drops when a level gets harder: an extra decoy, a compound pair or a gear to place', () => {
    for (const l of [...LEVELS, ...tinkers]) {
      const base = parFor(l);
      expect(parFor({ ...l, tray: [...l.tray, { id: 'extra', teeth: 20, layer: 0 }] }), `${l.id} decoy`).toBeGreaterThanOrEqual(base);
      const [gear] = Object.entries(l.solution)[0]!;
      const axle = l.solution[gear]!;
      const withPair = { ...l, tray: [...l.tray, { id: 'extra', teeth: 20, layer: 1 }], solution: { ...l.solution, extra: axle } };
      expect(parFor(withPair), `${l.id} placed`).toBeGreaterThanOrEqual(base);
    }
  });

  it('scales with difficulty: the hardest shipped level gets more than level 1, a long compound daily more than a short one', () => {
    expect(Math.max(...LEVELS.map(parFor))).toBeGreaterThan(parFor(LEVELS[0]!));
    const sorted = [...tinkers].sort((a, b) => place(a) - place(b));
    expect(parFor(sorted.at(-1)!)).toBeGreaterThan(parFor(sorted[0]!));
  });

  it('only looks at the level, so a shared puzzle and the daily with the same seed agree', () => {
    expect(parFor(tinkerLevel(424242))).toBe(parFor(tinkerLevel(424242)));
  });
});

describe('outcomeOf and timerView', () => {
  it('passes exactly at par and is over a hair after', () => {
    expect(outcomeOf(89.999, 90)).toBe('pass');
    expect(outcomeOf(90, 90)).toBe('pass');
    expect(outcomeOf(90.001, 90)).toBe('over');
  });

  it('counts down whole seconds to zero at par, then counts the seconds over', () => {
    expect(timerView(0, 90)).toEqual({ left: 90, over: 0, fraction: 1 });
    expect(timerView(30.2, 90)).toEqual({ left: 60, over: 0, fraction: 60 / 90 });
    expect(timerView(90, 90)).toEqual({ left: 0, over: 0, fraction: 0 });
    expect(timerView(95.7, 90)).toEqual({ left: 0, over: 5, fraction: 0 });
  });
});

describe('relaxed setting', () => {
  const store = (raw: string | null) => ({ getItem: () => raw });
  it('defaults to the timer on', () => {
    expect(loadRelaxed(null)).toBe(false);
    expect(loadRelaxed(store(null))).toBe(false);
    expect(loadRelaxed(store('garbage'))).toBe(false);
    expect(
      loadRelaxed({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(false);
  });

  it('round trips through saveRelaxed and never throws on a full or blocked store', () => {
    const data: Record<string, string> = {};
    const s = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    saveRelaxed(s, true);
    expect(loadRelaxed(s)).toBe(true);
    saveRelaxed(s, false);
    expect(loadRelaxed(s)).toBe(false);
    expect(() =>
      saveRelaxed(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        true,
      ),
    ).not.toThrow();
    expect(() => saveRelaxed(null, true)).not.toThrow();
  });
});

describe('clock.advance (test hook)', () => {
  it('adds seconds to the level time without needing a running frame', () => {
    const c = createClock();
    c.advance(12.5);
    expect(c.seconds).toBe(12.5);
    c.tick(1000, true);
    c.tick(2000, true);
    expect(c.seconds).toBe(13.5);
    c.reset();
    expect(c.seconds).toBe(0);
  });
});
