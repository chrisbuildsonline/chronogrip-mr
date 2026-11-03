# ChronoGrip UI design

The board is the game; UI is a quiet cream card that floats above it. Warm walnut and brass world, one card at a time.

## Colour
| Role | Hex | Use |
|---|---|---|
| Walnut | `#4a3322` | tray, ledge (world) |
| Brass | `#b08d57` | gears (world) |
| Cream | `#f6efe2` | every panel surface |
| Cream deep | `#ebe0cc` | secondary buttons, level tiles; `#e2d3b8` hovered |
| Ink | `#1c1712` | titles, numbers, the primary pill; `#33291f` hovered |
| Muted | `#665a4c` | secondary text, eyebrows |
| Amber | `#d99a2b` | the one accent: selection, progress, hover ring, reward glow |
| Amber tint | `#7a4e0e` on `#f3dcae` | status pills ("Solved", "New best") |
| Jam | `#cf4128` | world only: a jammed gear's tint, the goal ring when the target turns the wrong way |
| Jam ink | `#a8321e` | the red words and disc of a fault on the HUD, the badge arrow when wrong way (5.8:1 on cream) |
| Note | `#c9bba6` | page only: the Enter MR note on the walnut vignette (lightest stop `#3a2a1c`) |
| Shadow | `rgba(20,12,4,0.35)` | soft drop shadow, 30 px blur, 10 px down |

No hairline borders. Depth comes from the shadow and the cream-on-walnut contrast.

Every text colour reaches WCAG AA (4.5:1) on each surface it sits on, hover included: muted is 5.9:1 on cream, 5.1:1 on
cream deep and 4.6:1 on a hovered tile (tests/unit/palette.test.ts). The colours live in src/palette.ts.

## Type (panel millimetres; canvas at 3 px per mm)
| Style | Size | Face |
|---|---|---|
| Display (game title) | 36 mm | Georgia, serif, 600 |
| Number XL (level number, time) | 24 mm | system sans, 700 |
| Heading | 18 mm | Georgia, serif, 600 |
| Button | 12.5 mm | system sans, 600 |
| Body / secondary ("N of 9 solved", HUD goal line, tile best times, "Best m:ss", pause line) | 13.5 mm | system sans, 500-700, muted |
| Eyebrow | 8.5 mm | system sans, 700, caps, +1 px tracking |
| Status pill ("Solved", "New best") | 10.8 mm | system sans, 700, caps, amber tint |

Secondary text is sized to read from the desktop camera (about 13 px at 1280 x 720), not just at 46 cm in the headset.

Times are m:ss; under 10 s they carry tenths (0:00.4, 0:07.2), truncated, so a quick solve never reads 0:00.

## Shape
- Panel corner radius 18 mm, padding 16 mm. Buttons are pills (radius = half height), 46 mm tall.
- Every touch target is at least 40 mm on its short side (poke or pinch). Gap between targets 12 mm.
- One near-black primary pill per screen; everything else is a cream-deep secondary.
- Hover (gaze, hand near, mouse): amber 3 mm ring on the target.

## Placement (XR)
- Panels share one anchor: bottom-centre 46 cm from the head, 1.5 degrees above the board's highest line of sight
  (far ledge or the parts on it), tilted to face the head, carried along with the tray. A panel never hides the board.
- Board parts use the touch cone (pitch -50..+10 degrees); the board fills it, so menu buttons live in the band just
  above it: yaw within 35 degrees, distance within 60 cm, pitch up to +18 degrees (`PANEL_ZONE`).
- Press: index tip arriving at the button face from the front (within 15 mm), or a pinch that starts on it.
  A hand carrying a gear presses nothing.
- The "use your hands" hint is a cream pill floating just above the current panel, never on the board.

## Screens
| Screen | Size (m) | Layout |
|---|---|---|
| Title | 0.34 x 0.15 | eyebrow "A clockwork puzzle"; Display "ChronoGrip"; row: Start (primary 13 cm; "Continue" once anything is solved), Levels |
| Level select | 0.674 x 0.15 | Heading "Levels" with muted "N of 9 solved"; one row (the panel zone's pitch rules out two): Back pill, then nine 50 x 70 mm tiles (1-8, then "Daily" with an amber top edge); the outer tile sits at 34 degrees yaw, inside the 35 degree cone. A solved tile shows its best m:ss in muted text and a small amber check |
| HUD (playing, calibrate) | 0.27 x 0.096 | top: the goal line (muted "Turn the marked gear", the drawn turn arrow, ink bold "60 rpm", an amber check once matched); below: eyebrow "Level" over Number XL level (or "Daily"); Number XL time; round pause button right, kept on the bottom row so it is no higher in view |
| Level complete | 0.35 x 0.17 | amber "Solved" pill; Heading "Level N complete"; Number XL time right, an amber "New best" pill under it when a saved time was beaten, else muted "Best m:ss"; row: Next (primary), Restart, Levels. On the daily: Levels (primary), Restart |
| Pause | 0.35 x 0.15 | Heading "Paused"; muted "Level N - m:ss"; row: Resume (primary), Restart, Levels |

Progress (best times) is saved in localStorage; the title board is the first unsolved level, so Continue picks up there.
The daily is a seeded "tinker" puzzle generated from the local date and played after the eight levels, as a ninth.

The title screen leaves the board live: touching a gear starts the level. Level 1 has no text at all: a translucent
cream ghost hand loops pinch, carry, drop from the first loose gear to its axle until the player first grabs a gear.
It shows the back of a right hand from the seat: a palm, four two-joint fingers reaching up the board, a thumb from the
near side, 78% opaque with an amber Fresnel rim so each finger's edge and the outline read against wood and brass.

## Goal badge (on the board)
- The target gear is marked by a fine amber ring on the board just outside its teeth (3 mm wide, 4 mm out), under the
  gears, so meshing neighbours pass over it.
- Beside it lies an 84 x 32 mm cream pill in the tray plane (so it faces the seat like the board), soft shadow, no border:
  the drawn turn arrow (an open circle with an arrowhead, ↻ clockwise or ↺ anticlockwise as the player sees the gear) and
  the rpm, number large in ink, "rpm" smaller in muted on the same baseline. Matched (the live train turns the target the
  right way within tolerance): the pill turns amber with ink text, the same moment the HUD line gets its amber check.
- Spot (src/goal.ts): the nearest place round the target gear, a little nearer the player preferred, on the board and
  clear of every pin, fixed and solution gear, the dial, balance wheel and bird; spots clear of the biggest tray gear on
  every free axle are tried first. Checked on every level and 120 dailies (tests/unit/goal.test.ts). Two draw calls.
- The HUD repeats it in words: "Turn the marked gear ↻ 60 rpm".

## Faults (on the board and the HUD)
Red is kept for one thing: a train that will not do what the goal asks. It never shows on a board that is just
unfinished. Rules in src/fault.ts.
- Jammed (the gears lock each other): every gear the solver calls jammed takes a warm red tint (its own material, a
  colour lerp from brass towards Jam plus a faint Jam glow, no other gear touched). The gear whose drop jammed the
  train lands, then the locked gears shudder for 0.5 s (a 16 Hz rattle about the axle, 3.5 degrees at most, and an 11 Hz
  wobble across it, 1.2 degrees, under 2 mm at the rim of the biggest gear, dying away quadratically) and hold still.
  The tint stays while the jam does and goes the moment a gear comes off or moves.
- Wrong way (the target turns at the right speed, against the arrow): the badge's turn arrow is drawn in Jam ink and
  the ring round the target turns Jam. The pill stays cream; it only goes amber when matched.
- The HUD's goal line gives way to one line: a small Jam ink disc with a cream "!", the lead in Jam ink bold and the
  fix in muted: "Jammed: these gears lock up", "Wrong way: add or remove a gear". Short enough for body size on the
  HUD; a wider system font shrinks it to fit, it never wraps. The goal line comes back as soon as the fault clears.
- The grind sound still plays on the drop that jams.

## Escapement and automaton (on the board)
- Near-right corner of the tray, on a bronze plate: the regulator dial (88 mm cream face, brass bezel) and a small brass
  balance wheel beside it. The dial face has a muted scale over a 160 degree sweep, a minus at the slow end and a plus at
  the fast end, and the target arc in amber tint (a quarter of the face's radius wide). No words.
- The knurled brass knob in the dial's centre carries a dark bronze needle; it turns one to one with the wrist roll
  (160 degrees end to end). The whole dial is the pinch target (40 mm grab radius); hover and grab tint the knob amber.
- Calibrate screen: the HUD stays up (clock stopped at solve). The balance wheel swings once per tick, the escapement
  gear glints amber on each tick and the train steps forward with it. With the needle in the band the arc turns a
  deeper amber and at once shows a quarter filled in full amber, filling the rest over the 0.8 s hold; a progress ring
  round the knob appears with it and sweeps once round over the hold, so the hold reads even with the needle over the arc.
- Desktop: press the knob and drag sideways (right = faster); the cursor shows a horizontal resize arrow over it.
- Level 1: until the knob is first turned, the ghost hand mimes the twist beside the dial, never over it: just off the
  tray's right edge, level with the dial and under the bird (`TWIST_CUE_AT`), it comes down onto a translucent ghost of
  the knob (knurl and ridge), pinches and rolls its wrist the way to turn. The roll is centred on square (half a radian
  against, half past), so the forearm swings half as far either way. Its screen box stays clear of the dial face all loop
  at 1440 x 900, 1280 x 720 and 375 x 812 (tests/e2e/hints.spec.ts).
- Automaton: a brass bird (1.6x its 6 cm model) on a perch, on a bronze bracket off the tray's right edge, standing upright
  whatever the tray's tilt. Upright on the tilted tray it leans up the board, so it sits off the board: on it, its head
  hung over the parts strip and its body among the gears. It must stay clear of every pin, gear and strip slot on every
  level and daily, seen face on (tests/unit/clockwork.test.ts). Idle it looks about; once calibrated it flaps and bobs
  on every tick.

## Reward
On solve every gear flashes amber and fades over 1.2 s and an amber ring bursts from the target gear; the escapement
starts ticking. On calibrated the gears flash again, a ring bursts round the dial, the train runs smoothly at its true
speeds and the bird flaps in time; the complete card shows 2 s later.

## Passthrough cues (XR)
- Table found: when a detected plane places the tray, a brass chapter ring (a watch dial's minute track: a bold amber
  band between fine brass lines, 60 ticks with longer amber five-minute marks, a soft amber-tint glow) lies in the tray's own
  plane just under the board top and expands from 15 to 32 cm radius over 1 s, out past the rim, turning a twelfth of a turn as it fades; a
  fainter echo ring follows 0.2 s behind. A restored spot gets one fainter, shorter-growing ring (1.2 s). The default
  fallback gets none. Colours: amber, brass (`#b08d57`, world only) and amber tint from src/palette.ts.
- Hands: depth-only spheres and capsules on the 25 joints, drawn first, so the real hand shows in front of the board.

## Light and material (world)
- Tray and ledge: walnut grain (a canvas texture, warm streaks on `#573822`), 18 mm thick with a 6 mm rounded bevel;
  the ledge sits a step below the board.
- Lights: a warm key (`#ffe2b0`, 1.5) from the upper left, off the camera's mirror angle so no gear glares; a warm rim
  (`#ffcf8a`, 2.2) from behind and above the tray that picks out teeth, the bevel and the bird; a hemisphere fill (0.6)
  and the room environment (0.75).
- Contact shadows, no shadow maps: a soft radial disc under every gear (one instanced draw call; a lifted gear's spreads)
  and a wide soft one under the whole tray.
- Render budget (src/budget.ts): at most 100 draw calls and 60k triangles a frame; level 5 draws 53 calls, 34k triangles (the goal badge and ring add two calls on every level).

## Desktop
The same in-world panels, clicked with the mouse (ray cast). The HTML chrome is only the small serif wordmark (top left)
and the Enter MR pill with its note (top right, so it never covers the board), in the same palette, over a warm walnut
radial vignette that lets the tray's shadow read.

The note's second sentence, "Drag to look around the tray.", fades out (0.4 s) at the player's first drag on the canvas
(an orbit, a gear or the knob) and stays gone for the session; once faded it gives up its room, so "Mixed reality needs
a Quest browser." sits flush right in two lines, as on a phone.

Loading: from first paint (plain markup and CSS in index.html, before the 5.5 MB SDK chunk arrives) a cream card in the
middle: two brass gears that tick one tooth per half second and rest, the eyebrow, the Display wordmark and a muted
"Winding the clockwork…". The page wordmark and Enter MR wait behind it. Once the world is built it fades out (0.5 s) and
takes no pointer; if startup fails it stops ticking and says "The clockwork would not start." with the reason. Reduced
motion: no ticking, no fades.

Keys (desktop): Enter presses the card's primary pill; Esc pauses, resumes from the pause card and goes back from level
select. Held keys do not repeat. The canvas is labelled for screen readers (role img).

Camera: from above, behind and a little right of the seated head (0.107, 0.225, 0.364) looking at (0.015, -0.08, -0.36):
a three-quarter view that shows the bevel, gear thickness and the bird standing up. Every card (title, select, HUD,
complete, pause) stays wholly in frame at 1280 x 720 on every level, the tallest card on the biggest strip included
(tests/e2e/polish.spec.ts). On desktop the cards lie face on to the camera (parallel to the screen, no keystone); in XR
they keep their tilt towards the head.

Narrow windows (phone portrait): the camera backs off along the same line until the level's board and strip, the dial,
the bird and the card on show fit with 12 px to spare, and anything reaching a top corner stays under the wordmark and
Enter MR (src/fit.ts). It never comes nearer than the tuned view, so landscape is unchanged. The wide level select needs
more room, so a phone eases back 0.4 s for it and in again after. Under 500 px the header tightens to 16 px from the
edges and the note keeps only "Mixed reality needs a Quest browser." in two balanced lines (tests/e2e/fit.spec.ts).

Phone cards (under 500 px wide and taller than 1.4x the width, outside XR): not a shrunk desktop card but a bottom sheet,
one job per screen with the primary pill under the thumb. Every card is 0.30 m of panel space drawn 16 px in from the
sides and 16 px over the bottom edge (343 px wide at 375, so about 1.14 px per mm), held in front of the camera whatever
the orbit. The same screens and buttons in one phone width: title Start 150 mm, Levels 106 mm; pause and complete a
100 mm primary and 72 mm secondaries; the HUD as wide as the others. Level select is a 5-column grid of 44 x 60 mm cells
in two rows: Back (chevron over the word, tile corners) top left where a phone keeps it, then 1-8 and Daily. Buttons and
eyebrows grow to 14 mm and 11 mm, so every button is 44 px or more and every word 12 px or more on screen
(tests/e2e/phone.spec.ts). The board fits the room between the header and the tallest card of its kind, and the view is
raised (a camera view offset) to centre it there, so it holds still from title to HUD to complete.
