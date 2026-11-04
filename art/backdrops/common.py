"""Shared helpers for the ChronoGrip backdrop renders (Blender 4.5, Cycles).

Game coordinates are three.js (Y up, -Z forward). Blender is Z up. three (x, y, z) -> blender (x, -z, y).
Desktop camera (src/fit.ts): eye (0.107, 0.225, 0.364), target (0.015, -0.08, -0.36), vertical FOV 50 (IWSDK default).
Tray (src/seat.ts): centre (0, -0.19, -0.32), tilted 50 deg towards the player, 0.42 x 0.32 m play area.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler


def g2b(x, y, z):
    return Vector((x, -z, y))


EYE = g2b(0.107, 0.225, 0.364)
TARGET = g2b(0.015, -0.08, -0.36)
TRAY = g2b(0.0, -0.19, -0.32)
TILT = math.radians(50)
BENCH_Z = -0.336
FOV_V = math.radians(50)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


# ---------------------------------------------------------------- objects

def obj_from_bm(name, bm, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), smooth_angle=None, bevel=None, scale=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth_angle is not None:
        for p in me.polygons:
            p.use_smooth = True
        try:
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        except Exception:
            pass
    if mat:
        me.materials.append(mat)
    return place(me, name, loc, rot, bevel=bevel, scale=scale)


def place(me, name=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=None, scale=None, mat=None):
    ob = bpy.data.objects.new(name or me.name, me)
    ob.location = loc
    ob.rotation_euler = rot
    if scale is not None:
        ob.scale = scale if hasattr(scale, '__len__') else (scale, scale, scale)
    if mat is not None:
        ob.material_slots  # noqa
        if len(me.materials) == 0:
            me.materials.append(mat)
    if bevel:
        m = ob.modifiers.new('bevel', 'BEVEL')
        m.width = bevel
        m.segments = 2
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(40)
        m.harden_normals = True
    bpy.context.scene.collection.objects.link(ob)
    return ob


def bm_box(sx, sy, sz, at=(0, 0, 0), bm=None, rot=None):
    bm = bm or bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(at) @ (rot.to_matrix().to_4x4() if rot is not None else Matrix()) @ Matrix.Diagonal((sx, sy, sz, 1))
    bmesh.ops.transform(bm, matrix=M, verts=r['verts'])
    return bm


def bm_cyl(r, h, seg=32, r2=None, at=(0, 0, 0), bm=None, rot=None, caps=True):
    bm = bm or bmesh.new()
    res = bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    M = Matrix.Translation(at) @ (rot.to_matrix().to_4x4() if rot is not None else Matrix())
    bmesh.ops.transform(bm, matrix=M, verts=res['verts'])
    return bm


def bm_sphere(r, at=(0, 0, 0), bm=None, seg=24, rings=12):
    bm = bm or bmesh.new()
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bmesh.ops.translate(bm, vec=Vector(at), verts=res['verts'])
    return bm


def bm_octa(r, at, bm):
    x, y, z = at
    v = [bm.verts.new(c) for c in ((x + r, y, z), (x - r, y, z), (x, y + r, z), (x, y - r, z), (x, y, z + r), (x, y, z - r))]
    for a, b, c in ((0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)):
        bm.faces.new((v[a], v[b], v[c]))
    return bm


def bm_torus(R, r, seg=48, rseg=12, at=(0, 0, 0), bm=None, rot=None):
    bm = bm or bmesh.new()
    M = Matrix.Translation(at) @ (rot.to_matrix().to_4x4() if rot is not None else Matrix())
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            row.append(bm.verts.new(M @ p))
        rows.append(row)
    for i in range(seg):
        for j in range(rseg):
            bm.faces.new((rows[i][j], rows[(i + 1) % seg][j], rows[(i + 1) % seg][(j + 1) % rseg], rows[i][(j + 1) % rseg]))
    return bm


def bm_ring(r_out, r_in, h, seg=64, at=(0, 0, 0), bm=None, rot=None):
    """A flat washer / bezel ring, axis Z."""
    outer = [(r_out * math.cos(2 * math.pi * i / seg), r_out * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    inner = [(r_in * math.cos(2 * math.pi * i / seg), r_in * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    return bm_annulus(outer, inner, h, at=at, bm=bm, rot=rot)


def bm_annulus(outer, inner, h, at=(0, 0, 0), bm=None, rot=None):
    """Extrudes the ring between two closed 2D loops of equal length (outer, inner) by h along Z, centred."""
    bm = bm or bmesh.new()
    M = Matrix.Translation(at) @ (rot.to_matrix().to_4x4() if rot is not None else Matrix())
    n = len(outer)
    def vs(loop, z):
        return [bm.verts.new(M @ Vector((x, y, z))) for x, y in loop]
    ot, ob, it, ib = vs(outer, h / 2), vs(outer, -h / 2), vs(inner, h / 2), vs(inner, -h / 2)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((ob[j], ob[i], ib[i], ib[j]))
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((ib[j], ib[i], it[i], it[j]))
    return bm


def gear_bm(teeth, r, thick, rim=0.82, hub=0.16, spokes=5, depth=None, kind='spur', bm=None, at=(0, 0, 0), rot=None,
            hub_h=1.6, spoke_w=None, spoke_h=0.8, bore=0.05):
    """Procedural clock wheel, axis Z: toothed rim, hub, straight crossings (spokes). r = tip radius."""
    bm = bm or bmesh.new()
    M = Matrix.Translation(at) @ (rot.to_matrix().to_4x4() if rot is not None else Matrix())
    depth = depth or (2.2 * math.pi * r / teeth) * 0.55
    rr = r - depth
    outer = []
    for i in range(teeth):
        a0 = 2 * math.pi * i / teeth
        p = 2 * math.pi / teeth
        if kind == 'escape':
            prof = [(0.0, rr), (0.12, rr), (0.78, r), (0.86, r - 0.15 * depth), (0.9, rr + 0.25 * depth), (0.93, rr)]
        else:
            prof = [(0.0, rr), (0.14, rr), (0.26, rr + 0.55 * depth), (0.33, r - 0.08 * depth), (0.40, r),
                    (0.60, r), (0.67, r - 0.08 * depth), (0.74, rr + 0.55 * depth), (0.86, rr)]
        for f, rad in prof:
            a = a0 + f * p
            outer.append((rad * math.cos(a), rad * math.sin(a)))
    n = len(outer)
    if spokes:
        r_in = rr * rim
    else:
        r_in = r * bore
    inner = []
    for x, y in outer:
        a = math.atan2(y, x)
        inner.append((r_in * math.cos(a), r_in * math.sin(a)))
    bm_annulus(outer, inner, thick, bm=bm, at=at, rot=rot)
    if spokes:
        # hub
        bm_ring(r * hub, r * bore, thick * hub_h, seg=48, bm=bm, at=at, rot=rot)
        sw = spoke_w or r * 0.07
        L = r_in - r * hub * 0.9
        for k in range(spokes):
            a = 2 * math.pi * k / spokes + 0.3
            c = (r * hub * 0.9 + L / 2 + r * 0.01)
            loc = M @ Vector((c * math.cos(a), c * math.sin(a), 0))
            R = (rot.to_matrix() if rot is not None else Matrix.Identity(3)) @ Matrix.Rotation(a, 3, 'Z')
            bm_box(L + r * 0.04, sw, thick * spoke_h, at=loc, bm=bm, rot=R.to_euler())
    return bm


def gear(name, teeth, r, thick, mat, loc, rot=(0, 0, 0), **kw):
    bm = gear_bm(teeth, r, thick, **kw)
    return obj_from_bm(name, bm, mat, loc, rot, smooth_angle=30, bevel=min(thick * 0.12, r * 0.01))


# Roman numerals as bars (box strokes) in a 2D frame: x right, y up, baseline 0, height h.
def numeral_strokes(text, h, stroke=0.11):
    s = []  # (cx, cy, length, angle, width)
    x = 0.0
    sw = h * stroke
    serif = h * 0.06
    for ch in text:
        if ch == 'I':
            w = h * 0.16
            s.append((x + w / 2, h / 2, h, math.pi / 2, sw))
            s.append((x + w / 2, sw * 0.25, w + 2 * serif, 0, sw * 0.45))
            s.append((x + w / 2, h - sw * 0.25, w + 2 * serif, 0, sw * 0.45))
        elif ch in 'VX':
            w = h * 0.62
            if ch == 'V':
                for sx in (-1, 1):
                    dx, dy = sx * (w / 2 - sw / 2), h
                    L = math.hypot(dx, dy)
                    ang = math.atan2(dy, -dx)
                    s.append((x + w / 2 + dx / 2, h / 2, L, ang, sw * (1.0 if sx < 0 else 0.6)))
                    s.append((x + w / 2 + dx, h - sw * 0.25, sw * 2.2, 0, sw * 0.45))
            else:
                for sx in (-1, 1):
                    dx = sx * (w - sw)
                    L = math.hypot(dx, h)
                    s.append((x + w / 2, h / 2, L, math.atan2(h, dx), sw * (1.0 if sx > 0 else 0.6)))
                for yy in (sw * 0.25, h - sw * 0.25):
                    for xx in (x + sw / 2, x + w - sw / 2):
                        s.append((xx, yy, sw * 2.2, 0, sw * 0.45))
        x += w + h * 0.07
    total = x - h * 0.07
    return [(cx - total / 2, cy, L, a, w) for cx, cy, L, a, w in s], total


CLOCK_NUMERALS = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']


def dial_numerals_bm(radius, h, depth, bm=None, M=Matrix(), stroke=0.11, radial=True):
    """Twelve Roman numerals round a dial in the XY plane (12 at +Y), feet towards the centre."""
    bm = bm or bmesh.new()
    for k, txt in enumerate(CLOCK_NUMERALS):
        ang = math.pi / 2 - 2 * math.pi * k / 12
        strokes, _ = numeral_strokes(txt, h, stroke)
        cx, cy = radius * math.cos(ang), radius * math.sin(ang)
        rot_z = ang - math.pi / 2 if radial else 0
        for sx, sy, L, a, w in strokes:
            p = Vector((sx, sy - h / 2, 0))
            p.rotate(Matrix.Rotation(rot_z, 3, 'Z'))
            loc = M @ Vector((cx + p.x, cy + p.y, 0))
            R = M.to_3x3() @ Matrix.Rotation(rot_z + a, 3, 'Z')
            bm_box(L, w, depth, at=loc, bm=bm, rot=R.to_euler())
    return bm


def helix_curve(name, r, pitch, turns, wire, mat, loc, rot=(0, 0, 0), taper=0.0):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = wire
    cu.bevel_resolution = 2
    sp = cu.splines.new('POLY')
    n = int(turns * 24)
    sp.points.add(n)
    for i in range(n + 1):
        t = i / 24
        rr = r * (1 - taper * i / n)
        a = 2 * math.pi * t
        sp.points[i].co = (rr * math.cos(a), rr * math.sin(a), pitch * t, 1)
    cu.materials.append(mat)
    ob = bpy.data.objects.new(name, cu)
    ob.location = loc
    ob.rotation_euler = rot
    bpy.context.scene.collection.objects.link(ob)
    return ob


def spiral_curve(name, r0, r1, turns, wire, height, mat, loc, rot=(0, 0, 0)):
    """A flat hairspring / mainspring spiral."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_mode = 'PROFILE' if False else 'ROUND'
    cu.bevel_depth = wire
    cu.bevel_resolution = 1
    sp = cu.splines.new('POLY')
    n = int(turns * 48)
    sp.points.add(n)
    for i in range(n + 1):
        t = i / n
        rr = r0 + (r1 - r0) * t
        a = 2 * math.pi * turns * t
        sp.points[i].co = (rr * math.cos(a), rr * math.sin(a), 0, 1)
    cu.materials.append(mat)
    ob = bpy.data.objects.new(name, cu)
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale.z = 1
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- materials

def _mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out


def principled(name, color, metal=0.0, rough=0.5, **kw):
    m, nt, out = _mat(name)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    for k, v in kw.items():
        b.inputs[k].default_value = v
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def _noise(nt, scale, detail=4, rough=0.55, coord=None, dim='3D'):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.noise_dimensions = dim
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    if coord is not None:
        nt.links.new(coord, n.inputs['Vector'])
    return n


def _ramp(nt, fac, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
    el[1].position, el[1].color = stops[-1][0], (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        e = el.new(p)
        e.color = (*c, 1)
    nt.links.new(fac, r.inputs['Fac'])
    return r


def _maprange(nt, fac, a, b):
    m = nt.nodes.new('ShaderNodeMapRange')
    m.inputs['To Min'].default_value = a
    m.inputs['To Max'].default_value = b
    nt.links.new(fac, m.inputs['Value'])
    return m


def brass(name='brass', color=(0.78, 0.53, 0.22), rough=(0.16, 0.34), aniso=0.45, tarnish=0.35, scale=1.0):
    m, nt, out = _mat(name)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Anisotropic'].default_value = aniso
    tc = nt.nodes.new('ShaderNodeTexCoord')
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    nt.links.new(tc.outputs['Object'], add.inputs[0])
    nt.links.new(oi.outputs['Random'], add.inputs[1])
    n = _noise(nt, 18 * scale, 6, 0.6, add.outputs[0])
    big = _noise(nt, 3 * scale, 3, 0.5, add.outputs[0])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    mix.inputs['Factor'].default_value = 0.5
    nt.links.new(n.outputs['Fac'], mix.inputs['A'])
    nt.links.new(big.outputs['Fac'], mix.inputs['B'])
    dark = tuple(c * 0.35 for c in color)
    warm = (min(1, color[0] * 1.08), color[1] * 0.95, color[2] * 0.8)
    col = _ramp(nt, mix.outputs['Result'], [(0.35, dark if tarnish > 0 else color), (0.35 + 0.25 * (1 - tarnish), color), (0.8, warm)])
    nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
    ro = _maprange(nt, n.outputs['Fac'], rough[0], rough[1])
    nt.links.new(ro.outputs['Result'], b.inputs['Roughness'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.04
    bump.inputs['Distance'].default_value = 0.001
    fine = _noise(nt, 300 * scale, 2, 0.5, add.outputs[0])
    nt.links.new(fine.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def wood(name='wood', dark=(0.03, 0.014, 0.006), light=(0.11, 0.05, 0.022), scale=3.0, rough=(0.32, 0.55), coat=0.4,
         grain_axis='X'):
    m, nt, out = _mat(name)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.12
    tc = nt.nodes.new('ShaderNodeTexCoord')
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    mp = nt.nodes.new('ShaderNodeMapping')
    # stretch along the grain
    s = {'X': (0.08, 1, 1), 'Y': (1, 0.08, 1), 'Z': (1, 1, 0.08)}[grain_axis]
    mp.inputs['Scale'].default_value = s
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    sc = nt.nodes.new('ShaderNodeVectorMath')
    sc.operation = 'SCALE'
    sc.inputs['Scale'].default_value = 37.0
    nt.links.new(oi.outputs['Random'], sc.inputs[0])
    nt.links.new(tc.outputs['Object'], add.inputs[0])
    nt.links.new(sc.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], mp.inputs['Vector'])
    w = nt.nodes.new('ShaderNodeTexWave')
    w.wave_type = 'RINGS'
    w.inputs['Scale'].default_value = scale
    w.inputs['Distortion'].default_value = 6.0
    w.inputs['Detail'].default_value = 3.0
    w.inputs['Detail Scale'].default_value = 1.5
    nt.links.new(mp.outputs[0], w.inputs['Vector'])
    n = _noise(nt, scale * 2.5, 5, 0.6, mp.outputs[0])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    mix.inputs['Factor'].default_value = 0.45
    nt.links.new(w.outputs['Fac'], mix.inputs['A'])
    nt.links.new(n.outputs['Fac'], mix.inputs['B'])
    col = _ramp(nt, mix.outputs['Result'], [(0.2, dark), (0.55, tuple((a + b) / 2 for a, b in zip(dark, light))), (0.85, light)])
    nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
    ro = _maprange(nt, n.outputs['Fac'], rough[0], rough[1])
    nt.links.new(ro.outputs['Result'], b.inputs['Roughness'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    bump.inputs['Distance'].default_value = 0.002
    nt.links.new(w.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def paper(name='dial', base=(0.72, 0.62, 0.45), aged=(0.45, 0.33, 0.18), rough=0.45, coat=0.5):
    m, nt, out = _mat(name)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Coat Weight'].default_value = coat
    tc = nt.nodes.new('ShaderNodeTexCoord')
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    nt.links.new(tc.outputs['Object'], add.inputs[0])
    nt.links.new(oi.outputs['Random'], add.inputs[1])
    n = _noise(nt, 9, 6, 0.65, add.outputs[0])
    col = _ramp(nt, n.outputs['Fac'], [(0.3, aged), (0.62, base)])
    nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def emission(name, color, strength):
    m, nt, out = _mat(name)
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*color, 1)
    e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


def glass(name='glass', rough=0.0, tint=(1, 1, 1), ior=1.45):
    return principled(name, tint, 0.0, rough, **{'Transmission Weight': 1.0, 'IOR': ior})


def thin_glass(name='thinglass', tint=(0.95, 0.92, 0.85), refl=0.06):
    """Window glass that passes shadow rays straight through (no refraction caustics), with a faint reflection."""
    m, nt, out = _mat(name)
    t = nt.nodes.new('ShaderNodeBsdfTransparent')
    t.inputs['Color'].default_value = (*tint, 1)
    g = nt.nodes.new('ShaderNodeBsdfGlossy')
    g.inputs['Roughness'].default_value = 0.03
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.5
    mx = nt.nodes.new('ShaderNodeMixShader')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    front = nt.nodes.new('ShaderNodeMath')
    front.operation = 'SUBTRACT'
    front.inputs[0].default_value = 1.0
    nt.links.new(geo.outputs['Backfacing'], front.inputs[1])
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    nt.links.new(fr.outputs[0], k.inputs[0])
    nt.links.new(front.outputs[0], k.inputs[1])
    nt.links.new(k.outputs[0], mx.inputs[0])
    nt.links.new(t.outputs[0], mx.inputs[1])
    nt.links.new(g.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    return m


def volume_box(size, center, density, color=(1, 0.93, 0.85), aniso=0.45, noise=0.0, noise_scale=1.2):
    m, nt, out = _mat('haze')
    v = nt.nodes.new('ShaderNodeVolumePrincipled')
    v.inputs['Color'].default_value = (*color, 1)
    v.inputs['Anisotropy'].default_value = aniso
    if noise > 0:
        n = _noise(nt, noise_scale, 3, 0.5)
        mr = _maprange(nt, n.outputs['Fac'], density * (1 - noise), density * (1 + noise))
        mr.inputs['From Min'].default_value = 0.3
        mr.inputs['From Max'].default_value = 0.7
        nt.links.new(mr.outputs['Result'], v.inputs['Density'])
    else:
        v.inputs['Density'].default_value = density
    nt.links.new(v.outputs[0], out.inputs['Volume'])
    bm = bm_box(*size, at=center)
    ob = obj_from_bm('haze', bm, m)
    ob.visible_shadow = False
    return ob


def world(color=(0.002, 0.0015, 0.001), strength=1.0):
    w = bpy.data.worlds.new('world')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*color, 1)
    bg.inputs[1].default_value = strength
    bpy.context.scene.world = w
    return w


# ---------------------------------------------------------------- lights

def light(kind, name, loc, energy, color=(1, 0.8, 0.6), size=0.1, rot=None, target=None, spot=45, blend=0.4, shape='RECTANGLE', size_y=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.shape = shape
        ld.size = size
        if size_y:
            ld.size_y = size_y
    elif kind == 'SUN':
        ld.angle = size
    else:
        ld.shadow_soft_size = size
    if kind == 'SPOT':
        ld.spot_size = math.radians(spot)
        ld.spot_blend = blend
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    if target is not None:
        d = Vector(target) - Vector(loc)
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    elif rot is not None:
        ob.rotation_euler = rot
    ob.visible_camera = False
    bpy.context.scene.collection.objects.link(ob)
    return ob


def look(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


# ---------------------------------------------------------------- tray stand-in

def tray_silhouette(dark=(0.012, 0.009, 0.007)):
    """The game's board as a plain dark slab where it sits, so the user can picture the puzzle in place."""
    mat = principled('tray', dark, 0.0, 0.55, **{'Coat Weight': 0.3})
    R = Euler((TILT, 0, 0))
    bm = bmesh.new()
    # board 0.44 x 0.34, 18 mm, top surface at the tray centre
    n = Vector((0, 0, -0.009))
    n.rotate(R)
    bm_box(0.44, 0.34, 0.018, at=TRAY + n, bm=bm, rot=R)
    # ledge behind the play area, a touch lower
    off = Vector((0, 0.215, -0.010))
    off.rotate(R)
    bm_box(0.52, 0.09, 0.018, at=TRAY + off, bm=bm, rot=R)
    ob = obj_from_bm('tray-silhouette', bm, mat, smooth_angle=30, bevel=0.005)
    # wedge cheeks down to the bench
    bm2 = bmesh.new()
    far = TRAY + Vector((0, 0.17 * math.cos(TILT), 0.17 * math.sin(TILT) - 0.03))
    near = TRAY + Vector((0, -0.17 * math.cos(TILT), -0.17 * math.sin(TILT)))
    for x in (-0.17, 0.14):
        h = far.z - BENCH_Z
        verts = [bm2.verts.new((x + dx, y, z)) for dx in (0, 0.03) for (y, z) in ((near.y, BENCH_Z), (far.y, BENCH_Z), (far.y, far.z))]
        bm2.faces.new(verts[0:3])
        bm2.faces.new(verts[3:6][::-1])
        for a, b in ((0, 1), (1, 2), (2, 0)):
            bm2.faces.new((verts[b], verts[a], verts[a + 3], verts[b + 3]))
    st = obj_from_bm('tray-stand', bm2, mat)
    return [ob, st]


# ---------------------------------------------------------------- cameras + render

def game_camera(dof_fstop=None, focus=None):
    cd = bpy.data.cameras.new('game')
    cd.sensor_fit = 'VERTICAL'
    cd.sensor_height = 24.0
    cd.angle_y = FOV_V
    cd.clip_start = 0.02
    cd.clip_end = 200
    ob = bpy.data.objects.new('game', cd)
    ob.location = EYE
    look(ob, TARGET)
    if dof_fstop:
        cd.dof.use_dof = True
        cd.dof.focus_distance = focus or (TRAY - EYE).length
        cd.dof.aperture_fstop = dof_fstop
        cd.dof.aperture_blades = 7
        cd.dof.aperture_rotation = math.radians(12)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def pano_camera():
    cd = bpy.data.cameras.new('pano')
    cd.type = 'PANO'
    cd.panorama_type = 'EQUIRECTANGULAR'
    cd.clip_start = 0.02
    cd.clip_end = 200
    ob = bpy.data.objects.new('pano', cd)
    ob.location = TARGET
    # image centre faces three.js +X (Blender +X): three's scene.background convention puts -Z (game forward) at u = 0.25
    ob.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def setup_render(mode, samples, scale=1.0, exposure=0.0, look='AgX - Medium High Contrast', glare=True):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    dev = 'CPU'
    for t in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = t
            prefs.refresh_devices()
            gpus = [d for d in prefs.get_devices_for_type(t) if d.type == t]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == t
                dev = t
                break
        except Exception:
            pass
    sc.cycles.device = 'GPU' if dev != 'CPU' else 'CPU'
    print('RENDER_DEVICE', dev)
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.015
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    try:
        sc.cycles.denoising_use_gpu = True
    except Exception:
        pass
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 3
    sc.cycles.glossy_bounces = 4
    sc.cycles.transmission_bounces = 6
    sc.cycles.volume_bounces = 1
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.sample_clamp_indirect = 6.0
    sc.cycles.blur_glossy = 1.0
    sc.cycles.volume_step_rate = 1.5
    sc.cycles.volume_max_steps = 256
    try:
        sc.cycles.use_light_tree = True
    except Exception:
        pass
    if mode == 'preview':
        sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    else:
        sc.render.resolution_x, sc.render.resolution_y = 4096, 2048
    sc.render.resolution_percentage = int(100 * scale)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '8'
    sc.render.image_settings.compression = 40
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = look
    except Exception:
        pass
    sc.view_settings.exposure = exposure
    if glare and mode == 'preview':
        sc.use_nodes = True
        nt = sc.node_tree
        rl = nt.nodes.get('Render Layers') or nt.nodes.new('CompositorNodeRLayers')
        comp = nt.nodes.get('Composite') or nt.nodes.new('CompositorNodeComposite')
        gl = nt.nodes.new('CompositorNodeGlare')
        gl.glare_type = 'FOG_GLOW'
        gl.quality = 'HIGH'
        try:
            gl.threshold = 0.9
            gl.size = 8
            gl.mix = -0.75
        except Exception:
            pass
        nt.links.new(rl.outputs['Image'], gl.inputs['Image'])
        nt.links.new(gl.outputs['Image'], comp.inputs['Image'])
    return dev


def rnd(seed):
    return random.Random(seed)
