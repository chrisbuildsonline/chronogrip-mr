import { describe, expect, it } from 'vitest';
import { occupiedAt, pickGear, snapAxle } from '../../src/grab';
import { LEVELS } from '../../src/levels';
import { TRAY_POSE, layerLift, trayToWorld, worldToTray, type TrayPose, type Vec3 } from '../../src/seat';

const l1 = LEVELS[0]!;
const l3 = LEVELS[2]!;

describe('pickGear', () => {
  const gears = [
    { id: 'a', x: 0, y: 0, lift: 0.006 },
    { id: 'b', x: 0.05, y: 0, lift: 0.006 },
  ];
  it('picks the nearest gear within 4 cm', () => {
    expect(pickGear([0.03, 0, 0.006], gears)).toBe('b');
    expect(pickGear([0.01, 0, 0.006], gears)).toBe('a');
  });
  it('returns null beyond 4 cm', () => {
    expect(pickGear([0, 0.05, 0.006], gears)).toBeNull();
    expect(pickGear([0, 0, 0.3], gears)).toBeNull();
  });
  it('returns null with no candidates', () => {
    expect(pickGear([0, 0, 0], [])).toBeNull();
  });
});

describe('snapAxle', () => {
  const axle = l1.axles[1]!;
  it('snaps within 2.5 cm and not beyond', () => {
    expect(snapAxle([axle.x + 0.02, axle.y], l1.axles, [], 0)).toBe(axle.id);
    expect(snapAxle([axle.x + 0.03, axle.y], l1.axles, [], 0)).toBeNull();
  });
  it('refuses an axle taken at the same layer but allows another layer', () => {
    const taken = [{ axle: axle.id, layer: 0 }];
    expect(snapAxle([axle.x, axle.y], l1.axles, taken, 0)).toBeNull();
    expect(snapAxle([axle.x, axle.y], l1.axles, taken, 1)).toBe(axle.id);
  });
});

describe('occupiedAt', () => {
  it('lists fixed gears and placed loose gears at their layers', () => {
    expect(occupiedAt(l1, {})).toEqual([
      { axle: 'a0', layer: 0 },
      { axle: 'a2', layer: 0 },
    ]);
    expect(occupiedAt(l3, { q: 'b' })).toContainEqual({ axle: 'b', layer: 1 });
  });
  it('ignores the gear being moved', () => {
    expect(occupiedAt(l1, { br: 'a1' }, 'br')).toEqual(occupiedAt(l1, {}));
    expect(occupiedAt(l1, { br: 'a1' })).toContainEqual({ axle: 'a1', layer: 0 });
  });
});

describe('worldToTray', () => {
  const poses: TrayPose[] = [TRAY_POSE, { position: [0.1, -0.3, -0.4], tilt: 0.2, yaw: 0.7 }, { position: [-0.2, 0, -0.5], tilt: 1.1, yaw: -1.2 }];
  it('inverts trayToWorld', () => {
    for (const pose of poses) {
      const [x, y, lift] = worldToTray(trayToWorld(0.07, -0.11, 0.02, pose), pose);
      expect([x, y, lift].map((v) => +v.toFixed(9))).toEqual([0.07, -0.11, 0.02]);
    }
  });
  it('puts the tray origin at zero', () => {
    const o = worldToTray(trayToWorld(0, 0, layerLift(0), TRAY_POSE) as Vec3, TRAY_POSE);
    expect(o[2]).toBeCloseTo(0.006, 9);
  });
});
