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
  /** World only, never text: the gears' brass, and the fine lines of the "table found" ring (src/cue.ts). */
  brass: '#b08d57',
  /** Page only: the Enter MR note, and the lightest stop of the walnut vignette behind the page chrome. */
  note: '#c9bba6',
  vignette: '#3a2a1c',
} as const;
