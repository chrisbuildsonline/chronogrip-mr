import { describe, expect, it } from 'vitest';
import { BOB_M, KEN_PERIOD_S, ZOOM_MAX, ZOOM_MIN, bob, bobPeriod, kenBurns } from '../../src/motion';

const times = Array.from({ length: 400 }, (_, k) => k * 0.25);

describe('the cards float', () => {
  it('each card has its own period of 4 to 6 s, and they differ', () => {
    expect([0, 1, 2].map(bobPeriod)).toEqual([4, 5, 6]);
  });

  it('is a sine of a few millimetres, never more, that returns each period and starts the cards out of step', () => {
    for (const i of [0, 1, 2]) {
      const ys = times.map((t) => bob(t, i));
      expect(Math.max(...ys)).toBeLessThanOrEqual(BOB_M + 1e-12);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-BOB_M - 1e-12);
      expect(Math.max(...ys), 'it really moves').toBeGreaterThan(BOB_M * 0.9);
      expect(bob(3.3 + bobPeriod(i), i)).toBeCloseTo(bob(3.3, i), 9);
    }
    expect(new Set([0, 1, 2].map((i) => bob(0, i).toFixed(6))).size, 'phase-offset per card').toBe(3);
    expect(BOB_M).toBeLessThanOrEqual(0.005);
  });

  it('stands still with reduced motion', () => {
    for (const t of times) for (const i of [0, 1, 2]) expect(bob(t, i, true)).toBe(0);
  });
});

describe('the art pans and zooms (Ken Burns)', () => {
  const portrait = 0.75; // a card the image's own shape
  it('shows a window that never leaves the image, zoomed in between ZOOM_MIN and ZOOM_MAX, for a portrait and a landscape card', () => {
    for (const aspect of [0.72, portrait, 3.4]) {
      for (const i of [0, 1, 2]) {
        for (const t of times) {
          const w = kenBurns(t, i, aspect, 0.75);
          expect(w.offset.x).toBeGreaterThanOrEqual(-1e-9);
          expect(w.offset.y).toBeGreaterThanOrEqual(-1e-9);
          expect(w.offset.x + w.repeat.x).toBeLessThanOrEqual(1 + 1e-9);
          expect(w.offset.y + w.repeat.y).toBeLessThanOrEqual(1 + 1e-9);
          // The card's shape is kept: the window's width over its height, in the image's own units, is the card's aspect over the image's.
          expect(w.repeat.x / w.repeat.y, `${aspect}`).toBeCloseTo(aspect / 0.75, 6);
        }
      }
    }
    const zoomOf = (t: number) => 1 / kenBurns(t, 0, 0.75, 0.75).repeat.x;
    const zs = times.map(zoomOf);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(ZOOM_MIN - 1e-9);
    expect(Math.max(...zs)).toBeLessThanOrEqual(ZOOM_MAX + 1e-9);
    expect(Math.max(...zs) - Math.min(...zs), 'it breathes').toBeGreaterThan(0.05);
  });

  it('is a loop of 20 s, and pans a little (the offset really changes)', () => {
    expect(KEN_PERIOD_S).toBe(20);
    for (const i of [0, 1, 2]) {
      const a = kenBurns(7.7, i, 0.75, 0.75);
      const b = kenBurns(7.7 + KEN_PERIOD_S, i, 0.75, 0.75);
      expect(b.offset.x).toBeCloseTo(a.offset.x, 9);
      expect(b.offset.y).toBeCloseTo(a.offset.y, 9);
      expect(b.repeat.x).toBeCloseTo(a.repeat.x, 9);
    }
    const xs = times.map((t) => kenBurns(t, 0, 0.75, 0.75).offset.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.02);
  });

  it('keeps still and centred with reduced motion', () => {
    const first = kenBurns(0, 1, 0.75, 0.75, true);
    for (const t of times) expect(kenBurns(t, 1, 0.75, 0.75, true)).toEqual(first);
    expect(first.offset.x).toBeCloseTo((1 - first.repeat.x) / 2, 9);
    expect(first.offset.y).toBeCloseTo((1 - first.repeat.y) / 2, 9);
  });
});
