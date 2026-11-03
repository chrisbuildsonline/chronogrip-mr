import type { Level } from './levels';
import type { GearSpin } from './train';

/**
 * What is wrong with the train as placed, so the board can show it (design/DESIGN.md, "Faults"): the gears that lock
 * each other, and whether the target turns at the right speed but against the goal's arrow.
 */
export type Fault = { jammed: string[]; wrongWay: boolean };

export function faultOf(level: Level, spins: Readonly<Record<string, GearSpin>>): Fault {
  const jammed = Object.keys(spins)
    .filter((id) => spins[id] === 'jammed')
    .sort();
  const s = spins[level.target.gear];
  const { rpm, tolerance } = level.target;
  const wrongWay = typeof s === 'number' && s !== 0 && Math.sign(s) !== Math.sign(rpm) && Math.abs(Math.abs(s) - Math.abs(rpm)) <= tolerance;
  return { jammed, wrongWay };
}

/** The HUD's fault line: a red lead, then the plain fix in muted. */
export const FAULT_WORDS = {
  jammed: ['Jammed:', 'these gears lock up'],
  wrongWay: ['Wrong way:', 'add or remove a gear'],
} as const;

export const faultKind = (f: Fault): keyof typeof FAULT_WORDS | null => (f.jammed.length ? 'jammed' : f.wrongWay ? 'wrongWay' : null);

export const faultText = (f: Fault): string | null => {
  const k = faultKind(f);
  return k && FAULT_WORDS[k].join(' ');
};

/** The jam shake: how long it lasts, and its peak turn about the gear's axle and tilt across it, radians. */
export const SHAKE_MS = 500;
export const SHAKE = { spin: (3.5 * Math.PI) / 180, tilt: (1.2 * Math.PI) / 180 } as const;
/** Quadratic decay to exactly nothing at the end. */
const envelope = (ms: number) => (ms >= 0 && ms < SHAKE_MS ? (1 - ms / SHAKE_MS) ** 2 : 0);

/** The rattle about the gear's own axle `ms` after the shake starts: starts and ends at rest. */
export const shakeSpin = (ms: number) => {
  const e = envelope(ms);
  return e && SHAKE.spin * e * Math.sin((2 * Math.PI * 16 * ms) / 1000);
};
/** The wobble across the gear, out of step with the rattle, so it reads as a shudder, not a swing. */
export const shakeTilt = (ms: number) => {
  const e = envelope(ms);
  return e && SHAKE.tilt * e * Math.sin((2 * Math.PI * 11 * ms) / 1000);
};
