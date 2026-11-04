import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Fog,
  Group,
  IcosahedronGeometry,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  Shape,
  type Scene,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Placement } from './anchor';
import { C, SCENE } from './palette';
import { TRAY_POSE } from './seat';

/** 'inline' is the desktop and phone view (a workshop behind the tray); 'xr' is immersive-ar (a few props on the real table, nothing else). */
export type SceneryMode = 'inline' | 'xr';

export type Scenery = {
  mode: SceneryMode;
  group: Group;
  /** Triangles of every mesh in the group. */
  tris: number;
};

/** Top of the workbench: just under the lowest point of the tilted tray (its near edge, about y = -0.332). */
const BENCH_Y = -0.336;
/** Where the back wall's front face stands, metres behind the head. The bird and dial stay well in front of it. */
const WALL_Z = -0.95;

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

/** Soft round glow as raw pixels (white, alpha falling off to the rim), so it needs no canvas. */
function glowTexture(): DataTexture {
  const S = 64;
  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - (S - 1) / 2, y - (S - 1) / 2) / (S / 2);
      const a = Math.max(0, 1 - d) ** 2;
      px.set([255, 255, 255, Math.round(255 * a)], (y * S + x) * 4);
    }
  }
  const tex = new DataTexture(px, S, S, RGBAFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Unlit: the light is baked into the vertex colours (Bag), so a screen-filling wall and bench cost almost nothing per pixel, even on a software rasteriser. */
const matte = () => new MeshBasicMaterial({ vertexColors: true });
const metal = () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.75, flatShading: true });

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

function workbench(): Mesh[] {
  const top = new Bag(true);
  const tones = [SCENE.benchTop, SCENE.benchPlank, SCENE.benchGrain, SCENE.benchPlank];
  const planks = 9;
  const depth = 1.5;
  for (let i = 0; i < planks; i++) {
    const w = depth / planks;
    const z = 0.55 - w * (i + 0.5);
    top.box([3.4, 0.04, w - 0.004], tones[i % tones.length]!, [0, BENCH_Y - 0.02 - (i % 3) * 0.0006, z]);
  }
  top.box([3.4, 0.07, 0.04], SCENE.benchEdge, [0, BENCH_Y - 0.035, 0.57]);
  // A worn dark strip of grain on every other plank, to break the flat colour.
  for (let i = 0; i < planks; i += 2) {
    top.box([0.9 + (i % 3) * 0.3, 0.001, 0.012], SCENE.benchEdge, [-0.9 + i * 0.22, BENCH_Y + 0.0005, 0.55 - (depth / planks) * (i + 0.5)]);
  }
  const stand = new Bag(true);
  trayStand(stand);
  return [named('workbench', top.geometry(), matte()), named('tray-stand', stand.geometry(), matte())];
}

function backWall(): Mesh {
  const bag = new Bag(true);
  const planks = 26;
  const w = 3.5 / planks;
  for (let i = 0; i < planks; i++) {
    bag.box([w - 0.004, 1.5, 0.03], i % 2 ? SCENE.wallPlank : SCENE.wall, [-1.75 + w * (i + 0.5), 0.35, WALL_Z - 0.015 + (i % 2) * 0.002]);
  }
  // A dark wainscot along the bottom with a rail on top, where the bench meets the wall.
  bag.box([3.5, 0.2, 0.02], SCENE.wallLow, [0, BENCH_Y + 0.1, WALL_Z + 0.004]);
  bag.box([3.5, 0.018, 0.034], SCENE.rail, [0, BENCH_Y + 0.209, WALL_Z + 0.006]);
  return named('back-wall', bag.geometry(), matte());
}

const SHELVES = [
  { x: [-1.3, -0.5], y: 0.07 },
  { x: [0.5, 1.3], y: 0.07 },
  { x: [-1.1, -0.55], y: 0.27 },
  { x: [0.62, 1.2], y: 0.27 },
] as const;
const SHELF_Z = WALL_Z + 0.1;

function shelves(): Mesh {
  const bag = new Bag(true);
  for (const { x, y } of SHELVES) {
    const w = x[1] - x[0];
    const cx = (x[0] + x[1]) / 2;
    bag.box([w, 0.025, 0.2], SCENE.shelf, [cx, y, SHELF_Z]);
    bag.box([w, 0.012, 0.01], SCENE.shelfEdge, [cx, y - 0.006, SHELF_Z + 0.105]);
    for (const bx of [x[0] + 0.08, x[1] - 0.08]) bag.box([0.025, 0.07, 0.15], SCENE.shelfEdge, [bx, y - 0.05, SHELF_Z - 0.02]);
  }
  return named('shelves', bag.geometry(), matte());
}

/** Jars, books, a small clock and tools on the shelves; the brass bits go in a second, metallic mesh. */
function shelfProps(): Mesh[] {
  const wood = new Bag(true);
  const brass = new Bag();
  const top = (i: number) => SHELVES[i]!.y + 0.0125;
  const jar = (x: number, i: number, r: number, h: number, body: string) => {
    wood.cyl(r, r, h, 9, body, [x, top(i) + h / 2, SHELF_Z]);
    brass.cyl(r * 0.8, r * 0.8, 0.014, 9, C.brass, [x, top(i) + h + 0.007, SHELF_Z]);
  };
  // Lower left: four jars (two honey, two glass) and a leaning stack of books.
  jar(-1.22, 0, 0.04, 0.1, SCENE.honey);
  jar(-1.12, 0, 0.032, 0.075, SCENE.glass);
  jar(-1.03, 0, 0.038, 0.095, SCENE.glass);
  jar(-0.94, 0, 0.034, 0.08, SCENE.honey);
  const books = [[SCENE.bookRed, 0.11], [SCENE.bookGreen, 0.13], [SCENE.bookMustard, 0.1], [SCENE.bookBlue, 0.12]] as const;
  books.forEach(([color, h], k) => wood.box([0.026, h, 0.11], color, [-0.78 + k * 0.03, top(0) + h / 2, SHELF_Z]));
  wood.box([0.026, 0.12, 0.11], SCENE.bookRed, [-0.6, top(0) + 0.055, SHELF_Z], [0, 0, -0.35]);
  // Lower right: the small clock with a brass bell, and a hammer lying down.
  const clockX = 0.78;
  wood.box([0.14, 0.15, 0.07], SCENE.shelfEdge, [clockX, top(1) + 0.075, SHELF_Z]);
  wood.cyl(0.05, 0.05, 0.006, 16, C.cream, [clockX, top(1) + 0.082, SHELF_Z + 0.038], [Math.PI / 2, 0, 0]);
  wood.box([0.004, 0.036, 0.004], SCENE.lampMetal, [clockX, top(1) + 0.1, SHELF_Z + 0.043]);
  wood.box([0.03, 0.004, 0.004], SCENE.lampMetal, [clockX + 0.014, top(1) + 0.082, SHELF_Z + 0.043]);
  brass.cyl(0.026, 0.04, 0.03, 10, C.brass, [clockX, top(1) + 0.165, SHELF_Z]);
  brass.cyl(0.058, 0.058, 0.008, 16, C.brass, [clockX, top(1) + 0.082, SHELF_Z + 0.036], [Math.PI / 2, 0, 0]);
  wood.box([0.012, 0.012, 0.16], SCENE.woodLight, [1.05, top(1) + 0.006, SHELF_Z + 0.03], [0, 0.2, 0]);
  wood.box([0.07, 0.03, 0.03], SCENE.steelDark, [1.04, top(1) + 0.018, SHELF_Z - 0.04], [0, 0.2, 0]);
  // Upper left: small jars. Upper right: a flat stack of books and a tin.
  jar(-0.97, 2, 0.026, 0.06, SCENE.honey);
  jar(-0.9, 2, 0.03, 0.07, SCENE.glass);
  jar(-0.83, 2, 0.026, 0.055, SCENE.honey);
  const stack = [[SCENE.bookBlue, 0.24], [SCENE.bookMustard, 0.2], [SCENE.bookGreen, 0.22]] as const;
  stack.forEach(([color, w], k) => wood.box([w, 0.03, 0.15], color, [0.85 + (k % 2) * 0.01, top(3) + 0.015 + k * 0.03, SHELF_Z]));
  wood.cyl(0.045, 0.045, 0.05, 10, SCENE.steel, [1.08, top(3) + 0.025, SHELF_Z]);
  return [named('shelf-props', wood.geometry(), matte()), named('shelf-props-brass', brass.geometry(), metal())];
}

/** Loose things on the bench, clear of the tray: a stack of books, a honey jar, a cream mug and a spare brass gear. */
function benchProps(): Mesh {
  const bag = new Bag(true);
  const t = BENCH_Y;
  bag.box([0.2, 0.03, 0.14], SCENE.bookRed, [0.78, t + 0.015, -0.5], [0, 0.25, 0]);
  bag.box([0.18, 0.026, 0.13], SCENE.bookGreen, [0.78, t + 0.043, -0.5], [0, -0.1, 0]);
  bag.box([0.16, 0.024, 0.12], SCENE.bookMustard, [0.79, t + 0.068, -0.5], [0, 0.4, 0]);
  bag.cyl(0.034, 0.034, 0.08, 9, SCENE.honey, [0.98, t + 0.04, -0.38]);
  bag.cyl(0.028, 0.028, 0.014, 9, C.brass, [0.98, t + 0.087, -0.38]);
  bag.cyl(0.032, 0.028, 0.07, 10, SCENE.handleTeal, [-0.42, t + 0.035, -0.38]);
  bag.box([0.012, 0.04, 0.012], SCENE.handleTeal, [-0.38, t + 0.036, -0.38]);
  bag.cyl(0.026, 0.026, 0.006, 12, C.brass, [0.62, t + 0.003, -0.3]);
  return named('bench-props', bag.geometry(), matte());
}

const LAMP_AT =[-0.72, BENCH_Y, -0.72] as const;
/** The lamp head, where the shade opens and the bulb hangs. */
const LAMP_HEAD = [-0.6, BENCH_Y + 0.27, -0.7] as const;

function lamp(): Mesh[] {
  const [lx, ly, lz] = LAMP_AT;
  const [hx, hy, hz] = LAMP_HEAD;
  const body = new Bag(true);
  body.cyl(0.055, 0.065, 0.02, 12, SCENE.lampMetal, [lx, ly + 0.01, lz]);
  body.box([0.012, 0.15, 0.012], SCENE.lampMetal, [lx + 0.005, ly + 0.095, lz], [0, 0, -0.08]);
  body.box([0.012, 0.15, 0.012], SCENE.lampMetal, [lx + 0.055, ly + 0.2, lz], [0, 0, 0.9]);
  // Shade: a cone opening down and a little towards the tray.
  body.add(new ConeGeometry(0.07, 0.09, 12, 1, true).rotateZ(Math.PI + 0.35), SCENE.lampShade, [hx, hy, hz]);
  body.cyl(0.012, 0.012, 0.02, 8, SCENE.lampMetal, [hx - 0.01, hy + 0.045, hz]);
  const shade = named('lamp', body.geometry(), matte());
  (shade.material as MeshBasicMaterial).side = DoubleSide;
  const bulb = named('lamp-bulb', new IcosahedronGeometry(0.024, 0).translate(hx + 0.012, hy - 0.025, hz), new MeshBasicMaterial({ color: SCENE.bulb }));
  // A halo round the bulb and a wash of light on the wall behind: additive, so they only ever brighten.
  const glow = glowTexture();
  const additive = (map: DataTexture, opacity: number) => new MeshBasicMaterial({ map, color: SCENE.glow, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending });
  const halo = named('lamp-glow', new PlaneGeometry(0.4, 0.4).translate(hx + 0.012, hy - 0.03, hz + 0.05), additive(glow, 0.55));
  const wash = named('wall-glow', new PlaneGeometry(1.5, 1.1).translate(hx + 0.1, hy - 0.05, WALL_Z + 0.02), additive(glow, 0.65));
  return [shade, bulb, halo, wash];
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
  } else {
    group.add(...workbench(), backWall(), shelves(), ...shelfProps(), benchProps(), ...lamp());
  }
  let tris = 0;
  group.traverse((o) => o instanceof Mesh && (tris += triangles(o.geometry)));
  return { mode, group, tris };
}

/** What the test hook reports: the mode now shown, the visible mesh names and their triangles, and what is behind the room. */
export type SceneryState = { mode: SceneryMode; parts: string[]; tris: number; background: boolean; fog: boolean };

export type Sceneries = {
  inline: Scenery;
  xr: Scenery;
  /** Switches the whole scene between the inline workshop (false) and immersive-ar (true). */
  set(presenting: boolean): void;
  /** Puts the MR table props on the table the tray sits on; they show only when a table plane placed the tray. */
  place(placement: Placement): void;
  state(): SceneryState;
};

/** Adds both sceneries to the scene and returns the switch between them. Starts inline. */
export function createScenery(scene: Scene): Sceneries {
  const inline = buildScenery('inline');
  const xr = buildScenery('xr');
  const fog = new Fog(new Color(SCENE.wallLow), 1.6, 3.6);
  scene.add(inline.group, xr.group);
  let presenting = false;
  let last: Placement | null = null;
  const apply = () => {
    inline.group.visible = !presenting;
    scene.fog = presenting ? null : fog;
    scene.background = null;
    xr.group.visible = presenting && last !== null && last.stand > 0.02;
  };
  apply();
  return {
    inline,
    xr,
    set(p) {
      presenting = p;
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
      return { mode: presenting ? 'xr' : 'inline', parts, tris, background: scene.background !== null, fog: scene.fog !== null };
    },
  };
}
