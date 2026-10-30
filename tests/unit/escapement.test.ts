import { describe, expect, it } from 'vitest';
import {
  BAND,
  DWELL_S,
  RATE_MAX,
  RATE_MIN,
  TWIST_FULL,
  createRegulator,
  dragTwist,
  inBand,
  rateOf,
  settingOf,
  startSetting,
  targetRate,
  turn,
  twistOf,
  type Quat,
} from '../../src/escapement';
import { LEVELS } from '../../src/levels';

/** Rotation of `angle` radians about a unit axis, as [x, y, z, w]. */
const axisAngle = (axis: [number, number, number], angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};
/** Hamilton product a * b. */
const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const deg = Math.PI / 180;
/** The WebXR wrist frame: -Z points along the fingers. A clockwise roll (seen along the fingers) is +angle about -Z. */
const FINGERS: [number, number, number] = [0, 0, -1];

describe('regulator: setting to tick rate', () => {
  it('rises from the slowest to the fastest rate across the setting range, and clamps outside it', () => {
    expect(rateOf(0)).toBeCloseTo(RATE_MIN);
    expect(rateOf(1)).toBeCloseTo(RATE_MAX);
    expect(rateOf(-3)).toBeCloseTo(RATE_MIN);
    expect(rateOf(7)).toBeCloseTo(RATE_MAX);
    for (let s = 0; s < 1; s += 0.1) expect(rateOf(s + 0.1)).toBeGreaterThan(rateOf(s));
  });

  it('settingOf inverts rateOf', () => {
    for (const s of [0, 0.2, 0.5, 0.77, 1]) expect(settingOf(rateOf(s))).toBeCloseTo(s, 9);
  });

  it('the band is the same width in setting at every rate, so a slow and a fast target are equally easy to hold', () => {
    const width = (r: number) => settingOf(r * (1 + BAND)) - settingOf(r * (1 - BAND));
    expect(width(1.5)).toBeCloseTo(width(4), 9);
  });
});

describe('regulator: turning', () => {
  it('a twist of TWIST_FULL sweeps the whole range; turning clamps at both ends', () => {
    expect(turn(0, TWIST_FULL)).toBeCloseTo(1);
    expect(turn(0.5, TWIST_FULL / 4)).toBeCloseTo(0.75);
    expect(turn(0.9, 1)).toBe(1);
    expect(turn(0.1, -1)).toBe(0);
    expect(turn(0.5, Number.NaN)).toBe(0.5);
  });

  it('a mouse drag to the right turns it clockwise (up), to the left down', () => {
    expect(dragTwist(100)).toBeGreaterThan(0);
    expect(dragTwist(-100)).toBeLessThan(0);
    expect(dragTwist(0)).toBe(0);
  });

  it('twistOf reads the wrist roll about the fingers, clockwise positive', () => {
    const q0 = axisAngle([0, 1, 0], 0.7); // any starting hand orientation
    expect(twistOf(q0, q0)).toBeCloseTo(0, 9);
    expect(twistOf(q0, mul(q0, axisAngle(FINGERS, 30 * deg)))).toBeCloseTo(30 * deg, 9);
    expect(twistOf(q0, mul(q0, axisAngle(FINGERS, -45 * deg)))).toBeCloseTo(-45 * deg, 9);
  });

  it('twistOf ignores the hand tipping up or swinging sideways', () => {
    const q0 = axisAngle([1, 0, 0], -0.4);
    expect(twistOf(q0, mul(q0, axisAngle([1, 0, 0], 0.5)))).toBeCloseTo(0, 9);
    expect(twistOf(q0, mul(q0, axisAngle([0, 1, 0], 0.5)))).toBeCloseTo(0, 9);
    // A swing plus a roll: only the roll counts.
    const both = twistOf(q0, mul(q0, mul(axisAngle([1, 0, 0], 0.3), axisAngle(FINGERS, 20 * deg))));
    expect(both).toBeCloseTo(20 * deg, 9);
  });

  it('twistOf takes the short way round, and the sign of a quaternion does not matter', () => {
    const q0: Quat = [0, 0, 0, 1];
    const q = axisAngle(FINGERS, 10 * deg);
    expect(twistOf(q0, [-q[0], -q[1], -q[2], -q[3]])).toBeCloseTo(10 * deg, 9);
  });
});

describe('regulator: target band', () => {
  it('counts a rate within BAND of the target, either side', () => {
    expect(inBand(3, 3)).toBe(true);
    expect(inBand(3 * (1 + BAND * 0.99), 3)).toBe(true);
    expect(inBand(3 * (1 - BAND * 0.99), 3)).toBe(true);
    expect(inBand(3 * (1 + BAND * 1.01), 3)).toBe(false);
    expect(inBand(3 * (1 - BAND * 1.01), 3)).toBe(false);
  });

  for (const [i, level] of LEVELS.entries()) {
    it(`level ${i + 1}: the target band fits the range, and the start is clearly out of it, a comfortable twist away`, () => {
      const target = targetRate(level);
      expect(target * (1 - BAND)).toBeGreaterThan(RATE_MIN);
      expect(target * (1 + BAND)).toBeLessThan(RATE_MAX);
      const start = startSetting(level);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThanOrEqual(1);
      expect(Math.abs(rateOf(start) / target - 1)).toBeGreaterThan(3 * BAND);
      const twist = Math.abs(settingOf(target) - start) * TWIST_FULL;
      expect(twist).toBeGreaterThan(30 * deg);
      expect(twist).toBeLessThan(100 * deg);
    });
  }

  it('the target follows the solved train: a faster escapement gear wants a faster tick', () => {
    expect(targetRate(LEVELS[2]!)).toBeGreaterThan(targetRate(LEVELS[0]!)); // 90 rpm vs 60 rpm
  });
});

describe('regulator: dwell', () => {
  const FRAME = 1 / 60;
  const run = (r: ReturnType<typeof createRegulator>, seconds: number) => {
    for (let t = 0; t < seconds; t += FRAME) r.tick(FRAME);
  };

  it('starts out of band and uncalibrated', () => {
    const r = createRegulator(3, 0.2);
    expect(r.setting).toBe(0.2);
    expect(r.rate).toBeCloseTo(rateOf(0.2));
    expect(r.inBand).toBe(false);
    expect(r.calibrated).toBe(false);
  });

  it('calibrates only after the rate has stayed in band for DWELL_S', () => {
    const r = createRegulator(3, 0.2);
    r.turn((settingOf(3) - 0.2) * TWIST_FULL);
    expect(r.inBand).toBe(true);
    run(r, DWELL_S - 0.1);
    expect(r.calibrated).toBe(false);
    expect(r.hold).toBeGreaterThan(0.5);
    expect(r.hold).toBeLessThan(1);
    run(r, 0.15);
    expect(r.calibrated).toBe(true);
    expect(r.hold).toBe(1);
  });

  it('a twist that passes through the band does not count; leaving the band starts the dwell over', () => {
    const r = createRegulator(3, 0.2);
    const step = (settingOf(3) - 0.2) * TWIST_FULL;
    r.turn(step);
    run(r, DWELL_S / 2);
    r.turn(step); // well past the band
    expect(r.inBand).toBe(false);
    run(r, 0.05);
    expect(r.hold).toBe(0);
    r.turn(-step);
    run(r, DWELL_S - 0.1);
    expect(r.calibrated).toBe(false);
  });

  it('once calibrated the setting holds: turning does nothing, the escapement keeps ticking', () => {
    const r = createRegulator(3, settingOf(3));
    run(r, DWELL_S + 0.1);
    expect(r.calibrated).toBe(true);
    r.turn(1);
    expect(r.setting).toBeCloseTo(settingOf(3));
    const phase = r.phase;
    r.tick(0.5);
    expect(r.phase - phase).toBeCloseTo(0.5 * r.rate);
  });

  it('the tick phase advances at the current rate, one unit per tick', () => {
    const r = createRegulator(3, 0);
    r.tick(2);
    expect(r.phase).toBeCloseTo(2 * RATE_MIN);
  });
});
