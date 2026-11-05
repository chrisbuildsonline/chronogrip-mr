"""PNG renders -> JPGs for the page (each under 1.5 MB), thumbnails, board overlay; fills index.html placeholders."""
import os, re, subprocess, sys
B = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT, IMG = os.path.join(B, 'out'), os.path.join(B, 'img')
os.makedirs(IMG, exist_ok=True)
FF = 'ffmpeg'
C = ['c1_atelier', 'c2_attic', 'c3_movement', 'c4_studio']
LIMIT = 1.5e6


def jpg(src, dst, q, vf=None):
    cmd = [FF, '-y', '-loglevel', 'error', '-i', src] + (['-vf', vf] if vf else []) + ['-q:v', str(q), dst]
    subprocess.run(cmd, check=True)
    return os.path.getsize(dst)


sizes = {}
for i, c in enumerate(C, 1):
    for mode in ('preview', 'pano'):
        src = os.path.join(OUT, f'{c}_{mode}.png')
        dst = os.path.join(IMG, f'c{i}_{mode}.jpg')
        q = 3 if mode == 'preview' else 4   # ffmpeg mjpeg qscale ~ 85-90 % quality
        while True:
            s = jpg(src, dst, q)
            if s < LIMIT or q >= 10:
                break
            q += 1
        sizes[(i, mode)] = s
        print(c, mode, 'q', q, round(s / 1e6, 2), 'MB')
    jpg(os.path.join(OUT, f'{c}_preview.png'), os.path.join(IMG, f'c{i}_preview_thumb.jpg'), 4, 'scale=480:270')
    jpg(os.path.join(OUT, f'{c}_pano.png'), os.path.join(IMG, f'c{i}_pano_2048.jpg'), 4, 'scale=2048:1024')
subprocess.run([FF, '-y', '-loglevel', 'error', '-i', os.path.join(OUT, 'tray_mask.png'), '-vf', 'scale=960:540', os.path.join(IMG, 'board.png')], check=True)

# render times from times.log (last full-res entry per concept/mode)
times = {}
for line in open(os.path.join(OUT, 'times.log')):
    c, mode, res, spp, dev, secs = line.strip().split('\t')
    if res in ('1920x1080', '4096x2048'):
        times[(c, mode)] = (res, spp, dev, float(secs[:-1]))


def fmt(s):
    return f'{int(s // 60)} min {int(s % 60):02d} s' if s >= 60 else f'{s:.0f} s'


h = open(os.path.join(B, 'index.html')).read()
rows = []
total = 0
for i, c in enumerate(C, 1):
    p, q = times[(c, 'preview')], times[(c, 'pano')]
    total += p[3] + q[3]
    h = h.replace(f'SIZE{i}P', f'{sizes[(i, "pano")] / 1e6:.1f} MB')
    h = h.replace(f'TIME{i}', f'16:9 {fmt(p[3])} at {p[1][:-3]} spp; 360&deg; {fmt(q[3])} at {q[1][:-3]} spp (CUDA)')
    name = ['Atelier', 'Attic', 'Movement', 'Studio'][i - 1]
    rows.append(f'<tr><td>{["I", "II", "III", "IV"][i - 1]} {name}</td><td>{fmt(p[3])}</td><td>{fmt(q[3])}</td></tr>')
table = ('<table class="times"><thead><tr><th>Concept</th><th>16:9</th><th>360&deg;</th></tr></thead><tbody>' + ''.join(rows) +
         f'</tbody></table><p>1920 &times; 1080 at 192 spp and 4096 &times; 2048 at 160 spp, adaptive sampling, denoised. Total {fmt(total)} on one RTX 3090.</p>')
h = h.replace('    TIMES\n', '    ' + table + '\n')
open(os.path.join(B, 'index.html'), 'w').write(h)
print('TOTAL', fmt(total))
