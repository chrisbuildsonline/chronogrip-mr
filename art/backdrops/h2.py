"""Shared parts for the Hard (stage III) redesign: a tower clock at night, cool steel plus brass, sharp at mid distance.

Frame notes (game desktop view, FOV 50, pitched 22.8 deg down): the front view sees elevations from about -48 to +2 deg,
the bench edge sits near -23 deg, so everything above the bench is a thin band just below eye level. The orbit adds
+-40 deg of turn and up to 12 deg of tilt up (top edge then near +14 deg). The tray covers azimuth about -20..+20 deg and
reaches up to about -14 deg: keep that window calm.
"""
import os, bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from common import *
from common import _ramp, _noise, _maprange, _mat

MOON = (0.52, 0.68, 1.0)
COOL = (0.62, 0.76, 1.0)
WARM = (1.0, 0.6, 0.28)
LAMP = (1.0, 0.52, 0.2)
FACE = (math.pi / 2, 0, 0)       # disc axis along Y, facing the player
SIDE = (math.pi / 2, 0, math.pi / 2)  # disc axis along X


def eye_dir(az_deg, el_deg, d):
    """A point at distance d from the desktop eye, azimuth (+ right) and elevation in degrees."""
    a, e = math.radians(az_deg), math.radians(el_deg)
    return EYE + d * Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))


def mats():
    m = {}
    m['brass'] = brass('h-brass', color=(0.84, 0.6, 0.27), rough=(0.12, 0.26), aniso=0.6, tarnish=0.15, scale=0.25)
    m['brass_old'] = brass('h-brass-old', color=(0.62, 0.43, 0.18), rough=(0.25, 0.42), aniso=0.5, tarnish=0.45, scale=0.2)
    m['steel'] = principled('h-steel', (0.62, 0.65, 0.7), 1.0, 0.16, **{'Anisotropic': 0.5})
    m['steel_dark'] = steel_dark()
    m['blued'] = principled('h-blued', (0.06, 0.1, 0.24), 1.0, 0.2)
    m['iron'] = cast_iron()
    m['gold'] = principled('h-gold', (0.95, 0.7, 0.32), 1.0, 0.12)
    m['stone'] = masonry()
    m['timber'] = wood('h-timber', dark=(0.012, 0.007, 0.004), light=(0.045, 0.026, 0.013), scale=1.2, coat=0.0, rough=(0.55, 0.8), grain_axis='Z')
    m['beam'] = wood('h-beam', dark=(0.012, 0.007, 0.004), light=(0.045, 0.026, 0.013), scale=1.2, coat=0.0, rough=(0.55, 0.8), grain_axis='X')
    m['rope'] = principled('h-rope', (0.09, 0.07, 0.05), 0.0, 0.9)
    m['black'] = principled('h-black', (0.008, 0.008, 0.009), 0.3, 0.5)
    return m


def steel_dark():
    m, nt, out = _mat('h-steel-dark')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Anisotropic'].default_value = 0.4
    n = _noise(nt, 4.0, 5, 0.6)
    col = _ramp(nt, n.outputs['Fac'], [(0.3, (0.22, 0.25, 0.3)), (0.7, (0.42, 0.46, 0.52))])
    nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
    ro = _maprange(nt, n.outputs['Fac'], 0.18, 0.34)
    nt.links.new(ro.outputs['Result'], b.inputs['Roughness'])
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def cast_iron():
    """Painted cast iron (tower movement frames): near-black green with rubbed, lighter edges via noise."""
    m, nt, out = _mat('h-iron')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Metallic'].default_value = 0.35
    n = _noise(nt, 6.0, 6, 0.65)
    col = _ramp(nt, n.outputs['Fac'], [(0.35, (0.012, 0.016, 0.016)), (0.75, (0.04, 0.05, 0.05))])
    nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
    ro = _maprange(nt, n.outputs['Fac'], 0.32, 0.6)
    nt.links.new(ro.outputs['Result'], b.inputs['Roughness'])
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def masonry(name='h-stone', scale=2.2, c1=(0.05, 0.048, 0.046), c2=(0.085, 0.08, 0.075), mortar=(0.02, 0.019, 0.018)):
    m, nt, out = _mat(name)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.inputs['Scale'].default_value = scale
    br.inputs['Mortar Size'].default_value = 0.02
    br.inputs['Brick Width'].default_value = 0.9
    br.inputs['Row Height'].default_value = 0.4
    br.inputs['Color1'].default_value = (*c1, 1)
    br.inputs['Color2'].default_value = (*c2, 1)
    br.inputs['Mortar'].default_value = (*mortar, 1)
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (0, 0, 0)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    # bricks on the wall plane: use (x+y, z) so both wall orientations get courses
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    nt.links.new(sep.outputs['X'], add.inputs[0])
    nt.links.new(sep.outputs['Y'], add.inputs[1])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(add.outputs[0], comb.inputs['X'])
    nt.links.new(sep.outputs['Z'], comb.inputs['Y'])
    nt.links.new(comb.outputs[0], br.inputs['Vector'])
    n = _noise(nt, 3.0, 6, 0.6, tc.outputs['Object'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.6
    nt.links.new(br.outputs['Color'], mix.inputs['A'])
    r2 = _ramp(nt, n.outputs['Fac'], [(0.3, (0.55, 0.55, 0.55)), (0.7, (1.2, 1.2, 1.2))])
    nt.links.new(r2.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.85
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.02
    nt.links.new(br.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs[0], out.inputs[0])
    return m


def box(name, size, at, mat, rot=(0, 0, 0), bevel=0.01):
    return obj_from_bm(name, bm_box(*size, at=(0, 0, 0)), mat, at, rot, smooth_angle=30, bevel=bevel)


def rod(name, a, b, r, mat, seg=24):
    a, b = Vector(a), Vector(b)
    d = b - a
    ob = obj_from_bm(name, bm_cyl(r, d.length, seg), mat, (a + b) / 2, smooth_angle=40)
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return ob


def bar(name, a, b, w, t, mat, up=(0, 0, 1)):
    """A flat bar from a to b, w wide, t thick."""
    a, b = Vector(a), Vector(b)
    d = b - a
    ob = obj_from_bm(name, bm_box(d.length + w * 0.5, w, t), mat, (a + b) / 2, smooth_angle=30, bevel=min(w, t) * 0.12)
    ob.rotation_euler = d.to_track_quat('X', 'Z').to_euler()
    return ob


def twheel(name, teeth, r, thick, mat, loc, rot=FACE, spokes=6, arbor=1.4, axle_mat=None, pinion=True, kind='involute', rim=0.86):
    """A tower-clock wheel: involute rim, heavy hub, spokes, a steel arbor through it and a pinion on the near side."""
    g = gear(name, teeth, r, thick, mat, loc, rot, spokes=spokes, kind=kind, hub=0.16, rim=rim, hub_h=2.2, spoke_h=0.8,
             spoke_w=r * 0.06)
    E = Euler(rot)
    ax = Vector((0, 0, 1))
    ax.rotate(E)
    L = Vector(loc)
    if arbor and axle_mat is not None:
        a = obj_from_bm(name + '-arbor', bm_cyl(r * 0.035, r * arbor, 24), axle_mat, L, smooth_angle=40)
        a.rotation_euler = ax.to_track_quat('Z', 'Y').to_euler()
        if pinion:
            gear(name + '-pinion', 12, r * 0.17, thick * 3.0, axle_mat, L - ax * thick * 2.4, rot, spokes=0, kind='involute', bore=0.2)
    return g


def mesh_pair(base, r_base, r, ang, teeth, dy=0.0):
    """Centre of a wheel of tip radius r meshing with a wheel of tip radius r_base at base, at angle ang in the XZ plane."""
    bx, by, bz = base
    d = r_base + r - 2.0 * (2 * r / (teeth + 2))
    return (bx + d * math.cos(ang), by + dy, bz + d * math.sin(ang))


def bench_set():
    """The walnut bench from c3b (the game draws its own over it; the card art and previews show this one)."""
    import c3b_movement as c3b
    c3b.TEX = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tex')
    c3b.bench()


def haze(color=(0.8, 0.88, 1.0), top=0.004, bottom=0.02, z0=-8.0, z1=4.0, aniso=0.6, size=(60, 60, 30), center=(0, 2, 2), noise=0.35):
    m, nt, out = _mat('h-haze')
    v = nt.nodes.new('ShaderNodeVolumePrincipled')
    v.inputs['Color'].default_value = (*color, 1)
    v.inputs['Anisotropy'].default_value = aniso
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    hz = _maprange(nt, sep.outputs['Z'], bottom, top)
    hz.inputs['From Min'].default_value = z0
    hz.inputs['From Max'].default_value = z1
    n = _noise(nt, noise, 3, 0.5)
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
    hb = obj_from_bm('haze', bm_box(*size, at=center), m)
    hb.visible_shadow = False
    return hb


def bench_light_link(keep=('bench-key',)):
    """Only the named lights reach the bench; everything else lights the scene (the game lights its own bench)."""
    coll = bpy.data.collections.new('bench-only')
    for o in bpy.data.objects:
        if o.name.startswith(('plank', 'bench-edge', 'nosing', 'leg')):
            coll.objects.link(o)
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name not in keep:
            o.light_linking.receiver_collection = coll
            for co in coll.collection_objects:
                co.light_linking.link_state = 'EXCLUDE'


def night_sky(name='h-night', strength=1.0):
    """World: deep blue night, a little lighter toward the horizon (seen through openings)."""
    w = bpy.data.worlds.new(name)
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    r = nt.nodes.new('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    el[0].position, el[0].color = 0.0, (0.004, 0.006, 0.012, 1)
    el[1].position, el[1].color = 0.25, (0.002, 0.003, 0.008, 1)
    nt.links.new(sep.outputs['Z'], r.inputs['Fac'])
    nt.links.new(r.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    bpy.context.scene.world = w
    return w


def glow_disc(name, r, color, strength, loc, rot, var=0.25, scale=1.5):
    """A back-lit opal glass disc: emission with soft mottling."""
    m, nt, out = _mat(name)
    e = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = _noise(nt, scale, 4, 0.55, tc.outputs['Object'])
    col = _ramp(nt, n.outputs['Fac'], [(0.25, tuple(c * (1 - var) for c in color)), (0.75, color)])
    nt.links.new(col.outputs['Color'], e.inputs['Color'])
    e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], out.inputs[0])
    return obj_from_bm(name, bm_cyl(r, 0.02, 160), m, loc, rot, smooth_angle=40)
