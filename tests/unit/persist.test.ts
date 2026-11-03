import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, fitsComfort, placeTray, poseToWorld, toHeadFrame, type Head, type Placement } from '../../src/anchor';
import {
  TRAY_KEY,
  anchoredAt,
  keeps,
  loadTray,
  parseTray,
  restoreAt,
  saveTray,
  savedFrom,
  serializeTray,
  yawOf,
  type SavedTray,
} from '../../src/persist';
import { TRAY_POSE, type Vec3 } from '../../src/seat';

/** A tiny in-memory Storage. */
function memory(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    raw: () => m.get(TRAY_KEY) ?? null,
  };
}

const origin: Head = { position: [0, 0, 0], yaw: 0 };
/** A table 45 cm below the head and 40 cm ahead: the tray stands on it. */
const onTable = placeTray([{ orientation: 'horizontal', position: [0, -0.45, -0.4] }]);

const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe('saving the tray', () => {
  it('saves the pose in the head frame it was placed for, with its source and stand', () => {
    expect(onTable.source).toBe('plane');
    const head: Head = { position: [2, 1.2, -1], yaw: 0.6 };
    const world: Placement = { ...onTable, pose: poseToWorld(onTable.pose, head) };
    const saved = savedFrom(world, head);
    close(saved.pose.position, onTable.pose.position);
    expect(saved.pose.yaw).toBeCloseTo(0, 9);
    expect(saved.pose.tilt).toBe(onTable.pose.tilt);
    expect(saved.source).toBe('plane');
    expect(saved.stand).toBeCloseTo(onTable.stand, 9);
    expect(saved.anchor).toBeUndefined();
    expect(savedFrom(world, head, 'abc-123').anchor).toBe('abc-123');
  });

  it('round-trips through serialize and parse', () => {
    const saved: SavedTray = { ...savedFrom(onTable, origin), anchor: '0b7c1f9e-5d2a-4c33-9a0e-1f2e3d4c5b6a' };
    expect(parseTray(serializeTray(saved))).toEqual(saved);
    const plain = savedFrom(DEFAULT_PLACEMENT, origin);
    expect(parseTray(serializeTray(plain))).toEqual(plain);
  });

  it('writes to storage under its own key and reads it back', () => {
    const storage = memory();
    saveTray(storage, savedFrom(onTable, origin));
    expect(TRAY_KEY).toBe('chronogrip.tray.v1');
    expect(storage.raw()).not.toBeNull();
    expect(loadTray(storage)).toEqual(savedFrom(onTable, origin));
  });

  it('a recenter overwrites the saved pose', () => {
    const storage = memory();
    saveTray(storage, savedFrom(onTable, origin, 'first'));
    const head: Head = { position: [0.1, 0, 0.05], yaw: -0.3 };
    saveTray(storage, savedFrom({ ...DEFAULT_PLACEMENT, pose: poseToWorld(TRAY_POSE, head) }, head));
    const back = loadTray(storage)!;
    close(back.pose.position, TRAY_POSE.position);
    expect(back.source).toBe('default');
    expect(back.anchor).toBeUndefined();
  });
});

describe('restoring the tray', () => {
  it('puts a saved pose back in front of a new head, at the same head-relative spot', () => {
    const saved = savedFrom(onTable, origin);
    const head: Head = { position: [-0.4, 0.2, 0.7], yaw: 1.1 };
    const r = restoreAt(saved, head);
    expect(r.source).toBe('plane');
    expect(r.stand).toBeCloseTo(onTable.stand, 9);
    close(toHeadFrame(r.pose.position, head), onTable.pose.position);
    expect(r.pose.yaw).toBeCloseTo(head.yaw, 9);
  });

  it('places at a restored anchor pose when it is comfortable for the head', () => {
    const saved = savedFrom(onTable, origin, 'uuid-1');
    const head: Head = { position: [0.3, 0, -0.2], yaw: 0.2 };
    const world = poseToWorld(onTable.pose, head);
    const r = anchoredAt(saved, { position: world.position, yaw: world.yaw! }, head)!;
    expect(r).not.toBeNull();
    close(r.pose.position, world.position);
    expect(r.pose.yaw).toBeCloseTo(world.yaw!, 9);
    expect(r.pose.tilt).toBe(onTable.pose.tilt);
    expect(r.source).toBe('plane');
  });

  it('ignores an anchor that is now out of reach (the player moved seat)', () => {
    const saved = savedFrom(onTable, origin, 'uuid-1');
    expect(anchoredAt(saved, { position: [0, -0.22, -1.5], yaw: 0 }, origin)).toBeNull();
    expect(anchoredAt(saved, { position: [0, -0.22, 0.35], yaw: Math.PI }, origin)).toBeNull();
  });

  it('reads the yaw of a quaternion about Y', () => {
    const q = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
    for (const a of [0, 0.4, -1.2, 2.5]) expect(yawOf(q(a))).toBeCloseTo(a, 9);
  });
});

describe('a corrupt or old saved value falls back cleanly', () => {
  const good = JSON.parse(serializeTray(savedFrom(onTable, origin))) as Record<string, unknown>;
  const bad: [string, string | null][] = [
    ['nothing saved', null],
    ['empty string', ''],
    ['not JSON', '{pose: oops'],
    ['JSON null', 'null'],
    ['an array', '[1,2,3]'],
    ['a number', '42'],
    ['an old version', JSON.stringify({ ...good, v: 0 })],
    ['a future version', JSON.stringify({ ...good, v: 2 })],
    ['no pose', JSON.stringify({ ...good, pose: undefined })],
    ['two coordinates', JSON.stringify({ ...good, pose: { position: [0, -0.2], tilt: 0.8 } })],
    ['a NaN coordinate', JSON.stringify({ ...good, pose: { position: [0, 'x', -0.3], tilt: 0.8 } })],
    ['a huge coordinate', JSON.stringify({ ...good, pose: { position: [0, -0.2, -1e9], tilt: 0.8 } })],
    ['a missing tilt', JSON.stringify({ ...good, pose: { position: [0, -0.2, -0.33] } })],
    ['a string yaw', JSON.stringify({ ...good, pose: { position: [0, -0.2, -0.33], tilt: 0.8, yaw: '1' } })],
    ['an unknown source', JSON.stringify({ ...good, source: 'hit-test' })],
    ['a negative stand', JSON.stringify({ ...good, stand: -0.1 })],
    ['a stand taller than a metre', JSON.stringify({ ...good, stand: 3 })],
    ['an anchor that is not a handle', JSON.stringify({ ...good, anchor: '<script>' })],
    ['an anchor that is a number', JSON.stringify({ ...good, anchor: 7 })],
    ['a pose out of reach', JSON.stringify({ ...good, pose: { position: [0, -0.2, -0.9], tilt: 0.8 } })],
    ['a pose behind the head', JSON.stringify({ ...good, pose: { position: [0, -0.2, 0.3], tilt: 0.8 } })],
  ];

  it.each(bad)('%s gives null', (_, raw) => {
    expect(() => parseTray(raw)).not.toThrow();
    expect(parseTray(raw)).toBeNull();
  });

  it('every parsed pose keeps the board in the comfort zone', () => {
    expect(fitsComfort(parseTray(serializeTray(savedFrom(onTable, origin)))!.pose)).toBe(true);
  });

  it('blocked storage reads as nothing saved and a failed write does not throw', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    expect(loadTray(blocked)).toBeNull();
    expect(loadTray(null)).toBeNull();
    expect(() => saveTray(blocked, savedFrom(onTable, origin))).not.toThrow();
    expect(() => saveTray(null, savedFrom(onTable, origin))).not.toThrow();
  });

  it('a corrupt stored value loads as null', () => {
    expect(loadTray(memory({ [TRAY_KEY]: '{"v":1,"pose":' }))).toBeNull();
  });
});

describe('what gets saved', () => {
  const plane = onTable;
  it('keeps a plane found by the search and any recenter, not the timed default fallback', () => {
    expect(keeps('search', plane)).toBe(true);
    expect(keeps('search', DEFAULT_PLACEMENT)).toBe(false);
    expect(keeps('recenter', DEFAULT_PLACEMENT)).toBe(true);
    expect(keeps('recenter', plane)).toBe(true);
    expect(keeps('saved', plane)).toBe(false);
    expect(keeps('anchor', plane)).toBe(false);
  });
});

/** The head frame is honest across sessions; a raw world pose is not (the local origin moves). */
describe('why the head frame', () => {
  it('a world pose saved in one session lands elsewhere for a head that starts somewhere else', () => {
    const first: Head = { position: [0, 0, 0], yaw: 0 };
    const second: Head = { position: [0, 0, 0], yaw: 0.9 };
    const saved = savedFrom({ ...onTable, pose: poseToWorld(onTable.pose, first) }, first);
    const r = restoreAt(saved, second);
    const v: Vec3 = toHeadFrame(r.pose.position, second);
    close(v, onTable.pose.position);
  });
});
