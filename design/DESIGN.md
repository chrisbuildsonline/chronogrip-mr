# ChronoGrip UI design

The board is the game; UI is a quiet cream card that floats above it. Warm walnut and brass world, one card at a time.

## Colour
| Role | Hex | Use |
|---|---|---|
| Walnut | `#4a3322` | tray, ledge (world) |
| Brass | `#b08d57` | gears (world) |
| Cream | `#f6efe2` | every panel surface |
| Cream deep | `#ebe0cc` | secondary buttons, level tiles |
| Ink | `#1c1712` | titles, numbers, the primary pill |
| Muted | `#7d6f5f` | secondary text, eyebrows |
| Amber | `#d99a2b` | the one accent: selection, progress, hover ring, reward glow |
| Amber tint | `#f3dcae` on `#7a4e0e` | status pills ("Solved", best times) |
| Shadow | `rgba(20,12,4,0.35)` | soft drop shadow, 30 px blur, 10 px down |

No hairline borders. Depth comes from the shadow and the cream-on-walnut contrast.

## Type (panel millimetres; canvas at 3 px per mm)
| Style | Size | Face |
|---|---|---|
| Display (game title) | 36 mm | Georgia, serif, 600 |
| Number XL (level number, time) | 24 mm | system sans, 700 |
| Heading | 18 mm | Georgia, serif, 600 |
| Button | 12.5 mm | system sans, 600 |
| Body / secondary ("N of 6 solved", tile best times, "Best m:ss", pause line) | 13.5 mm | system sans, 500-700, muted |
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
| Level select | 0.488 x 0.15 | Heading "Levels" with muted "N of 6 solved"; one row: Back pill, then six 50 x 70 mm tiles (1-5, then "Daily" with an amber top edge). A solved tile shows its best m:ss in muted text and a small amber check |
| HUD (playing, calibrate) | 0.23 x 0.062 | eyebrow "Level" over Number XL level (or "Daily"); Number XL time; round pause button right |
| Level complete | 0.35 x 0.17 | amber "Solved" pill; Heading "Level N complete"; Number XL time right, an amber "New best" pill under it when a saved time was beaten, else muted "Best m:ss"; row: Next (primary), Restart, Levels. On the daily: Levels (primary), Restart |
| Pause | 0.35 x 0.15 | Heading "Paused"; muted "Level N - m:ss"; row: Resume (primary), Restart, Levels |

Progress (best times) is saved in localStorage; the title board is the first unsolved level, so Continue picks up there.
The daily is a seeded "tinker" puzzle generated from the local date and played as a sixth level.

The title screen leaves the board live: touching a gear starts the level. Level 1 has no text at all: a translucent
cream ghost hand loops pinch, carry, drop from the first loose gear to its axle until the player first grabs a gear.
It shows the back of a right hand from the seat: a palm, four two-joint fingers reaching up the board, a thumb from the
near side, 78% opaque with an amber Fresnel rim so each finger's edge and the outline read against wood and brass.

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
- Level 1: the ghost hand comes down onto the knob, pinches and rolls its wrist the way to turn, until the first grab.
- Automaton: a brass bird (1.6x its 6 cm model) on a perch, on a bronze bracket off the tray's right edge, standing upright
  whatever the tray's tilt. Upright on the tilted tray it leans up the board, so it sits off the board: on it, its head
  hung over the parts strip and its body among the gears. It must stay clear of every pin, gear and strip slot on every
  level and daily, seen face on (tests/unit/clockwork.test.ts). Idle it looks about; once calibrated it flaps and bobs
  on every tick.

## Reward
On solve every gear flashes amber and fades over 1.2 s and an amber ring bursts from the target gear; the escapement
starts ticking. On calibrated the gears flash again, a ring bursts round the dial, the train runs smoothly at its true
speeds and the bird flaps in time; the complete card shows 2 s later.

## Light and material (world)
- Tray and ledge: walnut grain (a canvas texture, warm streaks on `#573822`), 18 mm thick with a 6 mm rounded bevel;
  the ledge sits a step below the board.
- Lights: a warm key (`#ffe2b0`, 1.5) from the upper left, off the camera's mirror angle so no gear glares; a warm rim
  (`#ffcf8a`, 2.2) from behind and above the tray that picks out teeth, the bevel and the bird; a hemisphere fill (0.6)
  and the room environment (0.75).
- Contact shadows, no shadow maps: a soft radial disc under every gear (one instanced draw call; a lifted gear's spreads)
  and a wide soft one under the whole tray.
- Render budget (src/budget.ts): at most 100 draw calls and 60k triangles a frame; level 5 draws 53 calls, 34k triangles.

## Desktop
The same in-world panels, clicked with the mouse (ray cast). The HTML chrome is only the small serif wordmark (top left)
and the Enter MR pill with its note (top right, so it never covers the board), in the same palette, over a warm walnut
radial vignette that lets the tray's shadow read.

Camera: from above, behind and a little right of the seated head (0.107, 0.225, 0.364) looking at (0.015, -0.08, -0.36):
a three-quarter view that shows the bevel, gear thickness and the bird standing up. Every card (title, select, HUD,
complete, pause) stays wholly in frame at 1280 x 720 on every level, the tallest card on the biggest strip included
(tests/e2e/polish.spec.ts).
