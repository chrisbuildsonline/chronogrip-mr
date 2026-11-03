import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, placeTray, poseToWorld, type Head, type Placement } from '../../src/anchor';
import { createKeeper, type KeeperFrame, type KeeperSession } from '../../src/keeper';
import { TRAY_KEY, loadTray, savedFrom, saveTray } from '../../src/persist';
import { TRAY_POSE } from '../../src/seat';

type P = { x: number; y: number; z: number; w?: number };
/** XRRigidTransform as far as the keeper uses it (no WebXR in Node). */
class FakeTransform {
  constructor(
    readonly position: P,
    readonly orientation: P,
  ) {}
}
beforeAll(() => {
  (globalThis as { XRRigidTransform?: unknown }).XRRigidTransform = FakeTransform;
});

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), size: () => m.size };
}

type FakeAnchor = { anchorSpace: { at: FakeTransform }; requestPersistentHandle?: () => Promise<string>; delete(): void };

/** A runtime with persistent anchors: anchors live in `store` (uuid -> world transform) across sessions. */
function runtime(store = new Map<string, FakeTransform>(), opts: { persistent?: boolean; restore?: boolean } = {}) {
  let n = 0;
  const deleted: string[] = [];
  const anchorAt = (at: FakeTransform): FakeAnchor => ({
    anchorSpace: { at },
    requestPersistentHandle:
      opts.persistent === false
        ? undefined
        : () => {
            const uuid = `uuid-${++n}`;
            store.set(uuid, at);
            return Promise.resolve(uuid);
          },
    delete() {},
  });
  const session: KeeperSession = {
    persistentAnchors: [...store.keys()],
    restorePersistentAnchor:
      opts.restore === false
        ? undefined
        : (uuid: string) => (store.has(uuid) ? Promise.resolve(anchorAt(store.get(uuid)!) as unknown as XRAnchor) : Promise.reject(new DOMException('no', 'InvalidStateError'))),
    deletePersistentAnchor: (uuid: string) => {
      deleted.push(uuid);
      store.delete(uuid);
      return Promise.resolve();
    },
  };
  const frame: KeeperFrame = {
    createAnchor: (pose: XRRigidTransform) => Promise.resolve(anchorAt(pose as unknown as FakeTransform) as unknown as XRAnchor),
    getPose: (space: XRSpace) => ({ transform: (space as unknown as { at: FakeTransform }).at }) as unknown as XRPose,
  };
  return { session, frame, store, deleted };
}

const space = {} as XRReferenceSpace;
const origin: Head = { position: [0, 0, 0], yaw: 0 };
const onTable = placeTray([{ orientation: 'horizontal', position: [0, -0.45, -0.4] }]);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('tray keeper', () => {
  it('has nothing to restore on a first visit', () => {
    const rt = runtime();
    const keeper = createKeeper(memory(), rt.session);
    expect(keeper.start(origin)).toBeNull();
    expect(keeper.poll(rt.frame, space, origin)).toBeNull();
  });

  it('saves a placement at once in the head frame, then adds the persistent anchor handle', async () => {
    const storage = memory();
    const rt = runtime();
    const keeper = createKeeper(storage, rt.session);
    keeper.keep(rt.frame, space, onTable, origin);
    expect(loadTray(storage)?.pose.position).toEqual(onTable.pose.position);
    await flush();
    expect(loadTray(storage)?.anchor).toBe('uuid-1');
    expect(rt.store.has('uuid-1')).toBe(true);
  });

  it('next session: restores the saved pose at once, then the anchor pose once the runtime tracks it', async () => {
    const storage = memory();
    const store = new Map<string, FakeTransform>();
    const first = runtime(store);
    createKeeper(storage, first.session).keep(first.frame, space, onTable, origin);
    await flush();

    const second = runtime(store);
    const keeper = createKeeper(storage, second.session);
    const saved = keeper.start(origin)!;
    expect(saved.source).toBe('plane');
    expect(saved.pose.position).toEqual(onTable.pose.position);
    await flush();
    const anchored = keeper.poll(second.frame, space, origin)!;
    expect(anchored).not.toBeNull();
    anchored.pose.position.forEach((v, i) => expect(v).toBeCloseTo(onTable.pose.position[i]!, 9));
    expect(anchored.stand).toBeCloseTo(onTable.stand, 9);
    // Once only.
    expect(keeper.poll(second.frame, space, origin)).toBeNull();
  });

  it('the anchor is world-locked: a head that starts elsewhere still finds the tray where it was', async () => {
    const storage = memory();
    const store = new Map<string, FakeTransform>();
    const first = runtime(store);
    createKeeper(storage, first.session).keep(first.frame, space, onTable, origin);
    await flush();
    const head: Head = { position: [0.03, 0, 0.02], yaw: 0.05 };
    const second = runtime(store);
    const keeper = createKeeper(storage, second.session);
    keeper.start(head);
    await flush();
    const anchored = keeper.poll(second.frame, space, head)!;
    anchored.pose.position.forEach((v, i) => expect(v).toBeCloseTo(onTable.pose.position[i]!, 9));
  });

  it('without persistent anchors it still saves and restores the head-relative pose', async () => {
    const storage = memory();
    const store = new Map<string, FakeTransform>();
    const first = runtime(store, { persistent: false });
    createKeeper(storage, first.session).keep(first.frame, space, onTable, origin);
    await flush();
    expect(loadTray(storage)?.anchor).toBeUndefined();

    const head: Head = { position: [1, 0.2, -2], yaw: 0.7 };
    const second = runtime(store, { restore: false });
    const keeper = createKeeper(storage, second.session);
    const r = keeper.start(head)!;
    const want = poseToWorld(onTable.pose, head).position;
    r.pose.position.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 9));
    await flush();
    expect(keeper.poll(second.frame, space, head)).toBeNull();
  });

  it('a runtime with no anchors at all (no createAnchor) saves the head-relative pose only', () => {
    const storage = memory();
    const rt = runtime();
    const keeper = createKeeper(storage, {});
    keeper.keep({ getPose: rt.frame.getPose }, space, onTable, origin);
    expect(loadTray(storage)?.anchor).toBeUndefined();
    expect(loadTray(storage)?.source).toBe('plane');
  });

  it('a lost anchor (restore rejects) leaves the saved pose in place', async () => {
    const storage = memory();
    saveTray(storage, savedFrom(onTable, origin, 'gone'));
    const rt = runtime();
    const keeper = createKeeper(storage, rt.session);
    expect(keeper.start(origin)).not.toBeNull();
    await flush();
    expect(keeper.poll(rt.frame, space, origin)).toBeNull();
  });

  it('a recenter overwrites the save and deletes the old persistent anchor', async () => {
    const storage = memory();
    const rt = runtime();
    const keeper = createKeeper(storage, rt.session);
    keeper.keep(rt.frame, space, onTable, origin);
    await flush();
    const recentered: Placement = { ...DEFAULT_PLACEMENT, pose: poseToWorld(TRAY_POSE, origin) };
    keeper.keep(rt.frame, space, recentered, origin);
    expect(loadTray(storage)?.source).toBe('default');
    await flush();
    expect(rt.deleted).toEqual(['uuid-1']);
    expect(loadTray(storage)?.anchor).toBe('uuid-2');
    expect(loadTray(storage)?.pose.position).toEqual(TRAY_POSE.position);
  });

  it('a recenter during a pending restore wins: the late anchor does not move the tray back', async () => {
    const storage = memory();
    const store = new Map<string, FakeTransform>();
    const first = runtime(store);
    createKeeper(storage, first.session).keep(first.frame, space, onTable, origin);
    await flush();
    const second = runtime(store);
    const keeper = createKeeper(storage, second.session);
    keeper.start(origin);
    keeper.keep(second.frame, space, DEFAULT_PLACEMENT, origin);
    await flush();
    expect(keeper.poll(second.frame, space, origin)).toBeNull();
    expect(loadTray(storage)?.source).toBe('default');
  });

  it('two quick saves: only the newest anchor handle is kept', async () => {
    const storage = memory();
    const rt = runtime();
    const keeper = createKeeper(storage, rt.session);
    keeper.keep(rt.frame, space, onTable, origin);
    keeper.keep(rt.frame, space, DEFAULT_PLACEMENT, origin);
    await flush();
    await flush();
    expect(loadTray(storage)?.source).toBe('default');
    expect(loadTray(storage)?.anchor).toBe('uuid-2');
    expect(rt.store.has('uuid-1')).toBe(false);
  });

  it('a corrupt save is treated as none', () => {
    const storage = memory();
    storage.setItem(TRAY_KEY, 'garbage');
    expect(createKeeper(storage, runtime().session).start(origin)).toBeNull();
  });
});
