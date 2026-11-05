/**
 * Render quality. 'high' is the full look (environment lighting from the stage cubemap, varnished clearcoat tray, 2048 wood
 * maps at full anisotropy, lit bench planks, 2048 cubemap faces); 'low' is what a software rasteriser can draw without stalling
 * for tens of seconds on a first frame (no PMREM, plain standard materials, 1024 maps, anisotropy 1, unlit bench, 1024 faces).
 * Software GL (SwiftShader, llvmpipe: the test machines) runs 'low', and so does a standalone headset browser (Quest, Pico: a
 * mobile GPU where clearcoat shaders and 2048 maps at full anisotropy can stall the first frame); `?quality=high|low`
 * overrides, and `?shots` (README screenshots) asks for 'high'. On-device fps is still unmeasured.
 */
export type Quality = 'high' | 'low';

/** The user-agent of a standalone headset browser: Meta Quest (OculusBrowser), Pico, Wolvic. */
export const isHeadsetBrowser = (ua: string): boolean => /OculusBrowser|Quest|Pico|Wolvic/i.test(ua);

export function qualityOf(search: string, software: boolean, ua = ''): Quality {
  const params = new URLSearchParams(search);
  const asked = params.get('quality');
  if (asked === 'high' || asked === 'low') return asked;
  if (params.has('shots')) return 'high';
  return software || isHeadsetBrowser(ua) ? 'low' : 'high';
}
