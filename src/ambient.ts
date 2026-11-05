/**
 * Animated stage backdrops (F47): moving parts layered over each stage's cubemap, ticking on the stage music's beat.
 * Desktop and phone only: never add the group in immersive-ar (the room is the backdrop there).
 *
 * Everything is placed by a direction on the panorama (a spot on a 1280x760 frame of the default desktop view) at a
 * distance from the eye, so each part stays on the same spot of the cubemap at any window size or aspect.
 *
 * Use:
 *   const amb = createAmbient('easy', { eye: DESKTOP_EYE, target: DESKTOP_TARGET, phone, reducedMotion });
 *   scene.add(amb.group);                       // when the stage backdrop is shown; remove it in XR and on menus
 *   // every frame, beats = the music clock in beats since the theme started (fallback: seconds * bpm / 60)
 *   const { bgMul, lightMul } = amb.update(beats, seconds);
 *   scene.backgroundIntensity = bgMul;          // the room light: clouds (easy), lamp flicker (medium), thump (hard)
 *   amb.dispose();                              // when the stage changes
 */
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, DoubleSide,
  Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera,
  PlaneGeometry, Points, PointsMaterial, Shape, ShapeGeometry, SphereGeometry, SRGBColorSpace, Texture, Vector3,
} from 'three';
import { gearGeometry } from './gear';

export type AmbientStage = 'easy' | 'medium' | 'hard';
export type Vec3 = readonly [number, number, number];
export type AmbientOptions = {
  eye: Vec3;
  target: Vec3;
  /** Halves the dust and drops Hard's haze. */
  phone?: boolean;
  /** Parts stay where they are; no motion, no light changes. */
  reducedMotion?: boolean;
};
export type Ambient = {
  group: Group;
  /** beats: the music clock in beats (fractional); seconds: a free-running clock for drift. */
  update(beats: number, seconds: number): { bgMul: number; lightMul: number };
  dispose(): void;
};

/** Seconds a bird takes across the Easy window, and how often it comes. */
export const BIRD = { cross: 4, every: 14 } as const;
/** Easy: a cloud dims the window light by `depth` once per `every` seconds. */
export const CLOUD = { every: 20, depth: 0.12 } as const;
/** Medium lamp flicker and Hard thump, as fractions of the room light. */
export const FLICKER = 0.045;
export const THUMP = 0.07;

const FOV = 50, REF_W = 1280, REF_H = 760;
const MODULE = 0.034;

/** One escapement step per beat: a quick jump with a small overshoot in the first 22 % of the beat, then rest. */
export function stepEase(t: number): number {
  const c = 1.9, u = Math.min(1, Math.max(0, t) / 0.22);
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
}
/** Easy's room light over time: 1, dipping by CLOUD.depth once per CLOUD.every seconds. */
export const cloudLight = (s: number): number => 1 - CLOUD.depth * Math.max(0, Math.sin((s / CLOUD.every) * Math.PI * 2)) ** 3;
/** Hard's thump: a short bright pulse at the start of every beat. */
export const thumpLight = (frac: number): number => 1 + THUMP * Math.exp(-frac * 7);
const noise = (t: number) => Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.7) * 0.3 + Math.sin(t * 29.7 + 4.1) * 0.2;

export function createAmbient(stage: AmbientStage, opts: AmbientOptions): Ambient {
  const eye = new Vector3(...opts.eye);
  const ref = new PerspectiveCamera(FOV, REF_W / REF_H, 0.05, 100);
  ref.position.copy(eye); ref.lookAt(new Vector3(...opts.target)); ref.updateMatrixWorld();
  /** A point d metres from the eye, on the panorama spot that sits at (sx, sy) of the reference frame. */
  const at = (sx: number, sy: number, d: number) =>
    new Vector3((sx / REF_W) * 2 - 1, -((sy / REF_H) * 2 - 1), 0.5).unproject(ref).sub(eye).normalize().multiplyScalar(d).add(eye);
  /** n pixels of the reference frame, in metres at distance d. */
  const px = (n: number, d: number) => (n * 2 * d * Math.tan(MathUtils.degToRad(FOV / 2))) / REF_H;
  const face = <T extends Object3D>(o: T, p: Vector3): T => { o.position.copy(p); o.lookAt(eye); return o; };

  const group = new Group(); group.name = `ambient-${stage}`;
  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (owned.push(x), x);
  const updates: ((b: number, s: number, frac: number) => void)[] = [];
  let bgMul = 1, lightMul = 1;

  // The parts bring their own warm glow and stronger reflections, so they read in a dark room whatever lights the game has.
  const metal = (color: number, roughness: number, glow: number) =>
    keep(new MeshStandardMaterial({ color, metalness: 1, roughness, envMapIntensity: 2.2, emissive: glow, emissiveIntensity: 1 }));
  const brass = metal(0xc8963e, 0.32, 0x3a2408);
  const darkBrass = metal(0xa87a34, 0.38, 0x2a1a06);
  const steel = metal(0xb9bcc2, 0.25, 0x1c1c1e);

  const tex = (w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void): Texture => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
    const t = keep(new CanvasTexture(c)); t.colorSpace = SRGBColorSpace; return t;
  };
  const softDot = (rgb: string) => tex(32, 32, (x) => {
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  });
  const additive = (o: { map: Texture; opacity: number }) => keep(new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, ...o }));
  const mesh = <G extends BufferGeometry>(g: G, m: MeshBasicMaterial | MeshStandardMaterial) => new Mesh(keep(g), m);

  /** A gear from src/gear.ts (involute teeth: far fewer triangles than bevelled demo gears), pitch radius MODULE * teeth / 2. */
  function gear(teeth: number, mat = brass) {
    const rp = (MODULE * teeth) / 2, depth = 0.05;
    const m = mesh(gearGeometry({ module: MODULE, teeth, thickness: depth, holeRadius: rp * 0.14 }), mat), axle = mesh(new CylinderGeometry(rp * 0.1, rp * 0.1, depth * 3, 16), steel);
    axle.rotation.x = Math.PI / 2; m.add(axle);
    return Object.assign(m, { rp, teeth, ratio: 1, rot0: 0 });
  }
  type Gear = ReturnType<typeof gear>;
  /** A meshing train: each gear on the previous one's pitch circle, phased so a tooth lands in a gap. */
  function train(parent: Object3D, specs: { teeth: number; angle?: number; mat?: MeshStandardMaterial }[]): Gear[] {
    const out: Gear[] = [], wrap = (v: number, w: number) => ((v % w) + w) % w;
    specs.forEach(({ teeth, angle = 0, mat }, i) => {
      const g = gear(teeth, mat), p = out[i - 1];
      if (p) {
        const d = p.rp + g.rp, wp = (Math.PI * 2) / p.teeth, wi = (Math.PI * 2) / teeth;
        g.position.set(p.position.x + d * Math.cos(angle), p.position.y + d * Math.sin(angle), 0);
        g.ratio = -p.ratio * (p.rp / g.rp);
        const delta = wrap(0.4 * wp + p.rot0 - angle + wp / 2, wp) - wp / 2;
        g.rot0 = angle + Math.PI - delta * (p.rp / g.rp) - 0.9 * wi;
      }
      parent.add(g); out.push(g);
    });
    return out;
  }
  const turn = (gears: Gear[], drive: number) => gears.forEach((g) => (g.rotation.z = g.rot0 - drive * g.ratio));

  /** n motes over a reference-frame rectangle between two distances, drifting on slow noise. */
  function dust(n: number, [x0, y0, x1, y1]: readonly [number, number, number, number], near: number, far: number, rgb: string, size: number, fall: number, opacity: number) {
    n = opts.phone ? Math.round(n / 2) : n;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { const p = at(x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0), near + Math.random() * (far - near)); pos.set([p.x, p.y, p.z], i * 3); seed[i] = Math.random() * 100; }
    const home = pos.slice(), geo = keep(new BufferGeometry()); geo.setAttribute('position', new BufferAttribute(pos, 3));
    const mat = keep(new PointsMaterial({ size, map: softDot(rgb), transparent: true, opacity, depthWrite: false, blending: AdditiveBlending }));
    group.add(new Points(geo, mat));
    updates.push((_b, s) => {
      for (let i = 0; i < n; i++) {
        const k = seed[i]!, u = s * 0.12 + k;
        pos[i * 3] = home[i * 3]! + Math.sin(u) * 0.08 + Math.sin(u * 2.3) * 0.03;
        pos[i * 3 + 1] = home[i * 3 + 1]! - ((s * fall + k) % 0.5) + 0.25 + Math.cos(u * 1.7) * 0.03;
        pos[i * 3 + 2] = home[i * 3 + 2]! + Math.cos(u * 0.9) * 0.08;
      }
      geo.attributes.position!.needsUpdate = true;
      mat.opacity = opacity * (0.85 + 0.15 * Math.sin(s * 0.7));
    });
  }

  if (stage === 'easy') {
    // the attic clock: its hub sits at (1113, 8) of the reference frame (checked zoomed in at two aspects)
    const HUB: [number, number] = [1113, 8];
    const iron = keep(new MeshBasicMaterial({ color: 0x140b05 }));
    const L = px(250, 6), sweep = new Group();
    const arm = mesh(new BoxGeometry(px(5, 6), L * 1.25, 0.01), iron); arm.position.y = L * 0.375;
    const weight = mesh(new CircleGeometry(px(16, 6), 32), iron); weight.position.y = -L * 0.2;
    const tip = mesh(new CircleGeometry(px(9, 6), 24), iron); tip.position.y = L * 0.82;
    sweep.add(arm, weight, tip);
    group.add(face(new Group().add(sweep), at(...HUB, 6)));
    updates.push((b) => (sweep.rotation.z = 2.4 - ((Math.floor(b) + stepEase(b % 1)) * Math.PI * 2) / 60)); // a second hand: 60 beats a turn

    const rayTex = tex(512, 512, (x, w) => {
      x.translate(w / 2, w / 2);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + Math.random() * 0.15, s = 0.03 + Math.random() * 0.05, g = x.createRadialGradient(0, 0, 20, 0, 0, w / 2);
        g.addColorStop(0, 'rgba(255,200,120,.9)'); g.addColorStop(1, 'rgba(255,200,120,0)');
        x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, w / 2, a - s, a + s); x.fill();
      }
    });
    const rayMat = additive({ map: rayTex, opacity: 0.18 }), rays = mesh(new PlaneGeometry(px(1700, 5.8), px(1700, 5.8)), rayMat);
    group.add(face(rays, at(...HUB, 5.8)));
    updates.push((_b, s) => { rayMat.opacity = (0.13 + 0.07 * (0.5 + 0.5 * Math.sin(s * 0.9))) * cloudLight(s); rays.rotation.z = 0.05 * Math.sin(s * 0.21); });

    // a gull silhouette gliding past the window, wings flapping
    const sil = keep(new MeshBasicMaterial({ color: 0x1a0f07, side: DoubleSide }));
    const body = new Shape(); body.absellipse(0, 0, 0.32, 0.16, 0, Math.PI * 2, false, 0);
    const wing = new Shape(); wing.moveTo(0, 0.04); wing.quadraticCurveTo(-0.7, 0.55, -1.7, 0.2); wing.quadraticCurveTo(-0.8, 0.12, 0, -0.08); wing.lineTo(0, 0.04);
    const wingL = mesh(new ShapeGeometry(wing), sil), wingR = new Mesh(wingL.geometry, sil); wingR.scale.x = -1;
    const bird = new Group().add(mesh(new ShapeGeometry(body), sil), wingL, wingR); bird.scale.setScalar(px(34, 5.5)); group.add(bird);
    updates.push((_b, s) => {
      const k = (s % BIRD.every) / BIRD.cross;
      bird.visible = k < 1;
      if (k >= 1) return;
      face(bird, at(1320 - k * 600, 250 - k * 170 + Math.sin(k * 9) * 10, 5.5));
      wingL.scale.y = wingR.scale.y = Math.sin(s * 14);
    });

    dust(900, [520, -40, 1280, 560], 0.9, 3.6, '255,214,150', 0.016, 0.01, 0.8);
    updates.push((_b, s) => (bgMul *= cloudLight(s)));
  }

  if (stage === 'medium') {
    const wall = face(new Group(), at(915, 225, 4.2)); wall.scale.setScalar(0.6); group.add(wall);
    const g = train(wall, [{ teeth: 36 }, { teeth: 12, mat: darkBrass, angle: 0.2 }, { teeth: 28, angle: -0.35 }, { teeth: 10, mat: darkBrass, angle: 0.5 }]);
    updates.push((b) => turn(g, ((Math.floor(b) + stepEase(b % 1)) * Math.PI * 2) / 36)); // one tooth of the big wheel per beat

    const pendulum = face(new Group(), at(365, 115, 3.6)), swing = new Group(); pendulum.add(swing); group.add(pendulum);
    const rod = mesh(new CylinderGeometry(0.008, 0.008, 0.85, 10), steel); rod.position.y = -0.425;
    const bob = mesh(new CylinderGeometry(0.12, 0.12, 0.03, 48), metal(0xd9a84e, 0.28, 0x4a2e0c)); bob.rotation.x = Math.PI / 2; bob.position.y = -0.88;
    swing.add(rod, bob); pendulum.add(mesh(new SphereGeometry(0.025, 16, 12), darkBrass));
    updates.push((b) => (swing.rotation.z = 0.2 * Math.sin(Math.PI * b))); // one swing per beat, through the middle on the tick

    dust(700, [0, 0, 1280, 620], 0.8, 3.2, '255,220,160', 0.014, 0.015, 0.7);
    const shaftTex = tex(64, 256, (x) => {
      const g2 = x.createLinearGradient(0, 0, 64, 0); g2.addColorStop(0, 'rgba(255,190,110,0)'); g2.addColorStop(0.5, 'rgba(255,190,110,.55)'); g2.addColorStop(1, 'rgba(255,190,110,0)');
      x.fillStyle = g2; x.fillRect(0, 0, 64, 256);
      const v = x.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.25, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalCompositeOperation = 'destination-in'; x.fillStyle = v; x.fillRect(0, 0, 64, 256);
    });
    const shaft = face(mesh(new PlaneGeometry(0.9, 3.2), additive({ map: shaftTex, opacity: 0.16 })), at(330, 250, 2.2)); shaft.rotateZ(-0.45); group.add(shaft);
    updates.push((_b, s) => { const f = noise(s); bgMul *= 1 + FLICKER * f; lightMul *= 1 + 0.12 * f; });
  }

  if (stage === 'hard') {
    // big gears close up: top-left, and bottom-right under the giant balance wheel and hairspring (kept clear)
    const left = face(new Group(), at(55, 25, 1.5)); left.scale.setScalar(px(165, 1.5) / ((MODULE * 40) / 2)); group.add(left);
    const gl = train(left, [{ teeth: 40 }, { teeth: 12, mat: darkBrass, angle: -1.05 }]);
    const right = face(new Group(), at(1262, 445, 1.7)); right.scale.setScalar(px(135, 1.7) / ((MODULE * 30) / 2)); group.add(right);
    const gr = train(right, [{ teeth: 30, mat: darkBrass }, { teeth: 10, mat: darkBrass, angle: 2.6 }]);
    updates.push((b) => { const d = Math.floor(b) + stepEase(b % 1); turn(gl, (d * Math.PI * 2) / 40); turn(gr, -(d * Math.PI * 2) / 30); });

    if (!opts.phone) { // warm haze: a few huge soft puffs drifting across the movement
      const puff = softDot('255,170,90');
      const puffs = Array.from({ length: 7 }, (_, i) => {
        const m = mesh(new PlaneGeometry(1, 1), additive({ map: puff, opacity: 0.07 })), d = 3 + (i % 3);
        m.scale.setScalar(px(520 + (i % 2) * 260, d)); group.add(m);
        return { m, sx: (i / 7) * 1500 - 100, sy: 120 + (i % 3) * 110, d, speed: 9 + (i % 4) * 4 };
      });
      updates.push((_b, s) => puffs.forEach((u) => face(u.m, at(((u.sx + s * u.speed) % 1600) - 160, u.sy + Math.sin(s * 0.3 + u.sx) * 20, u.d))));
    }
    dust(450, [0, 0, 1280, 560], 0.8, 3.2, '235,225,205', 0.01, 0.03, 0.6);
    updates.push((_b, _s, frac) => { const k = thumpLight(frac); bgMul *= k; lightMul *= 1 + ((k - 1) / THUMP) * 0.4; });
  }

  for (const u of updates) u(0, 0, 0); // place everything once at rest (reduced motion keeps this pose)
  bgMul = 1; lightMul = 1;

  return {
    group,
    update(beats, seconds) {
      bgMul = 1; lightMul = 1;
      if (opts.reducedMotion || !Number.isFinite(beats)) return { bgMul, lightMul };
      const frac = beats - Math.floor(beats);
      for (const u of updates) u(beats, seconds, frac);
      return { bgMul, lightMul };
    },
    dispose() { group.removeFromParent(); for (const o of owned) o.dispose(); owned.length = 0; },
  };
}

/** A short string of every part's pose (positions, z rotations, the first motes): the test hook's way to tell whether anything moved. */
export function poseOf(group: Group): string {
  const out: string[] = [];
  group.traverse((o) => {
    out.push(`${o.position.x.toFixed(5)},${o.position.y.toFixed(5)},${o.position.z.toFixed(5)},${o.rotation.z.toFixed(5)},${o.visible ? 1 : 0}`);
    const pts = o as Points;
    if (pts.isPoints) out.push([...(pts.geometry.attributes.position!.array as Float32Array).slice(0, 6)].map((v) => v.toFixed(5)).join(','));
  });
  return out.join('|');
}
