import { describe, expect, it } from 'vitest';
import { GHOST_PERIOD_S, ghostAt } from '../../src/ghost';
import { easeOut, tweenAt } from '../../src/tween';

const from = [0, 0.2] as const;
const to = [0.05, 0] as const;

describe('ghost hand loop', () => {
  it('starts open over the first gear, pinches it, carries it to the axle and lets go', () => {
    const start = ghostAt(0.6, from, to);
    expect(start.pos[0]).toBeCloseTo(from[0]);
    expect(start.pos[1]).toBeCloseTo(from[1]);
    expect(start.carrying).toBe(false);

    const carry = ghostAt(GHOST_PERIOD_S * 0.45, from, to);
    expect(carry.pinch).toBe(1);
    expect(carry.carrying).toBe(true);
    expect(carry.pos[2]).toBeGreaterThan(start.pos[2]); // lifted while carried

    const drop = ghostAt(GHOST_PERIOD_S * 0.66, from, to);
    expect(drop.pos[0]).toBeCloseTo(to[0]);
    expect(drop.pos[1]).toBeCloseTo(to[1]);
    expect(drop.pinch).toBe(0);
    expect(drop.carrying).toBe(false);
  });

  it('loops with the period and fades in and out', () => {
    expect(ghostAt(0, from, to).opacity).toBe(0);
    expect(ghostAt(GHOST_PERIOD_S * 0.45, from, to).opacity).toBe(1);
    expect(ghostAt(GHOST_PERIOD_S * 0.98, from, to).opacity).toBe(0);
    expect(ghostAt(1.3 + GHOST_PERIOD_S, from, to)).toEqual(ghostAt(1.3, from, to));
  });
});

describe('snap tween', () => {
  it('eases out and clamps', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('moves from start to end over the duration and reports done', () => {
    const a = [0, 0, 0] as const;
    const b = [1, 2, 3] as const;
    expect(tweenAt(a, b, 0, 200)).toEqual({ pos: [0, 0, 0], done: false });
    const mid = tweenAt(a, b, 100, 200);
    expect(mid.pos[0]).toBeGreaterThan(0.5);
    expect(mid.done).toBe(false);
    expect(tweenAt(a, b, 250, 200)).toEqual({ pos: [1, 2, 3], done: true });
  });
});
