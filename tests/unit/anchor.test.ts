import { describe, expect, it } from 'vitest';
import {
  RECENTER_HOLD_MS,
  createRecenterHold,
  placeTray,
  poseToWorld,
  toHeadFrame,
  type Plane,
} from '../../src/anchor';
import { LEVELS } from '../../src/levels';
import { TRAY_POSE, inComfortZone, interactables, trayToWorld, type Vec3 } from '../../src/seat';

const plane = (x: number, y: number, z: number, orientation: Plane['orientation'] = 'horizontal'): Plane => ({
  orientation,
  position: [x, y, z],
});

const allComfortable = (pose: Parameters<typeof interactables>[1]) =>
  LEVELS.every((l) => interactables(l, pose).every((p) => inComfortZone(p)));

describe('placeTray', () => {
  it('uses the default pose with no planes', () => {
    const r = placeTray([]);
    expect(r.source).toBe('default');
    expect(r.pose).toEqual(TRAY_POSE);
    expect(r.stand).toBe(0);
  });

  it('ignores vertical planes', () => {
    expect(placeTray([plane(0, -0.4, -0.4, 'vertical')]).source).toBe('default');
  });

  it('ignores a plane behind the player', () => {
    expect(placeTray([plane(0, -0.4, 0.3)]).source).toBe('default');
  });

  it('ignores a plane too far ahead', () => {
    expect(placeTray([plane(0, -0.4, -0.9)]).source).toBe('default');
  });

  it('ignores a plane too far to the side', () => {
    expect(placeTray([plane(0.6, -0.4, -0.5)]).source).toBe('default');
  });

  it('ignores a plane that is too high or too low', () => {
    expect(placeTray([plane(0, -0.2, -0.4)]).source).toBe('default');
    expect(placeTray([plane(0, -0.8, -0.4)]).source).toBe('default');
  });

  it('ignores a tiny plane when extents are known', () => {
    expect(placeTray([{ ...plane(0, -0.4, -0.4), extents: { width: 0.1, depth: 0.1 } }]).source).toBe('default');
    expect(placeTray([{ ...plane(0, -0.4, -0.4), extents: { width: 1, depth: 0.6 } }]).source).toBe('plane');
  });

  it('picks the nearest of several valid planes', () => {
    const near = plane(0.05, -0.45, -0.35);
    const r = placeTray([plane(0.2, -0.6, -0.6), near, plane(-0.1, -0.3, -0.5), plane(0, -0.4, -0.3, 'vertical')]);
    expect(r.source).toBe('plane');
    expect(r.stand).toBeCloseTo(r.pose.position[1] - near.position[1], 9);
  });

  it('stands the tray above a low plane and keeps it below the head', () => {
    const r = placeTray([plane(0, -0.7, -0.4)]);
    expect(r.source).toBe('plane');
    expect(r.stand).toBeGreaterThan(0.3);
    expect(r.pose.position[1]).toBeGreaterThan(-0.7);
    expect(r.pose.position[1]).toBeLessThan(0);
  });

  it('follows an off-centre plane sideways, but only a little', () => {
    const right = placeTray([plane(0.25, -0.45, -0.4)]).pose;
    const left = placeTray([plane(-0.25, -0.45, -0.4)]).pose;
    expect(right.position[0]).toBeGreaterThan(0);
    expect(left.position[0]).toBeLessThan(0);
    expect(Math.abs(right.position[0])).toBeLessThanOrEqual(0.05);
  });

  it('keeps every interactable in the comfort zone: default pose', () => {
    expect(allComfortable(placeTray([]).pose)).toBe(true);
  });

  it('keeps every interactable in the comfort zone for low, high and off-centre planes', () => {
    for (const y of [-0.7, -0.6, -0.5, -0.4, -0.3, -0.25]) {
      for (const x of [-0.4, -0.3, -0.15, 0, 0.15, 0.3, 0.4]) {
        for (const z of [-0.2, -0.3, -0.45, -0.6, -0.7]) {
          const r = placeTray([plane(x, y, z)]);
          expect(allComfortable(r.pose), `plane ${x},${y},${z} (${r.source})`).toBe(true);
          if (Math.abs(x) <= 0.15 && z <= -0.3) expect(r.source, `plane ${x},${y},${z}`).toBe('plane');
        }
      }
    }
  });

  it('places on a plane for a typical centred table', () => {
    expect(placeTray([plane(0, -0.55, -0.4)]).source).toBe('plane');
    expect(placeTray([plane(0.25, -0.55, -0.45)]).source).toBe('plane');
    expect(placeTray([plane(0, -0.7, -0.4)]).source).toBe('plane');
    expect(placeTray([plane(0, -0.25, -0.4)]).source).toBe('plane');
  });
});

describe('head frame', () => {
  const head = { position: [1, 0.1, 2] as Vec3, yaw: Math.PI / 2 };

  it('is the identity for a head at the origin facing -Z', () => {
    const id = { position: [0, 0, 0] as Vec3, yaw: 0 };
    expect(toHeadFrame([0.1, -0.4, -0.3], id)).toEqual([0.1, -0.4, -0.3]);
    expect(poseToWorld(TRAY_POSE, id).position).toEqual(TRAY_POSE.position);
  });

  it('expresses a point straight ahead of a turned head as -Z', () => {
    // yaw +90 deg turns the head to face -X; a point one metre ahead is at x = 0 in head terms.
    const p = toHeadFrame([1 - 1, 0.1, 2], head);
    expect(p[0]).toBeCloseTo(0, 9);
    expect(p[2]).toBeCloseTo(-1, 9);
  });

  it('puts the tray in front of a turned head', () => {
    const w = poseToWorld(TRAY_POSE, head);
    const back = toHeadFrame(w.position, head);
    expect(back[0]).toBeCloseTo(TRAY_POSE.position[0], 9);
    expect(back[1]).toBeCloseTo(TRAY_POSE.position[1], 9);
    expect(back[2]).toBeCloseTo(TRAY_POSE.position[2], 9);
    expect(w.yaw).toBeCloseTo(head.yaw, 9);
    expect(w.tilt).toBe(TRAY_POSE.tilt);
  });
});

describe('trayToWorld with a pose', () => {
  it('moves the centre to the pose position', () => {
    const pose = { position: [0.05, -0.3, -0.4] as Vec3, tilt: 0.5, yaw: 0.2 };
    const c = trayToWorld(0, 0, 0, pose);
    expect(c[0]).toBeCloseTo(0.05, 9);
    expect(c[1]).toBeCloseTo(-0.3, 9);
    expect(c[2]).toBeCloseTo(-0.4, 9);
  });
});

describe('recenter hold', () => {
  it('fires after 1 s of both hands pinching, not before', () => {
    const hold = createRecenterHold();
    expect(RECENTER_HOLD_MS).toBe(1000);
    expect(hold(0, true)).toBe(false);
    expect(hold(500, true)).toBe(false);
    expect(hold(999, true)).toBe(false);
    expect(hold(1000, true)).toBe(true);
  });

  it('cancels when either hand lets go early', () => {
    const hold = createRecenterHold();
    hold(0, true);
    hold(600, true);
    expect(hold(700, false)).toBe(false);
    expect(hold(800, true)).toBe(false);
    expect(hold(1500, true)).toBe(false);
    expect(hold(1800, true)).toBe(true);
  });

  it('fires once per hold and again after a release', () => {
    const hold = createRecenterHold();
    hold(0, true);
    expect(hold(1000, true)).toBe(true);
    expect(hold(1100, true)).toBe(false);
    expect(hold(5000, true)).toBe(false);
    hold(5100, false);
    hold(6000, true);
    expect(hold(7000, true)).toBe(true);
  });
});
