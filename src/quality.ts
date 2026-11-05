/**
 * Render quality. 'high' is the full look (environment lighting from the stage cubemap, varnished clearcoat tray, 2048 wood
 * maps at full anisotropy, lit bench planks, 2048 cubemap faces); 'low' is what a software rasteriser can draw without stalling
 * for tens of seconds on a first frame (no PMREM, plain standard materials, 1024 maps, anisotropy 1, unlit bench, 1024 faces).
 * Software GL (SwiftShader, llvmpipe: the test machines) runs 'low'; `?quality=high|low` overrides, and `?shots` (README
 * screenshots) asks for 'high'.
 */
export type Quality = 'high' | 'low';

export function qualityOf(search: string, software: boolean): Quality {
  const params = new URLSearchParams(search);
  const asked = params.get('quality');
  if (asked === 'high' || asked === 'low') return asked;
  if (params.has('shots')) return 'high';
  return software ? 'low' : 'high';
}
