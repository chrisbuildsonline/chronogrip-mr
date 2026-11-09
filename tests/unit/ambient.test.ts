import { Box3, CircleGeometry, Mesh, Points, Scene, Vector3, type BufferGeometry, type Object3D } from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BIRD, CLOUD, FLICKER, THUMP, cloudLight, createAmbient, poseOf, stepEase, thumpLight, type AmbientStage } from '../../src/ambient';
import { DESKTOP_EYE, DESKTOP_TARGET } from '../../src/fit';
import { BENCH_Y } from '../../src/scenery';

// The module paints a few canvas textures; a no-op 2D context stands in for the DOM.
beforeAll(() => {
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(4 * 256 * 256) }) : () => undefined), set: () => true });
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

  it('a phone halves the dust (Hard\'s mist motes, Easy\'s dust)', () => {
    const motes = (g: Object3D) => {
      let n = 0;
      g.traverse((c) => (c as Points).isPoints && (n += (c as Points).geometry.attributes.position!.count));
      return n;
    };
    expect(motes(make('easy', { phone: true }).group)).toBe(motes(make('easy').group) / 2);
    expect(motes(make('hard', { phone: true }).group)).toBe(motes(make('hard').group) / 2);
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

  it.each(STAGES)('%s: every solid part stays past the bench\'s back edge (z < -0.95), so nothing floats between the eye and the bench', (stage) => {
    const a = make(stage);
    for (const [beats, seconds] of [[0, 0], [3.4, 10], [11.7, 31]] as const) {
      a.update(beats, seconds);
      a.group.updateMatrixWorld(true);
      a.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || (m.material as { blending?: number }).blending === 2) return;
        const box = new Box3().setFromObject(m);
        expect(box.max.z, `${stage} ${m.geometry.type} z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}`).toBeLessThan(-0.95);
      });
    }
    a.dispose();
  });

  describe('the Easy second hand on the painted clock hub', () => {
    // Measured on public/backdrops/c2_cube/nz.jpg (2048 px): a circle fit (scripts: art/backdrops/fit_hub.ts) on the clock's concentric
    // inner ring (r about 62 px, centre 1425, 986) and its outer edge (r about 88, centre 1427, 991) puts the hub at face pixel
    // (1426.5, 988.5). On the -z face of three's CubeTexture (x flipped, +y up) that is the world direction below.
    const MEASURED_HUB: [number, number, number] = [0.36563, 0.03225, -0.9302];
    const eye = new Vector3(...DESKTOP_EYE);
    const angle = (a: Vector3, b: Vector3) => (a.angleTo(b) * 180) / Math.PI;

    it('anchors the hand and the rays within 0.3 degrees of the measured hub direction', () => {
      const a = make('easy');
      a.group.updateMatrixWorld(true);
      const want = new Vector3(...MEASURED_HUB).normalize();
      const hand = a.group.children[0]!.getWorldPosition(new Vector3()).sub(eye).normalize();
      const rays = a.group.children[1]!.getWorldPosition(new Vector3()).sub(eye).normalize();
      expect(angle(hand, want), 'the hand pivot').toBeLessThan(0.3);
      expect(angle(rays, want), 'the rays').toBeLessThan(0.3);
      a.dispose();
    });

    it('reads as turning about its hub: the biggest round part sits at the pivot, with a small, close counterweight', () => {
      const a = make('easy');
      const discs: { r: number; y: number }[] = [];
      a.group.children[0]!.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && m.geometry instanceof CircleGeometry) discs.push({ r: m.geometry.parameters.radius, y: m.position.y });
      });
      expect(discs.length).toBeGreaterThanOrEqual(3);
      const big = discs.reduce((p, c) => (c.r > p.r ? c : p));
      expect(big.y, 'the largest disc (the hub cap) is at the pivot').toBeCloseTo(0, 9);
      for (const d of discs) if (d !== big) expect(d.r, 'every other disc is smaller').toBeLessThan(big.r);
      const tail = discs.filter((d) => d.y < 0);
      expect(tail).toHaveLength(1);
      expect(tail[0]!.r, 'the counterweight is at most half the cap').toBeLessThanOrEqual(big.r / 2 + 1e-9);
      a.dispose();
    });
  });

  describe('Hard on the Iron Tower render', () => {
    // az and el from out/final.log of the render (c3e_skyline SPOT lines): azimuth right of the view's forward (-z), elevation up.
    const dirOf = (az: number, el: number) => new Vector3(Math.sin((az * Math.PI) / 180) * Math.cos((el * Math.PI) / 180), Math.sin((el * Math.PI) / 180), -Math.cos((az * Math.PI) / 180) * Math.cos((el * Math.PI) / 180));
    const eye = new Vector3(...DESKTOP_EYE);
    const angle = (a: Vector3, b: Vector3) => (a.angleTo(b) * 180) / Math.PI;

    it('anchors the pendulum pivot and bob, and the wheel arbor, within 0.3 degrees of the logged spots', () => {
      const a = make('hard');
      a.group.updateMatrixWorld(true);
      const from = (o: Object3D) => o.getWorldPosition(new Vector3()).sub(eye).normalize();
      const pend = a.group.children[0]!;
      expect(angle(from(pend), dirOf(-27, 14)), 'pendulum pivot').toBeLessThan(0.3);
      expect(angle(from(a.group.children[1]!), dirOf(23, -3)), 'wheel arbor').toBeLessThan(0.3);
      // the bob hangs 4 m below at rest: its direction from the eye is the logged bob spot
      const bob = new Vector3();
      pend.traverse((o) => ((o as Mesh).isMesh && (o as Mesh).geometry.type === 'CylinderGeometry' && (o as Mesh).position.y <= -4 ? o.getWorldPosition(bob) : null));
      expect(angle(bob.clone().sub(eye).normalize(), dirOf(-27, -11.8)), 'pendulum bob at rest').toBeLessThan(0.3);
      a.dispose();
    });

    it('swings the pendulum once per beat, through the middle on the tick, and turns the wheel a tooth a beat', () => {
      const a = make('hard');
      const rot = () => {
        const swing = a.group.children[0]!.children[0]!;
        return swing.rotation.z;
      };
      a.update(0, 0);
      expect(rot()).toBeCloseTo(0, 9);
      a.update(0.5, 1);
      expect(Math.abs(rot())).toBeCloseTo(0.2, 6);
      a.update(1, 2);
      expect(rot()).toBeCloseTo(0, 6);
      a.dispose();
    });
  });
});
