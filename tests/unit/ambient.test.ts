import { Box3, Mesh, Points, Scene, Vector3, type BufferGeometry, type Object3D } from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BIRD, CLOUD, FLICKER, THUMP, cloudLight, createAmbient, poseOf, stepEase, thumpLight, type AmbientStage } from '../../src/ambient';
import { DESKTOP_EYE, DESKTOP_TARGET } from '../../src/fit';
import { BENCH_Y } from '../../src/scenery';

// The module paints a few canvas textures; a no-op 2D context stands in for the DOM.
beforeAll(() => {
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => undefined), set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
});
afterAll(() => vi.unstubAllGlobals());

const STAGES: AmbientStage[] = ['easy', 'medium', 'hard'];
const make = (stage: AmbientStage, extra = {}) => createAmbient(stage, { eye: DESKTOP_EYE, target: DESKTOP_TARGET, ...extra });
const tris = (o: Object3D) => {
  let n = 0;
  o.traverse((c) => {
    const g = (c as Mesh).geometry as BufferGeometry | undefined;
    if (g && (c as Mesh).isMesh) n += (g.index ? g.index.count : g.attributes.position!.count) / 3;
  });
  return n;
};
const parts = (o: Object3D) => {
  let n = 0;
  o.traverse((c) => ((c as Mesh).isMesh || (c as Points).isPoints) && n++);
  return n;
};

describe('the escapement step and the light curves', () => {
  it('a step starts at rest, overshoots a little inside the first 22 % of the beat, and rests at 1 from there on', () => {
    expect(stepEase(0)).toBe(0);
    expect(stepEase(0.22)).toBeCloseTo(1, 9);
    expect(stepEase(0.5)).toBe(1);
    expect(stepEase(1)).toBe(1);
    expect(Math.max(...[0.05, 0.08, 0.11, 0.14, 0.17].map(stepEase))).toBeGreaterThan(1);
    expect(stepEase(-1)).toBe(0);
  });

  it('the cloud dims by at most its depth, once every 20 s; the thump is a short pulse at the start of each beat', () => {
    expect(CLOUD.every).toBe(20);
    expect(BIRD.every).toBe(14);
    for (let s = 0; s < 60; s += 0.37) {
      expect(cloudLight(s)).toBeGreaterThanOrEqual(1 - CLOUD.depth - 1e-9);
      expect(cloudLight(s)).toBeLessThanOrEqual(1);
      expect(cloudLight(s)).toBeCloseTo(cloudLight(s + CLOUD.every), 9);
    }
    expect(thumpLight(0)).toBeCloseTo(1 + THUMP, 9);
    expect(thumpLight(0.99)).toBeLessThan(1.001);
    expect(thumpLight(0.5)).toBeLessThan(thumpLight(0.1));
  });
});

describe('createAmbient', () => {
  it.each(STAGES)('%s builds a named group with parts, and update is deterministic with bounded multipliers', (stage) => {
    const a = make(stage);
    expect(a.group.name).toBe(`ambient-${stage}`);
    expect(parts(a.group)).toBeGreaterThanOrEqual(4);
    const first = a.update(7.3, 41.2);
    const pose = poseOf(a.group);
    a.update(2.1, 5);
    const again = a.update(7.3, 41.2);
    expect(again).toEqual(first);
    expect(poseOf(a.group)).toBe(pose);
    for (let b = 0; b < 40; b += 0.173) {
      const { bgMul, lightMul } = a.update(b, b * 1.7);
      expect(bgMul, `${stage} bg at ${b}`).toBeGreaterThanOrEqual(0.85);
      expect(bgMul).toBeLessThanOrEqual(1.1);
      expect(lightMul).toBeGreaterThanOrEqual(0.8);
      expect(lightMul).toBeLessThanOrEqual(1.41);
    }
    expect(FLICKER).toBeLessThan(0.06);
    a.dispose();
  });

  it.each(STAGES)('%s moves with the beat and with time', (stage) => {
    const a = make(stage);
    a.update(3, 10);
    const p1 = poseOf(a.group);
    a.update(4.1, 10);
    const p2 = poseOf(a.group);
    a.update(4.1, 30);
    expect(p2).not.toBe(p1);
    expect(poseOf(a.group)).not.toBe(p2);
    a.dispose();
  });

  it.each(STAGES)('%s with reduced motion stays at rest and leaves the light alone', (stage) => {
    const a = make(stage, { reducedMotion: true });
    const rest = poseOf(a.group);
    expect(a.update(5.5, 99)).toEqual({ bgMul: 1, lightMul: 1 });
    expect(a.update(9.1, 3)).toEqual({ bgMul: 1, lightMul: 1 });
    expect(poseOf(a.group)).toBe(rest);
    a.dispose();
  });

  it('a phone drops the haze on Hard and halves the dust', () => {
    expect(parts(make('hard', { phone: true }).group)).toBeLessThan(parts(make('hard').group));
    const motes = (g: Object3D) => {
      let n = 0;
      g.traverse((c) => (c as Points).isPoints && (n += (c as Points).geometry.attributes.position!.count));
      return n;
    };
    expect(motes(make('easy', { phone: true }).group)).toBe(motes(make('easy').group) / 2);
  });

  it('uses the real gear geometry: Medium and Hard stay far under the prototype\'s 21k triangles', () => {
    expect(tris(make('medium').group)).toBeLessThan(12000);
    expect(tris(make('hard').group)).toBeLessThan(12000);
    expect(tris(make('easy').group)).toBeLessThan(600);
  });

  it('dispose takes the group out of its scene', () => {
    const scene = new Scene();
    const a = make('easy');
    scene.add(a.group);
    a.dispose();
    expect(a.group.parent).toBeNull();
    expect(scene.children).toHaveLength(0);
  });

  it.each(STAGES)('%s: no solid part reaches into the workbench slab (its top at the bench height, back edge at z -0.95)', (stage) => {
    const bench = new Box3(new Vector3(-1.7, BENCH_Y - 0.04, -0.95), new Vector3(1.7, BENCH_Y, 0.59));
    const a = make(stage);
    for (const [beats, seconds] of [[0, 0], [3.4, 10], [11.7, 31]] as const) {
      a.update(beats, seconds);
      a.group.updateMatrixWorld(true);
      a.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || (m.material as { blending?: number }).blending === 2) return; // additive planes (rays, haze) are light, not solids
        const box = new Box3().setFromObject(m);
        expect(box.intersectsBox(bench), `${stage} ${m.geometry.type} at ${box.min.toArray().map((v) => v.toFixed(2))}..${box.max.toArray().map((v) => v.toFixed(2))}`).toBe(false);
      });
    }
    a.dispose();
  });
});
