"""Tileable PBR wood sets (albedo, roughness, height -> normal) rendered flat from Blender.

blender -b --factory-startup -P textures.py -- <set> [size]
Sets: tray (dark walnut, varnished, 0.5 m tile) and bench (aged walnut-oak, worn, 1.0 m tile). Grain runs along U (x).
Noise is sampled on a 4D torus (cos/sin of u and v), so every map wraps seamlessly at both edges.
"""
import sys, os, math
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'tex')
os.makedirs(OUT, exist_ok=True)
argv = sys.argv[sys.argv.index('--') + 1:]
SET = argv[0]
SIZE = int(argv[1]) if len(argv) > 1 else 2048

P = {
    'tray': dict(lines=72, wob=0.045, figure=(0.8, 2.0), pore=(10.0, 420.0), dark=(0.028, 0.012, 0.005), mid=(0.075, 0.036, 0.016),
                 light=(0.13, 0.068, 0.032), rough=(0.3, 0.5), wear=0.0, scratches=0, height_k=3.0),
    'bench': dict(lines=56, wob=0.08, figure=(0.8, 2.0), pore=(8.0, 300.0), dark=(0.05, 0.026, 0.012), mid=(0.12, 0.068, 0.034),
                  light=(0.2, 0.12, 0.062), rough=(0.45, 0.72), wear=0.5, scratches=90, height_k=3.5),
}[SET]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'CUDA'
prefs.refresh_devices()
for d in prefs.devices:
    d.use = d.type == 'CUDA'
sc.cycles.device = 'GPU'
sc.cycles.samples = 16
sc.cycles.use_denoising = False
sc.cycles.pixel_filter_type = 'BLACKMAN_HARRIS'
sc.cycles.filter_width = 1.2
sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.render.resolution_percentage = 100
sc.world = bpy.data.worlds.new('w')

# plane 0..1 with an ortho camera looking straight down
me = bpy.data.meshes.new('plane')
me.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], [], [(0, 1, 2, 3)])
plane = bpy.data.objects.new('plane', me)
sc.collection.objects.link(plane)
cd = bpy.data.cameras.new('cam')
cd.type = 'ORTHO'
cd.ortho_scale = 1.0
cam = bpy.data.objects.new('cam', cd)
cam.location = (0.5, 0.5, 1.0)
sc.collection.objects.link(cam)
sc.camera = cam

mat = bpy.data.materials.new('m')
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial')
em = nt.nodes.new('ShaderNodeEmission')
nt.links.new(em.outputs[0], out.inputs[0])
me.materials.append(mat)
tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(tc.outputs['Generated'], sep.inputs[0])


def math_node(op, a, b=None):
    m = nt.nodes.new('ShaderNodeMath')
    m.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs[0]


TAU = 2 * math.pi
cu, su = math_node('COSINE', math_node('MULTIPLY', sep.outputs['X'], TAU)), math_node('SINE', math_node('MULTIPLY', sep.outputs['X'], TAU))
cv, sv = math_node('COSINE', math_node('MULTIPLY', sep.outputs['Y'], TAU)), math_node('SINE', math_node('MULTIPLY', sep.outputs['Y'], TAU))


def tnoise(ru, rv, detail=4.0, rough=0.55, seed=0.0, lac=2.0):
    """Tileable noise: (ru cos u, ru sin u, rv cos v) with w = rv sin v. ru/rv set the frequency along/across the grain."""
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(math_node('MULTIPLY', cu, ru), comb.inputs['X'])
    nt.links.new(math_node('MULTIPLY', su, ru), comb.inputs['Y'])
    nt.links.new(math_node('ADD', math_node('MULTIPLY', cv, rv), seed), comb.inputs['Z'])
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.noise_dimensions = '4D'
    n.inputs['Scale'].default_value = 1.0
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    n.inputs['Lacunarity'].default_value = lac
    nt.links.new(comb.outputs[0], n.inputs['Vector'])
    nt.links.new(math_node('MULTIPLY', sv, rv), n.inputs['W'])
    return n.outputs['Fac']


# growth rings: frac(v * lines + wobble), wobble from low-frequency tileable noise (integer line count keeps the wrap)
wob = math_node('MULTIPLY', math_node('SUBTRACT', tnoise(*P['figure'], detail=3, seed=3.1), 0.5), P['wob'] * 6)
wob2 = math_node('MULTIPLY', math_node('SUBTRACT', tnoise(0.6, 2.5, detail=2, seed=7.7), 0.5), 3.0)
phase = math_node('ADD', math_node('ADD', math_node('MULTIPLY', sep.outputs['Y'], float(P['lines'])), wob), wob2)
ring = math_node('FRACT', phase)
# latewood: a sharp dark band at the end of each ring
late = math_node('POWER', ring, 4.0)
pores = tnoise(*P['pore'], detail=2, rough=0.4, seed=11.0)
pores = math_node('MAXIMUM', math_node('MULTIPLY', math_node('SUBTRACT', pores, 0.58), 4.0), 0.0)
streak = tnoise(0.6, 34.0, detail=3, rough=0.5, seed=19.0)
fine = tnoise(2.5, 220.0, detail=2, rough=0.5, seed=23.0)
fig = math_node('ADD', math_node('MULTIPLY', streak, 0.8), math_node('MULTIPLY', fine, 0.2))
fig = math_node('ADD', math_node('MULTIPLY', math_node('SUBTRACT', fig, 0.5), 1.8), 0.5)
wear = tnoise(1.5, 1.5, detail=5, rough=0.6, seed=29.0)
wear = math_node('MULTIPLY', math_node('MAXIMUM', math_node('SUBTRACT', wear, 0.52), 0.0), 5.0 * P['wear'])


def ramp(fac, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], (*stops[0][1], 1)
    el[1].position, el[1].color = stops[-1][0], (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        e = el.new(p)
        e.color = (*c, 1)
    nt.links.new(fac, r.inputs['Fac'])
    return r.outputs['Color']


def mix(a, b, f, mode='MIX'):
    m = nt.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.blend_type = mode
    nt.links.new(f, m.inputs['Factor']) if not isinstance(f, float) else None
    if isinstance(f, float):
        m.inputs['Factor'].default_value = f
    nt.links.new(a, m.inputs['A'])
    nt.links.new(b, m.inputs['B'])
    return m.outputs['Result']


# scratches (bench): thin lines from a stretched, thresholded tileable noise across a few directions
scr = None
if P['scratches']:
    s1 = tnoise(14.0, 900.0, detail=1, rough=0.3, seed=41.0)
    s1 = math_node('MAXIMUM', math_node('MULTIPLY', math_node('SUBTRACT', s1, 0.66), 8.0), 0.0)
    s2 = tnoise(600.0, 30.0, detail=1, rough=0.3, seed=53.0)
    s2 = math_node('MAXIMUM', math_node('MULTIPLY', math_node('SUBTRACT', s2, 0.7), 6.0), 0.0)
    scr = math_node('MINIMUM', math_node('ADD', s1, s2), 1.0)

base = ramp(fig, [(0.2, P['dark']), (0.5, P['mid']), (0.85, P['light'])])
col = mix(base, ramp(late, [(0.0, (1, 1, 1)), (1.0, (0.62, 0.55, 0.5))]), 1.0, 'MULTIPLY')
col = mix(col, ramp(pores, [(0.0, (1, 1, 1)), (1.0, (0.5, 0.42, 0.38))]), 1.0, 'MULTIPLY')
def rgb(c):
    n = nt.nodes.new('ShaderNodeRGB')
    n.outputs[0].default_value = (*c, 1)
    return n.outputs[0]


if P['wear']:
    col = mix(col, rgb(P['light']), math_node('MULTIPLY', math_node('MINIMUM', wear, 1.0), 0.45))
if scr is not None:
    col = mix(col, rgb(tuple(min(1, x * 1.6) for x in P['light'])), math_node('MULTIPLY', scr, 0.5))
albedo = col
# height: latewood and pores sit lower, wear softens, scratches cut in
h = math_node('SUBTRACT', 0.6, math_node('MULTIPLY', late, 0.18))
h = math_node('SUBTRACT', h, math_node('MULTIPLY', pores, 0.25))
h = math_node('ADD', h, math_node('MULTIPLY', math_node('SUBTRACT', fig, 0.5), 0.15))
if scr is not None:
    h = math_node('SUBTRACT', h, math_node('MULTIPLY', scr, 0.3))
height = h
r0, r1 = P['rough']
rgh = math_node('ADD', r0, math_node('MULTIPLY', math_node('ADD', math_node('MULTIPLY', late, 0.5), math_node('MULTIPLY', pores, 0.8)), r1 - r0))
if P['wear']:
    rgh = math_node('ADD', rgh, math_node('MULTIPLY', wear, 0.12))
if scr is not None:
    rgh = math_node('ADD', rgh, math_node('MULTIPLY', scr, 0.15))
rgh = math_node('MINIMUM', rgh, 1.0)


def render(src, name, data, depth='8'):
    for l in list(em.inputs['Color'].links):
        nt.links.remove(l)
    nt.links.new(src, em.inputs['Color'])
    sc.view_settings.view_transform = 'Raw' if data else 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'BW' if data else 'RGB'
    sc.render.image_settings.color_depth = depth
    path = os.path.join(OUT, f'{SET}_{name}_{SIZE}.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


render(albedo, 'albedo', False)
render(rgh, 'roughness', True)
hp = render(height, 'height', True, '16')

# normal map (OpenGL / three.js convention: green = +v), from the wrapped height gradient
img = bpy.data.images.load(hp)
img.colorspace_settings.name = 'Non-Color'
a = np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)[:, :, 0]   # row 0 = bottom (v = 0)
k = P['height_k'] * SIZE / 2048
dx = (np.roll(a, -1, axis=1) - np.roll(a, 1, axis=1)) * 0.5 * k
dy = (np.roll(a, -1, axis=0) - np.roll(a, 1, axis=0)) * 0.5 * k
n = np.stack([-dx, -dy, np.ones_like(a)], axis=-1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
rgba = np.concatenate([n * 0.5 + 0.5, np.ones((SIZE, SIZE, 1), np.float32)], axis=-1)
out_img = bpy.data.images.new('normal', SIZE, SIZE, alpha=False, float_buffer=False)
out_img.colorspace_settings.name = 'Non-Color'
out_img.pixels = rgba.ravel()
out_img.filepath_raw = os.path.join(OUT, f'{SET}_normal_{SIZE}.png')
out_img.file_format = 'PNG'
out_img.save()
print('TEX_DONE', SET, SIZE)
