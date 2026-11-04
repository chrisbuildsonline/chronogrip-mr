/** Hook for tests, set once the scene is built; read-only but for holdCue. */
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
  /** Live: how the tray sits on its table: 'edge' (snapped to the near table edge), 'small' (the table cannot hold it comfortably, so it stays at the default spot) or 'default' (no outline, or no plane). */
  readonly trayFit: 'edge' | 'small' | 'default';
  /** Live: the tray's yaw in radians relative to the head it was placed for (what trayPose.yaw is); 0 when unturned. */
  readonly trayYaw: number;
  /** The two floating pills (hands hint, small-table line): words, measured text width, side padding and pill width, all metres. */
  readonly pills: readonly { readonly text: string; readonly textWidth: number; readonly padding: number; readonly width: number }[];
  /** Live: the line floating above the card when the table is too small for the tray (fit 'small'), else null. */
  readonly tableNote: string | null;
  /** Live: the table outline the tray was placed on as [x, z] points in the head frame it was placed for (x right, z forward = -Z), or null without one (also after a saved pose or anchor brings the tray back). */
  readonly tableOutline: readonly (readonly [number, number])[] | null;
  /** Live: the "table found" ring: the last kind shown ('plane' when a plane placed the tray, 'restored' for a saved pose), whether it is pulsing now, and how many times it has shown. */
  readonly placeCue: { readonly kind: 'plane' | 'restored' | null; readonly showing: boolean; readonly count: number };
  /** For screenshots on slow software GL: pins any running "table found" ring at this fraction of its pulse (0..1) until called with null, when it ends at once. */
  holdCue(progress: number | null): void;
  /** Live: how this session's tray pose came back from an earlier one: 'anchor' (a persistent anchor), 'saved' (the head-relative pose in localStorage), or null (placed fresh). */
  readonly trayRestored: 'anchor' | 'saved' | null;
  /** Live: per hand, the depth-only occluder's index tip (world) while the hand is tracked and occluding, else null. */
  readonly occluders: { readonly left: { readonly indexTip: readonly [number, number, number] } | null; readonly right: { readonly indexTip: readonly [number, number, number] } | null };
  /** Live: how many two-hand pinch holds have recentered the tray. */
  readonly recenters: number;
  /** Live: true while the in-scene "use your hands" hint is shown. */
  readonly handHint: boolean;
  /** Live: loose gear id -> axle id for gears resting on an axle (a copy). */
  readonly placements: Record<string, string>;
  /** Live: id of the gear being carried, or null. */
  readonly held: string | null;
  /** Live: how the current (or last) gear pick-up by hand started: IWSDK's GrabSystem or the raw pinch; null before the first. */
  readonly grabVia: 'iwsdk' | 'pinch' | null;
  /** Which path picks gears up by hand: 'iwsdk' by default, 'pinch' with `?grab=pinch`. */
  readonly grabMode: 'iwsdk' | 'pinch';
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
  /** Live: draw calls and triangles of the last rendered frame. */
  readonly render: { readonly calls: number; readonly triangles: number };
  /** Live: true once the escapement is calibrated and the automaton runs. */
  readonly automatonRunning: boolean;
  /** Live: the escapement's tick count so far (fractional); the bird's wings snap up at each whole tick. */
  readonly tickPhase: number;
  /** Live: world position of the top of the regulator knob, where a pinch grabs it. */
  readonly regulatorAt: readonly [number, number, number];
  /**
   * Live: the level's goal as the badge on the target gear shows it: direction as the player sees it, target rpm (unsigned),
   * whether the live spin matches, the HUD's words (the fault line while there is one), the target ring's colour
   * ('#rrggbb': amber, or the jam red when the target turns the wrong way), and world positions of the badge's centre and
   * of the target gear. Null when the level has no fixed target gear to mark.
   */
  readonly goal: {
    readonly dir: 'cw' | 'ccw';
    readonly rpm: number;
    readonly matched: boolean;
    readonly text: string;
    readonly ring: string;
    readonly at: readonly [number, number, number];
    readonly gear: readonly [number, number, number];
  } | null;
  /**
   * Live: the fault cues (src/fault.ts). `jammed`: ids of the gears the solver calls jammed, sorted; `wrongWay`: the
   * target turns at the right speed against the arrow; `shaking`: the jam shake is running (or waiting for the dropped gear
   * to land); `shakes`: how many jam shakes have started; `tint`: per gear id, how far its material has gone towards the
   * full jam red, 0..1, read back from the material (0 on every gear that is not jammed).
   */
  readonly cue: {
    readonly jammed: readonly string[];
    readonly wrongWay: boolean;
    readonly shaking: boolean;
    readonly shakes: number;
    readonly tint: Readonly<Record<string, number>>;
  };
  /** Live: index of the loaded level in LEVELS. */
  readonly levelIndex: number;
  /** Live: seconds played on this level; runs only while playing. */
  readonly levelTime: number;
  /** Live: saved best times in seconds per level id (a copy). */
  readonly progress: { readonly best: Readonly<Record<string, number>> };
  /** Live: true on the complete card when this solve beat a saved time; false on a first solve. */
  readonly newBest: boolean;
  /**
   * Live: the level timer. `relaxed`: the Relaxed (no timer) setting; `par`: this level's time limit in seconds; `left`,
   * `over`: whole seconds left (0 once out) and past par; `fraction`: share of par left, 0..1; `ring`: the HUD up now carries the countdown ring.
   */
  readonly timer: { readonly relaxed: boolean; readonly par: number; readonly left: number; readonly over: number; readonly fraction: number; readonly ring: boolean; /** The ring's left and right edge, metres from the card's left edge. */ readonly ringSpan: readonly [number, number] };
  /** Live: whether this level's last solve beat par ('pass') or not ('over'); null while playing and in Relaxed. */
  readonly outcome: 'pass' | 'over' | null;
  /** Live: saved pass/over per level id (a copy); Relaxed solves are not marked. */
  readonly outcomes: Readonly<Record<string, 'pass' | 'over'>>;
  /** Test only: adds `s` seconds to the level clock at once, so the timer can run out without waiting. */
  advanceClock(s: number): void;
  /** Live: true while the pause card is up. */
  readonly paused: boolean;
  /** Live: true while the level 1 ghost hand demonstrates the first move. */
  readonly ghostHand: boolean;
  /** Buttons on the panel now shown, with world centre, page pixel position and page-pixel box [x0, y0, x1, y1]. */
  buttons(): { id: string; label: string; world: readonly [number, number, number]; screen: [number, number]; rect: [number, number, number, number] }[];
  /** Live: the card now up (its screen and panel-space size in metres), null when none is shown. */
  readonly card: { readonly screen: 'title' | 'select' | 'hud' | 'complete' | 'paused'; readonly width: number; readonly height: number } | null;
  /** The words on the card now up: text, font size in panel metres, and that size in page pixels as seen now. */
  labels(): { text: string; size: number; height: number; y: number; left: number; right: number }[];
  /** Live: the puzzle code of the loaded level (a tinker level), null for a hand-made one. */
  readonly seedCode: string | null;
  /** Live: Random mode. `mode`: the board is the Random puzzle; `step`: its step; `next`: the step of the next puzzle (saved); `slow`: the last solve was over par; `slot`: its level index. */
  readonly random: { readonly mode: boolean; readonly step: number; readonly next: number; readonly slow: boolean; readonly slot: number };
  /** Live: the note shown for an invalid ?seed= while it is up, else null. */
  readonly seedNote: string | null;
  /** Live: the complete card's Copy link; `link` is what was (or would be) copied, null while idle. */
  readonly copy: { readonly state: 'idle' | 'copied' | 'failed'; readonly link: string | null };
  /** Page pixel positions of the shown panel's four corners (bottom left, bottom right, top left, top right); empty when none is up. */
  panelCorners(): [number, number][];
  /**
   * Page-pixel boxes [x0, y0, x1, y1] round the board and ledge, the escapement dial, the bird (each from its meshes' own
   * bounding box corners) and the card now up; null when not shown.
   */
  viewBoxes(): Record<'board' | 'dial' | 'bird' | 'card', [number, number, number, number] | null>;
  /** Page-pixel box [x0, y0, x1, y1] round the ghost hand's visible meshes (and anything it carries); null while it is hidden. */
  ghostBox(): [number, number, number, number] | null;
  /** Page-pixel box [x0, y0, x1, y1] round the regulator's cream dial face alone. */
  dialFaceBox(): [number, number, number, number] | null;
  /** Live: the camera's position (the desktop preview eye outside XR). */
  readonly cameraAt: [number, number, number];
  /** Live: true while the desktop camera eases to a new fit (a level or card change on a narrow window). */
  readonly cameraMoving: boolean;
  /** Page pixel coordinates of a world point, for driving the mouse in tests. */
  toScreen(p: readonly [number, number, number]): [number, number];
}

interface Window {
  __chrono?: ChronoHook;
}
