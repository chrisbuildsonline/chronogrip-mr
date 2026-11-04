import { Box3, Color, EquirectangularReflectionMapping, Mesh, Texture, type MeshBasicMaterial, Scene, Vector3, type BufferGeometry, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, type Placement } from '../../src/anchor';
import { C, SCENE } from '../../src/palette';
import { backdropFile } from '../../src/backdrop';
import { buildScenery, createScenery } from '../../src/scenery';
import { BOARD_MARGIN, COMFORT, TRAY_HALF, TRAY_POSE, inZone, type Vec3 } from '../../src/seat';
import { PANEL_ZONE } from '../../src/ui';
import src from '../../src/scenery.ts?raw';

const meshes = (o: Object3D) => {
  const out: Mesh[] = [];
  o.traverse((c) => c instanceof Mesh && out.push(c));
  return out;
};
const tris = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position!.count) / 3;
const names = (o: Object3D) => meshes(o).map((m) => m.name);
const plane = (stand: number): Placement => ({ pose: TRAY_POSE, source: 'plane', stand, fit: 'edge' });

describe('buildScenery inline (desktop and phone)', () => {
  const s = buildScenery('inline');
  const n = names(s.group);

  it('keeps only the bench and the stand the tray sits on: the panorama is the room', () => {
    expect([...n].sort()).toEqual(['tray-stand', 'workbench']);
    for (const gone of ['back-wall', 'shelves', 'shelf-props', 'bench-props', 'lamp', 'lamp-glow']) expect(n, gone).not.toContain(gone);
  });

  it('has no lights', () => {
    let lights = 0;
    s.group.traverse((o) => (o as { isLight?: boolean }).isLight && lights++);
    expect(lights).toBe(0);
  });

  it('stays cheap: two meshes and a small triangle bound', () => {
    expect(meshes(s.group).length).toBe(2);
    expect(s.tris).toBe(meshes(s.group).reduce((sum, m) => sum + tris(m.geometry), 0));
    expect(s.tris).toBeGreaterThan(50);
    expect(s.tris).toBeLessThanOrEqual(1000);
  });

  it('keeps the bench below the tray', () => {
    // The lowest point of the tray is its near edge underside, about y = -0.332.
    const top = new Box3().setFromObject(meshes(s.group).find((m) => m.name === 'workbench')!);
    expect(top.max.y).toBeLessThan(-0.33);
  });
});

describe('backdrop files', () => {
  it('names the panorama per concept, 2048 wide on a phone and 4096 otherwise', () => {
    expect(backdropFile('c2', false)).toBe('backdrops/c2_pano.jpg');
    expect(backdropFile('c2', true)).toBe('backdrops/c2_pano_2048.jpg');
    expect(backdropFile('c3', true)).toBe('backdrops/c3_pano_2048.jpg');
  });
});

describe('buildScenery xr (immersive-ar)', () => {
  const s = buildScenery('xr');
  const all = meshes(s.group);

  it('has only small props: no wall, bench, shelves, lamp or light', () => {
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const m of all) expect(m.name, m.name).toMatch(/^prop-/);
    for (const banned of ['wall', 'workbench', 'shelf', 'shelves', 'lamp']) expect(names(s.group).join(), banned).not.toContain(banned);
  });

  it('includes an oil can, a loupe, a screwdriver and a spare gear dish', () => {
    for (const p of ['prop-oil-can', 'prop-loupe', 'prop-screwdriver', 'prop-gear-dish']) expect(names(s.group)).toContain(p);
  });

  it('is tiny: each prop under 15 cm across, few triangles', () => {
    for (const m of all) {
      const size = new Box3().setFromObject(m).getSize(new Vector3());
      expect(Math.max(size.x, size.y, size.z), m.name).toBeLessThanOrEqual(0.15);
    }
    expect(s.tris).toBeLessThanOrEqual(1500);
  });

  it('sits beside the play area, on the table, clear of the tray, the comfort cone and the panels', () => {
    const box = new Box3().setFromObject(s.group);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6); // on the table
    expect(box.max.y).toBeLessThan(0.12);
    for (const m of all) {
      const b = new Box3().setFromObject(m);
      const sideGap = Math.min(Math.abs(b.min.x), Math.abs(b.max.x));
      expect(b.min.x * b.max.x > 0, `${m.name} straddles the centre`).toBe(true);
      expect(sideGap, m.name).toBeGreaterThanOrEqual(TRAY_HALF.x + BOARD_MARGIN + 0.04);
    }
    // Whatever the table height, no corner of any prop falls in the comfort cone or the panels' cone.
    for (const stand of [0.1, 0.2, 0.3, 0.45, 0.6]) {
      const p = plane(stand);
      for (const m of all) {
        const b = new Box3().setFromObject(m);
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          const w: Vec3 = [p.pose.position[0] + x, p.pose.position[1] - stand + y, p.pose.position[2] + z];
          expect(inZone(w, COMFORT), `${m.name} stand ${stand}`).toBe(false);
          expect(inZone(w, PANEL_ZONE), `${m.name} stand ${stand} panel zone`).toBe(false);
        }
      }
    }
  });
});

describe('scenery colours', () => {
  const allowed = [...Object.values(C), ...Object.values(SCENE)].filter((v) => v.startsWith('#')).map((v) => new Color(v));
  // A palette colour as drawn: itself, or shaded (the inline backdrop bakes light into its vertex colours, so a face is a palette colour times a shading factor between 0.2 and 1.25).
  const known = (r: number, g: number, b: number) =>
    allowed.some((c) => {
      const k = r / c.r;
      return k > 0.2 && k <= 1.25 && Math.abs(c.g * k - g) < 2e-3 && Math.abs(c.b * k - b) < 2e-3;
    });

  it.each(['inline', 'xr'] as const)('every %s vertex and material colour is a palette colour', (mode) => {
    const s = buildScenery(mode);
    for (const m of meshes(s.group)) {
      const col = m.geometry.attributes.color;
      const c = (m.material as { color?: Color }).color;
      if (col) {
        for (let i = 0; i < col.count; i++) if (!known(col.getX(i), col.getY(i), col.getZ(i))) throw new Error(`${m.name}: vertex ${i} colour is not in the palette`);
        if (c) expect(c.getHex(), `${m.name} is white under its vertex colours`).toBe(0xffffff);
      } else if (c) expect(known(c.r, c.g, c.b), `${m.name} material colour`).toBe(true);
    }
  });

  it('src/scenery.ts hard-codes no colour', () => {
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src).not.toMatch(/0x[0-9a-f]{6}\b/i);
  });
});

describe('createScenery: the mode switch', () => {
  const tex = () => new Texture();

  it('inline: the bench is up, the panorama is the background, no fog', () => {
    const scene = new Scene();
    const sc = createScenery(scene);
    sc.set(false);
    expect(sc.inline.group.visible).toBe(true);
    expect(sc.xr.group.visible).toBe(false);
    expect(scene.background).toBeNull();
    const t = tex();
    sc.setBackdrop('c2', t);
    expect(scene.background).toBe(t);
    expect(t.mapping).toBe(EquirectangularReflectionMapping);
    expect(scene.fog).toBeNull();
    expect(sc.state().backdrop).toBe('c2');
  });

  it('a new backdrop replaces the old and frees its texture: only one stays in memory', () => {
    const scene = new Scene();
    const sc = createScenery(scene);
    const a = tex();
    const b = tex();
    let freed = 0;
    a.addEventListener('dispose', () => freed++);
    sc.setBackdrop('c2', a);
    sc.setBackdrop('c1', b);
    expect(scene.background).toBe(b);
    expect(freed).toBe(1);
    expect(sc.state().backdrop).toBe('c1');
  });

  it('immersive-ar: nothing opaque behind the room: no backdrop, no fog, no background', () => {
    const scene = new Scene();
    const sc = createScenery(scene);
    sc.setBackdrop('c2', tex());
    sc.set(true);
    expect(sc.inline.group.visible).toBe(false);
    expect(scene.background).toBeNull();
    expect(scene.fog).toBeNull();
    expect(sc.state().parts.every((p) => p.startsWith('prop-'))).toBe(true);
    sc.set(false);
    expect(scene.background).not.toBeNull();
  });

  it('props show only once a table plane is found, on the table under the tray, and follow its yaw', () => {
    const scene = new Scene();
    const sc = createScenery(scene);
    sc.set(true);
    sc.place(DEFAULT_PLACEMENT);
    expect(sc.xr.group.visible).toBe(false);
    sc.place({ ...plane(0.3), pose: { ...TRAY_POSE, yaw: 0.4 } });
    expect(sc.xr.group.visible).toBe(true);
    expect(sc.xr.group.position.y).toBeCloseTo(TRAY_POSE.position[1] - 0.3, 6);
    expect(sc.xr.group.rotation.y).toBeCloseTo(0.4, 6);
  });

  it('props stay hidden outside XR even with a plane', () => {
    const scene = new Scene();
    const sc = createScenery(scene);
    sc.set(false);
    sc.place(plane(0.3));
    expect(sc.state().parts.some((p) => p.startsWith('prop-'))).toBe(false);
  });
});
