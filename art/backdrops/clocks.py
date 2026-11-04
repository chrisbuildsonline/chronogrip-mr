"""Antique clocks built from primitives. Local frame: dial in XY, face normal +Z, 12 o'clock +Y."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from common import *

_M = {}


def mats():
    if not _M:
        _M['dial'] = paper('dial')
        _M['dial2'] = paper('dial-ivory', base=(0.78, 0.7, 0.55), aged=(0.5, 0.4, 0.25), coat=0.8)
        _M['ink'] = principled('ink', (0.008, 0.007, 0.006), 0.2, 0.35)
        _M['blued'] = principled('blued', (0.02, 0.025, 0.06), 1.0, 0.25)
        _M['brass'] = brass('clock-brass', aniso=0.2)
        _M['brass_dark'] = brass('clock-brass-old', color=(0.55, 0.37, 0.15), rough=(0.25, 0.45), tarnish=0.6)
        _M['wood_a'] = wood('case-walnut', dark=(0.018, 0.008, 0.004), light=(0.09, 0.04, 0.016), scale=4, coat=0.8)
        _M['wood_b'] = wood('case-mahogany', dark=(0.03, 0.008, 0.004), light=(0.14, 0.04, 0.015), scale=3, coat=0.9)
        _M['wood_c'] = wood('case-oak', dark=(0.05, 0.028, 0.012), light=(0.16, 0.09, 0.04), scale=5, coat=0.5)
        _M['glass'] = thin_glass('clock-glass', refl=0.08)
        _M['black'] = principled('case-black', (0.006, 0.005, 0.004), 0.0, 0.25, **{'Coat Weight': 1.0})
    return _M


def dial_bm(r, numerals=True, ticks=True, bm=None, M=Matrix()):
    """Painted dial furniture (numerals, chapter rings, minute ticks), sitting just above z=0."""
    bm = bm or bmesh.new()
    z = 0.0006
    T = M @ Matrix.Translation((0, 0, z))
    if numerals:
        dial_numerals_bm(r * 0.70, r * 0.17, 0.0008, bm=bm, M=T, stroke=0.12)
    if ticks:
        R = T.to_3x3().to_euler()
        bm_ring(r * 0.905, r * 0.895, 0.0008, seg=96, at=T @ Vector(), bm=bm, rot=R)
        bm_ring(r * 0.865, r * 0.858, 0.0008, seg=96, at=T @ Vector(), bm=bm, rot=R)
        for k in range(60):
            a = 2 * math.pi * k / 60
            big = k % 5 == 0
            L = r * (0.05 if big else 0.035)
            rr = r * 0.88
            loc = T @ Vector((rr * math.cos(a), rr * math.sin(a), 0))
            rot = (T.to_3x3() @ Matrix.Rotation(a, 3, 'Z')).to_euler()
            bm_box(L, r * (0.012 if big else 0.006), 0.0008, at=loc, bm=bm, rot=rot)
    return bm


def hands_bm(r, hour, minute, bm=None, M=Matrix()):
    bm = bm or bmesh.new()
    for ang, L, w, z in ((hour, 0.48, 0.035, 0.002), (minute, 0.76, 0.022, 0.004)):
        a = math.pi / 2 - ang
        R = (M.to_3x3() @ Matrix.Rotation(a, 3, 'Z'))
        c = M @ Vector((r * L * 0.5 * math.cos(a), r * L * 0.5 * math.sin(a), z))
        bm_box(r * L, r * w, 0.0012, at=c, bm=bm, rot=R.to_euler())
        # spade near the tip
        t = M @ Vector((r * L * 0.78 * math.cos(a), r * L * 0.78 * math.sin(a), z))
        bm_box(r * w * 3.2, r * w * 3.2, 0.0012, at=t, bm=bm, rot=(R @ Matrix.Rotation(math.pi / 4, 3, 'Z')).to_euler())
        # tail
        c2 = M @ Vector((-r * 0.08 * math.cos(a), -r * 0.08 * math.sin(a), z))
        bm_box(r * 0.16, r * w * 1.4, 0.0012, at=c2, bm=bm, rot=R.to_euler())
    return bm


def clock(name, kind, r, loc, rot=(math.pi / 2, 0, 0), time=None, case='wood_a', numerals=True, glass=True, seed=0):
    """Builds one clock. Returns its objects. The dial centre sits at loc; the back of the case is behind it (-Z local)."""
    m = mats()
    rr = rnd(seed)
    E = Euler(rot)
    Rm = E.to_matrix()
    obs = []
    L = Vector(loc)

    def at(x, y, z):
        return L + Rm @ Vector((x, y, z))

    cm = m[case]
    if kind == 'round':
        bm = bm_cyl(r * 1.08, r * 0.35, 64, at=(0, 0, -r * 0.2))
        obs.append(obj_from_bm(name + '-case', bm, cm, L, rot, smooth_angle=35, bevel=r * 0.02))
        obs.append(obj_from_bm(name + '-bezel', bm_torus(r * 1.0, r * 0.055, 64, 12), m['brass'], at(0, 0, 0.0), rot, smooth_angle=80))
    elif kind == 'octagon':
        bm = bm_cyl(r * 1.32, r * 0.3, 8, at=(0, 0, -r * 0.17), rot=Euler((0, 0, math.pi / 8)))
        obs.append(obj_from_bm(name + '-case', bm, cm, L, rot, smooth_angle=20, bevel=r * 0.03))
        # drop box with a pendulum window
        bm = bm_box(r * 1.2, r * 1.3, r * 0.26, at=(0, -r * 1.6, -r * 0.17))
        obs.append(obj_from_bm(name + '-drop', bm, cm, L, rot, smooth_angle=20, bevel=r * 0.03))
        obs.append(obj_from_bm(name + '-bezel', bm_torus(r * 1.0, r * 0.05, 64, 10), m['brass'], at(0, 0, 0), rot, smooth_angle=80))
        obs.append(obj_from_bm(name + '-win', bm_box(r * 0.5, r * 0.55, 0.003, at=(0, -r * 1.65, -r * 0.03)), m['black'], L, rot))
    elif kind == 'box':
        bm = bm_box(r * 2.3, r * 2.5, r * 0.6, at=(0, -r * 0.2, -r * 0.3))
        bm_box(r * 2.5, r * 0.18, r * 0.7, at=(0, r * 1.12, -r * 0.3), bm=bm)
        bm_box(r * 2.5, r * 0.18, r * 0.7, at=(0, -r * 1.5, -r * 0.3), bm=bm)
        obs.append(obj_from_bm(name + '-case', bm, cm, L, rot, smooth_angle=20, bevel=r * 0.03))
        obs.append(obj_from_bm(name + '-bezel', bm_torus(r * 1.0, r * 0.045, 64, 10), m['brass'], at(0, 0, 0.0), rot, smooth_angle=80))
        # brass finials
        for sx in (-1, 1):
            obs.append(obj_from_bm(name + '-fin', bm_sphere(r * 0.1, seg=16, rings=8), m['brass'], at(sx * r * 1.05, r * 1.32, -r * 0.3), rot, smooth_angle=80))
    elif kind == 'regulator':
        H = r * 6.0
        bm = bm_box(r * 2.4, H, r * 0.7, at=(0, -H / 2 + r * 1.3, -r * 0.4))
        bm_box(r * 2.7, r * 0.25, r * 0.85, at=(0, r * 1.35, -r * 0.4), bm=bm)  # cornice
        bm_box(r * 2.7, r * 0.25, r * 0.85, at=(0, -H + r * 1.3, -r * 0.4), bm=bm)  # base
        bm_box(r * 0.9, r * 0.5, r * 0.6, at=(0, r * 1.7, -r * 0.4), bm=bm)  # crest
        obs.append(obj_from_bm(name + '-case', bm, cm, L, rot, smooth_angle=20, bevel=r * 0.03))
        obs.append(obj_from_bm(name + '-bezel', bm_torus(r * 1.0, r * 0.045, 64, 10), m['brass'], at(0, 0, 0.0), rot, smooth_angle=80))
        # dark interior window + brass pendulum
        obs.append(obj_from_bm(name + '-cav', bm_box(r * 1.7, r * 3.8, 0.004, at=(0, -r * 3.1, 0.0)), m['black'], L, rot))
        bm = bm_box(r * 0.05, r * 3.0, r * 0.02, at=(0, -r * 2.6, r * 0.04))
        bm_cyl(r * 0.36, r * 0.07, 40, at=(0.0, -r * 4.1, r * 0.04), bm=bm)
        obs.append(obj_from_bm(name + '-pend', bm, m['brass'], L, rot, smooth_angle=40))
        if glass:
            obs.append(obj_from_bm(name + '-door', bm_box(r * 1.8, r * 3.9, 0.002, at=(0, -r * 3.1, r * 0.08)), m['glass'], L, rot))
    # dial
    dm = m['dial2'] if rr.random() < 0.4 else m['dial']
    obs.append(obj_from_bm(name + '-dial', bm_cyl(r * 0.96, 0.004, 64, at=(0, 0, 0.0)), dm, L, rot))
    furniture = dial_bm(r, numerals=numerals, M=Matrix.Translation((0, 0, 0.002)))
    t = time if time is not None else rr.random() * 12
    hands_bm(r, (t / 12) * 2 * math.pi, ((t % 1)) * 2 * math.pi, bm=furniture, M=Matrix.Translation((0, 0, 0.003)))
    obs.append(obj_from_bm(name + '-ink', furniture, m['ink'], L, rot))
    obs.append(obj_from_bm(name + '-cap', bm_cyl(r * 0.04, 0.012, 16, at=(0, 0, 0.008)), m['brass'], L, rot, smooth_angle=60))
    if glass and kind != 'regulator':
        obs.append(obj_from_bm(name + '-glass', bm_cyl(r * 0.98, 0.001, 64, at=(0, 0, r * 0.06)), m['glass'], L, rot))
    return obs
