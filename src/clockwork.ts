import {
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  BoxGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BAND, TWIST_FULL, settingOf } from './escapement';
import { gearGeometry } from './gear';
import { trayLocal } from './seat';

/**
 * The escapement corner of the tray (regulator dial and balance wheel) and the automaton bird, per design/DESIGN.md.
 * Both sit in level coordinates clear of every level's gears and inside the touch cone.
 */
export const DIAL_AT = [0.13, -0.106] as const;
const DIAL_R = 0.036;
const BALANCE_AT = [0.183, -0.106] as const;
const BIRD_AT = [0.163, 0.108] as const;
/** The bird is modelled at about 6 cm tall and shown larger so it reads from the seat. */
const BIRD_SCALE = 1.4;
/** Height of the knob's top above the tray surface; a pinch is aimed here. */
export const KNOB_TOP = 0.019;
/** A pinch (or a mouse press) this close to the knob grabs it: the whole dial is the target, metres. */
export const KNOB_GRAB_M = 0.04;

const C = { cream: '#f6efe2', deep: '#ebe0cc', ink: '#1c1712', muted: '#7d6f5f', amber: '#d99a2b', tint: '#f3dcae' };
const brass = () => new MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: 0.35 });
const bronze = () => new MeshStandardMaterial({ color: 0x7d5f33, metalness: 0.85, roughness: 0.45 });
const steel = () => new MeshStandardMaterial({ color: 0x9aa3ab, metalness: 1, roughness: 0.35 });
const flat = <T extends Object3D>(m: T, lift: number, at: readonly [number, number]) => {
  m.position.set(...trayLocal(at[0], at[1], lift));
  return m;
};

/** Knob angle about the tray normal for a setting: clockwise (seen from above) from 12 o'clock, i.e. up the tray. */
const angleOf = (setting: number) => (setting - 0.5) * TWIST_FULL;

export type EscapementView = { setting: number; target: number; phase: number; ticking: boolean; hold: number; inBand: boolean; calibrated: boolean; lit: boolean };

/** Dial face drawn on a canvas: cream face, scale, minus and plus ends, and the target arc filling amber as it is held. */
function dialFace() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  const c = S / 2;
  const R = S / 2 - 4;
  const pt = (a: number, r: number): [number, number] => [c + r * Math.sin(a), c - r * Math.cos(a)];
  const arc = (a0: number, a1: number, r: number, width: number, color: string) => {
    g.beginPath();
    g.arc(c, c, r, a0 - Math.PI / 2, a1 - Math.PI / 2);
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
  };
  let key = '';
  return {
    tex,
    draw(target: number, hold: number, inBand: boolean) {
      const k = JSON.stringify([target, Math.round(hold * 24), inBand]);
      if (k === key) return;
      key = k;
      g.clearRect(0, 0, S, S);
      g.beginPath();
      g.arc(c, c, R, 0, Math.PI * 2);
      g.fillStyle = C.cream;
      g.fill();
      g.beginPath();
      g.arc(c, c, R * 0.99, 0, Math.PI * 2);
      g.lineWidth = R * 0.05;
      g.strokeStyle = C.deep;
      g.stroke();

      const [lo, hi] = [angleOf(settingOf(target * (1 - BAND))), angleOf(settingOf(target * (1 + BAND)))];
      g.lineCap = 'butt';
      arc(lo, hi, R * 0.72, R * 0.16, inBand ? '#ecc883' : C.tint);
      if (hold > 0) arc(lo, lo + (hi - lo) * hold, R * 0.72, R * 0.16, C.amber);

      g.lineCap = 'round';
      arc(angleOf(0), angleOf(1), R * 0.84, R * 0.018, C.muted);
      for (let i = 0; i <= 16; i++) {
        const a = angleOf(i / 16);
        const major = i % 8 === 0;
        g.beginPath();
        g.moveTo(...pt(a, R * 0.84));
        g.lineTo(...pt(a, R * (major ? 0.97 : 0.92)));
        g.lineWidth = R * (major ? 0.035 : 0.022);
        g.strokeStyle = major ? C.ink : C.muted;
        g.stroke();
      }
      // Minus at the slow end, plus at the fast end: no words needed.
      const sign = (a: number, plus: boolean) => {
        const [x, y] = pt(a, R * 0.8);
        const h = R * 0.07;
        g.beginPath();
        g.moveTo(x - h, y);
        g.lineTo(x + h, y);
        if (plus) {
          g.moveTo(x, y - h);
          g.lineTo(x, y + h);
        }
        g.lineWidth = R * 0.035;
        g.strokeStyle = C.ink;
        g.stroke();
      };
      sign(angleOf(0) - 0.32, false);
      sign(angleOf(1) + 0.32, true);
      tex.needsUpdate = true;
    },
  };
}

/** The regulator dial with its knob and needle, the balance wheel beside it, on a bronze plate in the tray's near right corner. */
export function createEscapement() {
  const root = new Group();
  root.name = 'escapement';
  const plateW = BALANCE_AT[0] + 0.017 - (DIAL_AT[0] - DIAL_R - 0.006);
  const plateX = (BALANCE_AT[0] + 0.017 + DIAL_AT[0] - DIAL_R - 0.006) / 2;
  root.add(flat(new Mesh(new RoundedBoxGeometry(plateW, 0.004, 2 * DIAL_R + 0.012, 2, 0.008), bronze()), 0.002, [plateX, DIAL_AT[1]]));
  for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    const screw = new Mesh(new CylinderGeometry(0.0022, 0.0022, 0.0012, 16), steel());
    root.add(flat(screw, 0.0046, [plateX + dx * (plateW / 2 - 0.0055), DIAL_AT[1] + dy * (DIAL_R + 0.0005)]));
  }

  // Dial: brass bezel round a cream face.
  const face = dialFace();
  const faceMesh = new Mesh(new CircleGeometry(DIAL_R, 64), new MeshBasicMaterial({ map: face.tex, toneMapped: false }));
  faceMesh.rotation.x = -Math.PI / 2;
  root.add(flat(faceMesh, 0.0052, DIAL_AT));
  const bezel = new Mesh(new TorusGeometry(DIAL_R, 0.0019, 10, 72), brass());
  bezel.rotation.x = -Math.PI / 2;
  root.add(flat(bezel, 0.0052, DIAL_AT));

  // Knob: knurled brass with a domed cap and a ridge, carrying the needle; it turns one to one with the wrist.
  const knob = new Group();
  root.add(flat(knob, 0, DIAL_AT));
  const knobMat = brass();
  const knurl = new Mesh(gearGeometry({ module: 0.0008, teeth: 30, thickness: 0.009 }), knobMat);
  knurl.rotation.x = -Math.PI / 2;
  knurl.position.y = 0.0115;
  const cap = new Mesh(new SphereGeometry(0.0118, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), knobMat);
  cap.scale.y = 0.3;
  cap.position.y = 0.016;
  const ridge = new Mesh(new BoxGeometry(0.0026, 0.0024, 0.018), bronze());
  ridge.position.set(0, KNOB_TOP - 0.0008, -0.002);
  const needleMat = new MeshStandardMaterial({ color: 0x5a3d16, metalness: 0.7, roughness: 0.35 });
  const needle = new Mesh(new BoxGeometry(0.0022, 0.0007, DIAL_R * 0.95), needleMat);
  needle.position.set(0, 0.0064, (-DIAL_R * 0.95) / 2);
  const tip = new Mesh(new ConeGeometry(0.0022, 0.005, 3), needleMat);
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0, 0.0064, -DIAL_R * 0.95);
  tip.scale.y = 0.35;
  knob.add(knurl, cap, ridge, needle, tip);

  // Balance wheel: a rimmed brass wheel with spokes, timing screws and a steel hairspring; it swings once per tick.
  const balance = new Group();
  root.add(flat(balance, 0.0085, BALANCE_AT));
  const rim = new Mesh(new TorusGeometry(0.0105, 0.0014, 8, 48), brass());
  rim.rotation.x = -Math.PI / 2;
  balance.add(rim);
  for (const a of [0, Math.PI / 2]) {
    const spoke = new Mesh(new BoxGeometry(0.021, 0.0009, 0.0013), brass());
    spoke.rotation.y = a;
    balance.add(spoke);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const screw = new Mesh(new SphereGeometry(0.0013, 10, 8), brass());
    screw.position.set(Math.cos(a) * 0.0118, 0, Math.sin(a) * 0.0118);
    balance.add(screw);
  }
  const hub = new Mesh(new CylinderGeometry(0.0016, 0.0016, 0.004, 16), steel());
  balance.add(hub);
  const spiral = Array.from({ length: 80 }, (_, i) => {
    const t = i / 79;
    const a = t * Math.PI * 2 * 4;
    const r = 0.0022 + t * 0.0062;
    return new Vector3(Math.cos(a) * r, 0.0018, Math.sin(a) * r);
  });
  balance.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(spiral), 160, 0.00028, 4), steel()));
  const pivot = new Mesh(new CylinderGeometry(0.0026, 0.0034, 0.0085, 16), bronze());
  root.add(flat(pivot, 0.0042, BALANCE_AT));

  return {
    root,
    update(v: EscapementView) {
      knob.rotation.y = -angleOf(v.setting);
      balance.rotation.y = v.ticking ? 2.3 * Math.sin(Math.PI * v.phase) : 0;
      face.draw(v.target, v.hold, v.inBand);
      knobMat.emissive.set(v.lit ? 0xd99a2b : 0x000000);
      knobMat.emissiveIntensity = v.lit ? 0.3 : 0;
    },
  };
}

/**
 * The automaton: a little brass bird on a perch, made of spheres, cones and cylinders. Idle it looks about;
 * running, it flaps and bobs on every tick of the escapement.
 */
export function createAutomaton() {
  const root = new Group();
  root.name = 'automaton';
  root.position.set(...trayLocal(BIRD_AT[0], BIRD_AT[1], 0));
  root.scale.setScalar(BIRD_SCALE);
  const plinth = new Mesh(new CylinderGeometry(0.014, 0.017, 0.006, 32), bronze());
  plinth.position.y = 0.003;
  root.add(plinth);

  // Stands upright in the room whatever the tray's tilt (set per frame).
  const upright = new Group();
  upright.position.y = 0.006;
  root.add(upright);
  const post = new Mesh(new CylinderGeometry(0.0019, 0.0024, 0.026, 12), brass());
  post.position.y = 0.013;
  const perch = new Mesh(new CylinderGeometry(0.0016, 0.0016, 0.022, 10), brass());
  perch.rotation.z = Math.PI / 2;
  perch.position.y = 0.026;
  upright.add(post, perch);

  const body = brass();
  const polished = new MeshStandardMaterial({ color: 0xd9b26a, metalness: 1, roughness: 0.25 });
  const amber = new MeshStandardMaterial({ color: 0xd99a2b, metalness: 0.6, roughness: 0.35 });
  const ink = new MeshStandardMaterial({ color: 0x1c1712, roughness: 0.3 });

  const bird = new Group();
  bird.position.y = 0.038;
  bird.rotation.y = -0.55; // looks across the board, towards the player
  upright.add(bird);
  const torso = new Mesh(new SphereGeometry(0.0125, 24, 16), body);
  torso.scale.set(0.85, 0.82, 1.25);
  const head = new Group();
  head.position.set(0, 0.0115, 0.0105);
  const skull = new Mesh(new SphereGeometry(0.0085, 24, 16), body);
  const beak = new Mesh(new ConeGeometry(0.0026, 0.0095, 12), amber);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.001, 0.0118);
  head.add(skull, beak);
  for (const s of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.00135, 10, 8), ink);
    eye.position.set(s * 0.0062, 0.0018, 0.0052);
    head.add(eye);
  }
  const tail = new Mesh(new ConeGeometry(0.006, 0.018, 4), polished);
  tail.scale.set(1.3, 1, 0.35);
  tail.rotation.x = -2.15;
  tail.position.set(0, 0.004, -0.0185);
  bird.add(torso, head, tail);
  const wings = [-1, 1].map((s) => {
    const shoulder = new Group();
    shoulder.position.set(s * 0.0088, 0.004, 0.003);
    const wing = new Mesh(new SphereGeometry(0.011, 20, 12), polished);
    wing.scale.set(0.22, 0.55, 1.05);
    wing.position.set(s * 0.0012, -0.0035, -0.004);
    shoulder.add(wing);
    bird.add(shoulder);
    return { shoulder, s };
  });

  return {
    root,
    /** `phase` is the escapement's tick count; `running` once it is calibrated; `tilt` is the tray's tilt. */
    update(t: number, phase: number, running: boolean, tilt: number) {
      upright.rotation.x = -tilt;
      // Running: each tick snaps the wings up and lets them settle; idle: a slow look around.
      const beat = running ? (1 - (phase - Math.floor(phase))) ** 2 : 0;
      for (const { shoulder, s } of wings) shoulder.rotation.z = s * 1.15 * beat;
      head.rotation.x = running ? -0.35 * beat : 0.08 * Math.sin(t * 1.3);
      head.rotation.y = running ? 0 : 0.5 * Math.sin(t * 0.7);
      bird.position.y = 0.038 + 0.003 * beat;
      torso.scale.y = 0.82 * (1 + (running ? 0 : 0.025 * Math.sin(t * 2.4)));
    },
  };
}
