/**
 * The UI palette (design/DESIGN.md). Every text colour reaches WCAG AA (4.5:1) on each surface it is drawn on, hover
 * states included (tests/unit/palette.test.ts); index.html repeats the page's colours in its CSS.
 */
export const C = {
  cream: '#f6efe2',
  deep: '#ebe0cc',
  deepHover: '#e2d3b8',
  ink: '#1c1712',
  inkHover: '#33291f',
  muted: '#665a4c',
  amber: '#d99a2b',
  tint: '#f3dcae',
  tintInk: '#7a4e0e',
  shadow: 'rgba(20,12,4,0.35)',
  /** World only, never text: the black 90% layer behind the menus (src/main.ts overlay, src/panels.ts backing). */
  scrim: '#000000',
  /** World only: the warm red a jammed gear is tinted and the goal ring turns when the target runs the wrong way. */
  jam: '#cf4128',
  /** The same red dark enough for words and the badge's arrow on cream: "Jammed:", "Wrong way:". */
  jamInk: '#a8321e',
  /** World only, never text: the gears' brass, and the fine lines of the "table found" ring (src/cue.ts). */
  brass: '#b08d57',
  /** Page only: the Enter MR note, and the lightest stop of the walnut vignette behind the page chrome. */
  note: '#c9bba6',
  vignette: '#3a2a1c',
  /** Menus float on the 90% black layer (F38, "Escapement deco"): the logo and big words, the row words, the selected row's words, and the muted lines. */
  logo: '#f1e8d8',
  menuInk: '#cdbfa6',
  menuHi: '#fff6e6',
  menuMuted: '#a8977f',
  /** The surface the menu words are checked on: walnut night, darker than the 90% layer over any wall. */
  menuBed: '#15110d',
  /** The stage-cleared card: a walnut-night panel, lighter at the top, under an amber hairline. */
  clearedTop: '#2a1d12',
  clearedFoot: '#100b07',
} as const;

/**
 * World only, never text: the clockmaker's workshop behind and around the tray (src/scenery.ts). Walnut and plaster stay
 * dark and warm so the cream panels and brass gears read first; the lamp, brass and cream props carry the highlights.
 */
export const SCENE = {
  benchTop: '#6c4730',
  /** Multiplier on the lit bench albedo (src/wood.ts). */
  benchTint: '#9c7c66',
  benchPlank: '#5e3c28',
  benchGrain: '#533523',
  benchEdge: '#3f281a',
  wall: '#41301f',
  wallPlank: '#4a3524',
  wallLow: '#392819',
  rail: '#6b4a2e',
  shelf: '#7a5233',
  shelfEdge: '#5a3b24',
  steel: '#9aa3ab',
  steelDark: '#5c6269',
  glass: '#a9c4b8',
  honey: '#c98a24',
  bookRed: '#9a4430',
  bookGreen: '#566e4c',
  bookBlue: '#476580',
  bookMustard: '#bf8c2f',
  lampMetal: '#3a342e',
  lampShade: '#cf7a2e',
  bulb: '#ffe2b0',
  glow: '#ffcf8a',
  canRed: '#b5432c',
  handleTeal: '#2f5a63',
  woodLight: '#b98b5a',
} as const;
