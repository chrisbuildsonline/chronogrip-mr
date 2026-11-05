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
dev = common.setup_render(mode, samples, scale, exposure=cfg.get('exposure', 0.0), look=cfg.get('look', 'AgX - Medium High Contrast'), glare=cfg.get('glare', True))
sc = bpy.context.scene
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
