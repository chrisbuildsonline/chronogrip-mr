/**
 * Measures the Easy attic clock's hub on public/backdrops/c2_cube/nz.jpg (the -z face, 2048 px) by fitting circles to the clock's
 * concentric rings: a Hough search on the gradient magnitude in a 400 px crop round the hub, refined to 0.1 px on a bilinear grid.
 *
 *   ffmpeg -i public/backdrops/c2_cube/nz.jpg -vf "crop=400:400:1214:786,format=gray" -f rawvideo hub.gray
 *   bun art/backdrops/fit_hub.ts hub.gray 56 64     # inner ring    -> r 62, face pixel (1425, 986)
 *   bun art/backdrops/fit_hub.ts hub.gray 80 95     # outer edge    -> r 88, face pixel (1427, 991)
 *
 * The hub used by src/ambient.ts (EASY_HUB) is the mean, face pixel (1426.5, 988.5) counting the texel centre.
 */
import { readFileSync } from 'fs';

const N = 400, ox = 1214, oy = 786;
const b = readFileSync(process.argv[2]!);
const g = (x: number, y: number) => b[Math.max(0, Math.min(N - 1, Math.round(y))) * N + Math.max(0, Math.min(N - 1, Math.round(x)))]!;
const mag = new Float32Array(N * N), gx = new Float32Array(N * N), gy = new Float32Array(N * N);
for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
  const dx = g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1) - g(x - 1, y - 1) - 2 * g(x - 1, y) - g(x - 1, y + 1);
  const dy = g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1) - g(x - 1, y - 1) - 2 * g(x, y - 1) - g(x + 1, y - 1);
  gx[y * N + x] = dx; gy[y * N + x] = dy; mag[y * N + x] = Math.hypot(dx, dy);
}
/** Mean radial gradient on a circle: high when the circle lies on an edge. */
const score = (cx: number, cy: number, r: number) => {
  let s = 0;
  const n = 180;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = Math.round(cy + r * Math.sin(a)) * N + Math.round(cx + r * Math.cos(a));
    if (mag[k]) s += Math.abs(gx[k]! * Math.cos(a) + gy[k]! * Math.sin(a));
  }
  return s / n;
};
const [rlo, rhi] = [Number(process.argv[3]), Number(process.argv[4])];
let best = { s: -1, cx: 0, cy: 0, r: 0 };
for (let cy = 160; cy < 240; cy++) for (let cx = 160; cx < 240; cx++) for (let r = rlo; r <= rhi; r++) {
  const s = score(cx, cy, r);
  if (s > best.s) best = { s, cx, cy, r };
}
const bilinear = (x: number, y: number) => {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, k = (xx: number, yy: number) => mag[yy * N + xx]!;
  return k(x0, y0) * (1 - fx) * (1 - fy) + k(x0 + 1, y0) * fx * (1 - fy) + k(x0, y0 + 1) * (1 - fx) * fy + k(x0 + 1, y0 + 1) * fx * fy;
};
let fine = { ...best, s: -1 };
for (let dy = -1.5; dy <= 1.5; dy += 0.1) for (let dx = -1.5; dx <= 1.5; dx += 0.1) for (let dr = -1.5; dr <= 1.5; dr += 0.25) {
  let t = 0;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    t += bilinear(best.cx + dx + (best.r + dr) * Math.cos(a), best.cy + dy + (best.r + dr) * Math.sin(a));
  }
  if (t / 360 > fine.s) fine = { s: t / 360, cx: best.cx + dx, cy: best.cy + dy, r: best.r + dr };
}
console.log(JSON.stringify({ r: fine.r, faceX: ox + fine.cx, faceY: oy + fine.cy }));
