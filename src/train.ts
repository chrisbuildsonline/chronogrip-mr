import { gearRadii } from './gear';

export type Axle = { id: string; x: number; y: number };
export type PlacedGear = { id: string; axle: string; teeth: number; layer: number };
export type TrainInput = {
  /** Shared by every gear: gears only mesh with equal module. */
  module: number;
  axles: Axle[];
  gears: PlacedGear[];
  /** Id of the gear that is driven. */
  driver: string;
  /** Driver rpm, signed (+ = counter-clockwise). */
  rpm: number;
  /** Absolute metres for the mesh-distance check. Default 0.05 * module. */
  tolerance?: number;
};
export type GearSpin = number | 'jammed';

/** Edge from a gear: `ratio` is the neighbour rpm / this rpm; null means a collision. */
type Edge = { to: number; ratio: number | null };

function validate(input: TrainInput, tolerance: number): void {
  const { module: m, axles, gears, driver, rpm } = input;
  if (!Number.isFinite(m) || m <= 0) throw new Error(`train module must be a positive finite number, got ${m}`);
  if (!Number.isFinite(rpm)) throw new Error(`train rpm must be finite, got ${rpm}`);
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error(`train tolerance must be finite and >= 0, got ${tolerance}`);
  const axleIds = new Set<string>();
  for (const a of axles) {
    if (axleIds.has(a.id)) throw new Error(`duplicate axle id ${a.id}`);
    axleIds.add(a.id);
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) throw new Error(`axle ${a.id} needs finite coordinates`);
  }
  const gearIds = new Set<string>();
  for (const g of gears) {
    if (gearIds.has(g.id)) throw new Error(`duplicate gear id ${g.id}`);
    gearIds.add(g.id);
    if (!axleIds.has(g.axle)) throw new Error(`gear ${g.id} is on unknown axle ${g.axle}`);
    if (!Number.isInteger(g.teeth) || g.teeth < 6) throw new Error(`gear ${g.id} teeth must be an integer >= 6, got ${g.teeth}`);
    if (!Number.isFinite(g.layer)) throw new Error(`gear ${g.id} layer must be finite, got ${g.layer}`);
  }
  if (!gearIds.has(driver)) throw new Error(`unknown driver gear ${driver}`);
}

export function solveTrain(input: TrainInput): Record<string, GearSpin> {
  const { module: m, driver, rpm } = input;
  const tol = input.tolerance ?? 0.05 * m;
  validate(input, tol);

  // Sorted by id so the walk, and so the floating point result, does not depend on input order.
  const gears = [...input.gears].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pos = new Map(input.axles.map((a) => [a.id, a]));
  const tip = gears.map((g) => gearRadii({ module: m, teeth: g.teeth }).tip);

  const edges: Edge[][] = gears.map(() => []);
  const link = (i: number, j: number, ratio: number | null) => {
    edges[i]!.push({ to: j, ratio });
    edges[j]!.push({ to: i, ratio: ratio === null ? null : 1 / ratio });
  };
  // ponytail: O(n^2) pair scan, fine while n < 30 gears.
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const a = gears[i]!;
      const b = gears[j]!;
      if (a.axle === b.axle) {
        if (a.layer === b.layer) link(i, j, null);
        else link(i, j, 1);
      } else if (a.layer === b.layer) {
        const pa = pos.get(a.axle)!;
        const pb = pos.get(b.axle)!;
        const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (Math.abs(dist - (m * (a.teeth + b.teeth)) / 2) <= tol) link(i, j, -a.teeth / b.teeth);
        else if (dist < tip[i]! + tip[j]! - tol) link(i, j, null);
      }
    }
  }

  const start = gears.findIndex((g) => g.id === driver);
  const speed: (number | undefined)[] = gears.map(() => undefined);
  speed[start] = rpm;
  const queue = [start];
  let jammed = false;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const { to, ratio } of edges[i]!) {
      if (ratio === null) jammed = true; // speeds past a collision are meaningless, but we only need the component
      const next = ratio === null ? 0 : speed[i]! * ratio;
      if (speed[to] === undefined) {
        speed[to] = next;
        queue.push(to);
      } else if (ratio !== null && Math.abs(speed[to]! - next) > 1e-9 * Math.max(Math.abs(speed[to]!), Math.abs(next))) {
        jammed = true;
      }
    }
  }

  const inTrain = new Set(queue);
  const out: Record<string, GearSpin> = {};
  for (const g of input.gears) {
    const i = gears.indexOf(g);
    out[g.id] = !inTrain.has(i) ? 0 : jammed ? 'jammed' : speed[i]!;
  }
  return out;
}
