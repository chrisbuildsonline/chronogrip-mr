import {
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  RingGeometry,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gearGeometry } from './gear';
import type { Level } from './levels';
import type { Placement } from './anchor';
import { PIN_RADIUS, TRAY_HALF, TRAY_POSE, layerLift, ledgeFar, partsStrip, trayLocal } from './seat';

const brass = () => new MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: 0.35 });
const steel = () => new MeshStandardMaterial({ color: 0x9aa3ab, metalness: 1, roughness: 0.4 });
const wood = () => new MeshStandardMaterial({ color: 0x4a3322, metalness: 0, roughness: 0.85 });

const BOARD_THICKNESS = 0.012;
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

  const place = (mesh: Mesh, x: number, y: number, lift: number) => {
    mesh.position.set(...trayLocal(x, y, lift));
    tray.add(mesh);
    parts.push(mesh);
  };

  const fill = (level: Level) => {
    const strip = partsStrip(level);
    const far = ledgeFar(level);
    const ledgeWidth = Math.max(2 * TRAY_HALF.x, ...strip.map((s) => 2 * Math.abs(s.x) + 2 * s.radius)) + 0.04;
    const board = new Mesh(new BoxGeometry(2 * TRAY_HALF.x + 0.02, BOARD_THICKNESS, 2 * TRAY_HALF.y + 0.02), wood());
    place(board, 0, 0, -BOARD_THICKNESS / 2);
    const ledgeDepth = far - TRAY_HALF.y;
    const ledge = new Mesh(new BoxGeometry(ledgeWidth, BOARD_THICKNESS, ledgeDepth), wood());
    place(ledge, 0, TRAY_HALF.y + ledgeDepth / 2, -BOARD_THICKNESS / 2);

    for (const a of level.axles) {
      const pin = new Mesh(new CylinderGeometry(PIN_RADIUS, PIN_RADIUS, PIN_HEIGHT, 24), steel());
      place(pin, a.x, a.y, PIN_HEIGHT / 2);
      pins.set(a.id, pin);
      // A thin flat ring round the pin, shown (pulsing) while a held gear could land here.
      const ring = new Mesh(new RingGeometry(PIN_RADIUS * 2, PIN_RADIUS * 2.6, 32), new MeshBasicMaterial({ color: 0xffd27a, transparent: true, depthWrite: false, side: DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      place(ring, a.x, a.y, 0.002);
      rings.set(a.id, ring);
    }

    const gear = (id: string, teeth: number, x: number, y: number, layer: number) => {
      const mesh = new Mesh(gearGeometry({ module: level.module, teeth }), brass());
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

  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.5;
  const key = new DirectionalLight(0xffe2b0, 0.5);
  key.position.set(-0.6, 0.7, -0.1); // off the mirror angle of the preview camera, so no gear glares
  scene.add(key, new HemisphereLight(0xfff1dd, 0x3a2a1e, 0.35));

  const built: BuiltScene = {
    tray,
    loose,
    gears,
    pins,
    rings,
    gearCount: 0,
    axleCount: 0,
    place: placeTray,
    load(next) {
      for (const m of parts) {
        tray.remove(m);
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      }
      parts = [];
      for (const map of [pins, rings, gears, loose]) map.clear();
      fill(next);
    },
  };
  fill(level);
  return built;
}
