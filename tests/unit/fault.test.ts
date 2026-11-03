import { describe, expect, it } from 'vitest';
import { FAULT_WORDS, SHAKE, SHAKE_MS, faultOf, faultText, shakeSpin, shakeTilt } from '../../src/fault';
import { LEVELS, checkLevel, type Level } from '../../src/levels';
import { dailySeed, tinkerLevel } from '../../src/tinker';

const [L1, L2, , L4, L5] = LEVELS as [Level, Level, Level, Level, Level];
const at = (level: Level, placements: Record<string, string>) => faultOf(level, checkLevel(level, placements).spins);

describe('faultOf', () => {
  it('is clear on an empty board and on every solution, dailies included', () => {
    for (const level of [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 10, 3)))]) {
      expect(at(level, {}), level.id).toEqual({ jammed: [], wrongWay: false });
      expect(at(level, level.solution), level.id).toEqual({ jammed: [], wrongWay: false });
    }
  });

  it('lists every jammed gear, sorted: the jam trap on level 4 locks the driver, its neighbour and the new gear', () => {
    expect(at(L4, { t2: 'tr' })).toEqual({ jammed: ['drv', 'e', 't2'], wrongWay: false });
    // With the whole solution in, the target is in the locked train too.
    expect(at(L4, { ...L4.solution, t2: 'tr' }).jammed).toEqual(['drv', 'e', 't1', 't2', 'tgt']);
    expect(at(L5, { ...L5.solution, x: 's' }).jammed).toContain('x');
  });

  it('a jam clears the moment the gear comes off', () => {
    expect(at(L4, { t2: 'tr' }).jammed.length).toBeGreaterThan(0);
    expect(at(L4, {}).jammed).toEqual([]);
  });

  it('is wrong way when the target turns at the right speed against the arrow: level 2 with the big idler on mid', () => {
    const spins = checkLevel(L2, { big: 'mid' }).spins;
    expect(spins.tgt).toBe(60); // target is -60
    expect(faultOf(L2, spins)).toEqual({ jammed: [], wrongWay: true });
  });

  it('wrong way needs the speed right: a wrong speed or a still target is just unmatched', () => {
    const t = L2.target; // -60 rpm, tolerance 1
    const only = (tgt: number | 'jammed') => faultOf(L2, { drv: 60, tgt });
    expect(only(60).wrongWay).toBe(true);
    expect(only(60 + 0.9 * t.tolerance).wrongWay).toBe(true);
    expect(only(60 + 1.5 * t.tolerance).wrongWay).toBe(false);
    expect(only(30).wrongWay).toBe(false);
    expect(only(0).wrongWay).toBe(false);
    expect(only(-60).wrongWay).toBe(false); // matched
    expect(only('jammed').wrongWay).toBe(false);
    expect(faultOf(L1, { drv: 60 }).wrongWay).toBe(false); // target not in the train
  });
});

describe('faultText', () => {
  it('says it in plain words: a jam first, then the wrong way, else nothing', () => {
    expect(faultText({ jammed: ['a'], wrongWay: false })).toBe(FAULT_WORDS.jammed.join(' '));
    expect(faultText({ jammed: [], wrongWay: true })).toBe(FAULT_WORDS.wrongWay.join(' '));
    expect(faultText({ jammed: [], wrongWay: false })).toBeNull();
    expect(FAULT_WORDS.jammed.join(' ')).toMatch(/^Jammed: /);
    expect(FAULT_WORDS.wrongWay.join(' ')).toMatch(/wrong way.*gear/i);
  });
});

describe('the jam shake', () => {
  const samples = Array.from({ length: 2001 }, (_, i) => -100 + i * 0.5); // -100 ms .. 900 ms

  it('is still before it starts, at its end and after it, exactly', () => {
    for (const ms of [-100, -1, 0, SHAKE_MS, SHAKE_MS + 1, 900, 10_000, Infinity, -Infinity]) {
      expect(shakeSpin(ms), `spin at ${ms}`).toBe(0);
      expect(shakeTilt(ms), `tilt at ${ms}`).toBe(0);
    }
  });

  it('lasts about half a second', () => {
    expect(SHAKE_MS).toBeGreaterThanOrEqual(400);
    expect(SHAKE_MS).toBeLessThanOrEqual(700);
  });

  it('stays small: a few degrees, under 2 mm at the rim of the biggest gear', () => {
    expect(SHAKE.spin).toBeLessThanOrEqual((5 * Math.PI) / 180);
    expect(SHAKE.tilt).toBeLessThanOrEqual((3 * Math.PI) / 180);
    // A 40-tooth gear's tip radius at module 4 mm is 84 mm: the tilt lifts its rim by under 2 mm.
    expect(0.084 * Math.sin(SHAKE.tilt)).toBeLessThan(0.002);
    for (const ms of samples) {
      expect(Math.abs(shakeSpin(ms))).toBeLessThanOrEqual(SHAKE.spin);
      expect(Math.abs(shakeTilt(ms))).toBeLessThanOrEqual(SHAKE.tilt);
    }
  });

  it('really shakes early on and dies away: the late swings are smaller than the early ones', () => {
    const peak = (from: number, to: number, f: (ms: number) => number) => Math.max(...samples.filter((ms) => ms >= from && ms < to).map((ms) => Math.abs(f(ms))));
    expect(peak(0, 120, shakeSpin)).toBeGreaterThan(0.5 * SHAKE.spin);
    expect(peak(0, 120, shakeTilt)).toBeGreaterThan(0.5 * SHAKE.tilt);
    expect(peak(SHAKE_MS * 0.8, SHAKE_MS, shakeSpin)).toBeLessThan(0.1 * SHAKE.spin);
    expect(peak(SHAKE_MS * 0.5, SHAKE_MS, shakeSpin)).toBeLessThan(peak(0, SHAKE_MS * 0.5, shakeSpin));
    // It swings both ways, a rattle, not a lean.
    expect(samples.some((ms) => shakeSpin(ms) > 0.3 * SHAKE.spin)).toBe(true);
    expect(samples.some((ms) => shakeSpin(ms) < -0.3 * SHAKE.spin)).toBe(true);
  });

  it('is finite for any input', () => {
    for (const ms of [NaN, 1e-9, 1e12, -1e12]) {
      expect(Number.isFinite(shakeSpin(ms))).toBe(true);
      expect(Number.isFinite(shakeTilt(ms))).toBe(true);
    }
  });
});
