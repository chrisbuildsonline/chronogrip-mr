import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  type Scene,
  type CubeTexture,
  type PMREMGenerator,
  type WebGLRenderTarget,
  TorusGeometry,
  Vector3,
  Color,
  DataTexture,
  LinearFilter,
  PlaneGeometry,
  RGBAFormat,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Placement } from './anchor';
import { type BackdropId } from './backdrop';
import { C, SCENE } from './palette';
import { metalEnv, setMetalEnv, setMetalEnvIntensity } from './metal';

/** 'inline' is the desktop and phone view (the bench under the tray, a rendered cubemap behind it); 'xr' is immersive-ar (a few props on the real table, nothing else). */
export type SceneryMode = 'inline' | 'xr';

export type Scenery = {
  mode: SceneryMode;
  group: Group;
  /** Triangles of every mesh in the group. */
  tris: number;
};

/** The floor under the tray (the workbench top, before it went): the contact shadow's height and where confetti lands. Just under the lowest point of the tilted tray (its near edge, about y = -0.332). */
export const BENCH_Y = -0.336;
/** How strongly the metals read Hard's night environment (the attics' is 10). */
const HARD_ENV_INTENSITY = 34;

/** Darkness at the middle of the contact shadow, and how far its soft edge reaches past the footprint (metres). */
export const SHADOW = { opacity: 0.75, spread: 0.1 } as const;

/**
 * Alpha of the contact shadow at (u, v) in 0..1 over its plane: a rounded rectangle, dark inside, with a smooth falloff over
 * `soft` (a fraction of the plane) at its edge. Pure, for the texture and the tests.
 */
export function shadowAlpha(u: number, v: number, soft = 0.25): number {
  const dx = Math.max(0, Math.abs(u - 0.5) * 2 - (1 - soft * 2)), dy = Math.max(0, Math.abs(v - 0.5) * 2 - (1 - soft * 2));
  const d = Math.min(1, Math.hypot(dx, dy) / (soft * 2));
  return (1 - d * d * (3 - 2 * d)); // smoothstep down to 0 at the plane's edge
}

/**
 * A soft shadow on the floor under the tray and the bird's stand, now that there is no workbench: a flat dark rounded patch
 * at BENCH_Y covering `foot` (the tray's world box) plus SHADOW.spread, with a blurred edge, drawn under the tray.
 */
export function contactShadow(foot: { min: { x: number; z: number }; max: { x: number; z: number } }): Mesh {
  const W = 128, H = 64, data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) data[(j * W + i) * 4 + 3] = Math.round(255 * shadowAlpha((i + 0.5) / W, (j + 0.5) / H));
  const tex = new DataTexture(data, W, H, RGBAFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  const sx = foot.max.x - foot.min.x + 2 * SHADOW.spread, sz = foot.max.z - foot.min.z + 2 * SHADOW.spread;
  const mesh = new Mesh(new PlaneGeometry(sx, sz), new MeshBasicMaterial({ color: C.ink, alphaMap: tex, transparent: true, opacity: SHADOW.opacity, depthWrite: false }));
  mesh.name = 'contact-shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((foot.min.x + foot.max.x) / 2, BENCH_Y + 0.0005, (foot.min.z + foot.max.z) / 2);
  mesh.renderOrder = -1; // under the tray's own transparent bits
  return mesh;
}

/** Direction the workshop's light comes from (the game's key light, from the upper left), for the baked shading. */
const KEY = new Vector3(-0.6, 0.8, 0.25).normalize();

/**
 * Merges small primitives into one geometry with a colour per vertex, so a whole part is one draw call. With `bake`, each
 * vertex colour is its palette colour shaded by its face's angle to the key light and darkened towards the edges of the
 * room (a vignette), so an unlit material still reads as soft, directional light and the backdrop recedes.
 */
class Bag {
  private readonly geos: BufferGeometry[] = [];
  private readonly m = new Matrix4();

  constructor(private readonly bake = false) {}

  add(g: BufferGeometry, color: string, at: readonly [number, number, number], turn: readonly [number, number, number] = [0, 0, 0]) {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    geo.deleteAttribute('uv');
    geo.applyMatrix4(this.m.compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...turn)), new Vector3(1, 1, 1)));
    const c = new Color(color);
    const pos = geo.attributes.position!;
    const nor = geo.attributes.normal!;
    const rgb = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let k = 1;
      if (this.bake) {
        const lit = Math.max(0, nor.getX(i) * KEY.x + nor.getY(i) * KEY.y + nor.getZ(i) * KEY.z);
        const edge = Math.min(1, Math.hypot(pos.getX(i) * 0.55, (pos.getY(i) - 0.1) * 0.6));
        k = (0.74 + 0.46 * lit) * (1 - 0.38 * edge * edge);
      }
      rgb.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    geo.setAttribute('color', new BufferAttribute(rgb, 3));
    this.geos.push(geo);
    g.dispose();
    return this;
  }

  box(size: readonly [number, number, number], color: string, at: readonly [number, number, number], turn?: readonly [number, number, number]) {
    return this.add(new BoxGeometry(...size), color, at, turn);
  }

  cyl(top: number, bottom: number, h: number, seg: number, color: string, at: readonly [number, number, number], turn?: readonly [number, number, number]) {
    return this.add(new CylinderGeometry(top, bottom, h, seg), color, at, turn);
  }

  geometry(): BufferGeometry {
    const merged = mergeGeometries(this.geos, false)!;
    for (const g of this.geos) g.dispose();
    return merged;
  }
}

const triangles = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position!.count) / 3;

/** Unlit: the light is baked into the vertex colours (Bag), so a screen-filling wall and bench cost almost nothing per pixel, even on a software rasteriser. */
function named(name: string, geo: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  const mesh = new Mesh(geo, material);
  mesh.name = name;
  return mesh;
}

/** The small props of the real table in MR, each a single mesh named prop-*, lying beside the play area (x measured from the tray's centre). */
function tableProps(): Mesh[] {
  const mat = () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15, flatShading: true });
  const props: Mesh[] = [];

  // Oil can: a red tin with a long spout and a ring handle.
  const can = new Bag();
  can.cyl(0.026, 0.028, 0.065, 10, SCENE.canRed, [0, 0.0325, 0]);
  can.cyl(0.012, 0.026, 0.02, 10, SCENE.canRed, [0, 0.075, 0]);
  can.cyl(0.004, 0.006, 0.075, 6, SCENE.steel, [0.04, 0.085, 0], [0, 0, -1.0]);
  can.box([0.012, 0.05, 0.008], SCENE.steelDark, [-0.03, 0.05, 0]);
  props.push(named('prop-oil-can', can.geometry().translate(-0.33, 0, 0.0), mat()));

  // Screwdriver: teal handle, steel shaft, lying along the table.
  const driver = new Bag();
  driver.cyl(0.0095, 0.0085, 0.055, 8, SCENE.handleTeal, [0, 0.0095, 0.025], [Math.PI / 2, 0, 0]);
  driver.cyl(0.0028, 0.0028, 0.075, 6, SCENE.steel, [0, 0.0095, -0.04], [Math.PI / 2, 0, 0]);
  props.push(named('prop-screwdriver', driver.geometry().rotateY(0.25).translate(-0.37, 0, 0.1), mat()));

  // Loupe: a glass lens in a steel rim on a short wooden handle.
  const loupe = new Bag();
  loupe.add(new TorusGeometry(0.03, 0.0035, 5, 14).rotateX(Math.PI / 2), SCENE.steel, [0, 0.0045, 0]);
  loupe.cyl(0.027, 0.027, 0.003, 14, SCENE.glass, [0, 0.0035, 0]);
  loupe.cyl(0.006, 0.007, 0.06, 7, SCENE.woodLight, [0, 0.0075, 0.062], [Math.PI / 2, 0, 0]);
  props.push(named('prop-loupe', loupe.geometry().rotateY(-0.5).translate(0.33, 0, 0.07), mat()));

  // Spare gear dish: a cream dish holding a few small steel gears.
  const dish = new Bag();
  dish.cyl(0.055, 0.04, 0.016, 14, C.deep, [0, 0.008, 0]);
  dish.cyl(0.048, 0.048, 0.002, 14, SCENE.steelDark, [0, 0.0165, 0]);
  dish.cyl(0.018, 0.018, 0.004, 10, SCENE.steel, [-0.015, 0.019, 0.006]);
  dish.cyl(0.013, 0.013, 0.004, 10, SCENE.steel, [0.02, 0.021, -0.012]);
  dish.cyl(0.009, 0.009, 0.004, 8, SCENE.steel, [0.012, 0.0215, 0.022]);
  props.push(named('prop-gear-dish', dish.geometry().translate(0.38, 0, -0.03), mat()));

  return props;
}

/** Builds the scenery of one mode as a group; nothing is added to a scene here. */
export function buildScenery(mode: SceneryMode): Scenery {
  const group = new Group();
  group.name = `scenery-${mode}`;
  if (mode === 'xr') {
    group.add(...tableProps());
  }
  // inline: no workbench (Chris, 2026-11-09): the tray stands in front of each room's own painted floor, on a soft contact shadow (contactShadow).
  let tris = 0;
  group.traverse((o) => o instanceof Mesh && (tris += triangles(o.geometry)));
  return { mode, group, tris };
}

/** What the test hook reports: the mode now shown, the visible mesh names and their triangles, and what is behind the room. */
export type SceneryState = { mode: SceneryMode; parts: string[]; tris: number; background: boolean; cube: boolean; environment: 'stage' | 'neutral'; backdrop: BackdropId | null; fog: boolean };

export type Sceneries = {
  inline: Scenery;
  xr: Scenery;
  /** Makes a loaded panorama the scene background (desktop and phone); the previous one is freed. */
  setBackdrop(id: BackdropId, texture: CubeTexture): void;
  /** Switches the whole scene between the inline bench and panorama (false) and immersive-ar (true). */
  set(presenting: boolean): void;
  /** Puts the MR table props on the table the tray sits on; they show only when a table plane placed the tray. */
  place(placement: Placement): void;
  state(): SceneryState;
};

/** Adds both sceneries to the scene and returns the switch between them. Starts inline. */
export function createScenery(scene: Scene, pmrem: PMREMGenerator | null = null): Sceneries {
  const inline = buildScenery('inline');
  const xr = buildScenery('xr');
  let backdrop: { id: BackdropId; texture: CubeTexture } | null = null;
  // The metals reflect the stage: its cubemap, prefiltered once per stage (one PMREM, the old one freed). In immersive-ar, and
  // before a backdrop has loaded, they use the scene's neutral room environment.
  let stageEnv: WebGLRenderTarget | null = null;
  scene.add(inline.group, xr.group);
  let presenting = false;
  let last: Placement | null = null;
  const apply = () => {
    inline.group.visible = !presenting;
    scene.fog = null;
    scene.background = presenting ? null : (backdrop?.texture ?? null);
    xr.group.visible = presenting && last !== null && last.stand > 0.02;
    setMetalEnv(!presenting && stageEnv ? stageEnv.texture : null);
  };
  apply();
  return {
    inline,
    xr,
    set(p) {
      presenting = p;
      apply();
    },
    setBackdrop(id, texture) {
      if (backdrop && backdrop.texture !== texture) backdrop.texture.dispose();
      backdrop = { id, texture };
      setMetalEnvIntensity(id === 'c3' ? HARD_ENV_INTENSITY : 10); // Hard's night environment is far darker than the attics'
      if (pmrem) {
        stageEnv?.dispose();
        stageEnv = pmrem.fromCubemap(texture);
      }
      apply();
    },
    place(placement) {
      last = placement;
      const [x, y, z] = placement.pose.position;
      xr.group.position.set(x, y - placement.stand, z);
      xr.group.rotation.y = placement.pose.yaw ?? 0;
      apply();
    },
    state() {
      const parts: string[] = [];
      let tris = 0;
      for (const s of [inline, xr]) {
        if (!s.group.visible) continue;
        s.group.traverseVisible((o) => {
          if (!(o instanceof Mesh)) return;
          parts.push(o.name);
          tris += triangles(o.geometry);
        });
      }
      return { mode: presenting ? 'xr' : 'inline', parts, tris, background: scene.background !== null, environment: metalEnv() !== null ? 'stage' : 'neutral', cube: (scene.background as CubeTexture | null)?.isCubeTexture === true, backdrop: backdrop?.id ?? null, fog: scene.fog !== null };
    },
  };
}
