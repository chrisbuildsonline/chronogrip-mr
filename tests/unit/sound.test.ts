import { describe, expect, it } from 'vitest';
import { createSound, tickInterval, ticksBetween } from '../../src/sound';

describe('tickInterval', () => {
  it('is the seconds between ticks', () => {
    expect(tickInterval(1)).toBe(1);
    expect(tickInterval(4)).toBeCloseTo(0.25);
    expect(tickInterval(2.5)).toBeCloseTo(0.4);
  });
  it('is Infinity when there is no rate', () => {
    expect(tickInterval(0)).toBe(Infinity);
    expect(tickInterval(-3)).toBe(Infinity);
    expect(tickInterval(NaN)).toBe(Infinity);
  });
});

describe('ticksBetween', () => {
  it('counts each whole step of the phase', () => {
    expect(ticksBetween(0, 0.4)).toBe(0);
    expect(ticksBetween(0.9, 1.1)).toBe(1);
    expect(ticksBetween(0.9, 3.1)).toBe(3);
    expect(ticksBetween(2, 2)).toBe(0);
  });
  it('never counts backwards or non-numbers', () => {
    expect(ticksBetween(3.2, 1.1)).toBe(0);
    expect(ticksBetween(0, NaN)).toBe(0);
  });
});

describe('createSound before unlock', () => {
  it('reports no context and swallows every call', () => {
    const s = createSound();
    expect(s.state()).toBe('none');
    expect(() => {
      s.tick();
      s.click();
      s.grind();
      s.chime();
      s.setListener([0, 0, 0], [0, 0, -1], [0, 1, 0]);
      s.setSource([1, 0, 0]);
      s.suspend();
      s.resume();
    }).not.toThrow();
    expect(s.counts).toEqual({ ticks: 0, clicks: 0, grinds: 0, chimes: 0, notes: 0 });
  });
});

describe('the ticks after a solve fade out', () => {
  it('are full to 2 s, fall linearly to nothing at 3 s, and stay silent after', async () => {
    const { tickGain } = await import('../../src/sound');
    expect([0, 1, 2].map(tickGain)).toEqual([1, 1, 1]);
    expect(tickGain(2.5)).toBeCloseTo(0.5, 9);
    expect(tickGain(2.25)).toBeCloseTo(0.75, 9);
    expect(tickGain(3)).toBe(0);
    expect(tickGain(10)).toBe(0);
    for (let t = 0; t < 6; t += 0.1) expect(tickGain(t + 0.1)).toBeLessThanOrEqual(tickGain(t) + 1e-12);
  });
});
