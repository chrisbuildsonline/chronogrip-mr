import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  RingGeometry,
  type Scene,
  SRGBColorSpace,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gearGeometry } from './gear';
import type { Level } from './levels';
import type { Placement } from './anchor';
import { PIN_RADIUS, TRAY_HALF, TRAY_POSE, layerLift, ledgeFar, partsStrip, trayLocal } from './seat';

const brass = () => new MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: 0.35 });
const steel = () => new MeshStandardMaterial({ color: 0x9aa3ab, metalness: 1, roughness: 0.4 });

/** Walnut grain drawn once on a canvas: warm streaks along the board, so the tray reads as wood, not a flat brown. */
function walnutGrain(): CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#573822';
  g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 110; i++) {
    const y = rnd() * S;
    const amp = 2 + rnd() * 5;
    const freq = 1 + rnd() * 2;
    const phase = rnd() * 6.3;
    g.beginPath();
    for (let x = 0; x <= S; x += 8) g.lineTo(x, y + amp * Math.sin((x / S) * Math.PI * 2 * freq + phase));
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.strokeStyle = rnd() < 0.6 ? `rgba(30,14,4,${0.15 + rnd() * 0.25})` : `rgba(150,96,50,${0.08 + rnd() * 0.14})`;
    g.stroke();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A soft round shadow: dark in the middle, fading to nothing at the rim. */
function softShadow(): CanvasTexture {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.75)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new CanvasTexture(canvas);
}

/** Most gears a level may have (parseLevel). */
const SHADOWS_MAX = 30;

const BOARD_THICKNESS = 0.018;
/** Rounded edge of the board and ledge, metres. */
const BEVEL = 0.006;
const PIN_HEIGHT = 0.04;

/** Where the near edge of the tilted tray hangs below its centre: the riser stops this far under the centre. */
const NEAR_EDGE_DROP = 0.13;

export type BuiltScene = {
  tray: Group;
  /** The movable gear meshes by loose gear id, children of the tray. */
  loose: Map<string, Mesh>;
  /** Every gear mesh (fixed and loose) by gear id, each with its own material. */
  gears: Map<string, Mesh>;
  /** Axle pin meshes by axle id, each with its own material. */
  pins: Map<string, Mesh>;
  /** Flat highlight rings round each pin by axle id, hidden until shown. */
  rings: Map<string, Mesh>;
  gearCount: number;
  axleCount: number;
  /** Moves the tray (and its riser, if the plane is low) to a placement. */
  place(placement: Placement): void;
  /** Swaps the board for a fresh one of another level; the maps above are refilled in place. */
  load(level: Level): void;
  /** Moves each gear's soft contact shadow under it; call once a frame. A lifted gear's shadow spreads. */
  updateShadows(): void;
};

/** Builds the tray, pins and gears of a level, posed per TRAY_POSE, and warm lights. */
export function buildScene(level: Level, scene: Scene, renderer: WebGLRenderer): BuiltScene {
  const tray = new Group();
  tray.name = 'tray';
  tray.rotation.order = 'YXZ'; // yaw outside the tilt, as in trayToWorld
  tray.position.set(...TRAY_POSE.position);
  tray.rotation.x = TRAY_POSE.tilt;
  // One material per mesh, so a hover tint on one gear or pin never shows on the others.
  const pins = new Map<string, Mesh>();
  const rings = new Map<string, Mesh>();
  const gears = new Map<string, Mesh>();
  const loose = new Map<string, Mesh>();
  let parts: Mesh[] = [];
  // Every pin and ring has one shape, and gears of one tooth count share one: built once, not per mesh.
  const pinGeometry = new CylinderGeometry(PIN_RADIUS, PIN_RADIUS, PIN_HEIGHT, 24);
  const ringGeometry = new RingGeometry(PIN_RADIUS * 2, PIN_RADIUS * 2.6, 32);
  const gearGeometries = new Map<number, BufferGeometry>();
  const grain = walnutGrain();
  const wood = () => new MeshStandardMaterial({ map: grain, metalness: 0, roughness: 0.62 });

  const place =(mesh: Mesh, x: number, y: number, lift: number) => {
    mesh.position.set(...trayLocal(x, y, lift));
    tray.add(mesh);
    parts.push(mesh);
  };

  const fill = (level: Level) => {
    const strip = partsStrip(level);
    const far = ledgeFar(level);
    const ledgeWidth = Math.max(2 * TRAY_HALF.x, ...strip.map((s) => 2 * Math.abs(s.x) + 2 * s.radius)) + 0.04;
    const board = new Mesh(new RoundedBoxGeometry(2 * TRAY_HALF.x + 0.02, BOARD_THICKNESS, 2 * TRAY_HALF.y + 0.02, 3, BEVEL), wood());
    place(board, 0, 0, -BOARD_THICKNESS / 2);
    // The ledge sits a touch lower and overlaps the board, so the seam reads as a step, not a flicker.
    const ledgeDepth = far - TRAY_HALF.y + 0.01;
    const ledge = new Mesh(new RoundedBoxGeometry(ledgeWidth, BOARD_THICKNESS, ledgeDepth, 3, BEVEL), wood());
    place(ledge, 0, TRAY_HALF.y + ledgeDepth / 2 - 0.01, -BOARD_THICKNESS / 2 - 0.001);

    for (const a of level.axles) {
      const pin = new Mesh(pinGeometry, steel());
      place(pin, a.x, a.y, PIN_HEIGHT / 2);
      pins.set(a.id, pin);
      // A thin flat ring round the pin, shown (pulsing) while a held gear could land here.
      const ring = new Mesh(ringGeometry, new MeshBasicMaterial({ color: 0xffd27a, transparent: true, depthWrite: false, side: DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      place(ring, a.x, a.y, 0.002);
      rings.set(a.id, ring);
    }

    const gear = (id: string, teeth: number, x: number, y: number, layer: number) => {
      if (!gearGeometries.has(teeth)) {
        const geo = gearGeometry({ module: level.module, teeth });
        geo.computeBoundingSphere();
        gearGeometries.set(teeth, geo);
      }
      const mesh = new Mesh(gearGeometries.get(teeth), brass());
      mesh.rotation.x = -Math.PI / 2; // gear axis Z -> tray normal
      place(mesh, x, y, layerLift(layer));
      gears.set(id, mesh);
      return mesh;
    };
    const axleAt = new Map(level.axles.map((a) => [a.id, a]));
    for (const f of level.fixed) {
      const a = axleAt.get(f.axle)!;
      gear(f.id, f.teeth, a.x, a.y, f.layer);
    }
    for (const s of strip) {
      const t = level.tray.find((g) => g.id === s.id)!;
      loose.set(s.id, gear(t.id, t.teeth, s.x, s.y, 0));
    }
    built.gearCount = level.fixed.length + level.tray.length;
    built.axleCount = level.axles.length;
    // Under the whole board, ledge included, and a little past its edges.
    const near = -TRAY_HALF.y - 0.01;
    trayShadow.scale.set(1.45 * ledgeWidth, 1, 1.45 * (far - near));
    trayShadow.position.set(...trayLocal(0, (far + near) / 2, -BOARD_THICKNESS - 0.01));
  };
  scene.add(tray);

  // A plain block from the plane up to the near edge of the tray, only drawn when the plane is low.
  const riser = new Mesh(new BoxGeometry(0.24, 1, 0.14), wood());
  riser.visible = false;
  scene.add(riser);
  const placeTray = ({ pose, stand }: Placement) => {
    tray.position.set(...pose.position);
    tray.rotation.set(pose.tilt, pose.yaw ?? 0, 0);
    const height = stand - NEAR_EDGE_DROP;
    riser.visible = height > 0.02;
    riser.scale.y = Math.max(height, 0.001);
    riser.position.set(pose.position[0], pose.position[1] - stand + height / 2, pose.position[2]);
    riser.rotation.y = pose.yaw ?? 0;
  };

  // Contact shadows: one soft disc under every gear (one draw call for all), and a wide soft one under the whole tray.
  const shadowMap = softShadow();
  const shadows = new InstancedMesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: shadowMap, color: 0x1a0e04, transparent: true, opacity: 0.55, depthWrite: false }),
    SHADOWS_MAX,
  );
  shadows.frustumCulled = false;
  tray.add(shadows);
  const trayShadow = new Mesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: shadowMap, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  tray.add(trayShadow);
  const shadowAt = new Matrix4();

  // Light, per design/DESIGN.md: a warm key from the upper left, a soft fill, and a rim from behind the tray that
  // picks out gear teeth, the bevel and the bird against the dark room.
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.75;
  const key = new DirectionalLight(0xffe2b0, 1.5);
  key.position.set(-0.6, 0.8, 0.1); // off the mirror angle of the preview camera, so no gear glares
  const rim = new DirectionalLight(0xffcf8a, 2.2);
  rim.position.set(0.35, 0.25, -1.2);
  scene.add(key, rim, new HemisphereLight(0xfff1dd, 0x3a2a1e, 0.6));

  const built: BuiltScene = {
    tray,
    loose,
    gears,
    pins,
    rings,
    gearCount: 0,
    axleCount: 0,
    place: placeTray,
    updateShadows() {
      let i = 0;
      for (const m of gears.values()) {
        if (i >= SHADOWS_MAX) break;
        const r = m.geometry.boundingSphere!.radius;
        const s = 2.3 * r + 1.5 * m.position.y;
        shadows.setMatrixAt(i++, shadowAt.makeScale(s, 1, s).setPosition(m.position.x, 0.0008, m.position.z));
      }
      shadows.count = i;
      shadows.instanceMatrix.needsUpdate = true;
    },
    load(next) {
      for (const m of parts) {
        tray.remove(m);
        if (m.geometry !== pinGeometry && m.geometry !== ringGeometry) m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      }
      parts = [];
      gearGeometries.clear();
      for (const map of [pins, rings, gears, loose]) map.clear();
      fill(next);
    },
  };
  fill(level);
  return built;
}
