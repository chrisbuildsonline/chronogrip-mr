import { CanvasTexture, Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2, type Texture } from 'three';
import { C } from './palette';

/**
 * The metals: polished brass, cooler steel and glossy dial enamel, each lit by the stage's environment map (src/scenery.ts).
 * A small brushed-metal pair of maps (a roughness streak map and a matching normal map) is baked once in code, tileable, with the
 * streaks along U; no image files.
 */
const SIZE = 256;

/** A tileable streak height field: long horizontal scratches. */
function streaks(): Float32Array {
  const h = new Float32Array(SIZE * SIZE);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = Array.from({ length: SIZE }, () => rnd());
  for (let y = 0; y < SIZE; y++) {
    // each row drifts along x with a couple of slow sines (periodic in SIZE, so the tile wraps)
    const a = rnd() * 6.28;
    const b = rnd() * 6.28;
    for (let x = 0; x < SIZE; x++) {
      h[y * SIZE + x] = 0.55 * rows[y]! + 0.25 * Math.sin((2 * Math.PI * 3 * x) / SIZE + a) * rows[(y + 1) % SIZE]! + 0.2 * Math.sin((2 * Math.PI * 7 * x) / SIZE + b) * rnd();
    }
  }
  return h;
}

let maps: { roughness: Texture; normal: Texture } | null = null;
const make = (draw: (g: CanvasRenderingContext2D) => void, srgb = false): CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  draw(canvas.getContext('2d')!);
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
};

/** The shared maps (built on first use). Roughness in the green channel, 0.7 to 1 (a multiplier of the material's roughness). */
export function brushedMaps(): { roughness: Texture; normal: Texture } {
  if (maps) return maps;
  const h = streaks();
  const at = (x: number, y: number) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!;
  maps = {
    roughness: make((g) => {
      const img = g.createImageData(SIZE, SIZE);
      for (let i = 0; i < SIZE * SIZE; i++) {
        const v = Math.round(255 * (0.7 + 0.3 * h[i]!));
        img.data.set([v, v, v, 255], i * 4);
      }
      g.putImageData(img, 0, 0);
    }),
    normal: make((g) => {
      const img = g.createImageData(SIZE, SIZE);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const dx = (at(x + 1, y) - at(x - 1, y)) * 2;
          const dy = (at(x, y + 1) - at(x, y - 1)) * 2;
          const len = Math.hypot(dx, dy, 1);
          img.data.set([Math.round(255 * (0.5 - (dx / len) * 0.5)), Math.round(255 * (0.5 + (dy / len) * 0.5)), Math.round(255 * (0.5 + (1 / len) * 0.5)), 255], (y * SIZE + x) * 4);
        }
      }
      g.putImageData(img, 0, 0);
    }),
  };
  return maps;
}

/** The brushed maps at a texture repeat: gears use world-scaled UVs (a few centimetres a tile), small round parts the 0..1 ones. */
const repeated = new Map<number, { roughness: Texture; normal: Texture }>();
function brushedAt(repeat: number) {
  let m = repeated.get(repeat);
  if (!m) {
    const base = brushedMaps();
    const r = base.roughness.clone();
    const n = base.normal.clone();
    for (const t of [r, n]) {
      t.repeat.set(repeat, repeat);
      t.needsUpdate = true;
    }
    m = { roughness: r, normal: n };
    repeated.set(repeat, m);
  }
  return m;
}

// The metals reflect the stage's environment map (a PMREM of its cubemap) while on a flat screen; the wood and the rest keep the
// scene's neutral room lighting. With no stage environment (immersive-ar, or before the backdrop loads) a metal uses the scene's.
let stageEnv: Texture | null = null;
const live = new Set<MeshStandardMaterial>();
/** Points every metal, present and future, at a stage environment (or back at the scene's with null). */
export function setMetalEnv(env: Texture | null): void {
  stageEnv = env;
  for (const m of live) {
    m.envMap = env;
    m.needsUpdate = true;
  }
}
export const metalEnv = (): Texture | null => stageEnv;
function track<M extends MeshStandardMaterial>(m: M): M {
  m.envMap = stageEnv;
  m.envMapIntensity = ENV_INTENSITY;
  live.add(m);
  m.addEventListener('dispose', () => live.delete(m));
  return m;
}
/** The backdrops are dim, warm LDR images, so a metal reads them stronger than 1. */
const ENV_INTENSITY = 10;

/** Polished brass: metalness 1, roughness about 0.3, a warm colour, a subtle brushing. */
export const brass = (repeat = 40): MeshStandardMaterial =>
  track(new MeshStandardMaterial({ color: new Color(C.brass), metalness: 0.62, roughness: 0.48, roughnessMap: brushedAt(repeat).roughness, normalMap: brushedAt(repeat).normal, normalScale: new Vector2(0.25, 0.25), envMapIntensity: 1 }));

/** Darker aged brass for plates and plinths. */
export const bronze = (repeat = 3): MeshStandardMaterial =>
  track(new MeshStandardMaterial({ color: 0x7d5f33, metalness: 1, roughness: 0.5, roughnessMap: brushedAt(repeat).roughness, normalMap: brushedAt(repeat).normal, normalScale: new Vector2(0.25, 0.25), envMapIntensity: 1 }));

/** Cooler steel for axles, screws and springs. */
export const steel = (repeat = 40): MeshStandardMaterial =>
  track(new MeshStandardMaterial({ color: 0x9aa3ab, metalness: 1, roughness: 0.5, roughnessMap: brushedAt(repeat).roughness, normalMap: brushedAt(repeat).normal, normalScale: new Vector2(0.2, 0.2), envMapIntensity: 1 }));
