import {
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gearGeometry } from './gear';
import type { Level } from './levels';
import type { Placement } from './anchor';
import { PIN_RADIUS, TRAY_HALF, TRAY_POSE, layerLift, partsStrip, trayLocal } from './seat';

const brass = () => new MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: 0.35 });
const steel = () => new MeshStandardMaterial({ color: 0x9aa3ab, metalness: 1, roughness: 0.4 });
const wood = () => new MeshStandardMaterial({ color: 0x4a3322, metalness: 0, roughness: 0.85 });

const BOARD_THICKNESS = 0.012;
const PIN_HEIGHT = 0.04;

/** Where the near edge of the tilted tray hangs below its centre: the riser stops this far under the centre. */
const NEAR_EDGE_DROP = 0.13;
const HINT_TEXT = 'Put the controllers down and use your hands';

export type BuiltScene = {
  tray: Group;
  gearCount: number;
  axleCount: number;
  /** Moves the tray (and its riser, if the plane is low) to a placement. */
  place(placement: Placement): void;
  /** Shows or hides the "use your hands" panel on the tray. */
  showHandHint(visible: boolean): void;
};

/** A small canvas-texture panel lying on the tray, hidden until needed. */
function handHint(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(20, 14, 9, 0.85)';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#f3dfb8';
  g.font = '600 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(HINT_TEXT, canvas.width / 2, canvas.height / 2);
  const mesh = new Mesh(new PlaneGeometry(0.36, 0.045), new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true }));
  mesh.rotation.x = -Math.PI / 2; // face the tray normal
  mesh.visible = false;
  return mesh;
}

/** Builds the tray, pins and gears of a level, posed per TRAY_POSE, and warm lights. */
export function buildScene(level: Level, scene: Scene, renderer: WebGLRenderer): BuiltScene {
  const tray = new Group();
  tray.name = 'tray';
  tray.rotation.order = 'YXZ'; // yaw outside the tilt, as in trayToWorld
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
  const hint = handHint();
  place(hint, 0, 0.0, 0.1);
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

  return {
    tray,
    gearCount: level.fixed.length + level.tray.length,
    axleCount: level.axles.length,
    place: placeTray,
    showHandHint: (visible) => (hint.visible = visible),
  };
}
