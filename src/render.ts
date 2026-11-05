import type { WebGLRenderer } from 'three';

// ponytail: software GL (SwiftShader, llvmpipe) is CPU-bound, so draw fewer pixels; 0.75 is the ceiling.
const SOFTWARE_PIXEL_RATIO = 0.75;

/** True when the unmasked GL renderer string names a CPU rasteriser. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|software/i.test(name);
}

/** Pixel ratio to render at: the device ratio, or less on software GL. */
export function pixelRatioFor(software: boolean, devicePixelRatio: number): number {
  return software ? Math.min(devicePixelRatio, SOFTWARE_PIXEL_RATIO) : devicePixelRatio;
}

/** True when the page URL asks for full resolution (`?shots`, used by the README screenshot capture). */
export function fullResolution(search: string): boolean {
  return new URLSearchParams(search).has('shots');
}

/** True when the renderer is a CPU rasteriser. */
export function isSoftwareGl(renderer: WebGLRenderer): boolean {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return isSoftwareRenderer(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '');
}

/** Lowers the renderer's pixel ratio when it runs on a software rasteriser, unless `?shots` asks for full resolution. */
export function tuneForSoftwareGl(renderer: WebGLRenderer): void {
  if (fullResolution(location.search)) return;
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  if (isSoftwareRenderer(name)) renderer.setPixelRatio(pixelRatioFor(true, window.devicePixelRatio));
}
