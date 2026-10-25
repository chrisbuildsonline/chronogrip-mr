import {
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PMREMGenerator,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gearGeometry } from './gear';
import type { Level } from './levels';
import { PIN_RADIUS, TRAY_HALF, TRAY_POSE, layerLift, partsStrip, trayLocal } from './seat';

const brass = () => new MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: 0.35 });
const steel = () => new MeshStandardMaterial({ color: 0x9aa3ab, metalness: 1, roughness: 0.4 });
const wood = () => new MeshStandardMaterial({ color: 0x4a3322, metalness: 0, roughness: 0.85 });

const BOARD_THICKNESS = 0.012;
const PIN_HEIGHT = 0.04;

export type BuiltScene = { tray: Group; gearCount: number; axleCount: number };

/** Builds the tray, pins and gears of a level, posed per TRAY_POSE, and warm lights. */
export function buildScene(level: Level, scene: Scene, renderer: WebGLRenderer): BuiltScene {
  const tray = new Group();
  tray.name = 'tray';
  tray.position.set(...TRAY_POSE.position);
  tray.rotation.x = TRAY_POSE.tilt;
  const brassMat = brass();
  const steelMat = steel();

  const place = (mesh: Mesh, x: number, y: number, lift: number) => {
    mesh.position.set(...trayLocal(x, y, lift));
    tray.add(mesh);
  };

  const strip = partsStrip(level);
  const ledgeFar = Math.max(TRAY_HALF.y, ...strip.map((s) => s.y + s.radius)) + 0.02;
  const ledgeWidth = Math.max(2 * TRAY_HALF.x, ...strip.map((s) => 2 * Math.abs(s.x) + 2 * s.radius)) + 0.04;
  const board = new Mesh(new BoxGeometry(2 * TRAY_HALF.x + 0.02, BOARD_THICKNESS, 2 * TRAY_HALF.y + 0.02), wood());
  place(board, 0, 0, -BOARD_THICKNESS / 2);
  const ledgeDepth = ledgeFar - TRAY_HALF.y;
  const ledge = new Mesh(new BoxGeometry(ledgeWidth, BOARD_THICKNESS, ledgeDepth), wood());
  place(ledge, 0, TRAY_HALF.y + ledgeDepth / 2, -BOARD_THICKNESS / 2);

  for (const a of level.axles) {
    const pin = new Mesh(new CylinderGeometry(PIN_RADIUS, PIN_RADIUS, PIN_HEIGHT, 24), steelMat);
    place(pin, a.x, a.y, PIN_HEIGHT / 2);
  }

  const gear = (teeth: number, x: number, y: number, layer: number) => {
    const mesh = new Mesh(gearGeometry({ module: level.module, teeth }), brassMat);
    mesh.rotation.x = -Math.PI / 2; // gear axis Z -> tray normal
    place(mesh, x, y, layerLift(layer));
  };
  const axleAt = new Map(level.axles.map((a) => [a.id, a]));
  for (const f of level.fixed) {
    const a = axleAt.get(f.axle)!;
    gear(f.teeth, a.x, a.y, f.layer);
  }
  for (const s of strip) {
    const t = level.tray.find((g) => g.id === s.id)!;
    gear(t.teeth, s.x, s.y, 0);
  }
  scene.add(tray);

  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.5;
  const key = new DirectionalLight(0xffe2b0, 0.5);
  key.position.set(-0.6, 0.7, -0.1); // off the mirror angle of the preview camera, so no gear glares
  scene.add(key, new HemisphereLight(0xfff1dd, 0x3a2a1e, 0.35));

  return { tray, gearCount: level.fixed.length + level.tray.length, axleCount: level.axles.length };
}
