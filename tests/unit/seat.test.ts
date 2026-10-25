import { Euler, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { gearRadii } from '../../src/gear';
import { LEVELS, type Level } from '../../src/levels';
import {
  COMFORT,
  TRAY_POSE,
  footprints,
  inComfortZone,
  interactables,
  layerLift,
  partsStrip,
  trayLocal,
  trayToWorld,
  type Vec3,
} from '../../src/seat';

const deg = (r: number) => (r * 180) / Math.PI;
const dist = (p: Vec3) => Math.hypot(...p);
const yaw = (p: Vec3) => deg(Math.atan2(p[0], -p[2]));
const pitch = (p: Vec3) => deg(Math.atan2(p[1], Math.hypot(p[0], p[2])));

describe('inComfortZone', () => {
  it('accepts a point straight ahead and slightly below', () => {
    expect(inComfortZone([0, -0.1, -0.3])).toBe(true);
  });
  it('limits distance to 0.6 m', () => {
    expect(inComfortZone([0, 0, -0.59])).toBe(true);
    expect(inComfortZone([0, 0, -0.61])).toBe(false);
  });
  it('limits yaw to 35 deg either side', () => {
    const z = -0.4;
    const at = (d: number) => [0.4 * Math.tan((d * Math.PI) / 180), 0, z] as Vec3;
    expect(inComfortZone(at(34.5))).toBe(true);
    expect(inComfortZone(at(35.5))).toBe(false);
    const left = at(-34.5);
    const farLeft = at(-35.5);
    expect(inComfortZone(left)).toBe(true);
    expect(inComfortZone(farLeft)).toBe(false);
  });
  it('limits pitch to -50..+10 deg', () => {
    const r = 0.4;
    const at = (d: number) => [0, r * Math.sin((d * Math.PI) / 180), -r * Math.cos((d * Math.PI) / 180)] as Vec3;
    expect(inComfortZone(at(-49.5))).toBe(true);
    expect(inComfortZone(at(-50.5))).toBe(false);
    expect(inComfortZone(at(9.5))).toBe(true);
    expect(inComfortZone(at(10.5))).toBe(false);
  });
  it('rejects points behind the head', () => {
    expect(inComfortZone([0, 0, 0.3])).toBe(false);
  });
  it('exposes the limits', () => {
    expect(COMFORT).toEqual({ maxDistance: 0.6, maxYaw: 35, minPitch: -50, maxPitch: 10 });
  });
});

describe('tray pose and mapping', () => {
  it('maps the tray centre to the tray pose position', () => {
    expect(trayToWorld(0, 0)).toEqual(TRAY_POSE.position);
  });
  it('is the same as transforming tray-local coordinates through the tray group', () => {
    const group = new Object3D();
    group.position.set(...TRAY_POSE.position);
    group.rotation.copy(new Euler(TRAY_POSE.tilt, 0, 0));
    group.updateMatrixWorld(true);
    for (const [x, y, lift] of [[0.1, 0.05, 0], [-0.13, -0.07, 0.02], [0.2, 0.15, 0.03]] as const) {
      const w = group.localToWorld(new Vector3(...trayLocal(x, y, lift)));
      expect(trayToWorld(x, y, lift)[0]).toBeCloseTo(w.x, 9);
      expect(trayToWorld(x, y, lift)[1]).toBeCloseTo(w.y, 9);
      expect(trayToWorld(x, y, lift)[2]).toBeCloseTo(w.z, 9);
    }
  });
  it('puts level +y further from the player and higher, and the tray faces the player', () => {
    const far = trayToWorld(0, 0.1);
    const near = trayToWorld(0, -0.1);
    expect(far[2]).toBeLessThan(near[2]);
    expect(far[1]).toBeGreaterThan(near[1]);
  });
  it('takes an optional pose, default TRAY_POSE', () => {
    expect(trayToWorld(0.1, 0.05, 0.01, TRAY_POSE)).toEqual(trayToWorld(0.1, 0.05, 0.01));
    const yawed = trayToWorld(0.1, 0, 0, { position: [0, 0, -0.4], tilt: 0, yaw: Math.PI / 2 });
    expect(yawed[0]).toBeCloseTo(0, 9);
    expect(yawed[2]).toBeCloseTo(-0.4 - 0.1, 9);
    const l = LEVELS[0]!;
    expect(interactables(l, TRAY_POSE)).toEqual(interactables(l));
  });
  it('lifts layers above the tray surface', () => {
    expect(layerLift(1)).toBeGreaterThan(layerLift(0));
    expect(layerLift(0)).toBeGreaterThan(0);
  });
});

describe.each(LEVELS.map((l) => [l.id, l] as const))('level %s seated layout', (_id, level: Level) => {
  it('has every interactable inside the comfort zone', () => {
    const pts = interactables(level);
    expect(pts.length).toBeGreaterThanOrEqual(level.axles.length + level.tray.length);
    for (const p of pts) {
      expect(dist(p), `distance of ${p}`).toBeLessThanOrEqual(COMFORT.maxDistance);
      expect(Math.abs(yaw(p)), `yaw of ${p}`).toBeLessThanOrEqual(COMFORT.maxYaw);
      expect(pitch(p), `pitch of ${p}`).toBeGreaterThanOrEqual(COMFORT.minPitch);
      expect(pitch(p), `pitch of ${p}`).toBeLessThanOrEqual(COMFORT.maxPitch);
      expect(inComfortZone(p)).toBe(true);
    }
  });

  it('lays out every loose gear once, not overlapping each other', () => {
    const strip = partsStrip(level);
    expect(strip.map((s) => s.id).sort()).toEqual(level.tray.map((t) => t.id).sort());
    for (let i = 0; i < strip.length; i++) {
      for (let j = i + 1; j < strip.length; j++) {
        const a = strip[i]!;
        const b = strip[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} vs ${b.id}`).toBeGreaterThan(a.radius + b.radius);
      }
    }
  });

  it('keeps loose gears clear of every axle and fixed gear footprint', () => {
    const strip = partsStrip(level);
    const prints = footprints(level);
    expect(prints.length).toBeGreaterThanOrEqual(level.axles.length);
    for (const s of strip) {
      for (const f of prints) {
        expect(Math.hypot(s.x - f.x, s.y - f.y), `${s.id} vs ${f.id}`).toBeGreaterThan(s.radius + f.radius);
      }
    }
  });

  it('uses the real tip radius for loose gears', () => {
    for (const s of partsStrip(level)) {
      const t = level.tray.find((g) => g.id === s.id)!;
      expect(s.radius).toBeCloseTo(gearRadii({ module: level.module, teeth: t.teeth }).tip, 9);
    }
  });
});

describe('worst case over all levels', () => {
  it('stays in the zone', () => {
    const all = LEVELS.flatMap((l) => interactables(l));
    expect(Math.max(...all.map(dist))).toBeLessThanOrEqual(0.6);
    expect(Math.max(...all.map((p) => Math.abs(yaw(p))))).toBeLessThanOrEqual(35);
    expect(Math.min(...all.map(pitch))).toBeGreaterThanOrEqual(-50);
    expect(Math.max(...all.map(pitch))).toBeLessThanOrEqual(10);
  });
});
