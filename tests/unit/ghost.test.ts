import { describe, expect, it } from 'vitest';
import { GHOST_PERIOD_S, GHOST_TWIST_S, ghostAt, ghostTwistAt } from '../../src/ghost';
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

describe('ghost twist loop', () => {
  const knob = [0.14, -0.1] as const;

  it('comes down onto the knob, pinches, rolls the wrist the way to turn, lets go and fades', () => {
    const start = ghostTwistAt(GHOST_TWIST_S * 0.05, knob, 1);
    expect(start.pinch).toBe(0);
    expect(start.roll).toBe(0);
    const turned = ghostTwistAt(GHOST_TWIST_S * 0.65, knob, 1);
    expect(turned.pos[0]).toBeCloseTo(knob[0]);
    expect(turned.pos[1]).toBeCloseTo(knob[1]);
    expect(turned.pinch).toBe(1);
    expect(turned.roll).toBeGreaterThan(0.5);
    expect(turned.carrying).toBe(false);
    expect(ghostTwistAt(GHOST_TWIST_S * 0.65, knob, -1).roll).toBeCloseTo(-turned.roll!);
    const done = ghostTwistAt(GHOST_TWIST_S * 0.9, knob, 1);
    expect(done.pinch).toBe(0);
    expect(done.pos[2]).toBeGreaterThan(turned.pos[2]); // lifts off
  });

  it('loops with its period and fades in and out', () => {
    expect(ghostTwistAt(0, knob, 1).opacity).toBe(0);
    expect(ghostTwistAt(GHOST_TWIST_S * 0.5, knob, 1).opacity).toBe(1);
    expect(ghostTwistAt(GHOST_TWIST_S * 0.99, knob, 1).opacity).toBeLessThan(0.1);
    expect(ghostTwistAt(0.9 + GHOST_TWIST_S, knob, 1)).toEqual(ghostTwistAt(0.9, knob, 1));
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
