"""Concept 3: inside a giant clock movement. Wheels stand facing the player like a skeleton clock, receding into haze."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from common import *
from common import _ramp, _noise, _maprange
from props import pm

PLATE_Z = BENCH_Z
FACE = (math.pi / 2, 0, 0)   # wheel axis along Y, face towards the player


def perlage(name='perlage', color=(0.24, 0.165, 0.075)):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Anisotropic'].default_value = 0.3
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vo = nt.nodes.new('ShaderNodeTexVoronoi')
    vo.inputs['Scale'].default_value = 28.0
    vo.inputs['Randomness'].default_value = 0.25
    nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 70.0
    nt.links.new(vo.outputs['Distance'], mul.inputs[0])
    sn = nt.nodes.new('ShaderNodeMath')
    sn.operation = 'SINE'
    nt.links.new(mul.outputs[0], sn.inputs[0])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.05
    bump.inputs['Distance'].default_value = 0.002
    nt.links.new(sn.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    n = _noise(nt, 2.0, 4, 0.5, tc.outputs['Object'])
    ro = _maprange(nt, n.outputs['Fac'], 0.2, 0.34)
    nt.links.new(ro.outputs['Result'], b.inputs['Roughness'])
    col = _ramp(nt, n.outputs['Fac'], [(0.3, tuple(c * 0.55 for c in color)), (0.7, color)])
    nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
    return m


def wheel(name, teeth, r, thick, mat, loc, spokes=5, kind='spur', arbor=True, pinion=True, steel=None, spin=0.0):
    x, y, z = loc
    g = gear(name, teeth, r, thick, mat, loc, (math.pi / 2, spin, 0), spokes=spokes, kind=kind, hub=0.14, rim=0.84)
    if arbor:
        L = thick * 14 + 0.4 * r
        obj_from_bm(name + '-arbor', bm_cyl(r * 0.035, L, 24, rot=Euler(FACE)), steel, (x, y + L * 0.35, z), smooth_angle=40)
    if pinion:
        pr = r * 0.17
        gear(name + '-pinion', 10, pr, thick * 3, steel, (x, y + thick * 2.5, z), (math.pi / 2, spin * 2, 0), spokes=0, bore=0.2)
    return g


def pillar(loc, h, r, mat):
    x, y, z = loc
    bm = bm_cyl(r, h, 48, at=(0, 0, h / 2))
    for t, k in ((0.0, 1.35), (0.06, 1.15), (0.94, 1.15), (1.0, 1.35), (0.5, 1.12)):
        bm_cyl(r * k, h * 0.025, 48, at=(0, 0, h * t), bm=bm)
    return obj_from_bm('pillar', bm, mat, (x, y, z), smooth_angle=40, bevel=r * 0.03)


def frame_bar(a, b, w, t, mat):
    a, b = Vector(a), Vector(b)
    d = b - a
    ob = obj_from_bm('frame', bm_box(w, t, d.length + w, at=(0, 0, 0)), mat, (a + b) / 2, smooth_angle=30, bevel=w * 0.06)
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return ob


def build(mode):
    world((0.012, 0.007, 0.004), 1.0)
    m = pm()
    br = brass('mv-brass', color=(0.8, 0.55, 0.22), rough=(0.14, 0.3), aniso=0.6, tarnish=0.2, scale=0.25)
    br2 = brass('mv-brass-warm', color=(0.85, 0.5, 0.18), rough=(0.18, 0.36), aniso=0.6, tarnish=0.3, scale=0.25)
    gilt = brass('mv-gilt', color=(0.62, 0.44, 0.18), rough=(0.25, 0.42), aniso=0.7, tarnish=0.35, scale=0.2)
    steel = principled('mv-steel', (0.6, 0.6, 0.62), 1.0, 0.18, **{'Anisotropic': 0.6})
    blued = principled('mv-blued', (0.03, 0.05, 0.14), 1.0, 0.22)
    ruby = principled('mv-ruby', (0.75, 0.03, 0.04), 0.0, 0.03, **{'Transmission Weight': 0.85, 'IOR': 1.76, 'Emission Color': (1, 0.1, 0.05, 1), 'Emission Strength': 0.3})
    plate = perlage()

    # main plate under the tray, a vast gilt floor with slots, jewels and blued screws
    obj_from_bm('main-plate', bm_box(30, 34, 0.12, at=(0, 6, PLATE_Z - 0.06)), plate, bevel=0.01)
    rr = rnd(3)
    for i in range(26):
        a = rr.uniform(0, 2 * math.pi)
        d = rr.uniform(0.9, 9)
        x, y = d * math.cos(a), 0.4 + d * math.sin(a)
        if abs(x) < 0.5 and -0.2 < y < 1.0:
            continue
        s = rr.uniform(0.04, 0.12)
        obj_from_bm('chaton', bm_ring(s, s * 0.45, 0.03, 48), br, (x, y, PLATE_Z + 0.012), smooth_angle=40, bevel=s * 0.05)
        obj_from_bm('jewel', bm_sphere(s * 0.48, seg=24, rings=12), ruby, (x, y, PLATE_Z + 0.01), scale=(1, 1, 0.35))
    for i in range(30):
        a = rr.uniform(0, 2 * math.pi)
        d = rr.uniform(0.8, 10)
        x, y = d * math.cos(a), 0.4 + d * math.sin(a)
        if abs(x) < 0.5 and -0.2 < y < 1.0:
            continue
        s = rr.uniform(0.03, 0.07)
        bm = bm_cyl(s, s * 0.45, 32, at=(0, 0, s * 0.22))
        bm_box(s * 2.05, s * 0.22, s * 0.3, at=(0, 0, s * 0.42), bm=bm, rot=Euler((0, 0, rr.random() * 3)))
        obj_from_bm('screw', bm, blued, (x, y, PLATE_Z), smooth_angle=40, bevel=s * 0.04)

    # skeleton frames left and right (vertical plates with arched bars), and a top bridge far above
    for sx in (-1, 1):
        x = sx * 3.2
        for y in (1.2, 5.5, 10.5):
            pillar((x, y, PLATE_Z), 5.5, 0.16, gilt)
        frame_bar((x, 1.2, 5.2), (x, 10.5, 5.2), 0.35, 0.12, gilt)
        frame_bar((x, 1.2, 2.4), (x, 5.5, 4.6), 0.18, 0.1, gilt)
        frame_bar((x, 5.5, 4.6), (x, 10.5, 2.4), 0.18, 0.1, gilt)
    for y in (1.2, 10.5):
        frame_bar((-3.2, y, 5.2), (3.2, y, 5.2), 0.3, 0.12, gilt)

    # the going train: wheels facing the player at many depths. (teeth, r, x, y, z, spokes, material, kind)
    train = [
        (140, 1.25, -1.75, 2.1, 0.45, 6, br, 'spur'),         # big wheel left, the main highlight edge
        (48, 0.42, -0.75, 2.6, -0.15, 5, br2, 'spur'),
        (96, 0.9, 1.75, 2.4, 0.15, 5, br, 'spur'),            # right
        (30, 0.32, 1.0, 1.75, -0.12, 0, steel, 'escape'),
        (120, 1.6, 0.25, 6.0, 1.3, 6, br2, 'spur'),            # far, behind the tray, hazed
        (64, 0.62, -1.15, 4.2, 1.35, 5, br, 'spur'),
        (80, 0.75, 2.0, 5.2, 2.2, 5, br, 'spur'),
        (36, 0.75, 0.9, 3.8, 0.55, 4, steel, 'escape'),       # escape wheel
        (180, 2.6, -1.0, 10.0, 2.0, 8, gilt, 'spur'),          # huge, deep in the haze
        (110, 1.4, 2.4, 8.5, 0.8, 6, br2, 'spur'),
        (72, 0.8, -2.4, 6.8, 0.2, 5, br, 'spur'),
        (54, 0.5, -0.2, 3.2, 2.0, 5, br2, 'spur'),
        (150, 2.0, 0.8, 13.0, 3.6, 6, gilt, 'spur'),
        (60, 0.55, -1.25, 1.55, -0.05, 5, br2, 'spur'),
        (44, 0.38, 1.25, 1.45, 0.02, 5, br, 'spur'),
        (220, 3.0, -2.6, 7.0, 2.6, 8, br, 'spur'),
        (200, 2.8, 3.2, 6.5, 2.4, 8, br2, 'spur'),
        (84, 0.7, 0.35, 4.6, -0.25, 6, br, 'spur'),
        # behind and above the player, for the panorama
        (130, 1.5, 0.6, -3.5, 1.4, 6, br, 'spur'),
        (70, 0.8, -1.6, -2.4, 0.4, 5, br2, 'spur'),
        (90, 1.0, 2.0, -2.0, 0.6, 5, br, 'spur'),
        (40, 0.5, -0.4, -1.8, 2.4, 0, steel, 'escape'),
        (100, 1.2, -2.2, 0.5, 2.8, 6, br2, 'spur'),
        (100, 1.1, 2.3, 0.0, 3.0, 6, br, 'spur'),
        (200, 3.2, 0.0, -7.5, 2.8, 8, gilt, 'spur'),
    ]
    for i, (t, r, x, y, z, sp, mat, kind) in enumerate(train):
        wheel(f'w{i}', t, r, max(0.02, r * 0.04), mat, (x, y, z), spokes=sp, kind=kind, steel=steel, spin=rr.random())
    # more wheels hung through the upper volume all round, on arbors, so the panorama is a whole movement
    placed = [(Vector((x, y, z)), r) for (t, r, x, y, z, sp, mat, kind) in train]
    mats3 = [br, br2, gilt, br, steel]
    k = 0
    for i in range(4000):
        az = rr.uniform(-math.pi, math.pi)
        d = rr.uniform(2.6, 9.5)
        z = rr.uniform(1.0, 6.0)
        r = rr.uniform(0.3, 1.6)
        p = Vector((TARGET.x + d * math.sin(az), TARGET.y + d * math.cos(az), z))
        if abs(p.x) > 3.0:
            continue
        if any((p - q).length < (r + rq) * 0.95 for q, rq in placed):
            continue
        placed.append((p, r))
        mat = mats3[k % 5]
        t = max(24, int(r * 70))
        wheel(f'u{k}', t, r, max(0.02, r * 0.04), mat, tuple(p), spokes=rr.choice((4, 5, 6)) if mat is not steel else 0,
              kind='escape' if mat is steel and rr.random() < 0.5 else 'spur', steel=steel, spin=rr.random())
        k += 1
        if k >= 34:
            break
    # overhead bridge plate with jewel holes, far above
    obj_from_bm('top-plate', bm_box(6.6, 11.0, 0.14, at=(0, 5.8, 6.4)), gilt, bevel=0.01)
    obj_from_bm('top-plate-back', bm_box(6.6, 6.0, 0.14, at=(0, -4.6, 6.4)), gilt, bevel=0.01)

    # pallet fork over the escape wheel: anchor with two ruby pallets
    ex, ey, ez = 0.9, 3.8, 0.55
    ax = Vector((ex, ey - 0.06, ez + 0.95))
    for s in (-1, 1):
        tip = Vector((ex + s * 0.45, ey - 0.06, ez + 0.55))
        frame_bar(ax, tip, 0.07, 0.035, steel)
        obj_from_bm('pallet', bm_box(0.05, 0.05, 0.14), ruby, tip + Vector((0, 0, -0.06)), (0, s * 0.3, 0))
    frame_bar(ax, ax + Vector((0, 0, 1.6)), 0.05, 0.035, steel)
    # pendulum far behind: a long rod and a huge bob
    px, py = -0.4, 8.0
    obj_from_bm('pend-rod', bm_cyl(0.03, 5.0, 16), steel, (px, py, 2.9), smooth_angle=40)
    obj_from_bm('pend-bob', bm_cyl(0.55, 0.12, 64, rot=Euler(FACE)), br, (px, py, 0.4), smooth_angle=40, bevel=0.01)
    # mainspring barrel low right with a coiled blued spring showing
    obj_from_bm('barrel', bm_cyl(0.65, 0.35, 96, rot=Euler(FACE)), br, (2.7, 3.2, PLATE_Z + 0.66), smooth_angle=40, bevel=0.01)
    spiral_curve('mainspring', 0.12, 0.6, 14, 0.008, 0, blued, (2.7, 3.0, PLATE_Z + 0.66), FACE)

    # light: rim lights behind the wheels at the edges, warm top key, haze
    for loc, tgt, e, c, s in (
        ((-3.2, 4.5, 1.6), (-1.6, 2.0, 0.3), 170, (1.0, 0.62, 0.3), 1.4),
        ((3.4, 4.0, 1.4), (1.6, 2.2, 0.1), 160, (1.0, 0.6, 0.28), 1.4),
        ((-1.0, 13.0, 6.0), (-1.0, 9.0, 2.5), 500, (1.0, 0.55, 0.22), 3.0),
        ((3.0, 11.0, 4.0), (2.4, 8.0, 1.5), 260, (1.0, 0.6, 0.28), 2.0),
        ((0.0, -9.5, 4.0), (0.0, -6.0, 2.5), 400, (1.0, 0.55, 0.25), 3.0),
        ((-2.6, -1.0, 3.5), (-1.6, -2.4, 0.4), 120, (1.0, 0.62, 0.3), 1.2),
        ((2.6, -0.6, 3.5), (2.0, -2.0, 0.6), 120, (1.0, 0.62, 0.3), 1.2),
    ):
        light('AREA', 'rim', loc, e, c, size=s, target=tgt)
    light('AREA', 'top-key', (-2.2, 0.2, 6.0), 70, (1.0, 0.7, 0.42), size=3.0, target=(-0.8, 2.5, PLATE_Z))
    volume_box((30, 34, 14), (0, 6, PLATE_Z + 7), 0.012, color=(1.0, 0.88, 0.72), aniso=0.6, noise=0.5, noise_scale=0.25)
    game_camera(dof_fstop=4.0)
    pano_camera()
    return {'exposure': 0.0}
