import { CylinderGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';

/** The 25 WebXR hand joints in the spec's order (XRHand iterates them this way). */
export const HAND_JOINTS = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  ...(['index', 'middle', 'ring', 'pinky'] as const).flatMap((f) =>
    (['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'] as const).map((j) => `${f}-finger-${j}` as const),
  ),
] as const satisfies readonly XRHandJoint[];

/** Joint index pairs joined by a capsule body: wrist to each metacarpal, down every finger, and across the knuckles to fill the palm. */
export const HAND_BONES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  ...[5, 10, 15, 20].flatMap((m) => [[0, m], [m, m + 1], [m + 1, m + 2], [m + 2, m + 3], [m + 3, m + 4]] as const),
  [6, 11], [11, 16], [16, 21], [5, 10], [10, 15], [15, 20], [2, 6],
];

/** Drawn before everything else (the tray, gears and cards are all at 0), so their pixels behind a hand fail the depth test. */
export const OCCLUDER_ORDER = -1;
/** Joint radius when the runtime reports none, metres (a finger is about 2 cm across). */
const FALLBACK_RADIUS = 0.009;
/** Real fingers are a little fuller than the joint spheres; a hair more keeps edges from flickering through. */
const INFLATE = 1.15;

/** Depth only: writes no colour, so passthrough (the real hand) shows where it wins the depth test. */
export const occluderMaterial = () => new MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true });

export type HandOccluder = {
  root: Group;
  joints: InstancedMesh;
  bones: InstancedMesh;
  /** Joints as [x, y, z, radius] x 25 in world space, or null when the hand is not tracked (hides it). */
  update(joints: Float32Array | null): void;
};

/** A hand-shaped depth mask: a sphere per joint and a capsule body per bone, two draw calls, hidden until tracked. */
export function createHandOccluder(material = occluderMaterial()): HandOccluder {
  const root = new Group();
  root.name = 'hand-occluder';
  root.visible = false;
  const joints = new InstancedMesh(new SphereGeometry(1, 10, 8), material, HAND_JOINTS.length);
  const bones = new InstancedMesh(new CylinderGeometry(1, 1, 1, 10, 1, true), material, HAND_BONES.length);
  for (const m of [joints, bones]) {
    m.renderOrder = OCCLUDER_ORDER;
    m.frustumCulled = false; // instances move every frame; the base geometry's bounds mean nothing
    root.add(m);
  }
  const m4 = new Matrix4();
  const a = new Vector3();
  const b = new Vector3();
  const s = new Vector3();
  const q = new Quaternion();
  const UP = new Vector3(0, 1, 0);
  const radius = (j: Float32Array, i: number) => INFLATE * (j[i * 4 + 3]! > 0 ? j[i * 4 + 3]! : FALLBACK_RADIUS);
  const at = (j: Float32Array, i: number, out: Vector3) => out.set(j[i * 4]!, j[i * 4 + 1]!, j[i * 4 + 2]!);

  return {
    root,
    joints,
    bones,
    update(j) {
      root.visible = j !== null;
      if (!j) return;
      for (let i = 0; i < HAND_JOINTS.length; i++) {
        const r = radius(j, i);
        joints.setMatrixAt(i, m4.compose(at(j, i, a), q.identity(), s.set(r, r, r)));
      }
      HAND_BONES.forEach(([i, k], n) => {
        at(j, i, a);
        at(j, k, b);
        const r = Math.min(radius(j, i), radius(j, k));
        const length = a.distanceTo(b);
        q.setFromUnitVectors(UP, b.sub(a).normalize());
        bones.setMatrixAt(n, m4.compose(a.addScaledVector(b, length / 2), q, s.set(r, length, r)));
      });
      joints.instanceMatrix.needsUpdate = true;
      bones.instanceMatrix.needsUpdate = true;
    },
  };
}
