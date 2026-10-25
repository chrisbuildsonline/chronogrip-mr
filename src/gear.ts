import { ExtrudeGeometry, Path, Shape, Vector2 } from 'three';

export type GearParams = {
  /** Module in metres: pitch diameter / teeth. */
  module: number;
  teeth: number;
  /** Degrees, default 20. */
  pressureAngle?: number;
};

export type GearRadii = { pitch: number; tip: number; root: number; base: number };

export type GearGeometryParams = GearParams & {
  /** Extrusion depth in metres. Default 2.5 * module. */
  thickness?: number;
  /** Axle hole radius in metres. Default 0.3 * root radius. */
  holeRadius?: number;
};

const DEFAULT_PRESSURE_ANGLE = 20;
const FLANK_STEPS = 8;
const TIP_STEPS = 3;
const ROOT_STEPS = 3;
const HOLE_SEGMENTS = 48;

function validate({ module: m, teeth: z, pressureAngle: pa = DEFAULT_PRESSURE_ANGLE }: GearParams): void {
  if (!Number.isFinite(m) || m <= 0) throw new Error(`gear module must be a positive finite number, got ${m}`);
  if (!Number.isInteger(z) || z < 6) throw new Error(`gear teeth must be an integer >= 6, got ${z}`);
  if (!Number.isFinite(pa) || pa <= 0 || pa >= 35) {
    throw new Error(`gear pressureAngle must be in (0, 35) degrees, got ${pa}`);
  }
}

export function gearRadii(p: GearParams): GearRadii {
  validate(p);
  const pa = ((p.pressureAngle ?? DEFAULT_PRESSURE_ANGLE) * Math.PI) / 180;
  const pitch = (p.module * p.teeth) / 2;
  return { pitch, tip: pitch + p.module, root: pitch - 1.25 * p.module, base: pitch * Math.cos(pa) };
}

/**
 * Closed outline of a spur gear in the XY plane, centred on the origin, counter-clockwise.
 * The outline is explicitly closed: the last point is a copy of the first.
 * Flanks are true involutes of the base circle; when the root circle lies inside the base
 * circle the flank continues from the base circle to the root along a radial line.
 */
export function gearProfile(p: GearParams): { x: number; y: number }[] {
  const { tip, root, base } = gearRadii(p);
  const z = p.teeth;
  const pa = ((p.pressureAngle ?? DEFAULT_PRESSURE_ANGLE) * Math.PI) / 180;
  const inv = (a: number) => Math.tan(a) - a;
  // Half the angular width of a tooth at radius r (tooth centred on angle 0).
  const halfWidth = (r: number) => Math.PI / (2 * z) + inv(pa) - inv(Math.acos(Math.min(1, base / r)));

  const start = Math.max(base, root);
  if (halfWidth(tip) <= 0) throw new Error('gear tooth would come to a point; use more teeth or a smaller pressure angle');
  if (2 * Math.PI / z - 2 * halfWidth(start) <= 0) throw new Error('gear teeth overlap at the root');

  const polar: [number, number][] = []; // [radius, angle] for one tooth, in order
  if (root < base) polar.push([root, -halfWidth(base)]);
  for (let k = 0; k <= FLANK_STEPS; k++) {
    const r = start + ((tip - start) * k) / FLANK_STEPS;
    polar.push([r, -halfWidth(r)]);
  }
  const tipHalf = halfWidth(tip);
  for (let k = 1; k < TIP_STEPS; k++) polar.push([tip, -tipHalf + (2 * tipHalf * k) / TIP_STEPS]);
  for (let k = FLANK_STEPS; k >= 0; k--) {
    const r = start + ((tip - start) * k) / FLANK_STEPS;
    polar.push([r, halfWidth(r)]);
  }
  if (root < base) polar.push([root, halfWidth(base)]);
  const rootStart = halfWidth(start);
  const rootEnd = (2 * Math.PI) / z - rootStart;
  for (let k = 1; k < ROOT_STEPS; k++) polar.push([root, rootStart + ((rootEnd - rootStart) * k) / ROOT_STEPS]);

  const pts: { x: number; y: number }[] = [];
  for (let tooth = 0; tooth < z; tooth++) {
    const offset = (tooth * 2 * Math.PI) / z;
    for (const [r, a] of polar) pts.push({ x: r * Math.cos(a + offset), y: r * Math.sin(a + offset) });
  }
  pts.push({ ...pts[0]! });
  return pts;
}

/** Extruded gear with a round axle hole, centred on the origin, axis along Z. */
export function gearGeometry(p: GearGeometryParams): ExtrudeGeometry {
  const { root } = gearRadii(p);
  const thickness = p.thickness ?? 2.5 * p.module;
  const holeRadius = p.holeRadius ?? 0.3 * root;
  if (!Number.isFinite(thickness) || thickness <= 0) throw new Error(`gear thickness must be positive, got ${thickness}`);
  if (!Number.isFinite(holeRadius) || holeRadius <= 0) throw new Error(`gear holeRadius must be positive, got ${holeRadius}`);
  if (holeRadius >= root) throw new Error(`gear hole radius ${holeRadius} must be smaller than the root radius ${root}`);

  const outline = gearProfile(p).slice(0, -1);
  const shape = new Shape(outline.map((pt) => new Vector2(pt.x, pt.y)));
  const hole = new Path();
  hole.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: HOLE_SEGMENTS });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}
