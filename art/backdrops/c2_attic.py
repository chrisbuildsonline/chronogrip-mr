"""Concept 2: attic workshop at dusk behind a giant round clock-face window."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from common import *
from common import _ramp, _noise, _maprange
from props import *

RX = 1.15          # ridge x: the gable (and window) is centred here, to the right of the tray
W = 2.7            # half width of the attic
X0, X1 = RX - W, RX + W
Y0, Y1 = -2.6, 3.3  # back gable, window gable (inner face)
FLOOR = -1.1
EAVE = -0.35
RIDGE = 2.5
WIN_C = Vector((RX, Y1, 0.02))
WIN_R = 1.17
SUN_DIR = Vector((-0.32, -1.0, -0.13)).normalized()   # direction the light travels


def sky_world():
    w = bpy.data.worlds.new('dusk')
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nrm = nt.nodes.new('ShaderNodeVectorMath')
    nrm.operation = 'NORMALIZE'
    nt.links.new(tc.outputs['Generated'], nrm.inputs[0])
    nt.links.new(nrm.outputs[0], sep.inputs[0])
    ramp = _ramp(nt, sep.outputs['Z'], [(0.0, (0.04, 0.015, 0.008)), (0.36, (0.45, 0.15, 0.05)), (0.47, (1.0, 0.38, 0.1)), (0.52, (1.0, 0.5, 0.2)),
                                        (0.58, (0.38, 0.16, 0.2)), (0.68, (0.1, 0.07, 0.16)), (1.0, (0.01, 0.012, 0.04))])
    # sun glow: pow(max(dot(dir, -sun), 0), k)
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = tuple(-SUN_DIR)
    nt.links.new(nrm.outputs[0], dot.inputs[0])
    mx = nt.nodes.new('ShaderNodeMath')
    mx.operation = 'MAXIMUM'
    mx.inputs[1].default_value = 0.0
    nt.links.new(dot.outputs['Value'], mx.inputs[0])
    pw = nt.nodes.new('ShaderNodeMath')
    pw.operation = 'POWER'
    pw.inputs[1].default_value = 40.0
    nt.links.new(mx.outputs[0], pw.inputs[0])
    pw2 = nt.nodes.new('ShaderNodeMath')
    pw2.operation = 'POWER'
    pw2.inputs[1].default_value = 3000.0
    nt.links.new(mx.outputs[0], pw2.inputs[0])
    glow = nt.nodes.new('ShaderNodeMath')
    glow.operation = 'MULTIPLY_ADD'
    nt.links.new(pw2.outputs[0], glow.inputs[0])
    glow.inputs[1].default_value = 60.0
    nt.links.new(pw.outputs[0], glow.inputs[2])
    sunc = nt.nodes.new('ShaderNodeMix')
    sunc.data_type = 'RGBA'
    sunc.blend_type = 'ADD'
    nt.links.new(glow.outputs[0], sunc.inputs['Factor'])
    nt.links.new(ramp.outputs['Color'], sunc.inputs['A'])
    sunc.inputs['B'].default_value = (1.0, 0.55, 0.22, 1)
    nt.links.new(sunc.outputs['Result'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 2.2
    bpy.context.scene.world = w


def brick(name='brick'):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Brick Width'].default_value = 0.23
    br.inputs['Row Height'].default_value = 0.075
    br.inputs['Mortar Size'].default_value = 0.008
    br.inputs['Color1'].default_value = (0.09, 0.03, 0.015, 1)
    br.inputs['Color2'].default_value = (0.05, 0.018, 0.01, 1)
    br.inputs['Mortar'].default_value = (0.06, 0.05, 0.04, 1)
    # bricks run along x on the gables, along y on the side walls: object coords with a swizzle per object is overkill;
    # use x + y so both read as courses
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    add = nt.nodes.new('ShaderNodeMath')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    nt.links.new(sep.outputs['X'], add.inputs[0])
    nt.links.new(sep.outputs['Y'], add.inputs[1])
    nt.links.new(add.outputs[0], comb.inputs['X'])
    nt.links.new(sep.outputs['Z'], comb.inputs['Y'])
    nt.links.new(comb.outputs[0], br.inputs['Vector'])
    n = _noise(nt, 6, 5, 0.6, tc.outputs['Object'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.6
    nt.links.new(br.outputs['Color'], mix.inputs['A'])
    nt.links.new(n.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.85
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5
    nt.links.new(br.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def room():
    br = brick()
    boards = wood('roof-boards', dark=(0.02, 0.01, 0.005), light=(0.07, 0.035, 0.016), scale=1.5, rough=(0.6, 0.85), coat=0.0, grain_axis='Y')
    timber = wood('timber', dark=(0.014, 0.007, 0.003), light=(0.05, 0.025, 0.011), scale=2.5, rough=(0.55, 0.8), coat=0.0, grain_axis='Z')
    floor_m = wood('attic-floor', dark=(0.022, 0.011, 0.005), light=(0.08, 0.042, 0.02), scale=1.2, rough=(0.5, 0.8), coat=0.05, grain_axis='Y')
    # floor planks along y
    n = 22
    pw = (X1 - X0) / n
    for i in range(n):
        obj_from_bm('plank', bm_box(pw - 0.006, Y1 - Y0 + 0.4, 0.04, at=(X0 + pw * (i + 0.5), (Y0 + Y1) / 2, FLOOR - 0.02 - (i % 3) * 0.002)), floor_m, bevel=0.003)
    # gable walls (brick) with the round window cut out of the front one
    T = 0.4
    front = obj_from_bm('gable-front', bm_box(X1 - X0 + 1, T, RIDGE - FLOOR + 1, at=(RX, Y1 + T / 2, (RIDGE + FLOOR) / 2)), br)
    cut = obj_from_bm('cut', bm_cyl(WIN_R + 0.06, T * 3, 96, rot=Euler((math.pi / 2, 0, 0))), None, (WIN_C.x, Y1 + T / 2, WIN_C.z))
    mod = front.modifiers.new('hole', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cut
    mod.solver = 'EXACT'
    cut.hide_render = True
    cut.hide_viewport = True
    obj_from_bm('gable-back', bm_box(X1 - X0 + 1, T, RIDGE - FLOOR + 1, at=(RX, Y0 - T / 2, (RIDGE + FLOOR) / 2)), br)
    # knee walls
    for x in (X0, X1):
        obj_from_bm('knee', bm_box(0.12, Y1 - Y0, EAVE - FLOOR + 0.2, at=(x + (0.06 if x == X1 else -0.06), (Y0 + Y1) / 2, (EAVE + FLOOR) / 2)), boards)
    # roof planes: boards + rafters
    run = W
    rise = RIDGE - EAVE
    ang = math.atan2(rise, run)
    L = math.hypot(run, rise) + 0.3
    for s in (-1, 1):
        cx = RX + s * run / 2
        cz = (RIDGE + EAVE) / 2
        rot = Euler((0, s * ang, 0))
        off = Vector((0, 0, 0.05))
        off.rotate(rot)
        obj_from_bm('roof', bm_box(L, Y1 - Y0 + 1.0, 0.04, at=Vector((cx, (Y0 + Y1) / 2, cz)) + off * 1.6, rot=rot), boards)
        k = 0
        y = Y0 + 0.25
        while y < Y1 - 0.1:
            obj_from_bm('rafter', bm_box(L, 0.075, 0.14, at=Vector((cx, y, cz)) - off * 0.6, rot=rot), timber, bevel=0.006)
            y += 0.62
        # purlins
        for t in (0.3, 0.65):
            p = Vector((RX + s * run * (1 - t), 0, EAVE + rise * t))
            obj_from_bm('purlin', bm_box(0.16, Y1 - Y0, 0.16, at=(p.x, (Y0 + Y1) / 2, p.z - 0.17)), timber, bevel=0.008)
    # ridge beam + collar ties + a king post near the window
    obj_from_bm('ridge', bm_box(0.18, Y1 - Y0, 0.22, at=(RX, (Y0 + Y1) / 2, RIDGE - 0.15)), timber, bevel=0.01)
    for y in (Y0 + 1.1, 0.6, Y1 - 0.9):
        zc = 1.55
        half = (RIDGE - zc) / rise * run
        obj_from_bm('collar', bm_box(2 * half + 0.1, 0.12, 0.16, at=(RX, y, zc)), timber, bevel=0.008)
    obj_from_bm('post', bm_box(0.18, 0.18, RIDGE - FLOOR, at=(X0 + 0.85, 1.6, (RIDGE + FLOOR) / 2)), timber, bevel=0.01)
    obj_from_bm('brace', bm_box(0.12, 0.12, 1.1, at=(X0 + 0.55, 1.6, 1.45), rot=Euler((0, -0.75, 0))), timber, bevel=0.01)


def clock_window():
    iron = principled('iron', (0.012, 0.01, 0.009), 0.85, 0.5)
    rim = brass('rim-brass', color=(0.5, 0.33, 0.13), rough=(0.3, 0.5), tarnish=0.7)
    M = Matrix.Translation(WIN_C + Vector((0, -0.05, 0))) @ Euler((math.pi / 2, 0, math.pi)).to_matrix().to_4x4()  # dial plane faces -Y, 12 up
    R = M.to_3x3().to_euler()
    at = M @ Vector()
    bm = bmesh.new()
    bm_ring(WIN_R + 0.06, WIN_R - 0.06, 0.12, 128, at=at, bm=bm, rot=R)
    bm_ring(WIN_R * 0.905, WIN_R * 0.875, 0.07, 128, at=at, bm=bm, rot=R)
    bm_ring(WIN_R * 0.6, WIN_R * 0.575, 0.06, 128, at=at, bm=bm, rot=R)
    bm_ring(WIN_R * 0.2, WIN_R * 0.16, 0.08, 64, at=at, bm=bm, rot=R)
    # minute ticks between the two outer rings
    for k in range(60):
        a = 2 * math.pi * k / 60
        rr = WIN_R * 0.95
        loc = M @ Vector((rr * math.cos(a), rr * math.sin(a), 0))
        bm_box(WIN_R * (0.09 if k % 5 == 0 else 0.05), WIN_R * (0.018 if k % 5 == 0 else 0.008), 0.05, at=loc, bm=bm,
               rot=(M.to_3x3() @ Matrix.Rotation(a, 3, 'Z')).to_euler())
    # radial glazing bars
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        for r0, r1, w in ((0.2, 0.575, 0.016), (0.6, 0.875, 0.014)):
            c = (r0 + r1) / 2 * WIN_R
            loc = M @ Vector((c * math.cos(a), c * math.sin(a), 0))
            bm_box((r1 - r0) * WIN_R, WIN_R * w, 0.04, at=loc, bm=bm, rot=(M.to_3x3() @ Matrix.Rotation(a, 3, 'Z')).to_euler())
    dial_numerals_bm(WIN_R * 0.74, WIN_R * 0.2, 0.05, bm=bm, M=M, stroke=0.12)
    obj_from_bm('window-iron', bm, iron, smooth_angle=30, bevel=0.004)
    obj_from_bm('window-rim', bm_torus(WIN_R + 0.02, 0.05, 128, 12, at=M @ Vector((0, 0, 0.06)), rot=R), rim, smooth_angle=80)
    # hands (10:08), set in front of the glass, with a counterweight tail
    hb = bmesh.new()
    for ang, L, w in ((math.radians(304), 0.52, 0.05), (math.radians(48), 0.8, 0.032)):
        a = math.pi / 2 - ang
        Rz = M.to_3x3() @ Matrix.Rotation(a, 3, 'Z')
        c = M @ Vector((WIN_R * L * 0.45 * math.cos(a), WIN_R * L * 0.45 * math.sin(a), 0.09))
        bm_box(WIN_R * L * 0.9, WIN_R * w, 0.02, at=c, bm=hb, rot=Rz.to_euler())
        t = M @ Vector((WIN_R * L * 0.78 * math.cos(a), WIN_R * L * 0.78 * math.sin(a), 0.09))
        bm_box(WIN_R * w * 3, WIN_R * w * 3, 0.02, at=t, bm=hb, rot=(Rz @ Matrix.Rotation(math.pi / 4, 3, 'Z')).to_euler())
        c2 = M @ Vector((-WIN_R * 0.14 * math.cos(a), -WIN_R * 0.14 * math.sin(a), 0.09))
        bm_box(WIN_R * 0.28, WIN_R * w * 1.5, 0.02, at=c2, bm=hb, rot=Rz.to_euler())
    bm_cyl(WIN_R * 0.07, 0.08, 32, at=M @ Vector((0, 0, 0.1)), bm=hb, rot=R)
    obj_from_bm('window-hands', hb, iron, smooth_angle=30, bevel=0.003)
    # glass panes: faintly amber, mostly letting the sun through
    gl = thin_glass('window-glass', tint=(0.95, 0.82, 0.62))
    obj_from_bm('window-pane', bm_cyl(WIN_R, 0.004, 128, at=M @ Vector((0, 0, 0.0)), rot=R), gl)


def tower_movement():
    """A floor-standing iron tower-clock movement near the window, driving the hands through a rod."""
    iron = principled('iron2', (0.018, 0.015, 0.012), 0.9, 0.45)
    b = brass('tower-brass', color=(0.7, 0.48, 0.2), rough=(0.2, 0.4), aniso=0.6, tarnish=0.4)
    cx, cy = -1.25, Y1 - 1.1
    base = FLOOR
    bm = bmesh.new()
    H, Wd, D = 0.95, 1.0, 0.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            bm_box(0.05, 0.05, H, at=(cx + sx * Wd / 2, cy + sy * D / 2, base + H / 2), bm=bm)
    for z in (base + 0.05, base + H):
        for sy in (-1, 1):
            bm_box(Wd + 0.05, 0.05, 0.05, at=(cx, cy + sy * D / 2, z), bm=bm)
        for sx in (-1, 1):
            bm_box(0.05, D + 0.05, 0.05, at=(cx + sx * Wd / 2, cy, z), bm=bm)
    obj_from_bm('tower-frame', bm, iron, smooth_angle=30, bevel=0.006)
    rot = (math.pi / 2, 0, 0)
    gear('tw-g1', 120, 0.34, 0.03, b, (cx - 0.15, cy - 0.05, base + 0.5), rot, spokes=6)
    gear('tw-g2', 40, 0.12, 0.05, b, (cx + 0.3, cy + 0.08, base + 0.74), rot, spokes=0)
    gear('tw-g3', 72, 0.22, 0.03, iron, (cx + 0.3, cy - 0.1, base + 0.32), rot, spokes=5)
    gear('tw-esc', 30, 0.15, 0.02, b, (cx + 0.05, cy + 0.15, base + 0.83), rot, spokes=4, kind='escape')
    # drum with rope down to weights, and the drive rod to the window hub
    obj_from_bm('drum', bm_cyl(0.11, 0.4, 32, rot=Euler((math.pi / 2, 0, 0))), iron, (cx - 0.15, cy, base + 0.5), smooth_angle=40)
    a = Vector((cx + 0.3, cy + 0.08, base + 0.74))
    c = WIN_C + Vector((0, -0.12, 0))
    d = c - a
    rod = obj_from_bm('rod', bm_cyl(0.018, d.length, 16), iron, (a + c) / 2, smooth_angle=40)
    rod.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    # pendulum hanging through the floor-standing frame
    obj_from_bm('pend-rod', bm_cyl(0.012, 0.9, 12), iron, (cx + 0.05, cy + 0.15, base + 0.83 - 0.45))
    obj_from_bm('pend-bob', bm_cyl(0.12, 0.05, 40, rot=Euler((math.pi / 2, 0, 0))), b, (cx + 0.05, cy + 0.15, base + 0.12), smooth_angle=40, bevel=0.005)


def workbench():
    top_m = wood('attic-bench', dark=(0.03, 0.015, 0.007), light=(0.1, 0.055, 0.026), scale=1.4, rough=(0.45, 0.7), coat=0.08)
    xa, xb, ya, yb = -1.05, 0.95, -0.6, 0.72
    for i in range(5):
        w = (yb - ya) / 5
        obj_from_bm('bench-plank', bm_box(xb - xa, w - 0.005, 0.06, at=((xa + xb) / 2, ya + w * (i + 0.5), BENCH_Z - 0.03 - (i % 2) * 0.002)), top_m, bevel=0.004)
    for x in (xa + 0.06, xb - 0.06):
        for y in (ya + 0.06, yb - 0.06):
            obj_from_bm('bench-leg', bm_box(0.09, 0.09, BENCH_Z - FLOOR, at=(x, y, (BENCH_Z + FLOOR) / 2)), top_m, bevel=0.005)
    obj_from_bm('bench-stretcher', bm_box(xb - xa, 0.06, 0.08, at=((xa + xb) / 2, yb - 0.06, FLOOR + 0.25)), top_m, bevel=0.004)
    # shelf under the bench with dark shapes
    obj_from_bm('bench-shelf', bm_box(xb - xa - 0.1, yb - ya - 0.1, 0.03, at=((xa + xb) / 2, (ya + yb) / 2, FLOOR + 0.3)), top_m)


def lantern(at):
    m = pm()
    x, y, z = at
    b = brass('lantern-brass', aniso=0.3)
    obj_from_bm('lan-base', bm_cyl(0.055, 0.04, 40), b, (x, y, z + 0.02), smooth_angle=40, bevel=0.003)
    obj_from_bm('lan-top', bm_cyl(0.05, 0.05, 40, r2=0.02), b, (x, y, z + 0.215), smooth_angle=40)
    obj_from_bm('lan-ring', bm_torus(0.03, 0.004, 32, 8, rot=Euler((math.pi / 2, 0, 0))), b, (x, y, z + 0.27), smooth_angle=80)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        obj_from_bm('lan-bar', bm_cyl(0.004, 0.16, 8), b, (x + 0.047 * math.cos(a), y + 0.047 * math.sin(a), z + 0.12))
    obj_from_bm('lan-glass', bm_cyl(0.042, 0.15, 40, caps=False), glass('lan-glass'), (x, y, z + 0.115), smooth_angle=60)
    flame = emission('flame', (1.0, 0.5, 0.15), 60)
    obj_from_bm('flame', bm_sphere(0.009, seg=16, rings=8), flame, (x, y, z + 0.09), scale=(1, 1, 2.2))
    light('POINT', 'lantern', (x, y, z + 0.1), 6, (1.0, 0.55, 0.22), size=0.012)


def props():
    m = pm()
    z = BENCH_Z
    avoid = lambda x, y: (abs(x) < 0.34 and y < 0.62) or y < 0.12
    lantern((-0.72, 0.5, z))
    # vise on the left front
    iron = principled('vise-iron', (0.02, 0.025, 0.02), 0.7, 0.45)
    obj_from_bm('vise', bm_box(0.12, 0.09, 0.07, at=(0, 0, 0.035)), iron, (-0.85, 0.2, z), (0, 0, 0.2), smooth_angle=30, bevel=0.006)
    obj_from_bm('vise-jaw', bm_box(0.13, 0.03, 0.05, at=(0, 0.06, 0.08)), iron, (-0.85, 0.2, z), (0, 0, 0.2), smooth_angle=30, bevel=0.004)
    scatter_parts((-0.8, -0.36, 0.15, 0.65), 18, 21, z, avoid, big=0.025)
    scatter_parts((0.36, 0.85, 0.15, 0.65), 12, 22, z, avoid, big=0.025)
    screwdriver((0.5, 0.3, z + 0.006), (math.pi / 2, 0, 0.7), length=0.13)
    screwdriver((0.6, 0.2, z + 0.006), (math.pi / 2, 0, 1.1), length=0.11)
    pocket_watch((0.48, 0.48, z), 0.028, 0.6)
    # jars on the right
    for i, (x, y, r, h) in enumerate(((0.72, 0.6, 0.035, 0.11), (0.81, 0.55, 0.03, 0.08), (0.78, 0.66, 0.028, 0.13))):
        obj_from_bm('jar', bm_cyl(r, h, 32), glass('jar-glass'), (x, y, z + h / 2), smooth_angle=60)
        obj_from_bm('jar-lid', bm_cyl(r * 1.02, 0.012, 32), m['brass_old'], (x, y, z + h + 0.006), smooth_angle=60)
        scatter_parts((x - r * 0.6, x + r * 0.6, y - r * 0.6, y + r * 0.6), 5, 40 + i, z + 0.004, big=r * 0.5)


def attic_stuff():
    """Things around the attic for the panorama: crates, a draped dust sheet, the spare wheel, a hanging bulb."""
    crate = wood('crate', dark=(0.03, 0.016, 0.007), light=(0.09, 0.05, 0.022), scale=2, rough=(0.6, 0.85), coat=0)
    for i, (x, y, s, rz) in enumerate(((X0 + 0.5, -0.3, 0.45, 0.1), (X0 + 0.55, 0.25, 0.35, -0.2), (X0 + 0.45, -0.3, 0.3, 0.4), (X1 - 0.6, -1.4, 0.5, 0.2), (X1 - 0.55, -0.8, 0.4, -0.1))):
        zz = FLOOR + s / 2 + (0.45 if i == 2 else 0)
        obj_from_bm('crate', bm_box(s, s, s, at=(0, 0, 0)), crate, (x, y, zz), (0, 0, rz), smooth_angle=30, bevel=0.01)
    sheet = principled('dust-sheet', (0.32, 0.29, 0.24), 0, 0.9, **{'Sheen Weight': 0.4})
    bm = bm_sphere(0.6, seg=40, rings=20)
    for v in bm.verts:
        v.co.z = max(v.co.z, -0.05) * 1.4
        v.co.x *= 1.3
    obj_from_bm('sheet', bm, sheet, (X1 - 0.9, 0.9, FLOOR), smooth_angle=180)
    b = pm()['brass_old']
    gear('spare-wheel', 140, 0.75, 0.04, b, (X0 + 0.25, -1.6, FLOOR + 0.78), (math.pi / 2, 0.22, math.pi / 2 + 0.05), spokes=6)
    gear('spare-wheel2', 60, 0.35, 0.04, principled('iron3', (0.02, 0.017, 0.014), 0.85, 0.5), (X0 + 0.35, -0.95, FLOOR + 0.36), (math.pi / 2, 0.15, math.pi / 2 - 0.1), spokes=5)
    # hanging bulb, dim, over the back
    cord = principled('cord', (0.01, 0.01, 0.01), 0, 0.6)
    obj_from_bm('cord', bm_cyl(0.003, 1.1, 8), cord, (RX - 0.4, -1.2, RIDGE - 0.75))
    bulb = emission('attic-bulb', (1.0, 0.5, 0.2), 25)
    obj_from_bm('bulb', bm_sphere(0.03, seg=16, rings=8), bulb, (RX - 0.4, -1.2, RIDGE - 1.33))
    light('POINT', 'attic-bulb', (RX - 0.4, -1.2, RIDGE - 1.33), 8, (1.0, 0.55, 0.25), size=0.03)


def skyline():
    """Dark rooftops and chimneys outside, so the window has a city horizon."""
    dark = principled('roofs', (0.004, 0.003, 0.003), 0, 0.8)
    rr = rnd(5)
    for i in range(40):
        d = rr.uniform(35, 90)
        a = rr.uniform(-1.1, 1.1)
        x = RX + d * math.sin(a)
        y = Y1 + d * math.cos(a)
        w = rr.uniform(4, 12)
        h = rr.uniform(-4, 4) + d * 0.02
        obj_from_bm('house', bm_box(w, rr.uniform(4, 9), 8, at=(0, 0, 0)), dark, (x, y, -4.0 + h * 0.3 - d * 0.04), (0, 0, a + rr.uniform(-0.3, 0.3)))
        if rr.random() < 0.6:
            obj_from_bm('chimney', bm_box(0.6, 0.6, 2.0, at=(0, 0, 0)), dark, (x + rr.uniform(-w / 3, w / 3), y, 0.6 + h * 0.3 - d * 0.04), (0, 0, a))
    # a distant clock tower spire to the left of the sun
    obj_from_bm('spire', bm_box(3, 3, 22, at=(0, 0, 0)), dark, (RX - 16, Y1 + 45, 4), (0, 0, 0.2))
    obj_from_bm('spire-top', bm_cyl(2.2, 6, 4, r2=0.01), dark, (RX - 16, Y1 + 45, 18), (0, 0, 0.98))


def motes():
    mat = principled('mote', (0.9, 0.8, 0.65), 0, 0.6, **{'Emission Color': (1.0, 0.7, 0.4, 1), 'Emission Strength': 0.15})
    rr = rnd(9)
    bm = bmesh.new()
    n = 0
    while n < 3500:
        p = Vector((rr.uniform(X0 + 0.3, X1 - 0.3), rr.uniform(-0.2, Y1 - 0.2), rr.uniform(FLOOR + 0.1, 1.6)))
        # concentrate along the sun shafts: distance from the line through the window centre along SUN_DIR
        q = p - WIN_C
        t = q.dot(SUN_DIR)
        dline = (q - SUN_DIR * t).length
        if t < 0 or dline > WIN_R * 1.2 and rr.random() < 0.85:
            continue
        if (p - EYE).length < 0.35:
            continue
        r = rr.uniform(0.0007, 0.0018)
        bm_octa(r, p, bm)
        n += 1
    obj_from_bm('motes', bm, mat)


def build(mode):
    sky_world()
    room()
    clock_window()
    tower_movement()
    workbench()
    props()
    attic_stuff()
    skyline()
    motes()
    sun = light('SUN', 'sun', (RX, Y1 + 5, 2), 10, (1.0, 0.58, 0.28), size=math.radians(0.6))
    sun.rotation_euler = SUN_DIR.to_track_quat('-Z', 'Y').to_euler()
    # bounce from the sunlit floor patch and a cool skylight fill so the shadows are not dead
    light('AREA', 'bounce', (RX - 0.5, 1.2, FLOOR + 0.05), 25, (1.0, 0.55, 0.3), size=2.0, rot=(math.pi, 0, 0))
    light('AREA', 'sky-fill', (RX, Y1 - 0.4, 0.2), 8, (0.55, 0.45, 0.6), size=2.2, rot=(math.pi / 2, 0, 0))
    volume_box((X1 - X0, Y1 - Y0, RIDGE - FLOOR), (RX, (Y0 + Y1) / 2, (RIDGE + FLOOR) / 2), 0.013, color=(1, 0.94, 0.88), aniso=0.7, noise=0.6, noise_scale=1.0)
    game_camera(dof_fstop=1.8)
    pano_camera()
    return {'exposure': -0.2}
