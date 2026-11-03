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

/** Lowers the renderer's pixel ratio when it runs on a software rasteriser. */
export function tuneForSoftwareGl(renderer: WebGLRenderer): void {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  if (isSoftwareRenderer(name)) renderer.setPixelRatio(pixelRatioFor(true, window.devicePixelRatio));
}
