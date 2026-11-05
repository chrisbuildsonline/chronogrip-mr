import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  type Scene,
  type CubeTexture,
  type PMREMGenerator,
  type WebGLRenderTarget,
  TorusGeometry,
  Vector3,
  Color,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Placement } from './anchor';
import { type BackdropId } from './backdrop';
import { C, SCENE } from './palette';
import { TRAY_POSE } from './seat';
import { metalEnv, setMetalEnv } from './metal';
import { type WoodSet, benchTopGeometry, benchWood } from './wood';

/** 'inline' is the desktop and phone view (the bench under the tray, a rendered cubemap behind it); 'xr' is immersive-ar (a few props on the real table, nothing else). */
export type SceneryMode = 'inline' | 'xr';

export type Scenery = {
  mode: SceneryMode;
  group: Group;
  /** Triangles of every mesh in the group. */
  tris: number;
};

/** Top of the workbench: just under the lowest point of the tilted tray (its near edge, about y = -0.332). */
export const BENCH_Y = -0.336;

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
const matte = () => new MeshBasicMaterial({ vertexColors: true });

function named(name: string, geo: BufferGeometry, material: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  const mesh = new Mesh(geo, material);
  mesh.name = name;
  return mesh;
}

/** Two wedge cheeks under the board hold the tilted tray up on the bench, 6 mm under its underside. */
function trayStand(bag: Bag) {
  const [, py, pz] = TRAY_POSE.position;
  const c = Math.cos(TRAY_POSE.tilt);
  const s = Math.sin(TRAY_POSE.tilt);
  // World (y, z) of the board's underside at tray-local depth lz (towards the player), 18 mm under the surface.
  const under = (lz: number): [number, number] => [py - 0.018 * c - lz * s - 0.006, pz - 0.018 * s + lz * c];
  const [farY, farZ] = under(-0.17);
  const nearZ = under(0.17)[1];
  const shape = new Shape();
  // u runs along -z (away from the player).
  shape.moveTo(-nearZ, BENCH_Y);
  shape.lineTo(-farZ, BENCH_Y);
  shape.lineTo(-farZ, farY);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  // shape (u, y) and extrusion d -> world (x = d, y, z = -u)
  geo.applyMatrix4(new Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
  for (const x of [-0.17, 0.14]) bag.add(geo, SCENE.shelfEdge, [x, 0, 0]);
}

/** With a wood set the nine top planks are one lit PBR mesh; without (software GL) they stay the old unlit vertex-coloured boxes. */
function workbench(wood: WoodSet | null): Mesh[] {
  const top = new Bag(true);
  const planks = 9;
  const depth = 1.5;
  if (!wood) {
    const tones = [SCENE.benchTop, SCENE.benchPlank, SCENE.benchGrain, SCENE.benchPlank];
    for (let i = 0; i < planks; i++) {
      const w = depth / planks;
      const z = 0.55 - w * (i + 0.5);
      top.box([3.4, 0.04, w - 0.004], tones[i % tones.length]!, [0, BENCH_Y - 0.02 - (i % 3) * 0.0006, z]);
    }
  }
  top.box([3.4, 0.07, 0.04], SCENE.benchEdge, [0, BENCH_Y - 0.035, 0.57]);
  if (!wood) {
    // A worn dark strip of grain on every other plank, to break the flat colour.
    for (let i = 0; i < planks; i += 2) {
      top.box([0.9 + (i % 3) * 0.3, 0.001, 0.012], SCENE.benchEdge, [-0.9 + i * 0.22, BENCH_Y + 0.0005, 0.55 - (depth / planks) * (i + 0.5)]);
    }
  }
  const stand = new Bag(true);
  trayStand(stand);
  const out = [named('workbench', top.geometry(), matte()), named('tray-stand', stand.geometry(), matte())];
  if (wood) {
    const geos = benchTopGeometry(BENCH_Y);
    out.push(named('workbench-top', mergeGeometries(geos, false)!, benchWood(wood)));
    for (const g of geos) g.dispose();
  }
  return out;
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
export function buildScenery(mode: SceneryMode, wood: WoodSet | null = null): Scenery {
  const group = new Group();
  group.name = `scenery-${mode}`;
  if (mode === 'xr') {
    group.add(...tableProps());
  } else {
    group.add(...workbench(wood));
  }
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
export function createScenery(scene: Scene, wood: WoodSet | null = null, pmrem: PMREMGenerator | null = null): Sceneries {
  const inline = buildScenery('inline', wood);
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
