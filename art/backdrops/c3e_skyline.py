"""Hard option C, "Iron Tower, Midnight": the bench on an open platform near the top of a lattice clock tower, 90 m over
a sleeping harbour city. A low moon rises over the bay at the left; the city lights spread out on both shores; riveted
lattice legs frame the view; the skeleton movement stands on the platform at the right, brass wheels in a steel frame,
lit by two lamps. Behind the tray: dark open water and the far horizon, calm.
Clear spots: a pendulum hanging from the top girder at the left, swinging across the moon; open sky right of the tray,
beside the movement, for a big animated wheel.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from common import *
from common import _mat, _noise, _ramp, _maprange
from h2 import *

GROUND = -90.0
PLAT = -1.25
MOON_AZ, MOON_EL = -31.0, 0.35
PEND = eye_dir(-27.0, 14.0, 9.0)                    # pivot high on the top girder
WHEEL = eye_dir(23.0, -3.0, 9.0)                    # open sky for an animated wheel


def sky():
    """Night sky: navy zenith, a teal-grey band at the horizon with warm city glow, stars above 3 deg."""
    w = bpy.data.worlds.new('h-sky')
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    grad = nt.nodes.new('ShaderNodeValToRGB')
    el = grad.color_ramp.elements
    el[0].position, el[0].color = 0.0, (0.012, 0.016, 0.03, 1)
    el[1].position, el[1].color = 1.0, (0.0015, 0.0025, 0.007, 1)
    e = grad.color_ramp.elements.new(0.03)
    e.color = (0.05, 0.05, 0.065, 1)
    e = grad.color_ramp.elements.new(0.12)
    e.color = (0.012, 0.02, 0.045, 1)
    e = grad.color_ramp.elements.new(0.005)
    e.color = (0.09, 0.06, 0.05, 1)
    # z of the direction; below the horizon stays the same as the horizon band
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.0
    mr.inputs['From Max'].default_value = 1.0
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], grad.inputs['Fac'])
    # stars
    vo = nt.nodes.new('ShaderNodeTexVoronoi')
    vo.inputs['Scale'].default_value = 260.0
    nt.links.new(tc.outputs['Generated'], vo.inputs['Vector'])
    st = nt.nodes.new('ShaderNodeMapRange')
    st.inputs['From Min'].default_value = 0.06
    st.inputs['From Max'].default_value = 0.0
    st.inputs['To Min'].default_value = 0.0
    st.inputs['To Max'].default_value = 1.0
    nt.links.new(vo.outputs['Distance'], st.inputs['Value'])
    pw = nt.nodes.new('ShaderNodeMath')
    pw.operation = 'POWER'
    pw.inputs[1].default_value = 6.0
    nt.links.new(st.outputs['Result'], pw.inputs[0])
    hm = nt.nodes.new('ShaderNodeMapRange')       # fade stars in from 3 deg up
    hm.inputs['From Min'].default_value = 0.05
    hm.inputs['From Max'].default_value = 0.25
    nt.links.new(sep.outputs['Z'], hm.inputs['Value'])
    rnd_ = nt.nodes.new('ShaderNodeMath')
    rnd_.operation = 'MULTIPLY'
    nt.links.new(pw.outputs[0], rnd_.inputs[0])
    nt.links.new(hm.outputs['Result'], rnd_.inputs[1])
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    k.inputs[1].default_value = 0.6
    nt.links.new(rnd_.outputs[0], k.inputs[0])
    add = nt.nodes.new('ShaderNodeMix')
    add.data_type = 'RGBA'
    add.blend_type = 'ADD'
    add.inputs['Factor'].default_value = 1.0
    nt.links.new(grad.outputs['Color'], add.inputs['A'])
    nt.links.new(k.outputs[0], add.inputs['B'])
    nt.links.new(add.outputs['Result'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    bpy.context.scene.world = w


def city():
    """Ground far below: land with sodium and white street lights in clusters, a dark bay in the middle."""
    m, nt, out = _mat('h-city')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    # azimuth of the ground point from the tower (object origin under the eye)
    at = nt.nodes.new('ShaderNodeMath')
    at.operation = 'ARCTAN2'
    nt.links.new(sep.outputs['X'], at.inputs[0])
    nt.links.new(sep.outputs['Y'], at.inputs[1])
    nshore = _noise(nt, 0.0012, 4, 0.6, tc.outputs['Object'])
    sh = nt.nodes.new('ShaderNodeMath')
    sh.operation = 'MULTIPLY_ADD'
    sh.inputs[1].default_value = 0.5
    sh.inputs[2].default_value = -0.25
    nt.links.new(nshore.outputs['Fac'], sh.inputs[0])
    a2 = nt.nodes.new('ShaderNodeMath')
    a2.operation = 'ADD'
    nt.links.new(at.outputs[0], a2.inputs[0])
    nt.links.new(sh.outputs[0], a2.inputs[1])
    # land right of +0.22 rad (13 deg), and left of -0.75 rad; the bay in between
    landR = nt.nodes.new('ShaderNodeMapRange')
    landR.inputs['From Min'].default_value = 0.18
    landR.inputs['From Max'].default_value = 0.26
    nt.links.new(a2.outputs[0], landR.inputs['Value'])
    landL = nt.nodes.new('ShaderNodeMapRange')
    landL.inputs['From Min'].default_value = -0.7
    landL.inputs['From Max'].default_value = -0.78
    nt.links.new(a2.outputs[0], landL.inputs['Value'])
    land = nt.nodes.new('ShaderNodeMath')
    land.operation = 'MAXIMUM'
    nt.links.new(landR.outputs['Result'], land.inputs[0])
    nt.links.new(landL.outputs['Result'], land.inputs[1])
    # the near shore under the tower is land too (within 120 m)
    rad = nt.nodes.new('ShaderNodeVectorMath')
    rad.operation = 'LENGTH'
    nt.links.new(tc.outputs['Object'], rad.inputs[0])
    near = nt.nodes.new('ShaderNodeMapRange')
    near.inputs['From Min'].default_value = 160.0
    near.inputs['From Max'].default_value = 120.0
    nt.links.new(rad.outputs['Value'], near.inputs['Value'])
    land2 = nt.nodes.new('ShaderNodeMath')
    land2.operation = 'MAXIMUM'
    nt.links.new(land.outputs[0], land2.inputs[0])
    nt.links.new(near.outputs['Result'], land2.inputs[1])
    # street lights: voronoi points, two scales, masked by a cluster noise
    def pts(scale, size):
        vo = nt.nodes.new('ShaderNodeTexVoronoi')
        vo.inputs['Scale'].default_value = scale
        vo.inputs['Randomness'].default_value = 0.6
        nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
        r = nt.nodes.new('ShaderNodeMapRange')
        r.inputs['From Min'].default_value = size
        r.inputs['From Max'].default_value = 0.0
        nt.links.new(vo.outputs['Distance'], r.inputs['Value'])
        return r, vo
    p1, vo1 = pts(0.06, 0.13)     # ~17 m grid, tight dots
    p2, vo2 = pts(0.017, 0.07)    # big avenues / blocks
    cl = _noise(nt, 0.004, 5, 0.65, tc.outputs['Object'])
    clm = nt.nodes.new('ShaderNodeMapRange')
    clm.inputs['From Min'].default_value = 0.4
    clm.inputs['From Max'].default_value = 0.56
    nt.links.new(cl.outputs['Fac'], clm.inputs['Value'])
    s = nt.nodes.new('ShaderNodeMath')
    s.operation = 'ADD'
    nt.links.new(p1.outputs['Result'], s.inputs[0])
    nt.links.new(p2.outputs['Result'], s.inputs[1])
    s2 = nt.nodes.new('ShaderNodeMath')
    s2.operation = 'MULTIPLY'
    nt.links.new(s.outputs[0], s2.inputs[0])
    nt.links.new(clm.outputs['Result'], s2.inputs[1])
    s3 = nt.nodes.new('ShaderNodeMath')
    s3.operation = 'MULTIPLY'
    nt.links.new(s2.outputs[0], s3.inputs[0])
    nt.links.new(land2.outputs[0], s3.inputs[1])
    # fade with distance (air) so the horizon stays soft
    fade = nt.nodes.new('ShaderNodeMapRange')
    fade.inputs['From Min'].default_value = 400.0
    fade.inputs['From Max'].default_value = 12000.0
    fade.inputs['To Min'].default_value = 1.0
    fade.inputs['To Max'].default_value = 0.3
    nt.links.new(rad.outputs['Value'], fade.inputs['Value'])
    s4 = nt.nodes.new('ShaderNodeMath')
    s4.operation = 'MULTIPLY'
    nt.links.new(s3.outputs[0], s4.inputs[0])
    nt.links.new(fade.outputs['Result'], s4.inputs[1])
    s5 = nt.nodes.new('ShaderNodeMath')
    s5.operation = 'MULTIPLY'
    s5.inputs[1].default_value = 30.0
    nt.links.new(s4.outputs[0], s5.inputs[0])
    col = _ramp(nt, vo1.outputs['Color'], [(0.0, (1.0, 0.55, 0.2)), (0.7, (1.0, 0.62, 0.3)), (0.85, (0.85, 0.9, 1.0))])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(col.outputs['Color'], em.inputs['Color'])
    nt.links.new(s5.outputs[0], em.inputs['Strength'])
    # base: dark land, glossy dark water reflecting the moon
    water = nt.nodes.new('ShaderNodeBsdfPrincipled')
    water.inputs['Base Color'].default_value = (0.004, 0.006, 0.01, 1)
    water.inputs['Roughness'].default_value = 0.3
    water.inputs['Specular IOR Level'].default_value = 0.12
    wmap = nt.nodes.new('ShaderNodeMapping')
    wmap.inputs['Scale'].default_value = (0.25, 1.0, 1.0)
    nt.links.new(tc.outputs['Object'], wmap.inputs['Vector'])
    wn = _noise(nt, 0.35, 6, 0.65, wmap.outputs[0])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 0.4
    nt.links.new(wn.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], water.inputs['Normal'])
    ground = nt.nodes.new('ShaderNodeBsdfPrincipled')
    ground.inputs['Base Color'].default_value = (0.01, 0.01, 0.012, 1)
    ground.inputs['Roughness'].default_value = 0.9
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(land2.outputs[0], mix.inputs[0])
    nt.links.new(water.outputs[0], mix.inputs[1])
    nt.links.new(ground.outputs[0], mix.inputs[2])
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(mix.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs[0])
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30000)
    return obj_from_bm('city', bm, m, (EYE.x, EYE.y, GROUND))


def moon():
    d = 900.0
    p = eye_dir(MOON_AZ, MOON_EL, d)
    r = d * math.tan(math.radians(1.35))
    m, nt, out = _mat('h-moon')
    e = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = _noise(nt, 0.08, 5, 0.6, tc.outputs['Object'])
    col = _ramp(nt, n.outputs['Fac'], [(0.35, (0.8, 0.62, 0.42)), (0.65, (1.0, 0.86, 0.66))])
    nt.links.new(col.outputs['Color'], e.inputs['Color'])
    e.inputs['Strength'].default_value = 2.2
    nt.links.new(e.outputs[0], out.inputs[0])
    ob = obj_from_bm('moon', bm_sphere(r, seg=48, rings=24), m, p)
    ob.visible_shadow = False
    # its glow on the air round it
    g, nt, out = _mat('h-moon-halo')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0.5, 0.42, 0.35, 1)
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'POWER'
    inv.inputs[1].default_value = 3.0
    sub = nt.nodes.new('ShaderNodeMath')
    sub.operation = 'SUBTRACT'
    sub.inputs[0].default_value = 1.0
    nt.links.new(lw.outputs['Facing'], sub.inputs[1])
    nt.links.new(sub.outputs[0], inv.inputs[0])
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    k.inputs[1].default_value = 0.06
    nt.links.new(inv.outputs[0], k.inputs[0])
    nt.links.new(k.outputs[0], em.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    ad = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(em.outputs[0], ad.inputs[0])
    nt.links.new(tr.outputs[0], ad.inputs[1])
    nt.links.new(ad.outputs[0], out.inputs[0])
    h = obj_from_bm('moon-halo', bm_sphere(r * 5, seg=48, rings=24), g, p)
    h.visible_shadow = False
    # moonlight on the tower: cool, from the moon's direction
    sun = light('SUN', 'moonlight', tuple(p), 0.35, (0.7, 0.8, 1.0), size=math.radians(1.0), target=tuple(EYE))
    return p


def lattice_leg(name, base, top, w, mat, lace=0.9):
    """A square riveted lattice leg from base to top (both centre points), corner angles and zig-zag lacing."""
    base, top = Vector(base), Vector(top)
    h = (top - base).length
    bm = bmesh.new()
    d = (top - base).normalized()
    q = d.to_track_quat('Z', 'Y').to_matrix()
    ex, ey = q @ Vector((1, 0, 0)), q @ Vector((0, 1, 0))
    corners = [ex * sx * w / 2 + ey * sy * w / 2 for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    rot = q.to_euler()
    for c in corners:
        bm_box(0.12, 0.12, h, at=(base + top) / 2 + c, bm=bm, rot=rot)
    n = int(h / lace)
    for i in range(n):
        z0, z1 = i * lace, (i + 1) * lace
        for k in range(4):
            a, b = corners[k], corners[(k + 1) % 4]
            p0 = base + d * z0 + (a if i % 2 == 0 else b)
            p1 = base + d * z1 + (b if i % 2 == 0 else a)
            dd = p1 - p0
            mid = (p0 + p1) / 2
            r = dd.to_track_quat('Z', 'Y').to_euler()
            bm_box(0.05, 0.08, dd.length, at=mid, bm=bm, rot=r)
        if i % 6 == 0:
            for k in range(4):
                a, b = corners[k], corners[(k + 1) % 4]
                mid = base + d * z0 + (a + b) / 2
                dd = b - a
                bm_box(dd.length, 0.1, 0.1, at=mid, bm=bm, rot=dd.to_track_quat('X', 'Z').to_euler())
    return obj_from_bm(name, bm, mat, bevel=None)


def girder(name, a, b, depth, mat, lace=0.7):
    """A horizontal lattice girder (two chords, zig-zag web) from a to b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    u = d.normalized()
    up = Vector((0, 0, 1))
    bm = bmesh.new()
    rot = u.to_track_quat('X', 'Z').to_euler()
    for s in (-0.5, 0.5):
        bm_box(L, 0.16, 0.12, at=(a + b) / 2 + up * s * depth, bm=bm, rot=rot)
    n = int(L / lace)
    for i in range(n):
        p0 = a + u * i * lace + up * (-0.5 if i % 2 == 0 else 0.5) * depth
        p1 = a + u * (i + 1) * lace + up * (0.5 if i % 2 == 0 else -0.5) * depth
        dd = p1 - p0
        bm_box(0.06, 0.08, dd.length, at=(p0 + p1) / 2, bm=bm, rot=dd.to_track_quat('Z', 'Y').to_euler())
    return obj_from_bm(name, bm, mat)


def tower(M):
    st = M['steel_dark']
    # four legs, splayed slightly outward going down; we stand inside them
    legs = [(-6.5, -4.0), (6.5, -4.0), (-6.5, 8.5), (6.5, 8.5)]
    for i, (x, y) in enumerate(legs):
        lattice_leg(f'leg{i}', (x * 1.35, y * 1.2 + 0.8, -45.0), (x * 0.92, y * 0.95 + 0.4, 14.0), 1.1, st)
    # ring girders at the platform and above
    for z, dep in ((PLAT - 0.6, 1.0), (6.5, 1.3), (13.0, 1.0)):
        k = 1.0 - 0.012 * z
        c = [(x * k, y * k + 0.3, z) for x, y in legs]
        for a, b in (((0, 1), (1, 3), (2, 0)) if z < 0 else ((0, 1), (1, 3), (3, 2), (2, 0))):
            girder(f'ring{z}', c[a], c[b], dep, st)
    # cross-bracing X's below the platform (they show at the frame's lower corners)
    for z0 in (-6.0, -16.0):
        for a, b in (((-6.5, 8.5), (6.5, 8.5)), ((-6.5, -4.0), (-6.5, 8.5)), ((6.5, -4.0), (6.5, 8.5))):
            k0, k1 = 1.0 - 0.012 * z0, 1.0 - 0.012 * (z0 - 9)
            A0 = Vector((a[0] * k0, a[1] * k0 + 0.3, z0))
            B1 = Vector((b[0] * k1, b[1] * k1 + 0.3, z0 - 9))
            A1 = Vector((a[0] * k1, a[1] * k1 + 0.3, z0 - 9))
            B0 = Vector((b[0] * k0, b[1] * k0 + 0.3, z0))
            bar('brace', A0, B1, 0.22, 0.1, st)
            bar('brace', B0, A1, 0.22, 0.1, st)
    # platform deck (behind and beside the bench, not in front of it)
    box('deck', (13.0, 6.5, 0.12), (0, -1.6, PLAT), M['black'], bevel=0.01)
    box('pier-r', (3.4, 1.4, 0.14), (4.0, 4.6, PLAT), principled('pier-grate', (0.01, 0.01, 0.012), 0.2, 0.95), bevel=0.01)
    for x in (-6.3, 6.3):
        for y in (-4.5, 0.0, 4.5):
            rod('rail-post', (x, y, PLAT), (x, y, PLAT + 1.1), 0.03, st, seg=8)
        rod('rail', (x, -4.5, PLAT + 1.1), (x, 4.5, PLAT + 1.1), 0.035, st, seg=12)


def movement(M):
    """A skeleton movement on the platform at the right: steel A-frame, brass great wheel, steel second, escape on top."""
    iron, B, S = M['iron'], M['brass'], M['steel']
    base = Vector((4.0, 4.6, PLAT))
    for dy in (-0.5, 0.5):
        bar('mframe', base + Vector((-1.6, dy, 0)), base + Vector((0, dy, 3.4)), 0.2, 0.14, M['steel_dark'])
        bar('mframe', base + Vector((1.6, dy, 0)), base + Vector((0, dy, 3.4)), 0.2, 0.14, M['steel_dark'])
        bar('mframe', base + Vector((-1.2, dy, 0.9)), base + Vector((1.2, dy, 0.9)), 0.16, 0.12, M['steel_dark'])
    gw = base + Vector((-0.2, -0.75, 1.45))
    twheel('great', 120, 1.4, 0.07, B, gw, FACE, spokes=6, axle_mat=S, arbor=1.7)
    p2 = mesh_pair(gw, 1.4, 0.75, 1.0, 54, dy=0.15)
    twheel('second', 54, 0.75, 0.06, S, p2, FACE, spokes=5, axle_mat=S)
    ew = Vector(mesh_pair(p2, 0.75, 0.55, 2.3, 30, dy=0.1))
    gear('escape', 30, 0.55, 0.05, M['blued'], ew, FACE, spokes=5, kind='escape', hub=0.15, rim=0.8)
    pv = ew + Vector((0, -0.08, 0.85))
    for s in (-1, 1):
        bar('anchor-arm', pv, pv + Vector((s * 0.5, 0, -0.62)), 0.09, 0.06, B)
    obj_from_bm('drum', bm_cyl(0.45, 1.1, 48), M['steel_dark'], base + Vector((0.4, 0.2, 0.45)), SIDE, smooth_angle=40)
    rod('cable', base + Vector((0.85, 0.0, 0.2)), base + Vector((0.85, 0.0, -30)), 0.02, M['rope'], seg=8)


def pendulum_mount(M):
    """Top girder bracket and suspension cock for a long pendulum that will hang across the moon."""
    box('susp-cock', (0.3, 0.3, 0.6), PEND, M['iron'])
    girder('susp-girder', (PEND.x - 5.0, PEND.y, PEND.z + 0.6), (PEND.x + 5.0, PEND.y, PEND.z + 0.6), 0.8, M['steel_dark'])


def wheel_mount(M):
    """A bare arbor on a bracket off the movement frame, in clear sky: the spot for an animated wheel."""
    bar('wheel-bracket', Vector((4.0, 4.6, PLAT + 2.2)), WHEEL + Vector((0, 0.3, 0)), 0.16, 0.12, M['steel_dark'])
    rod('wheel-arbor', WHEEL + Vector((0, 0.4, 0)), WHEEL - Vector((0, 0.3, 0)), 0.045, M['steel'])


def build(mode):
    sky()
    M = mats()
    bench_set()
    city()
    mp = moon()
    tower(M)
    movement(M)
    pendulum_mount(M)
    wheel_mount(M)
    light('POINT', 'lamp-a', (3.0, 3.6, PLAT + 2.6), 160, LAMP, size=0.06)
    obj_from_bm('lamp-a-glass', bm_sphere(0.07), emission('lamp-a-flame', LAMP, 40), (3.0, 3.6, PLAT + 2.6))
    light('POINT', 'lamp-b', (5.8, 5.8, PLAT + 3.0), 140, LAMP, size=0.06)
    obj_from_bm('lamp-b-glass', bm_sphere(0.07), emission('lamp-b-flame', LAMP, 40), (5.8, 5.8, PLAT + 3.0))
    light('AREA', 'rim-cool', (8.0, 12.0, 2.0), 900, COOL, size=4.0, target=(4.0, 4.6, 0.5))
    light('AREA', 'city-bounce', (0, 4.0, -12.0), 400, (1.0, 0.6, 0.35), size=20.0, target=(0, 4.0, 10.0))
    light('AREA', 'bench-key', (-1.2, 0.0, 1.1), 18, (1.0, 0.7, 0.45), size=1.0, target=(-0.5, 0.4, BENCH_Z))
    bench_light_link(keep=('bench-key',))
    game_camera()
    spots = {'pendulum pivot': PEND, 'pendulum bob (4 m rod)': PEND - Vector((0, 0, 4.0)), 'wheel arbor': WHEEL, 'moon': mp}
    return {'exposure': 0.0, 'turn': 'left', 'spots': spots}
