"""Small watchmaker props shared by the scenes."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from common import *

_P = {}


def pm():
    if not _P:
        _P['brass'] = brass('prop-brass', aniso=0.5)
        _P['brass_old'] = brass('prop-brass-old', color=(0.6, 0.4, 0.16), rough=(0.25, 0.45), tarnish=0.6)
        _P['steel'] = principled('steel', (0.55, 0.56, 0.58), 1.0, 0.22, **{'Anisotropic': 0.4})
        _P['blued'] = principled('blued-steel', (0.03, 0.04, 0.1), 1.0, 0.2)
        _P['ruby'] = principled('ruby', (0.6, 0.02, 0.03), 0.0, 0.05, **{'Transmission Weight': 0.8, 'IOR': 1.76})
        _P['handle'] = wood('handle', dark=(0.06, 0.02, 0.008), light=(0.2, 0.07, 0.025), scale=8, coat=0.8, grain_axis='Z')
        _P['glass'] = glass('lens', 0.0)
        _P['black'] = principled('black-lacquer', (0.008, 0.007, 0.006), 0.0, 0.2, **{'Coat Weight': 1.0})
        _P['gilt'] = brass('gilt-plate', color=(0.62, 0.46, 0.22), rough=(0.28, 0.4), aniso=0.7, tarnish=0.1)
    return _P


def loupe(loc, yaw=0.0):
    m = pm()
    R = (0, 0, yaw)
    ob = []
    ob.append(obj_from_bm('loupe-rim', bm_ring(0.022, 0.018, 0.022, 48), m['black'], (loc[0], loc[1], loc[2] + 0.011), R, smooth_angle=40, bevel=0.001))
    ob.append(obj_from_bm('loupe-brass', bm_ring(0.0225, 0.019, 0.004, 48), m['brass'], (loc[0], loc[1], loc[2] + 0.0215), R, smooth_angle=40))
    ob.append(obj_from_bm('loupe-lens', bm_sphere(0.019, seg=32, rings=16), m['glass'], (loc[0], loc[1], loc[2] + 0.02), R, scale=(1, 1, 0.25), smooth_angle=180))
    return ob


def tweezers(loc, yaw=0.0):
    m = pm()
    bm = bmesh.new()
    for s in (-1, 1):
        bm_box(0.12, 0.004, 0.0015, at=(0, s * 0.0035, 0.002), bm=bm, rot=Euler((0, 0, s * 0.04)))
    return [obj_from_bm('tweezers', bm, m['steel'], loc, (0, 0, yaw), smooth_angle=30)]


def screwdriver(loc, rot, length=0.11, r=0.006, handle_mat=None):
    m = pm()
    bm = bm_cyl(r, length * 0.55, 16, at=(0, 0, length * 0.275))
    bm_cyl(r * 1.1, length * 0.06, 16, at=(0, 0, length * 0.03), bm=bm)
    o1 = obj_from_bm('sd-handle', bm, handle_mat or m['handle'], loc, rot, smooth_angle=40, bevel=0.0008)
    bm = bm_cyl(r * 0.25, length * 0.5, 8, at=(0, 0, -length * 0.25))
    o2 = obj_from_bm('sd-blade', bm, m['steel'], loc, rot, smooth_angle=40)
    bm = bm_cyl(r * 1.15, length * 0.03, 16, at=(0, 0, length * 0.57))
    o3 = obj_from_bm('sd-cap', bm, m['brass'], loc, rot, smooth_angle=40)
    return [o1, o2, o3]


def pocket_watch(loc, r=0.026, yaw=0.0, open_back=True):
    """An open watch movement lying face down: case, gilt plate, wheels, balance and hairspring."""
    m = pm()
    x, y, z = loc
    R = (0, 0, yaw)
    ob = [obj_from_bm('pw-case', bm_ring(r, r * 0.88, r * 0.32, 64), m['brass'], (x, y, z + r * 0.16), R, smooth_angle=50, bevel=r * 0.02)]
    ob.append(obj_from_bm('pw-bow', bm_torus(r * 0.22, r * 0.035, 32, 8, rot=Euler((math.pi / 2, 0, 0))), m['brass'], (x + r * 1.15 * math.cos(yaw), y + r * 1.15 * math.sin(yaw), z + r * 0.16), (0, 0, yaw + math.pi / 2), smooth_angle=80))
    ob.append(obj_from_bm('pw-plate', bm_cyl(r * 0.88, r * 0.1, 64, at=(0, 0, 0)), m['gilt'], (x, y, z + r * 0.2), R, smooth_angle=40))
    rr = rnd(int(x * 1000) + 7)
    for k, (gr, gx, gy, t) in enumerate(((0.32, -0.25, 0.2, 60), (0.24, 0.3, 0.3, 48), (0.2, 0.1, -0.35, 40), (0.14, -0.3, -0.3, 30))):
        ob.append(gear(f'pw-g{k}', t, r * gr, r * 0.025, m['brass'], (x + r * gx, y + r * gy, z + r * 0.28 + k * 0.0003), (0, 0, rr.random()), spokes=4 if gr > 0.18 else 0))
        ob.append(obj_from_bm('pw-jewel', bm_cyl(r * 0.03, r * 0.02, 12), m['ruby'], (x + r * gx, y + r * gy, z + r * 0.3), R))
    # balance wheel + hairspring
    bx, by = x + r * 0.35, y - r * 0.2
    ob.append(gear('pw-balance', 3, r * 0.3, r * 0.03, m['brass'], (bx, by, z + r * 0.34), (0, 0, 0.4), spokes=3, depth=0.0001, rim=0.85))
    ob.append(spiral_curve('pw-hair', r * 0.03, r * 0.2, 9, r * 0.004, 0, m['blued'], (bx, by, z + r * 0.37)))
    # bridge
    bm = bm_box(r * 0.9, r * 0.16, r * 0.06, at=(0, 0, 0), rot=Euler((0, 0, 0.6)))
    ob.append(obj_from_bm('pw-bridge', bm, m['gilt'], (x - r * 0.1, y + r * 0.1, z + r * 0.34), R, smooth_angle=30, bevel=r * 0.01))
    for gx, gy in ((-0.45, 0.4), (0.25, -0.15)):
        ob.append(obj_from_bm('pw-screw', bm_cyl(r * 0.045, r * 0.03, 16), m['blued'], (x + r * gx, y + r * gy, z + r * 0.38), R, smooth_angle=60))
    return ob


def scatter_parts(zone, n, seed, z, avoid=None, big=0.02):
    """Small gears, screws and springs strewn over a rectangle zone=(x0, x1, y0, y1)."""
    m = pm()
    rr = rnd(seed)
    obs = []
    tries = 0
    while len(obs) < n and tries < n * 20:
        tries += 1
        x = rr.uniform(zone[0], zone[1])
        y = rr.uniform(zone[2], zone[3])
        if avoid and avoid(x, y):
            continue
        k = rr.random()
        if k < 0.55:
            r = rr.uniform(0.006, big) if rr.random() < 0.7 else rr.uniform(big, big * 1.6)
            t = max(10, int(r * 2600))
            mat = m['brass'] if rr.random() < 0.8 else m['steel']
            obs.append(gear('part-gear', t, r, max(0.0008, r * 0.08), mat, (x, y, z + r * 0.04), (0, 0, rr.random() * 6), spokes=rr.choice((4, 5, 5, 6)) if r > 0.008 else 0))
        elif k < 0.8:
            bm = bm_cyl(0.0012, 0.004, 10, at=(0, 0, 0.002))
            bm_cyl(0.0022, 0.0012, 12, at=(0, 0, 0.0045), bm=bm)
            obs.append(obj_from_bm('screw', bm, m['blued'] if rr.random() < 0.5 else m['steel'], (x, y, z), (rr.uniform(1.2, 1.6), 0, rr.random() * 6), smooth_angle=50))
        elif k < 0.92:
            obs.append(helix_curve('spring', rr.uniform(0.002, 0.004), 0.0012, rr.randint(6, 14), 0.0004, m['steel'], (x, y, z + 0.003), (math.pi / 2, 0, rr.random() * 6)))
        else:
            obs.append(spiral_curve('mainspring', 0.004, rr.uniform(0.012, 0.02), rr.randint(6, 10), 0.00045, 0, m['blued'], (x, y, z + 0.0008), (0, 0, rr.random() * 6)))
    return obs
