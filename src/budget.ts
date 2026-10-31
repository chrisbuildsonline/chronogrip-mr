/**
 * Most draw calls and triangles one frame may cost on a level in play.
 * Measured at 47-52 calls and 25k-33k triangles per level (swiftshader, desktop view); this leaves close to 2x headroom for a Quest 3.
 */
export const RENDER_BUDGET = { calls: 100, triangles: 60_000 } as const;
