import { solveTrain, type Axle, type GearSpin, type PlacedGear } from './train';

/** A gear in the player's tray; its layer is baked in. */
export type LooseGear = { id: string; teeth: number; layer: number };
export type Level = {
  id: string;
  name: string;
  /** Metres, shared by every gear on the level. */
  module: number;
  /** Tray-local metres; the tray is 0.40 x 0.30 m centred on the origin. */
  axles: Axle[];
  /** Gears already on the board, includes the driver. */
  fixed: PlacedGear[];
  driver: string;
  /** Driver rpm, signed. */
  rpm: number;
  tray: LooseGear[];
  /** `gear` is fixed or tray; `rpm` is signed (sign = direction); `tolerance` is absolute rpm. */
  target: { gear: string; rpm: number; tolerance: number };
  /** The gear whose spin drives the tick. */
  escapement: { gear: string };
  /** Intended placement: tray gear id -> axle id. */
  solution: Record<string, string>;
};

/** Centre distance of two meshing gears of equal module. */
const mesh = (m: number, z1: number, z2: number) => (m * (z1 + z2)) / 2;
const g = (id: string, axle: string, teeth: number, layer = 0): PlacedGear => ({ id, axle, teeth, layer });
const t = (id: string, teeth: number, layer = 0): LooseGear => ({ id, teeth, layer });
const ax = (id: string, x: number, y: number): Axle => ({ id, x, y });

const M = 0.004;

// 1. One gap: a single idler bridges driver and target.
const l1: Level = {
  id: 'l1',
  name: 'Mind the gap',
  module: M,
  axles: [ax('a0', -0.1, 0), ax('a1', -0.1 + mesh(M, 20, 30), 0), ax('a2', -0.1 + 2 * mesh(M, 20, 30), 0)],
  fixed: [g('drv', 'a0', 20), g('tgt', 'a2', 20)],
  driver: 'drv',
  rpm: 60,
  tray: [t('br', 30)],
  target: { gear: 'tgt', rpm: 60, tolerance: 1 },
  escapement: { gear: 'tgt' },
  solution: { br: 'a1' },
};

// 2. Direction: two idlers turn the target against the driver; one big idler on `mid` is a shortcut that turns it the wrong way.
const s2 = mesh(M, 20, 20);
const l2: Level = {
  id: 'l2',
  name: 'Against the grain',
  module: M,
  axles: [
    ax('a0', -0.12, 0),
    ax('a1', -0.12 + s2, 0),
    ax('a2', -0.12 + 2 * s2, 0),
    ax('a3', -0.12 + 3 * s2, 0),
    ax('mid', -0.12 + mesh(M, 20, 40), 0),
  ],
  fixed: [g('drv', 'a0', 20), g('tgt', 'a3', 20)],
  driver: 'drv',
  rpm: 60,
  tray: [t('i1', 20), t('i2', 20), t('big', 40)],
  target: { gear: 'tgt', rpm: -60, tolerance: 1 },
  escapement: { gear: 'tgt' },
  solution: { i1: 'a1', i2: 'a2' },
};

// 3. Speed: a compound pair (40 + 30 teeth on axle b, layers 0 and 1) steps 60 rpm up to 90 rpm.
const l3: Level = {
  id: 'l3',
  name: 'Gearing up',
  module: M,
  axles: [ax('a0', -0.13, 0), ax('b', -0.13 + mesh(M, 20, 40), 0), ax('a2', -0.13 + mesh(M, 20, 40) + mesh(M, 30, 10), 0)],
  fixed: [g('drv', 'a0', 20), g('tgt', 'a2', 10, 1)],
  driver: 'drv',
  rpm: 60,
  tray: [t('p', 40), t('q', 30, 1), t('x', 30), t('y', 20, 1)],
  target: { gear: 'tgt', rpm: 90, tolerance: 1.5 },
  escapement: { gear: 'tgt' },
  solution: { p: 'b', q: 'b' },
};

// 4. Jam trap: t2 fits axle `tr`, meshing both driver and e, but 3 gears in a triangle is an odd loop.
const l4: Level = {
  id: 'l4',
  name: 'Odd one out',
  module: M,
  axles: [
    ax('a0', -0.12, 0),
    ax('a1', -0.12 + s2, 0),
    ax('a2', -0.12 + 2 * s2, 0),
    ax('a3', -0.12 + 3 * s2, 0),
    ax('tr', -0.12 + s2 / 2, Math.sqrt(s2 * s2 - (s2 / 2) ** 2)),
  ],
  fixed: [g('drv', 'a0', 20), g('e', 'a1', 20), g('tgt', 'a3', 20)],
  driver: 'drv',
  rpm: 60,
  tray: [t('t1', 20), t('t2', 20), t('t3', 30)],
  target: { gear: 'tgt', rpm: -60, tolerance: 1 },
  escapement: { gear: 'tgt' },
  solution: { t1: 'a2' },
};

// 5. Combo: compound pair p+q on b, then idler r flips the direction and q->r->tgt steps 80 rpm to -50.
// x on `s` meshes both q and r, a layer 1 odd loop.
const bx = -0.14 + mesh(M, 20, 40);
const by = -0.06;
const cy = by + mesh(M, 30, 20);
const sx = (() => {
  const r = mesh(M, 30, 20);
  const sy = (r * r - s2 * s2 + (cy - by) ** 2) / (2 * (cy - by));
  return { x: bx + Math.sqrt(r * r - sy * sy), y: by + sy };
})();
const l5: Level = {
  id: 'l5',
  name: 'Full movement',
  module: M,
  axles: [
    ax('a', -0.14, by),
    ax('b', bx, by),
    ax('c', bx, cy),
    ax('e', bx + mesh(M, 20, 24), cy),
    ax('s', sx.x, sx.y),
  ],
  fixed: [g('drv', 'a', 20), g('tgt', 'e', 24, 1)],
  driver: 'drv',
  rpm: 80,
  tray: [t('p', 40), t('q', 30, 1), t('r', 20, 1), t('x', 20, 1), t('w', 30)],
  target: { gear: 'tgt', rpm: -50, tolerance: 1 },
  escapement: { gear: 'q' },
  solution: { p: 'b', q: 'b', r: 'c' },
};

export const LEVELS: readonly Level[] = [l1, l2, l3, l4, l5];

export function checkLevel(level: Level, placements: Record<string, string>): { solved: boolean; spins: Record<string, GearSpin> } {
  const tray = new Map(level.tray.map((x) => [x.id, x]));
  const axles = new Set(level.axles.map((a) => a.id));
  const gears: PlacedGear[] = [...level.fixed];
  for (const [id, axle] of Object.entries(placements)) {
    const loose = tray.get(id);
    if (!loose) throw new Error(`level ${level.id}: placed gear ${id} is not in the tray`);
    if (!axles.has(axle)) throw new Error(`level ${level.id}: gear ${id} placed on unknown axle ${axle}`);
    gears.push({ id, axle, teeth: loose.teeth, layer: loose.layer });
  }
  const spins = solveTrain({ module: level.module, axles: level.axles, gears, driver: level.driver, rpm: level.rpm });
  const spin = spins[level.target.gear];
  const { rpm, tolerance } = level.target;
  const solved = typeof spin === 'number' && Math.sign(spin) === Math.sign(rpm) && Math.abs(spin - rpm) <= tolerance;
  return { solved, spins };
}

type Obj = Record<string, unknown>;

function fail(path: string, what: string): never {
  throw new Error(`level${path} ${what}`);
}
function obj(v: unknown, path: string): Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(path, 'must be an object');
}
function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) return fail(path, 'must be an array');
  if (v.length > max) return fail(path, `must have at most ${max} items`);
  return v;
}
function get(o: Obj, k: string): unknown {
  return Object.hasOwn(o, k) ? o[k] : undefined;
}
function num(v: unknown, path: string): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fail(path, 'must be a finite number');
}
function int(v: unknown, path: string, min: number, max: number): number {
  const n = num(v, path);
  return Number.isInteger(n) && n >= min && n <= max ? n : fail(path, `must be an integer from ${min} to ${max}`);
}
function str(v: unknown, path: string, max: number): string {
  return typeof v === 'string' && v.length >= 1 && v.length <= max ? v : fail(path, `must be a string of 1 to ${max} characters`);
}
/** A sane id: starts with a letter, no prototype names. */
export const isIdent = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v) && !(v in Object.prototype);
function ident(v: unknown, path: string): string {
  return isIdent(v)
    ? v
    : fail(path, 'must start with a letter and use only letters, digits, _ or -');
}
function nonZero(v: unknown, path: string): number {
  const n = num(v, path);
  return n !== 0 ? n : fail(path, 'must not be zero');
}

/** Validates untrusted JSON and returns a fresh Level; the input is never returned or kept. */
export function parseLevel(json: unknown): Level {
  const root = obj(json, '');
  const id = ident(get(root, 'id'), '.id');
  const name = str(get(root, 'name'), '.name', 80);
  const module = num(get(root, 'module'), '.module');
  if (module < 0.002 || module > 0.02) fail('.module', 'must be from 0.002 to 0.02');

  const axleIds = new Set<string>();
  const axles = arr(get(root, 'axles'), '.axles', 30).map((v, i): Axle => {
    const p = `.axles[${i}]`;
    const o = obj(v, p);
    const aid = ident(get(o, 'id'), `${p}.id`);
    if (axleIds.has(aid)) fail(`${p}.id`, 'must be unique');
    axleIds.add(aid);
    return { id: aid, x: num(get(o, 'x'), `${p}.x`), y: num(get(o, 'y'), `${p}.y`) };
  });

  const gearIds = new Set<string>();
  const gear = (v: unknown, p: string) => {
    const o = obj(v, p);
    const gid = ident(get(o, 'id'), `${p}.id`);
    if (gearIds.has(gid)) fail(`${p}.id`, 'must be unique');
    gearIds.add(gid);
    return { o, id: gid, teeth: int(get(o, 'teeth'), `${p}.teeth`, 6, 80), layer: Number.isInteger(get(o, 'layer')) ? (get(o, 'layer') as number) : fail(`${p}.layer`, 'must be an integer') };
  };

  const fixedRaw = arr(get(root, 'fixed'), '.fixed', 30);
  const fixed = fixedRaw.map((v, i): PlacedGear => {
    const p = `.fixed[${i}]`;
    const { o, id: gid, teeth, layer } = gear(v, p);
    const axle = ident(get(o, 'axle'), `${p}.axle`);
    if (!axleIds.has(axle)) fail(`${p}.axle`, 'must be the id of an axle');
    return { id: gid, axle, teeth, layer };
  });
  const trayRaw = arr(get(root, 'tray'), '.tray', 30);
  if (fixedRaw.length + trayRaw.length > 30) fail('.tray', 'and .fixed together must have at most 30 gears');
  const tray = trayRaw.map((v, i): LooseGear => {
    const { id: gid, teeth, layer } = gear(v, `.tray[${i}]`);
    return { id: gid, teeth, layer };
  });

  const driver = ident(get(root, 'driver'), '.driver');
  if (!fixed.some((f) => f.id === driver)) fail('.driver', 'must be the id of a fixed gear');
  const rpm = nonZero(get(root, 'rpm'), '.rpm');

  const tg = obj(get(root, 'target'), '.target');
  const tgear = ident(get(tg, 'gear'), '.target.gear');
  if (!gearIds.has(tgear)) fail('.target.gear', 'must be the id of a gear');
  const trpm = nonZero(get(tg, 'rpm'), '.target.rpm');
  const tolerance = num(get(tg, 'tolerance'), '.target.tolerance');
  if (tolerance <= 0) fail('.target.tolerance', 'must be greater than zero');

  const egear = ident(get(obj(get(root, 'escapement'), '.escapement'), 'gear'), '.escapement.gear');
  if (!gearIds.has(egear)) fail('.escapement.gear', 'must be the id of a gear');

  const sol = obj(get(root, 'solution'), '.solution');
  const trayIds = new Set(tray.map((x) => x.id));
  const solution: Record<string, string> = {};
  for (const k of Object.keys(sol)) {
    const p = `.solution[${JSON.stringify(k)}]`;
    if (!trayIds.has(k)) fail(p, 'key must be the id of a tray gear');
    const axle = ident(sol[k], p);
    if (!axleIds.has(axle)) fail(p, 'must be the id of an axle');
    solution[k] = axle;
  }

  return {
    id, name, module, axles, fixed, driver, rpm, tray,
    target: { gear: tgear, rpm: trpm, tolerance },
    escapement: { gear: egear },
    solution,
  };
}
