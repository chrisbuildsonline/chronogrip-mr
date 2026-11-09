"""blender -b --factory-startup -P run.py -- <concept> <preview|pano> [scale] [samples]"""
import sys, os, time, importlib, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import common

argv = sys.argv[sys.argv.index('--') + 1:]
concept, mode = argv[0], argv[1]
scale = float(argv[2]) if len(argv) > 2 else 1.0
samples = int(argv[3]) if len(argv) > 3 else (192 if mode == 'preview' else 160)
OUT = os.path.join(os.path.dirname(HERE), 'out')
os.makedirs(OUT, exist_ok=True)

common.reset()
if mode == 'mask':
    sc = bpy.context.scene
    obs = common.tray_silhouette()
    m = common.emission('tray-flat', (0.006, 0.0045, 0.0035), 1.0)
    for o in obs:
        o.data.materials.clear()
        o.data.materials.append(m)
    common.game_camera()
    common.setup_render('preview', 16, 1.0, glare=False)
    sc.cycles.use_denoising = False
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.camera = bpy.data.objects['game']
    sc.render.filepath = os.path.join(OUT, 'tray_mask.png')
    bpy.ops.render.render(write_still=True)
    raise SystemExit(0)
mod = importlib.import_module(concept)
t0 = time.time()
cfg = mod.build(mode) or {}
print('BUILD_SECONDS', round(time.time() - t0, 1))
if cfg.get('spots'):
    # where each animation spot lands in the 1920 x 1080 game reference frame, plus its direction from the eye
    import math
    from bpy_extras.object_utils import world_to_camera_view
    s0 = bpy.context.scene
    s0.render.resolution_x, s0.render.resolution_y = 1920, 1080
    bpy.context.view_layer.update()
    cam = bpy.data.objects['game']
    for name, p in cfg['spots'].items():
        v = world_to_camera_view(s0, cam, common.Vector(p))
        d = common.Vector(p) - common.EYE
        print('SPOT', concept, name, f'x={v.x * 1920:.0f} y={(1 - v.y) * 1080:.0f}',
              f'az={math.degrees(math.atan2(d.x, d.y)):.1f} el={math.degrees(math.atan2(d.z, d.xy.length)):.1f} dist={d.length:.1f}')
dev = common.setup_render('preview' if mode.startswith('turn') else mode, samples, scale, exposure=cfg.get('exposure', 0.0), look=cfg.get('look', 'AgX - Medium High Contrast'), glare=cfg.get('glare', True))
sc = bpy.context.scene
if mode.startswith('turn'):
    # the desktop orbit at its clamp: 40 deg of turn around the target and 12 deg lower (main.ts), so the view tips up
    import math
    from mathutils import Matrix
    side = cfg.get('turn', 'left') if mode == 'turn' else mode[5:]
    home = common.EYE - common.TARGET
    r = home.length
    polar = math.acos(home.z / r) + math.radians(12)
    az = math.atan2(home.y, home.x) + math.radians(40 if side == 'left' else -40)
    eye = common.TARGET + r * common.Vector((math.sin(polar) * math.cos(az), math.sin(polar) * math.sin(az), math.cos(polar)))
    cd = bpy.data.cameras.new('turn')
    cd.sensor_fit = 'VERTICAL'
    cd.sensor_height = 24.0
    cd.angle_y = common.FOV_V
    cd.clip_start = 0.02
    cd.clip_end = 50000
    ob = bpy.data.objects.new('turn', cd)
    ob.location = eye
    common.look(ob, common.TARGET)
    sc.collection.objects.link(ob)
    sc.camera = ob
    path = os.path.join(OUT, f'{concept}_turn_{side}.png')
    sc.render.filepath = path
    t1 = time.time()
    bpy.ops.render.render(write_still=True)
    print('RENDER_SECONDS', concept, mode, round(time.time() - t1, 1))
    raise SystemExit(0)
if 'glare' in cfg and mode == 'preview' and cfg.get('glare_settings'):
    pass
if mode.startswith('cube'):
    size = int(mode[4:] or 2048)
    cams = common.cube_cameras()
    if cfg.get('cube_dof'):
        for cam in cams.values():
            cam.data.dof.use_dof = True
            cam.data.dof.focus_distance = cfg['cube_dof']['focus']
            cam.data.dof.aperture_fstop = 18.0 / cfg['cube_dof']['aperture_mm']   # 90 deg on a 36 mm sensor = 18 mm
            cam.data.dof.aperture_blades = 7
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    tag = argv[4] if len(argv) > 4 else ''
    t1 = time.time()
    for name, cam in cams.items():
        sc.camera = cam
        sc.render.filepath = os.path.join(OUT, f'{concept}{tag}_cube{size}_{name}.png')
        bpy.ops.render.render(write_still=True)
    secs = round(time.time() - t1, 1)
    print('RENDER_SECONDS', concept, mode, samples, dev, secs)
    with open(os.path.join(OUT, 'times.log'), 'a') as f:
        f.write(f'{concept}{tag}\t{mode}\t6x{size}\t{samples}spp\t{dev}\t{secs}s\n')
    raise SystemExit(0)
sc.camera = bpy.data.objects['game' if mode == 'preview' else 'pano']
tag = '' if scale >= 1 else f'_test{int(scale * 100)}'
path = os.path.join(OUT, f'{concept}_{mode}{tag}.png')
sc.render.filepath = path
t1 = time.time()
bpy.ops.render.render(write_still=True)
secs = round(time.time() - t1, 1)
print('RENDER_SECONDS', concept, mode, scale, samples, dev, secs)
with open(os.path.join(OUT, 'times.log'), 'a') as f:
    f.write(f'{concept}\t{mode}\t{sc.render.resolution_x * scale:.0f}x{sc.render.resolution_y * scale:.0f}\t{samples}spp\t{dev}\t{secs}s\n')
