import { describe, expect, it } from 'vitest';
import { Matrix4, Mesh, MeshStandardMaterial, Object3D, Scene, SphereGeometry, Vector3 } from 'three';
import { HAND_BONES, HAND_JOINTS, OCCLUDER_ORDER, createHandOccluder, occluderMaterial } from '../../src/occlude';

/** A flat hand: joint i at (i cm, 0, -40 cm), radius 1 cm. */
function flatHand(): Float32Array {
  const a = new Float32Array(HAND_JOINTS.length * 4);
  HAND_JOINTS.forEach((_, i) => a.set([i * 0.01, 0, -0.4, 0.01], i * 4));
  return a;
}

describe('hand occluder material', () => {
  it('writes depth only: no colour, depth on, opaque', () => {
    const m = occluderMaterial();
    expect(m.colorWrite).toBe(false);
    expect(m.depthWrite).toBe(true);
    expect(m.depthTest).toBe(true);
    expect(m.transparent).toBe(false);
  });
});

describe('hand occluder', () => {
  it('follows the 25 WebXR hand joints, wrist first, tips included', () => {
    expect(HAND_JOINTS).toHaveLength(25);
    expect(HAND_JOINTS[0]).toBe('wrist');
    expect(HAND_JOINTS).toContain('thumb-tip');
    expect(HAND_JOINTS).toContain('index-finger-tip');
    expect(HAND_JOINTS).toContain('pinky-finger-tip');
    expect(new Set(HAND_JOINTS).size).toBe(25);
  });

  it('joins joints with bones along every finger', () => {
    for (const [a, b] of HAND_BONES) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(HAND_JOINTS.length);
      expect(a).not.toBe(b);
    }
    // Every joint but the wrist ends at least one bone, so no fingertip floats free.
    for (let j = 1; j < HAND_JOINTS.length; j++) expect(HAND_BONES.some(([a, b]) => a === j || b === j), HAND_JOINTS[j]).toBe(true);
  });

  it('has one sphere per joint and one capsule body per bone, all with the depth-only material', () => {
    const o = createHandOccluder();
    expect(o.joints.count).toBe(25);
    expect(o.bones.count).toBe(HAND_BONES.length);
    for (const m of [o.joints, o.bones]) {
      const mat = m.material as ReturnType<typeof occluderMaterial>;
      expect(mat.colorWrite).toBe(false);
      expect(mat.depthWrite).toBe(true);
    }
  });

  it('draws before the tray and gears (lower render order)', () => {
    const o = createHandOccluder();
    const gear = new Mesh(new SphereGeometry(), new MeshStandardMaterial());
    expect(OCCLUDER_ORDER).toBeLessThan(gear.renderOrder);
    expect(o.joints.renderOrder).toBe(OCCLUDER_ORDER);
    expect(o.bones.renderOrder).toBe(OCCLUDER_ORDER);
  });

  it('is shown only while the hand is tracked', () => {
    const o = createHandOccluder();
    expect(o.root.visible).toBe(false);
    o.update(flatHand());
    expect(o.root.visible).toBe(true);
    o.update(null);
    expect(o.root.visible).toBe(false);
  });

  it('puts each sphere on its joint, sized by the joint radius', () => {
    const o = createHandOccluder();
    const scene = new Scene();
    scene.add(o.root);
    o.update(flatHand());
    const m = new Matrix4();
    const p = new Vector3();
    const s = new Vector3();
    for (const i of [0, 9, 24]) {
      o.joints.getMatrixAt(i, m);
      m.decompose(p, new Object3D().quaternion, s);
      expect(p.x).toBeCloseTo(i * 0.01, 6);
      expect(p.z).toBeCloseTo(-0.4, 6);
      expect(s.x).toBeGreaterThanOrEqual(0.01);
      expect(s.x).toBeLessThan(0.02);
    }
  });

  it('stretches each bone between its two joints', () => {
    const o = createHandOccluder();
    o.update(flatHand());
    const m = new Matrix4();
    const p = new Vector3();
    const s = new Vector3();
    HAND_BONES.forEach(([a, b], i) => {
      o.bones.getMatrixAt(i, m);
      m.decompose(p, new Object3D().quaternion, s);
      expect(p.x, `bone ${a}-${b}`).toBeCloseTo(((a + b) / 2) * 0.01, 6);
      expect(s.y, `bone ${a}-${b}`).toBeCloseTo(Math.abs(b - a) * 0.01, 6);
    });
  });

  it('falls back to a finger-sized radius when the runtime gives none', () => {
    const o = createHandOccluder();
    const hand = flatHand();
    for (let i = 0; i < 25; i++) hand[i * 4 + 3] = Number.NaN;
    o.update(hand);
    const m = new Matrix4();
    const s = new Vector3();
    o.joints.getMatrixAt(5, m);
    m.decompose(new Vector3(), new Object3D().quaternion, s);
    expect(s.x).toBeGreaterThan(0.005);
    expect(s.x).toBeLessThan(0.02);
  });
});
