import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  type WebGLRenderer,
} from 'three';
import { C, SCENE } from './palette';

export type WoodSet = { map: Texture; normalMap: Texture; roughnessMap: Texture };

/** UVs = local position / tile metres, picked by each vertex normal's dominant axis, so the grain has one scale on every face. */
export function planarUv<G extends BufferGeometry>(geo: G, tile: number, ofs = 0): G {
  const p = geo.attributes.position!;
  const n = geo.attributes.normal!;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = -p.getZ(i);
    } else if (az >= ax) {
      u = p.getX(i);
      v = p.getY(i);
    } else {
      u = -p.getZ(i);
      v = p.getY(i);
    }
    uv[2 * i] = u / tile + ofs;
    uv[2 * i + 1] = v / tile;
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  return geo;
}

const loader = new TextureLoader();

/** One tileable PBR wood set (public/textures; 1024 on a phone or in the low tier): albedo sRGB, normal and roughness linear, repeat-wrapped, anisotropy at the GPU's maximum. */
export function woodSet(name: 'tray' | 'bench', small: boolean, renderer: WebGLRenderer, low = false): WoodSet {
  const size = small || low ? 1024 : 2048;
  const aniso = low ? 1 : renderer.capabilities.getMaxAnisotropy();
  const load = (kind: string) => {
    const t = loader.load(`textures/${name}_${kind}_${size}.jpg`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  };
  const map = load('albedo');
  map.colorSpace = SRGBColorSpace;
  return { map, normalMap: load('normal'), roughnessMap: load('roughness') };
}

/** Varnished walnut for the tray; roughness 1 is a multiplier, the map holds the real values. */
export const trayWood = (set: WoodSet, low = false): MeshStandardMaterial =>
  low
    ? new MeshStandardMaterial({ ...set, roughness: 0.45, metalness: 0, normalScale: new Vector2(0.3, 0.3), envMapIntensity: 0.6 })
    : new MeshPhysicalMaterial({ ...set, roughness: 1, metalness: 0, normalScale: new Vector2(0.3, 0.3), clearcoat: 0.15, clearcoatRoughness: 0.3, envMapIntensity: 0.6 });

/** A 2.5 mm brass line inlaid 9 mm inside the board edge, flush with the top (tray-local XZ). */
export function brassInlay(halfX: number, halfZ: number, inset = 0.009, w = 0.0025): Mesh {
  const ox = halfX - inset;
  const oz = halfZ - inset;
  const o = new Shape();
  o.moveTo(-ox, -oz);
  o.lineTo(ox, -oz);
  o.lineTo(ox, oz);
  o.lineTo(-ox, oz);
  o.closePath();
  const h = new Path();
  h.moveTo(-ox + w, -oz + w);
  h.lineTo(-ox + w, oz - w);
  h.lineTo(ox - w, oz - w);
  h.lineTo(ox - w, -oz + w);
  h.closePath();
  o.holes.push(h);
  const m = new Mesh(new ShapeGeometry(o).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: C.brass, metalness: 1, roughness: 0.28 }));
  m.position.y = 0.0004;
  m.name = 'tray-inlay';
  return m;
}

/** The bench's top planks as one mesh (one draw call), each plank offset along the grain so no two match. */
export function benchTopGeometry(benchY: number): BufferGeometry[] {
  const planks = 9;
  const depth = 1.5;
  const w = depth / planks;
  const out: BufferGeometry[] = [];
  for (let i = 0; i < planks; i++) {
    const z = 0.55 - w * (i + 0.5);
    out.push(planarUv(new BoxGeometry(3.4, 0.04, w - 0.004).translate(0, benchY - 0.02 - (i % 3) * 0.0006, z), 1.0, i * 0.37));
  }
  return out;
}

export const benchWood = (set: WoodSet) =>
  new MeshStandardMaterial({ ...set, color: SCENE.benchTint, roughness: 1, metalness: 0, normalScale: new Vector2(0.5, 0.5) });
