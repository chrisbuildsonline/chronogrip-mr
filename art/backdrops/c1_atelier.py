"""Concept 1: Victorian clockmaker's atelier at night."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from common import *
from clocks import clock, mats as clock_mats
from props import *

WALL_Y = 1.12
FLOOR = -1.1
CEIL = 1.95
XL, XR, YB = -2.2, 2.2, -2.3


def room():
    wall = wood('wall-panel', dark=(0.012, 0.006, 0.003), light=(0.045, 0.02, 0.009), scale=2.5, coat=0.6)
    paper_m, nt, out = None, None, None
    # dark damask-ish wallpaper: deep brown with faint vertical stripes
    m, nt, out = (lambda: None, None, None)
    wp = bpy.data.materials.new('wallpaper')
    wp.use_nodes = True
    nt = wp.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.wave_type = 'BANDS'
    wv.bands_direction = 'X'
    wv.inputs['Scale'].default_value = 14
    wv.inputs['Distortion'].default_value = 0.4
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    from common import _ramp
    r = _ramp(nt, wv.outputs['Fac'], [(0.3, (0.02, 0.012, 0.007)), (0.7, (0.04, 0.024, 0.012))])
    nt.links.new(r.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.7
    floor_m = wood('floor', dark=(0.02, 0.01, 0.005), light=(0.07, 0.035, 0.015), scale=2, coat=0.3)

    # walls (paper above a panelled wainscot)
    for name, size, at in (
        ('back', (XR - XL, 0.04, CEIL - FLOOR), ((XL + XR) / 2, WALL_Y + 0.02, (CEIL + FLOOR) / 2)),
        ('front', (XR - XL, 0.04, CEIL - FLOOR), ((XL + XR) / 2, YB - 0.02, (CEIL + FLOOR) / 2)),
        ('left', (0.04, WALL_Y - YB, CEIL - FLOOR), (XL - 0.02, (WALL_Y + YB) / 2, (CEIL + FLOOR) / 2)),
        ('right', (0.04, WALL_Y - YB, CEIL - FLOOR), (XR + 0.02, (WALL_Y + YB) / 2, (CEIL + FLOOR) / 2)),
    ):
        obj_from_bm('wall-' + name, bm_box(*size, at=at), wp)
    # wainscot panels on every wall up to z = -0.15
    top = -0.15
    for x0, x1, y0, y1 in ((XL, XR, WALL_Y - 0.03, WALL_Y), (XL, XR, YB, YB + 0.03), (XL, XL + 0.03, YB, WALL_Y), (XR - 0.03, XR, YB, WALL_Y)):
        obj_from_bm('wainscot', bm_box(x1 - x0, y1 - y0, top - FLOOR, at=((x0 + x1) / 2, (y0 + y1) / 2, (top + FLOOR) / 2)), wall, bevel=0.004)
    # picture rail + skirting
    rail = wood('rail', dark=(0.02, 0.008, 0.004), light=(0.06, 0.025, 0.01), coat=0.9)
    for z in (top, 1.75):
        obj_from_bm('rail', bm_box(XR - XL, 0.05, 0.035, at=(0, WALL_Y - 0.03, z)), rail, bevel=0.006)
        obj_from_bm('rail', bm_box(XR - XL, 0.05, 0.035, at=(0, YB + 0.03, z)), rail, bevel=0.006)
        obj_from_bm('rail', bm_box(0.05, WALL_Y - YB, 0.035, at=(XL + 0.03, (WALL_Y + YB) / 2, z)), rail, bevel=0.006)
        obj_from_bm('rail', bm_box(0.05, WALL_Y - YB, 0.035, at=(XR - 0.03, (WALL_Y + YB) / 2, z)), rail, bevel=0.006)
    obj_from_bm('floor', bm_box(XR - XL, WALL_Y - YB, 0.04, at=(0, (WALL_Y + YB) / 2, FLOOR - 0.02)), floor_m)
    ceil_m = principled('ceiling', (0.03, 0.022, 0.016), 0, 0.8)
    obj_from_bm('ceiling', bm_box(XR - XL, WALL_Y - YB, 0.04, at=(0, (WALL_Y + YB) / 2, CEIL + 0.02)), ceil_m)
    beam = wood('beam', dark=(0.012, 0.006, 0.003), light=(0.04, 0.018, 0.008), coat=0.2)
    for y in (-1.6, -0.5, 0.6):
        obj_from_bm('beam', bm_box(XR - XL, 0.16, 0.2, at=(0, y, CEIL - 0.1)), beam, bevel=0.01)


def bench():
    top_m = wood('bench-top', dark=(0.02, 0.009, 0.004), light=(0.085, 0.04, 0.017), scale=1.6, rough=(0.4, 0.62), coat=0.18)
    obj_from_bm('bench', bm_box(3.0, WALL_Y + 0.8, 0.06, at=(0, (WALL_Y - 0.8) / 2, BENCH_Z - 0.03)), top_m, bevel=0.006)
    # front apron + legs (seen in the panorama)
    obj_from_bm('apron', bm_box(3.0, 0.04, 0.16, at=(0, -0.78, BENCH_Z - 0.12)), top_m, bevel=0.004)
    for x in (-1.45, 1.45):
        obj_from_bm('leg', bm_box(0.08, 0.08, BENCH_Z - FLOOR, at=(x, -0.72, (BENCH_Z + FLOOR) / 2)), top_m, bevel=0.005)
    # drawers under the bench front
    knob = brass('knob', aniso=0.1)
    for x in (-1.0, -0.35, 0.35, 1.0):
        obj_from_bm('drawer', bm_box(0.55, 0.03, 0.12, at=(x, -0.8, BENCH_Z - 0.12)), top_m, bevel=0.004)
        obj_from_bm('knob', bm_sphere(0.012, seg=16, rings=8), knob, (x, -0.82, BENCH_Z - 0.12))
    # leather mat under the left work area
    leather = principled('leather', (0.045, 0.012, 0.007), 0.0, 0.55, **{'Coat Weight': 0.2})
    obj_from_bm('mat', bm_box(0.5, 0.42, 0.004, at=(-0.6, 0.33, BENCH_Z + 0.002), rot=Euler((0, 0, 0.06))), leather, bevel=0.0015)


def lamp():
    """Articulated brass desk lamp on the left, its shade over the leather mat."""
    m = pm()
    b = brass('lamp-brass', aniso=0.3)
    base = Vector((-0.86, 0.72, BENCH_Z))
    obj_from_bm('lamp-base', bm_cyl(0.09, 0.025, 48, r2=0.075), b, base + Vector((0, 0, 0.0125)), smooth_angle=40, bevel=0.003)
    p1 = base + Vector((0, 0, 0.03))
    p2 = Vector((-0.78, 0.6, 0.18))
    p3 = Vector((-0.6, 0.38, 0.12))
    for a, c in ((p1, p2), (p2, p3)):
        d = c - a
        bm = bm_cyl(0.007, d.length, 16)
        ob = obj_from_bm('lamp-arm', bm, b, (a + c) / 2, smooth_angle=40)
        ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        obj_from_bm('lamp-joint', bm_sphere(0.014, seg=16, rings=8), b, c, smooth_angle=80)
    # shade: a brass dome opening down-forward
    bm = bmesh.new()
    res = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=16, radius=0.085)
    for v in list(bm.verts):
        if v.co.z < -0.005:
            bm.verts.remove(v)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.002)
    shade_dir = Vector((0.25, -0.1, -1)).normalized()
    shade = obj_from_bm('lamp-shade', bm, b, p3 + Vector((0.02, -0.01, -0.01)), smooth_angle=80)
    shade.rotation_euler = (-shade_dir).to_track_quat('Z', 'Y').to_euler()
    inner = emission('lamp-inner', (1.0, 0.62, 0.3), 1.2)
    bulb = emission('bulb', (1.0, 0.55, 0.22), 40)
    hot = p3 + Vector((0.02, -0.01, -0.01)) + shade_dir * 0.03
    obj_from_bm('lamp-bulb', bm_sphere(0.022, seg=24, rings=12), bulb, hot)
    sp = light('SPOT', 'lamp-spot', hot + shade_dir * 0.01, 80, (1.0, 0.68, 0.38), size=0.025, target=hot + shade_dir, spot=95, blend=0.6)
    sp.data.use_soft_falloff = True
    # glow inside the shade bounces softly
    light('POINT', 'lamp-fill', hot - shade_dir * 0.03, 1.2, (1.0, 0.6, 0.3), size=0.03)


def sconce(at, name='sconce', strength=18):
    b = brass('sconce-brass', aniso=0.2)
    x, y, z = at
    obj_from_bm(name + '-plate', bm_cyl(0.05, 0.015, 32, rot=Euler((math.pi / 2, 0, 0))), b, (x, y - 0.007, z), smooth_angle=40)
    obj_from_bm(name + '-arm', bm_cyl(0.008, 0.16, 16, rot=Euler((math.pi / 2, 0, 0))), b, (x, y - 0.09, z + 0.02), smooth_angle=40)
    frost = principled('frost', (1.0, 0.85, 0.65), 0, 0.4, **{'Transmission Weight': 1.0, 'Emission Color': (1.0, 0.6, 0.28, 1), 'Emission Strength': strength})
    obj_from_bm(name + '-globe', bm_sphere(0.06, seg=32, rings=16), frost, (x, y - 0.17, z + 0.08))
    light('POINT', name + '-light', (x, y - 0.17, z + 0.08), 10, (1.0, 0.62, 0.32), size=0.06)


def clock_wall():
    clock_mats()
    rr = rnd(11)
    rot = (math.pi / 2, 0, 0)
    y = WALL_Y - 0.03
    boxes = [(1.02 - 0.12, 1.02 + 0.12, 0.1, 0.42), (-1.3 - 0.12, -1.3 + 0.12, 0.3, 0.62)]  # sconces

    def bbox(k, r, x, z):
        if k == 'round':
            return (x - 1.1 * r, x + 1.1 * r, z - 1.1 * r, z + 1.1 * r)
        if k == 'octagon':
            return (x - 1.33 * r, x + 1.33 * r, z - 2.3 * r, z + 1.33 * r)
        if k == 'box':
            return (x - 1.25 * r, x + 1.25 * r, z - 1.6 * r, z + 1.45 * r)
        return (x - 1.35 * r, x + 1.35 * r, z - 4.8 * r, z + 2.0 * r)

    def free(b, pad=0.025):
        return all(b[1] + pad < o[0] or o[1] + pad < b[0] or b[3] + pad < o[2] or o[3] + pad < b[2] for o in boxes)

    placed = []
    # a few hand placed heroes first: big regulator left, big round right, a large dim one behind the tray
    hero = [('regulator', 0.085, -0.95, 0.22, 'wood_b'), ('round', 0.17, 0.95, 0.08, 'wood_a'), ('round', 0.22, 0.05, 0.62, 'wood_a'),
            ('octagon', 0.1, -0.55, 0.12, 'wood_c'), ('box', 0.09, 0.55, 0.12, 'wood_b'), ('round', 0.08, -1.35, 0.0, 'black'),
            ('round', 0.07, 1.4, -0.05, 'black')]
    for k, r, x, z, c in hero:
        b = bbox(k, r, x, z)
        if free(b):
            boxes.append(b)
            placed.append((k, r, x, z, c))
    kinds = ['round'] * 6 + ['octagon', 'box', 'box', 'regulator']
    cases = ['wood_a', 'wood_b', 'wood_c', 'black']
    for i in range(3000):
        z = rr.uniform(-0.2, 1.75)
        k = rr.choice(kinds)
        r = rr.uniform(0.045, 0.09 + 0.07 * max(0, z) / 1.75)
        if k == 'regulator':
            r *= 0.7
        x = rr.uniform(-2.1, 2.1)
        b = bbox(k, r, x, z)
        if b[2] < -0.3 or b[3] > 1.85:
            continue
        if free(b):
            boxes.append(b)
            placed.append((k, r, x, z, rr.choice(cases)))
        if len(placed) > 60:
            break
    for i, (k, r, x, z, case) in enumerate(placed):
        clock(f'wc{i}', k, r, (x, y - r * 0.4, z), rot, case=case, seed=i * 7 + 3, numerals=r > 0.06)
    print('WALL_CLOCKS', len(placed))


def shelf_and_mantel():
    """Mantel clocks and books standing along the back of the bench, kept to the sides."""
    clock_mats()
    top = BENCH_Z
    yb = WALL_Y - 0.14
    clock('mc0', 'box', 0.075, (-0.78, yb, top + 0.125), (math.pi / 2, 0, 0.14), case='wood_b', seed=5)
    clock('mc2', 'box', 0.06, (0.68, yb - 0.06, top + 0.1), (math.pi / 2, 0, -0.2), case='black', seed=8)
    clock('mc3', 'round', 0.05, (1.0, yb - 0.25, top + 0.055), (math.pi / 2 - 0.12, 0, -0.35), case='wood_c', seed=9)
    clock('mc4', 'round', 0.045, (-1.08, yb - 0.2, top + 0.05), (math.pi / 2 - 0.12, 0, 0.35), case='wood_a', seed=10)
    rr = rnd(4)
    bcols = [(0.05, 0.012, 0.008), (0.012, 0.025, 0.018), (0.06, 0.035, 0.012), (0.02, 0.012, 0.008)]
    for side, x0, n in ((1, 1.25, 9), (-1, -1.25, 7)):
        x = x0
        for i in range(n):
            w = rr.uniform(0.025, 0.05)
            h = rr.uniform(0.17, 0.26)
            mat = principled(f'book{side}{i}', bcols[i % 4], 0, 0.6)
            obj_from_bm('book', bm_box(w, 0.17, h, at=(x, WALL_Y - 0.12, top + h / 2), rot=Euler((0, 0.35 if i == n - 1 else 0, 0))), mat, bevel=0.002)
            x += side * (w + 0.004)


def bell_jar(at, r=0.075, h=0.22):
    """A glass dome over a small skeleton clock movement."""
    m = pm()
    x, y, z = at
    base = wood('jar-base', dark=(0.01, 0.005, 0.003), light=(0.05, 0.02, 0.01), coat=1.0)
    obj_from_bm('jar-base', bm_cyl(r * 1.15, 0.03, 48), base, (x, y, z + 0.015), smooth_angle=40, bevel=0.004)
    bm = bmesh.new()
    bm_cyl(r, h - r, 48, caps=False, bm=bm, at=(0, 0, (h - r) / 2))
    res = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=r)
    for v in res['verts']:
        v.co.z += h - r
    for v in [v for v in res['verts'] if v.co.z < h - r - 1e-4]:
        bm.verts.remove(v)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.002)
    obj_from_bm('jar-glass', bm, glass('jar-glass'), (x, y, z + 0.03), smooth_angle=80)
    # skeleton movement: two pillars, three wheels standing up
    zc = z + 0.03 + h * 0.45
    for dx in (-0.03, 0.03):
        obj_from_bm('pillar', bm_cyl(0.003, h * 0.7, 12), m['brass'], (x + dx, y, z + 0.03 + h * 0.35))
    for k, (gr, dx, dz, t) in enumerate(((0.035, 0.0, 0.03, 60), (0.022, -0.025, -0.02, 40), (0.018, 0.028, -0.035, 30))):
        gear(f'skel{k}', t, gr, 0.0015, m['brass'], (x + dx, y + 0.005 * k, zc + dz), (math.pi / 2, 0, 0), spokes=5 if gr > 0.02 else 4)
    gear('skel-esc', 15, 0.016, 0.0012, m['steel'], (x - 0.03, y + 0.01, zc + 0.055), (math.pi / 2, 0, 0.2), spokes=4, kind='escape')


def back_and_sides():
    """Longcase clock, cabinet, window with moonlight: seen in the panorama."""
    clock_mats()
    cab = wood('cabinet', dark=(0.015, 0.007, 0.003), light=(0.06, 0.026, 0.011), coat=0.7)
    knob = brass('cab-knob', aniso=0.1)
    # longcase clock against the back (behind the player)
    x, y = 0.9, YB + 0.25
    obj_from_bm('longcase', bm_box(0.55, 0.35, 2.15, at=(x, y, FLOOR + 1.075)), cab, bevel=0.01)
    obj_from_bm('longcase-hood', bm_box(0.62, 0.4, 0.12, at=(x, y, FLOOR + 2.2)), cab, bevel=0.01)
    clock('longcase-dial', 'round', 0.19, (x, y + 0.19, FLOOR + 1.78), (math.pi / 2, 0, math.pi), case='wood_b', seed=33)
    clock_mats()
    obj_from_bm('longcase-door', bm_box(0.3, 0.01, 0.9, at=(x, y + 0.18, FLOOR + 1.0)), clock_mats()['black'], bevel=0.003)
    obj_from_bm('longcase-bob', bm_cyl(0.07, 0.015, 32, rot=Euler((math.pi / 2, 0, 0))), pm()['brass'], (x, y + 0.19, FLOOR + 0.75), smooth_angle=40)
    # drawer cabinet behind on the left
    x0 = -1.0
    obj_from_bm('cabinet', bm_box(1.3, 0.5, 1.2, at=(x0, YB + 0.25, FLOOR + 0.6)), cab, bevel=0.01)
    for i in range(5):
        for j in range(6):
            obj_from_bm('cab-knob', bm_sphere(0.01, seg=12, rings=6), knob, (x0 - 0.54 + j * 0.215, YB + 0.51, FLOOR + 0.2 + i * 0.22))
    # door on the right wall, and shelving with more clocks
    obj_from_bm('door', bm_box(0.05, 0.9, 2.05, at=(XR - 0.03, -1.3, FLOOR + 1.025)), cab, bevel=0.01)
    obj_from_bm('door-knob', bm_sphere(0.025, seg=16, rings=8), knob, (XR - 0.07, -0.95, FLOOR + 1.0))
    for z in (0.15, 0.6, 1.05):
        obj_from_bm('side-shelf', bm_box(0.3, 1.6, 0.03, at=(XR - 0.15, 0.35, z)), cab, bevel=0.004)
    for i, (yy, z, r) in enumerate(((-0.2, 0.15, 0.08), (0.3, 0.15, 0.06), (0.8, 0.15, 0.09), (0.0, 0.6, 0.1), (0.65, 0.6, 0.07), (0.25, 1.05, 0.09), (0.9, 1.05, 0.06))):
        clock(f'sc{i}', 'box' if i % 2 else 'round', r, (XR - 0.2, yy, z + 0.015 + r * 1.5), (math.pi / 2, 0, math.pi / 2), case='wood_b' if i % 2 else 'wood_a', seed=60 + i)
    # left wall: tall window with moonlight
    frame = principled('win-frame', (0.01, 0.008, 0.006), 0.2, 0.5)
    wx = XL + 0.01
    obj_from_bm('window-hole', bm_box(0.06, 1.1, 1.5, at=(wx, -0.6, 0.65)), principled('night', (0, 0, 0), 0, 1))
    sky = emission('moon-sky', (0.25, 0.35, 0.6), 0.35)
    obj_from_bm('window-sky', bm_box(0.01, 1.1, 1.5, at=(XL - 0.3, -0.6, 0.65)), sky)
    bpy.data.objects['window-hole'].hide_render = True
    for yy in (-1.15, -0.6, -0.05):
        obj_from_bm('mullion', bm_box(0.05, 0.035, 1.5, at=(wx + 0.02, yy, 0.65)), frame)
    for zz in (-0.1, 0.4, 0.9, 1.4):
        obj_from_bm('transom', bm_box(0.05, 1.1, 0.035, at=(wx + 0.02, -0.6, zz)), frame)
    # cut the window opening by building the left wall in pieces instead of one slab
    bpy.data.objects.remove(bpy.data.objects['wall-left'])
    wp = bpy.data.materials['wallpaper']
    for y0, y1, z0, z1 in ((YB, -1.15, FLOOR, CEIL), (-0.05, WALL_Y, FLOOR, CEIL), (-1.15, -0.05, FLOOR, -0.1), (-1.15, -0.05, 1.4, CEIL)):
        obj_from_bm('wall-left', bm_box(0.04, y1 - y0, z1 - z0, at=(XL - 0.02, (y0 + y1) / 2, (z0 + z1) / 2)), wp)
    obj_from_bm('sill', bm_box(0.2, 1.2, 0.04, at=(XL + 0.08, -0.6, -0.12)), cab, bevel=0.005)
    moon = light('AREA', 'moon', (XL - 0.6, -0.6, 1.3), 25, (0.45, 0.6, 1.0), size=1.0, target=(0.2, -0.3, FLOOR))
    # a dim gas lamp by the cabinet, behind the player
    sconce((XL + 0.05, -1.8, 0.55), 'sconce-back', 6)


def bench_props():
    m = pm()
    z = BENCH_Z
    avoid = lambda x, y: (abs(x) < 0.32 and y < 0.62) or (y < 0.13)
    loupe((-0.42, 0.24, z), 0.3)
    tweezers((-0.55, 0.15, z + 0.004), 0.9)
    pocket_watch((-0.62, 0.36, z + 0.004), 0.03, 0.4)
    pocket_watch((-0.5, 0.52, z + 0.004), 0.022, 1.8)
    scatter_parts((-0.85, -0.33, 0.13, 0.55), 26, 3, z + 0.004, avoid)
    scatter_parts((0.33, 0.85, 0.15, 0.5), 14, 5, z, avoid)
    # screwdriver stand on the right
    st = wood('stand', dark=(0.02, 0.008, 0.004), light=(0.07, 0.03, 0.012), coat=0.9)
    sx, sy = 0.62, 0.62
    obj_from_bm('sd-stand', bm_cyl(0.075, 0.03, 48), st, (sx, sy, z + 0.015), smooth_angle=40, bevel=0.003)
    for k in range(7):
        a = 2 * math.pi * k / 7
        screwdriver((sx + 0.045 * math.cos(a), sy + 0.045 * math.sin(a), z + 0.04), (0.05 * math.sin(a), -0.05 * math.cos(a), 0), length=0.12 + 0.01 * (k % 3), r=0.0055)
    # loose screwdriver and an oil pot
    screwdriver((0.42, 0.25, z + 0.006), (math.pi / 2, 0, 1.2), length=0.12)
    obj_from_bm('oil-pot', bm_cyl(0.022, 0.03, 32), m['brass'], (0.5, 0.42, z + 0.015), smooth_angle=40, bevel=0.002)
    obj_from_bm('oil-cap', bm_cyl(0.012, 0.012, 24), m['black'], (0.5, 0.42, z + 0.036), smooth_angle=40)
    bell_jar((0.88, 0.8, z), 0.085, 0.26)
    # books stacked at the far right
    for i, (w, h, c) in enumerate(((0.3, 0.05, (0.05, 0.012, 0.008)), (0.27, 0.04, (0.012, 0.025, 0.018)), (0.25, 0.045, (0.06, 0.035, 0.012)))):
        obj_from_bm('bench-book', bm_box(w, 0.2, h, at=(1.1, 0.6, z + 0.024 + i * 0.047), rot=Euler((0, 0, 0.3 - i * 0.15))), principled(f'bb{i}', c, 0, 0.6), bevel=0.003)
    clock('desk-clock', 'box', 0.06, (1.1, 0.62, z + 0.14 + 0.09), (math.pi / 2, 0, -0.5), case='wood_b', seed=70)
    # a big spare wheel leaning on the wall left
    gear('lean-wheel', 96, 0.16, 0.004, m['brass_old'], (-0.68, WALL_Y - 0.08, z + 0.16), (math.pi / 2 - 0.2, 0, 0.2), spokes=5)
    gear('lean-wheel2', 60, 0.09, 0.003, m['brass'], (-0.52, WALL_Y - 0.14, z + 0.09), (math.pi / 2 - 0.25, 0, 0.35), spokes=4)


def build(mode):
    world((0.0015, 0.0012, 0.001))
    room()
    bench()
    lamp()
    clock_wall()
    shelf_and_mantel()
    bench_props()
    back_and_sides()
    sconce((1.02, WALL_Y - 0.03, 0.2), 'sconce-r', 16)
    sconce((-1.3, WALL_Y - 0.03, 0.4), 'sconce-l', 8)
    # warm, low wash from the right across the clocks; faint cool kicker from the left window
    for a in (light('AREA', 'clock-wash', (1.6, 0.4, 1.6), 30, (1.0, 0.6, 0.32), size=0.6, target=(0.6, WALL_Y, 0.6)),
              light('AREA', 'clock-wash-l', (-1.7, 0.5, 1.5), 12, (1.0, 0.64, 0.36), size=0.5, target=(-1.1, WALL_Y, 0.7))):
        a.visible_glossy = False
    for x, z, e in ((-1.5, 1.25, 70), (1.5, 1.25, 70), (0.0, 1.4, 35), (-0.75, 1.55, 30), (0.75, 1.55, 30)):
        light('SPOT', 'wall-spot', (x * 0.7, -0.7, CEIL - 0.12), e, (1.0, 0.66, 0.38), size=0.05, target=(x, WALL_Y, z), spot=24, blend=0.9)
    volume_box((XR - XL, WALL_Y - YB, CEIL - FLOOR), (0, (WALL_Y + YB) / 2, (CEIL + FLOOR) / 2), 0.02, noise=0.6, noise_scale=1.5, aniso=0.6)
    game_camera(dof_fstop=1.3)
    pano_camera()
    return {'exposure': 0.6}
