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
  /** Live: the music's theme, the level driving its layers, whether the clock is under 30 s, and the layers playing (pad, melody, bass, counter, ticks). */
  readonly music: { readonly theme: 'menu' | 'box' | 'marimba' | 'clockwork'; readonly level: number; readonly low: boolean; readonly layers: readonly ('pad' | 'melody' | 'bass' | 'counter' | 'ticks')[] };
  /** Live: audio context state and how many of each sound have played. */
  readonly audio: { readonly state: 'none' | 'suspended' | 'running' | 'closed'; readonly ticks: number; readonly clicks: number; readonly grinds: number; readonly chimes: number; /** Music notes scheduled so far (the bed's melody and pad). */ readonly notes: number };
  /** Live: draw calls and triangles of the last rendered frame. */
  readonly render: { readonly calls: number; readonly triangles: number };
  /**
   * Live: the scenery (src/scenery.ts). `mode`: 'inline' (bench and panorama backdrop) or 'xr' (a few props on the real table);
   * `parts`: names of the scenery meshes drawn now; `tris`: their triangles; `background`: scene.background is set; `cube`: it is a CubeTexture; `environment`: what lights the metals ('stage' = the backdrop's PMREM, 'neutral' = the room environment); `backdrop`: which panorama (c1-c3);
   * `fog`: scene.fog is set; `clearAlpha`: the renderer's clear alpha.
   */
  readonly scenery: { readonly mode: 'inline' | 'xr'; readonly parts: readonly string[]; readonly tris: number; readonly background: boolean; readonly cube: boolean; readonly environment: 'stage' | 'neutral'; readonly backdrop: 'c1' | 'c2' | 'c3' | null; readonly fog: boolean; readonly clearAlpha: number };
  /** Live: every gear's screen centre and radius (CSS px). */
  readonly gearScreens: readonly { readonly id: string; readonly x: number; readonly y: number; readonly r: number }[];
  /** Live: the first gear's metal (metalness, roughness, brushed maps) and whether the scene has an environment map (scene.environment). */
  readonly metals: { readonly metalness: number; readonly roughness: number; readonly roughnessMap: boolean; readonly normalMap: boolean; readonly environment: boolean; readonly intensity: number };
  /** Live: the tray's wood material (PBR maps present, anisotropy of the albedo map). */
  readonly trayWood: { readonly physical: boolean; readonly map: boolean; readonly normalMap: boolean; readonly roughnessMap: boolean; readonly anisotropy: number; readonly normalScale: number; readonly clearcoat: number };
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
  /** Live: the campaign run in progress or saved (levels cleared, total time so far in ms), null when none. */
  readonly run: { readonly stage: 'easy' | 'medium' | 'hard'; readonly cleared: number; readonly ms: number } | null;
  /** Live: the stage being played (the one of the run, else the last picked) and the HUD's words for the level, "Hard · Level 3" (just "Level 3" outside the 20 stage levels). */
  readonly stage: 'easy' | 'medium' | 'hard';
  readonly hudLabel: string;
  /** Live: the stage picker's cards (src/cards.ts): whether up, reduced motion, and per card its hint, float offset, hover mix, art brightness and uv offset. */
  readonly stageCards: { readonly visible: boolean; readonly reduced: boolean; readonly cards: readonly { readonly id: string; readonly hint: string; readonly lift: number; readonly mix: number; readonly brightness: number; readonly hover: boolean; readonly offset: readonly [number, number] }[] };
  /** Live: the menu button the keyboard has reached (null until an arrow or Tab). */
  readonly kbdFocus: string | null;
  /** Live: the button drawn selected (hovered by mouse or hand, or reached by the keys); null when nothing is. */
  readonly highlighted: string | null;
  /** Live: whether the board (the tray and everything on it) is drawn: hidden while the level is paused or counting down. */
  readonly boardVisible: boolean;
  /** Live: the resume countdown's number (3, 2, 1) while it runs, else null. */
  readonly countdown: number | null;
  /** Live: the About window's scroll and its most, metres; null when it is not up. */
  readonly aboutScroll: { readonly scroll: number; readonly max: number } | null;
  /** Live: the music theme playing: 'menu' (every menu), 'box' (Easy), 'marimba' (Medium) or 'clockwork' (Hard); `musicDucked`: the pause card has the music 6 dB down. */
  readonly musicTheme: 'menu' | 'box' | 'marimba' | 'clockwork';
  readonly musicDucked: boolean;
  /** Live: the page header's progress (src/main.ts updateProgress): its words, filled bar segments and whether the bar shows; null when hidden. */
  readonly progress: { readonly text: string; readonly filled: number; readonly bar: boolean } | null;
  /**
   * Live: the level timer. `relaxed`: the Relaxed (no timer) setting; `par`: this level's time limit in seconds; `left`,
   * `over`: whole seconds left (0 once out) and past par; `fraction`: share of par left, 0..1; `ring`: the HUD up now carries the countdown ring.
   */
  readonly timer: { readonly relaxed: boolean; readonly par: number; readonly left: number; readonly over: number; readonly fraction: number; readonly ring: boolean; /** The ring's left and right edge, metres from the card's left edge. */ readonly ringSpan: readonly [number, number] };
  /** Live: whether this level's last solve beat par ('pass') or not ('over'); null while playing and in Relaxed. */
  readonly outcome: 'pass' | 'over' | null;
  /** Test only: adds `s` seconds to the level clock at once, so the timer can run out without waiting. */
  advanceClock(s: number): void;
  /** Live: true while the pause card is up. */
  readonly paused: boolean;
  /** Live: true while the level 1 ghost hand demonstrates the first move. */
  readonly ghostHand: boolean;
  /** Buttons on the panel now shown, with world centre, page pixel position and page-pixel box [x0, y0, x1, y1]. */
  buttons(): { id: string; label: string; world: readonly [number, number, number]; screen: [number, number]; rect: [number, number, number, number] }[];
  /** Live: the black layer behind the menus: `full` over a flat view, `backing` panel behind the card in XR, null in play. */
  readonly scrim: { readonly mode: 'full' | 'backing' | null; readonly opacity: number; readonly backingOpacity: number };
  /** Live: the card now up (its screen and panel-space size in metres), null when none is shown. */
  readonly card: { readonly screen: 'title' | 'stages' | 'picker' | 'countdown' | 'about' | 'hud' | 'complete' | 'paused' | 'initials' | 'board' | 'options' | 'result'; readonly width: number; readonly height: number } | null;
  /** The words on the card now up: text, font size in panel metres, and that size in page pixels as seen now. */
  labels(): { text: string; size: number; height: number; y: number; left: number; right: number }[];
  /** Live: the puzzle code of the loaded level (a tinker level), null for a hand-made one. */
  readonly seedCode: string | null;
  /** Live: Random mode. `mode`: the board is the Random puzzle; `step`: its step; `next`: the step of the next puzzle (saved); `slow`: the last solve was over par; `slot`: its level index. */
  readonly random: { readonly mode: boolean; readonly difficulty: string; readonly slot: number };
  /** Test hook: starts campaign level `n` (1-based) at once, a fresh puzzle. */
  jump(n: number): void;
  /** The solution of the level on the board, gear id to axle id. */
  readonly solution: Record<string, string>;
  /** Live: the saved high score boards (a copy): the last initials used, and per board id (campaign) its top ten completed runs, fastest first. */
  readonly scores: { readonly initials: string; readonly boards: Readonly<Record<string, readonly { readonly name: string; readonly ms: number; readonly date: string }[]>> };
  /** Live: whether sound is on (Options; saved as chronogrip.sound.v1). */
  readonly soundOn: boolean;
  /** Live: whether the background music is on (Options; saved as chronogrip.music.v1). */
  readonly musicOn: boolean;
  /** Live: the Options card while it is up (whether Reset progress awaits its confirm, the No timer and Sound switches), else null. */
  readonly options: { readonly confirm: boolean; readonly relaxed: boolean; readonly sound: boolean; readonly music: boolean } | null;
  /** Live: the initials card while it is up (the board it is for, the rank it would take, the three letters, the slot typing fills next, 3 once all are in), else null. */
  readonly initials: { readonly board: string; readonly rank: number; readonly letters: string; readonly cursor: number } | null;
  /** Live: the note shown for an invalid ?seed= while it is up, else null. */
  readonly seedNote: string | null;
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
