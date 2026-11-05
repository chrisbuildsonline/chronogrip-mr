"""Concept III, second pass: a watchmaker's walnut bench at the edge of a vast clock movement.

The bench matches the game's bench (src/scenery.ts: 9 planks, 3.4 x 1.5 m, top at y = -0.336), so in game the real
bench covers the panorama's bench exactly. Beyond its far edge the movement drops away: polished involute wheels,
a giant balance wheel with its hairspring, bridges with ruby jewels, warm haze and god rays. The cone behind the tray
is kept to far, hazed, dim shapes; the bright things sit at the left and right edges and overhead.
VARIANT env: 'a' (crisp backdrop) or 'b' (lens-soft backdrop, bokeh in every view).
"""
import os, bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from common import *
from common import _ramp, _noise, _maprange

VARIANT = os.environ.get('VARIANT', 'a')
TEX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tex')
FACE = (math.pi / 2, 0, 0)
DEEP = -3.4   # the main plate far below the bench


def pbr_wood(name, set_, tile):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    uv = nt.nodes.new('ShaderNodeUVMap')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1)
    nt.links.new(uv.outputs[0], mp.inputs['Vector'])

    def img(kind, data):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(os.path.join(TEX, f'{set_}_{kind}_2048.png'))
        if data:
            t.image.colorspace_settings.name = 'Non-Color'
        t.interpolation = 'Cubic'
        nt.links.new(mp.outputs[0], t.inputs['Vector'])
        return t
    nt.links.new(img('albedo', False).outputs['Color'], b.inputs['Base Color'])
    nt.links.new(img('roughness', True).outputs['Color'], b.inputs['Roughness'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = 1.0
    nt.links.new(img('normal', True).outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Coat Weight'].default_value = 0.25
    b.inputs['Coat Roughness'].default_value = 0.2
    return m


def uv_box(name, size, at, mat, uofs=0.0):
    """A box whose UVs are its world x, y in metres (plus an offset per plank), like the planar UVs the game will use."""
    bm = bm_box(*size, at=at)
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal
        for l in f.loops:
            c = l.vert.co
            if abs(n.z) > 0.5:
                l[uvl].uv = (c.x + uofs, c.y)
            elif abs(n.y) > 0.5:
                l[uvl].uv = (c.x + uofs, c.z)
            else:
                l[uvl].uv = (c.y, c.z)
    return obj_from_bm(name, bm, mat, bevel=0.002)


def bench():
    m = pbr_wood('bench-walnut', 'bench', 1.0)
    planks, depth = 9, 1.5
    w = depth / planks
    for i in range(planks):
        y = -0.55 + w * (i + 0.5)      # three z = 0.55 - w (i + 0.5)  ->  blender y = -z
        uv_box('plank', (3.4, w - 0.004, 0.04), (0, y, BENCH_Z - 0.02 - (i % 3) * 0.0006), m, uofs=i * 0.37)
    uv_box('bench-edge', (3.4, 0.04, 0.07), (0, -0.57, BENCH_Z - 0.035), m)
    # far edge: a thin brass nosing, a deco line between the bench and the drop
    obj_from_bm('nosing', bm_box(3.4, 0.012, 0.045, at=(0, 0.956, BENCH_Z - 0.0215)), brass('nosing', color=(0.8, 0.56, 0.24), rough=(0.12, 0.22), aniso=0.2), bevel=0.002)
    # legs dropping into the dark
    legm = wood('legs', dark=(0.012, 0.006, 0.003), light=(0.04, 0.02, 0.009), coat=0.4)
    for x in (-1.6, 1.6):
        for y in (-0.5, 0.88):
            obj_from_bm('leg', bm_box(0.08, 0.08, 2.6, at=(x, y, BENCH_Z - 1.33)), legm, bevel=0.004)


def wheel(name, teeth, r, thick, mat, loc, rot=FACE, spokes=5, jewel=True, arbor=2.0, mats=None):
    g = gear(name, teeth, r, thick, mat, loc, rot, spokes=spokes, kind='involute', hub=0.15, rim=0.86, hub_h=1.8, spoke_h=0.7)
    E = Euler(rot)
    ax = Vector((0, 0, 1))
    ax.rotate(E)
    L = Vector(loc)
    steel, ruby, gold = mats['steel'], mats['ruby'], mats['gold']
    if arbor:
        a = obj_from_bm(name + '-arbor', bm_cyl(r * 0.03, r * arbor, 24), steel, L, smooth_angle=40)
        a.rotation_euler = ax.to_track_quat('Z', 'Y').to_euler()
        pin = gear(name + '-pinion', 12, r * 0.16, thick * 3.5, steel, L + ax * thick * 2.6, rot, spokes=0, kind='involute', bore=0.2)
    if jewel:
        for s in (1,):
            p = L - ax * thick * 1.1 * s
            obj_from_bm(name + '-chaton', bm_ring(r * 0.075, r * 0.04, thick * 0.5, 48), gold, p, rot, smooth_angle=40, bevel=r * 0.004)
            obj_from_bm(name + '-jewel', bm_sphere(r * 0.042, seg=32, rings=16), ruby, p - ax * thick * 0.1, rot, scale=(1, 1, 0.45))
    return g


def balance_wheel(c, R, rot, mats):
    """A giant balance: rim with timing screws, two arms, a bright hairspring in front of the hub."""
    b = mats['brass']
    E = Euler(rot)
    M = Matrix.Translation(c) @ E.to_matrix().to_4x4()
    obj_from_bm('balance-rim', bm_ring(R, R * 0.9, R * 0.06, 160), b, c, rot, smooth_angle=40, bevel=R * 0.006)
    for k in range(2):
        a = k * math.pi + 0.4
        bm = bm_box(R * 1.82, R * 0.06, R * 0.04, rot=Euler((0, 0, a)))
        obj_from_bm('balance-arm', bm, b, c, rot, smooth_angle=40, bevel=R * 0.005)
    obj_from_bm('balance-hub', bm_cyl(R * 0.08, R * 0.12, 48), b, c, rot, smooth_angle=40, bevel=R * 0.006)
    for k in range(22):
        a = 2 * math.pi * k / 22
        p = M @ Vector((R * 1.0 * math.cos(a), R * 1.0 * math.sin(a), 0))
        d = (p - Vector(c)).normalized()
        s = obj_from_bm('timing-screw', bm_cyl(R * 0.028, R * 0.07, 24), mats['gold'], p + d * R * 0.03, smooth_angle=40)
        s.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    ax = Vector((0, 0, 1))
    ax.rotate(E)
    spiral_curve('hairspring', R * 0.12, R * 0.62, 8, R * 0.0028, 0, mats['spring'], Vector(c) - ax * R * 0.1, rot)
    obj_from_bm('stud', bm_box(R * 0.06, R * 0.06, R * 0.08), mats['steel'], M @ Vector((R * 0.62, 0, -R * 0.1)), rot)
    a = obj_from_bm('balance-staff', bm_cyl(R * 0.025, R * 1.4, 24), mats['steel'], c, smooth_angle=40)
    a.rotation_euler = ax.to_track_quat('Z', 'Y').to_euler()


def bridge(name, pts, w, t, mat, jewels, mats):
    """A gilt bridge: a thick bar along a polyline, with jewelled holes at the given points."""
    for a, b in zip(pts, pts[1:]):
        a, b = Vector(a), Vector(b)
        d = b - a
        ob = obj_from_bm(name, bm_box(d.length + w, w, t), mat, (a + b) / 2, smooth_angle=30, bevel=w * 0.08)
        ob.rotation_euler = d.to_track_quat('X', 'Z').to_euler()
    for p in jewels:
        obj_from_bm(name + '-chaton', bm_ring(w * 0.3, w * 0.16, t * 1.3, 48), mats['gold'], p, smooth_angle=40, bevel=w * 0.02)
        obj_from_bm(name + '-jewel', bm_sphere(w * 0.17, seg=32, rings=16), mats['ruby'], Vector(p) - Vector((0, 0, t * 0.4)), scale=(1, 1, 0.45))


def build(mode):
    world((0.006, 0.0035, 0.002), 1.0)
    mats = {
        'brass': brass('pol-brass', color=(0.86, 0.6, 0.26), rough=(0.07, 0.16), aniso=0.7, tarnish=0.05, scale=0.2),
        'brass2': brass('pol-brass-warm', color=(0.9, 0.55, 0.2), rough=(0.09, 0.2), aniso=0.7, tarnish=0.1, scale=0.2),
        'gilt': brass('gilt', color=(0.6, 0.43, 0.18), rough=(0.22, 0.36), aniso=0.75, tarnish=0.25, scale=0.15),
        'gold': principled('gold', (0.95, 0.68, 0.3), 1.0, 0.1),
        'steel': principled('pol-steel', (0.75, 0.75, 0.77), 1.0, 0.08, **{'Anisotropic': 0.5}),
        'spring': principled('spring', (0.7, 0.7, 0.74), 1.0, 0.18),
        'blued': principled('blued', (0.03, 0.06, 0.18), 1.0, 0.15),
        'ruby': principled('ruby', (0.8, 0.02, 0.04), 0.0, 0.02, **{'Transmission Weight': 0.85, 'IOR': 1.76, 'Emission Color': (1, 0.12, 0.06, 1), 'Emission Strength': 0.6}),
    }
    bench()
    # main plate far below, perlage, mostly lost in the dark haze
    from c3_movement import perlage
    obj_from_bm('deep-plate', bm_box(40, 40, 0.2, at=(0, 6, DEEP - 0.1)), perlage('deep-perlage', (0.3, 0.2, 0.09)))

    B, B2, G = mats['brass'], mats['brass2'], mats['gilt']
    # hero wheels, left edge: a great wheel and its neighbour rising from the abyss, near enough to read
    wheel('great', 144, 2.3, 0.07, B, (-3.0, 3.6, -1.15), spokes=6, mats=mats)
    wheel('third', 84, 1.05, 0.05, B2, (-1.35, 5.2, -1.6), spokes=5, mats=mats)
    # right edge: the giant balance wheel, slightly turned to the player, low enough that its hub shows in the game view
    balance_wheel((3.0, 6.2, 0.15), 1.9, (math.pi / 2, 0, -0.35), mats)
    wheel('fourth', 96, 1.2, 0.05, B, (2.2, 3.4, -1.75), spokes=5, mats=mats)
    # behind the tray: far, dim, hazed escape wheel and pallet fork
    # upper volume and all round for the panorama: more of the train, the barrel, the crown wheel
    wheel('centre', 120, 1.8, 0.06, G, (-1.2, 8.5, 2.6), spokes=6, mats=mats)
    wheel('upper-r', 90, 1.3, 0.05, B, (2.6, 9.0, 3.4), spokes=5, mats=mats)
    wheel('back-1', 160, 2.6, 0.07, B, (1.8, -5.2, 0.5), spokes=6, mats=mats)
    wheel('back-2', 72, 1.0, 0.05, B2, (-1.8, -4.2, 2.2), spokes=5, mats=mats)
    wheel('back-3', 110, 1.6, 0.06, G, (-3.6, -2.2, -1.2), (math.pi / 2, 0, math.pi / 2), spokes=6, mats=mats)
    wheel('side-r', 100, 1.5, 0.06, B, (4.4, 0.6, 1.4), (math.pi / 2, 0, math.pi / 2), spokes=6, mats=mats)
    wheel('side-l', 64, 0.9, 0.05, B2, (-4.2, 1.2, 1.9), (math.pi / 2, 0, math.pi / 2), spokes=5, mats=mats)
    # companions meshing with the heroes, so the trains read as working gearing, not loose rings
    def mate(name, base, r_base, r, ang, teeth, mat, dy=0.09, rot=FACE):
        bx, by, bz = base
        m_ = 2 * r_base / 140
        d = r_base + r - 2.0 * (2 * r / (teeth + 2))
        wheel(name, teeth, r, 0.05, mat, (bx + d * math.cos(ang), by + dy, bz + d * math.sin(ang)), rot, spokes=5 if r > 0.5 else 0, mats=mats, jewel=r > 0.4)
    mate('great-p', (-3.0, 3.6, -1.15), 2.3, 0.55, 0.95, 22, mats['steel'])
    mate('third-p', (-1.35, 5.2, -1.6), 1.05, 0.7, 2.2, 40, B)
    mate('fourth-p', (2.2, 3.4, -1.75), 1.2, 0.8, 0.6, 46, B2)
    mate('centre-p', (-1.2, 8.5, 2.6), 1.8, 0.9, -0.5, 52, B)
    mate('upper-p', (2.6, 9.0, 3.4), 1.3, 0.6, 3.6, 34, mats['steel'])
    mate('back-1p', (1.8, -5.2, 0.5), 2.6, 1.1, 2.6, 60, B2, dy=-0.09)
    mate('back-2p', (-1.8, -4.2, 2.2), 1.0, 0.65, -0.7, 38, B, dy=-0.09)
    # far ring of large dim wheels in the haze, silhouetted against warm glows (none straight behind the tray)
    rr = rnd(77)
    for i in range(18):
        az = 2 * math.pi * i / 18 + rr.uniform(-0.12, 0.12)
        if abs(math.atan2(math.sin(az), math.cos(az))) < 0.45:
            continue
        d = rr.uniform(13, 18)
        r = rr.uniform(1.8, 3.6)
        z = rr.uniform(-3.0, 4.5)
        x, y = d * math.sin(az), 0.4 + d * math.cos(az)
        gear('far', int(r * 48), r, 0.1, G, (x, y, z), (math.pi / 2, 0, -az), spokes=rr.choice((5, 6, 8)), kind='involute', hub=0.12, rim=0.86)
    for az, z, e in ((-1.0, 1.5, 2200), (1.1, 0.5, 2200), (math.pi, 1.0, 2600), (2.2, 3.0, 1600), (-2.3, -1.0, 1600)):
        d = 24
        p_ = Vector((d * math.sin(az), 0.4 + d * math.cos(az), z))
        light('AREA', 'far-glow', tuple(p_), e, (1.0, 0.58, 0.26), size=8.0, target=(0, 0.4, z))
    # crown wheel lying flat overhead, and the mainspring barrel low behind the player
    gear('crown', 80, 1.4, 0.08, B, (0.5, 2.0, 5.2), (0, 0, 0.2), spokes=5, kind='involute', hub=0.15, rim=0.86)
    obj_from_bm('barrel', bm_cyl(1.5, 0.6, 128, rot=Euler(FACE)), B, (0.2, -6.5, -1.6), smooth_angle=40, bevel=0.012)
    gear('barrel-teeth', 160, 1.6, 0.08, B, (0.2, -6.15, -1.6), FACE, spokes=0, kind='involute', bore=0.9)
    spiral_curve('mainspring', 0.25, 1.35, 16, 0.012, 0, mats['blued'], (0.2, -6.34, -1.6), FACE)
    # bridges overhead with ruby jewels, the god rays come through their gaps
    bridge('bridge-a', [(-5, 1.0, 4.4), (-1.0, 4.0, 4.6), (1.5, 9.0, 4.6)], 0.5, 0.18, G, [(-1.0, 4.0, 4.45), (0.2, 6.5, 4.45)], mats)
    bridge('bridge-b', [(5, 2.0, 4.0), (2.6, 6.0, 4.2), (2.6, 12.0, 4.4)], 0.45, 0.16, G, [(2.6, 6.0, 4.05), (2.6, 9.0, 4.15)], mats)
    bridge('bridge-c', [(-4, -6.0, 4.2), (0.5, -3.0, 4.6), (4, -6.5, 4.3)], 0.5, 0.18, G, [(0.5, -3.0, 4.45)], mats)
    # pillars to the deep plate at the corners of the frame
    for x, y in ((-4.6, 7.5), (4.8, 8.0), (-4.5, -4.0), (4.6, -3.5)):
        bm = bm_cyl(0.22, 9.0, 48, at=(0, 0, 0))
        for t, k in ((-0.45, 1.3), (0.45, 1.3), (0.0, 1.12)):
            bm_cyl(0.22 * k, 0.12, 48, at=(0, 0, 9.0 * t), bm=bm)
        obj_from_bm('pillar', bm, G, (x, y, DEEP + 4.5), smooth_angle=40, bevel=0.01)

    # light: god rays from high left through the bridges; rim lights behind the heroes; ruby glints
    light('SPOT', 'god', (-6.0, 4.0, 9.5), 14000, (1.0, 0.68, 0.38), size=0.12, target=(1.5, 9.0, -3.0), spot=24, blend=0.35)
    light('AREA', 'rim-great', (-4.6, 6.4, 0.6), 420, (1.0, 0.6, 0.28), size=1.6, target=(-2.8, 3.4, -0.9))
    light('AREA', 'rim-balance', (4.6, 8.6, 1.4), 520, (1.0, 0.64, 0.32), size=1.8, target=(3.0, 6.0, 0.1))
    light('AREA', 'key-balance', (1.0, 2.0, 3.5), 60, (1.0, 0.72, 0.45), size=1.0, target=(3.0, 6.2, 0.2))
    light('AREA', 'fourth-rim', (3.6, 5.6, -0.6), 180, (1.0, 0.6, 0.3), size=1.0, target=(2.2, 3.4, -1.7))
    light('AREA', 'up-wash', (0.0, 6.0, 7.5), 300, (1.0, 0.62, 0.32), size=4.0, target=(0.0, 6.0, 2.5))
    light('AREA', 'back-wash', (0.0, -2.0, 6.0), 380, (1.0, 0.6, 0.3), size=3.0, target=(0.5, -5.5, 0.0))
    light('AREA', 'side-wash-r', (2.4, 0.0, 3.5), 140, (1.0, 0.62, 0.32), size=1.2, target=(4.4, 0.6, 1.4))
    light('AREA', 'side-wash-l', (-2.2, 0.4, 3.6), 120, (1.0, 0.62, 0.32), size=1.2, target=(-4.2, 1.2, 1.9))
    light('AREA', 'move-key-l', (-0.5, 1.2, 1.6), 140, (1.0, 0.7, 0.42), size=0.8, target=(-2.6, 3.6, -0.9))
    light('AREA', 'move-key-r', (1.2, 2.0, 1.2), 120, (1.0, 0.7, 0.42), size=0.8, target=(2.6, 5.0, -0.6))
    light('AREA', 'bench-key', (-1.2, 0.0, 1.1), 18, (1.0, 0.7, 0.45), size=1.0, target=(-0.5, 0.4, BENCH_Z))

    # layered haze: thicker in the abyss, thin at bench level, a little noise
    m, nt, out = (None, None, None)
    from common import _mat
    m, nt, out = _mat('layered-haze')
    v = nt.nodes.new('ShaderNodeVolumePrincipled')
    v.inputs['Color'].default_value = (1.0, 0.86, 0.68, 1)
    v.inputs['Anisotropy'].default_value = 0.65
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    hz = _maprange(nt, sep.outputs['Z'], 0.014, 0.0012)
    hz.inputs['From Min'].default_value = -6.0
    hz.inputs['From Max'].default_value = 3.0
    n = _noise(nt, 0.35, 3, 0.5)
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    nt.links.new(hz.outputs['Result'], mul.inputs[0])
    sc_ = _maprange(nt, n.outputs['Fac'], 0.5, 1.5)
    sc_.inputs['From Min'].default_value = 0.3
    sc_.inputs['From Max'].default_value = 0.7
    nt.links.new(sc_.outputs['Result'], mul.inputs[1])
    nt.links.new(mul.outputs[0], v.inputs['Density'])
    nt.links.new(v.outputs[0], out.inputs['Volume'])
    hb = obj_from_bm('haze', bm_box(56, 56, 18, at=(0, 2, 1.0)), m)
    hb.visible_shadow = False

    # light linking: only the bench key reaches the bench; everything else lights the movement
    coll = bpy.data.collections.new('bench-only')
    for o in bpy.data.objects:
        if o.name.startswith(('plank', 'bench-edge', 'nosing', 'leg')):
            coll.objects.link(o)
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name != 'bench-key':
            o.light_linking.receiver_collection = coll
            for co in coll.collection_objects:
                co.light_linking.link_state = 'EXCLUDE'
    cam = game_camera(dof_fstop=2.0)
    pano_camera()
    cfg = {'exposure': -0.3}
    if VARIANT == 'b':
        # lens-soft backdrop: the cube faces get the same angular blur as the game camera would at f/2.8 on the tray
        cfg['cube_dof'] = dict(focus=(TRAY - EYE).length, aperture_mm=25.7 / 2.8)
    return cfg
