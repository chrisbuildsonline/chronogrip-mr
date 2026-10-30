import { describe, expect, it } from 'vitest';
import { gearRadii } from '../../src/gear';
import { PROPS } from '../../src/clockwork';
import { targetRate } from '../../src/escapement';
import { checkLevel, parseLevel, type Level } from '../../src/levels';
import { PIN_RADIUS, footprints, inComfortZone, interactables, partsStrip } from '../../src/seat';
import { dailySeed, fallbackLevel, tinkerLevel } from '../../src/tinker';

/** Every invariant the shipped levels are tested for, plus the tinker-specific ones. */
function invariants(level: Level, why: string) {
  expect(parseLevel(JSON.parse(JSON.stringify(level))), why).toEqual(level);
  expect(level.module, why).toBe(0.004);
  expect(level.tray.length, why).toBeGreaterThanOrEqual(2);

  const r = checkLevel(level, level.solution);
  expect(r.solved, `${why}: solution solves`).toBe(true);
  expect(Object.values(r.spins), `${why}: nothing jams`).not.toContain('jammed');
  expect(checkLevel(level, {}).solved, `${why}: empty is unsolved`).toBe(false);
  expect(targetRate(level), `${why}: calibratable ticks/s`).toBeGreaterThanOrEqual(1.5);
  expect(targetRate(level), `${why}: calibratable ticks/s`).toBeLessThanOrEqual(4.5);

  const solutionIds = new Set(Object.keys(level.solution));
  const decoys = level.tray.filter((t) => !solutionIds.has(t.id));
  expect(decoys.length, why).toBeGreaterThanOrEqual(1);
  expect(decoys.length, why).toBeLessThanOrEqual(2);
  expect(solutionIds.size, why).toBeGreaterThanOrEqual(1);
  const axleIds = level.axles.map((a) => a.id);
  for (const a of [undefined, ...axleIds]) {
    for (const b of [undefined, ...axleIds]) {
      const place: Record<string, string> = {};
      if (a) place[decoys[0]!.id] = a;
      if (b && decoys[1]) place[decoys[1].id] = b;
      expect(checkLevel(level, place).solved, `${why}: decoys only ${JSON.stringify(place)}`).toBe(false);
    }
  }

  const pos = new Map(level.axles.map((a) => [a.id, a]));
  for (const a of level.axles) {
    expect(Math.abs(a.x), why).toBeLessThanOrEqual(0.2);
    expect(Math.abs(a.y), why).toBeLessThanOrEqual(0.15);
  }
  const placed = [
    ...level.fixed,
    ...Object.entries(level.solution).map(([id, axle]) => ({ id, axle, teeth: level.tray.find((t) => t.id === id)!.teeth })),
  ];
  for (const g of placed) {
    const { tip } = gearRadii({ module: level.module, teeth: g.teeth });
    const p = pos.get(g.axle)!;
    expect(Math.abs(p.x) + tip, `${why}: gear ${g.id}`).toBeLessThanOrEqual(0.2);
    expect(Math.abs(p.y) + tip, `${why}: gear ${g.id}`).toBeLessThanOrEqual(0.15);
    for (const q of PROPS) expect(Math.hypot(q.x - p.x, q.y - p.y), `${why}: gear ${g.id} over a prop`).toBeGreaterThan(q.r + tip);
    for (const a of level.axles) {
      if (a.id !== g.axle) expect(Math.hypot(a.x - p.x, a.y - p.y), `${why}: gear ${g.id} over axle ${a.id}`).toBeGreaterThan(tip + PIN_RADIUS);
    }
  }
  for (const t of level.tray) {
    expect(t.teeth, why).toBeGreaterThanOrEqual(10);
    expect(t.teeth, why).toBeLessThanOrEqual(40);
  }

  for (const p of interactables(level)) expect(inComfortZone(p), `${why}: comfort ${p}`).toBe(true);
  const strip = partsStrip(level);
  expect(strip.map((s) => s.id).sort(), why).toEqual(level.tray.map((t) => t.id).sort());
  for (let i = 0; i < strip.length; i++) {
    for (let j = i + 1; j < strip.length; j++) {
      expect(Math.hypot(strip[i]!.x - strip[j]!.x, strip[i]!.y - strip[j]!.y), why).toBeGreaterThan(strip[i]!.radius + strip[j]!.radius);
    }
    for (const f of footprints(level)) {
      expect(Math.hypot(strip[i]!.x - f.x, strip[i]!.y - f.y), `${why}: strip ${strip[i]!.id} vs ${f.id}`).toBeGreaterThan(strip[i]!.radius + f.radius);
    }
  }
}

describe('dailySeed', () => {
  it('is YYYYMMDD of the local date', () => {
    expect(dailySeed(new Date(2026, 0, 1, 0, 0, 1))).toBe(20260101);
    expect(dailySeed(new Date(2026, 11, 31, 23, 59, 59))).toBe(20261231);
    expect(dailySeed(new Date(2027, 1, 5, 12))).toBe(20270205);
  });
  it('is one seed per day and differs between days', () => {
    expect(dailySeed(new Date(2026, 5, 9, 1))).toBe(dailySeed(new Date(2026, 5, 9, 22)));
    expect(dailySeed(new Date(2026, 5, 9))).not.toBe(dailySeed(new Date(2026, 5, 10)));
  });
});

describe('tinkerLevel', () => {
  it('is deterministic', () => {
    for (const s of [0, 1, 20260101, 20261030, 123456789]) expect(tinkerLevel(s)).toEqual(tinkerLevel(s));
  });

  it('has a stable valid id and a name', () => {
    const l = tinkerLevel(20260101);
    expect(l.id).toBe('t20260101');
    expect(l.name).toBe('Daily tinker');
    expect(tinkerLevel(20260102).id).not.toBe(l.id);
  });

  it('varies over 30 days', () => {
    const shapes = new Set<string>();
    for (let d = 0; d < 30; d++) {
      const l = tinkerLevel(dailySeed(new Date(2026, 0, 1 + d)));
      shapes.add(`${l.axles.length}:${l.tray.map((t) => `${t.teeth}/${t.layer}`).join(',')}:${l.target.rpm}`);
    }
    expect(shapes.size).toBeGreaterThanOrEqual(25);
    const counts = new Set(Array.from({ length: 30 }, (_, d) => tinkerLevel(dailySeed(new Date(2026, 0, 1 + d))).axles.length));
    expect(counts.size).toBeGreaterThanOrEqual(3);
  });

  it('the fallback level meets every invariant', () => {
    invariants(fallbackLevel('t0'), 'fallback');
  });

  it('never throws for odd seeds', () => {
    for (const s of [NaN, Infinity, -1, 0.5, 2 ** 40, -(2 ** 40)]) {
      const l = tinkerLevel(s);
      expect(() => parseLevel(l)).not.toThrow();
      expect(checkLevel(l, l.solution).solved).toBe(true);
    }
  });
});

describe('tinkerLevel fuzz', () => {
  it('2000 seeds all meet the invariants', () => {
    const seeds: number[] = [];
    for (let d = 0; d < 1000; d++) seeds.push(dailySeed(new Date(2026, 0, 1 + d)));
    let x = 12345;
    for (let i = 0; i < 1000; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      seeds.push(x);
    }
    const plain = JSON.stringify({ ...fallbackLevel('x'), id: 'x' });
    let fallbacks = 0;
    for (const s of seeds) {
      const l = tinkerLevel(s);
      invariants(l, `seed ${s}`);
      if (JSON.stringify({ ...l, id: 'x' }) === plain) fallbacks++;
    }
    expect(fallbacks, 'the generator, not the fallback, makes the puzzles').toBeLessThan(seeds.length / 20);
  });
});
