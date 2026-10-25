/** Read-only hook for tests, set once the scene is built. */
interface ChronoHook {
  readonly levelId: string;
  readonly gearCount: number;
  readonly axleCount: number;
  readonly ready: true;
  /** Live: true while an XR session is running. */
  readonly xrPresenting: boolean;
  /** Live: tray pose relative to the head it was placed for (head at the origin, -Z forward). */
  readonly trayPose: { readonly position: readonly [number, number, number]; readonly tilt: number; readonly yaw?: number };
  /** Live: 'plane' when a detected plane placed the tray, else 'default'. */
  readonly trayPlaced: 'plane' | 'default';
  /** Live: how many two-hand pinch holds have recentered the tray. */
  readonly recenters: number;
  /** Live: true while the in-scene "use your hands" hint is shown. */
  readonly handHint: boolean;
  /** Live: loose gear id -> axle id for gears resting on an axle (a copy). */
  readonly placements: Record<string, string>;
  /** Live: id of the gear being carried, or null. */
  readonly held: string | null;
  /** Live: whether the current placements solve the level. */
  readonly solved: boolean;
  /** Live: world positions of the loose gear centres. */
  readonly gears: Record<string, readonly [number, number, number]>;
  /** Live: world positions of the axles, at the height of a layer 0 gear centre. */
  readonly axles: Record<string, readonly [number, number, number]>;
  /** Live: world pinch point of each hand while it pinches, else null. */
  readonly pinchPoints: { readonly left: readonly [number, number, number] | null; readonly right: readonly [number, number, number] | null };
  /** Page pixel coordinates of a world point, for driving the mouse in tests. */
  toScreen(p: readonly [number, number, number]): [number, number];
}

interface Window {
  __chrono?: ChronoHook;
}
