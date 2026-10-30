import { checkLevel, type Level } from './levels';

/**
 * The escapement regulator: a knob the player twists (wrist roll in XR, a horizontal mouse drag on desktop)
 * until the tick rate sits in the level's target band for a moment. Setting is 0..1 across the knob's travel.
 */
export type Quat = readonly [number, number, number, number];

/** Slowest and fastest tick rate, ticks per second. */
export const RATE_MIN = 1;
export const RATE_MAX = 5;
/** Wrist roll that sweeps the knob's whole travel, radians (160 degrees); the knob turns one to one with the wrist. */
export const TWIST_FULL = (160 * Math.PI) / 180;
/** Horizontal mouse drag that sweeps the whole travel, pixels. */
export const DRAG_FULL_PX = 600;
/** In band: within this fraction of the target rate, either side. */
export const BAND = 0.1;
/** The rate must stay in band this long to count, so a twist passing through does not. */
export const DWELL_S = 0.8;
/** Each level starts this far (in setting) from its target, on the side with room. */
const START_OFFSET = 0.35;
/** Escapement gear rpm per tick per second: 60 rpm ticks 3 times a second. */
const RPM_PER_TICK = 20;

const clamp01 = (s: number) => Math.min(1, Math.max(0, s));

/** Tick rate of a setting; exponential, so the band is equally wide in setting at every rate. */
export const rateOf = (setting: number) => RATE_MIN * (RATE_MAX / RATE_MIN) ** clamp01(setting);
export const settingOf = (rate: number) => Math.log(rate / RATE_MIN) / Math.log(RATE_MAX / RATE_MIN);

/** The setting after a twist (radians, clockwise positive), clamped to the knob's travel. */
export const turn = (setting: number, twist: number) => (Number.isFinite(twist) ? clamp01(setting + twist / TWIST_FULL) : setting);
/** A mouse drag in pixels as a twist: right is clockwise. */
export const dragTwist = (px: number) => (px * TWIST_FULL) / DRAG_FULL_PX;

export const inBand = (rate: number, target: number) => Math.abs(rate / target - 1) <= BAND;

/** The level's target: the solved train's escapement gear speed, as ticks per second. */
export function targetRate(level: Level): number {
  const spin = checkLevel(level, level.solution).spins[level.escapement.gear];
  return Math.abs(typeof spin === 'number' ? spin : 0) / RPM_PER_TICK;
}

/** Where the knob starts: clearly off the target, below it when there is room, else above. */
export function startSetting(level: Level): number {
  const t = settingOf(targetRate(level));
  return t >= 0.5 ? t - START_OFFSET : t + START_OFFSET;
}

/**
 * Wrist roll from q0 to q (world orientations of the WebXR wrist joint, [x, y, z, w]): the twist part of the
 * relative rotation about the fingers (wrist -Z), clockwise seen along the fingers positive; swing is ignored.
 */
export function twistOf(q0: Quat, q: Quat): number {
  const [ax, ay, az, aw] = [-q0[0], -q0[1], -q0[2], q0[3]];
  const [bx, by, bz, bw] = q;
  let z = aw * bz + ax * by - ay * bx + az * bw;
  let w = aw * bw - ax * bx - ay * by - az * bz;
  if (w < 0) [z, w] = [-z, -w];
  return -2 * Math.atan2(z, w);
}

/** The regulator during one level: turned by twists, ticked every frame; calibrated once held in band for DWELL_S. */
export function createRegulator(target: number, start: number) {
  let setting = clamp01(start);
  let held = 0;
  let phase = 0;
  let done = false;
  return {
    target,
    get setting() {
      return setting;
    },
    get rate() {
      return rateOf(setting);
    },
    get inBand() {
      return inBand(rateOf(setting), target);
    },
    get calibrated() {
      return done;
    },
    /** Dwell progress, 0..1. */
    get hold() {
      return done ? 1 : Math.min(1, held / DWELL_S);
    },
    /** Ticks so far: the balance passes its centre at every whole number. */
    get phase() {
      return phase;
    },
    turn(twist: number) {
      if (!done) setting = turn(setting, twist);
    },
    /** Advances dt seconds; returns whether it is calibrated. */
    tick(dt: number): boolean {
      phase += rateOf(setting) * dt;
      if (!done) {
        held = inBand(rateOf(setting), target) ? held + dt : 0;
        done = held >= DWELL_S;
      }
      return done;
    },
  };
}

export type Regulator = ReturnType<typeof createRegulator>;
