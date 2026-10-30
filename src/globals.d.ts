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
  /** Live: the gear or axle under the gaze ray (head forward in XR, mouse pointer on desktop), else null. */
  readonly gazeTarget: { readonly kind: 'gear' | 'axle'; readonly id: string } | null;
  /** Live: ids of loose gears glowing because a free hand is within 5 cm. */
  readonly handGlow: readonly string[];
  /** Live: ids of axles where the held gear could snap (pulsing); empty when nothing is held. */
  readonly validAxles: readonly string[];
  /** Live: world pinch point of each hand while it pinches, else null. */
  readonly pinchPoints: { readonly left: readonly [number, number, number] | null; readonly right: readonly [number, number, number] | null };
  /** Live: level flow state. */
  readonly flow: 'title' | 'select' | 'playing' | 'calibrate' | 'complete' | 'paused';
  /** Live: true while the level 1 ghost hand demonstrates the regulator twist. */
  readonly ghostTwist: boolean;
  /** Live: the escapement regulator setting, 0..1 across the knob's travel. */
  readonly regulator: number;
  /** Live: the escapement's tick rate now and the level's target, ticks per second. */
  readonly tickRate: number;
  readonly targetRate: number;
  /** Live: whether the tick rate is inside the target band. */
  readonly inBand: boolean;
  /** Live: who is turning the regulator knob, or null. */
  readonly turning: 'left' | 'right' | 'mouse' | null;
  /** Live: world orientation [x, y, z, w] of each tracked wrist joint, else null. */
  readonly wrists: { readonly left: readonly [number, number, number, number] | null; readonly right: readonly [number, number, number, number] | null };
  /** Live: audio context state and how many of each sound have played. */
  readonly audio: { readonly state: 'none' | 'suspended' | 'running' | 'closed'; readonly ticks: number; readonly clicks: number; readonly grinds: number; readonly chimes: number };
  /** Live: true once the escapement is calibrated and the automaton runs. */
  readonly automatonRunning: boolean;
  /** Live: world position of the top of the regulator knob, where a pinch grabs it. */
  readonly regulatorAt: readonly [number, number, number];
  /** Live: index of the loaded level in LEVELS. */
  readonly levelIndex: number;
  /** Live: seconds played on this level; runs only while playing. */
  readonly levelTime: number;
  /** Live: saved best times in seconds per level id (a copy). */
  readonly progress: { readonly best: Readonly<Record<string, number>> };
  /** Live: true on the complete card when this solve beat a saved time; false on a first solve. */
  readonly newBest: boolean;
  /** Live: true while the pause card is up. */
  readonly paused: boolean;
  /** Live: true while the level 1 ghost hand demonstrates the first move. */
  readonly ghostHand: boolean;
  /** Buttons on the panel now shown, with world centre and page pixel position. */
  buttons(): { id: string; label: string; world: readonly [number, number, number]; screen: [number, number] }[];
  /** Page pixel coordinates of a world point, for driving the mouse in tests. */
  toScreen(p: readonly [number, number, number]): [number, number];
}

interface Window {
  __chrono?: ChronoHook;
}
