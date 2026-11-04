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
| Title (the start panel's name) | 46 mm (42 mm on a phone) | Georgia, serif, 600 |
| Display (loading card wordmark) | 36 mm | Georgia, serif, 600 |
| Number XL (level number, time) | 24 mm | system sans, 700 |
| Heading | 18 mm | Georgia, serif, 600 |
| Button | 12.5 mm | system sans, 600 |
| Body / secondary ("N of 9 solved", HUD goal line, tile best times, "Best m:ss", pause line) | 13.5 mm | system sans, 500-700, muted |
| Eyebrow | 8.5 mm | system sans, 700, caps, +1 px tracking |
| Status pill ("Solved", "New best") | 10.8 mm | system sans, 700, caps, amber tint |

Secondary text is sized to read from the desktop camera (about 13 px at 1280 x 720), not just at 46 cm in the headset.

Times are m:ss; under 10 s they carry tenths (0:00.4, 0:07.2), truncated, so a quick solve never reads 0:00. The best times board is the exception: it always shows m:ss.t (0:08.0, 0:10.0) so every row has one format (`clockTenths`, src/ui.ts).

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
| Title (the start panel) | 0.42 x 0.17 | The first thing seen. See Start screen below: eyebrow, the Title face "ChronoGrip", a tagline and three big buttons on one row: Start game (primary, 130 mm; "Continue" once anything is solved), Options (90 mm) and High scores (110 mm), each 50 mm tall. On a phone 0.30 x 0.208: Start game across the foot (268 x 52 mm) under the thumb, Options and High scores side by side above it |
| Options | 0.44 x 0.15 | Over the start panel; see Options below: Heading "Options", one muted grab line, one row of Back, No timer, Sound, Reset progress. Reset progress swaps the row for Back, Keep it and Reset now (primary). On a phone 0.30 x 0.20: Back and Reset progress under the thumb, the two switches above |
| Level select | 0.684 x 0.15 | Heading "Levels" with muted "N of 9 solved" (Random is endless, so it is not counted); one row (the panel zone's pitch rules out two): Back pill, then nine 42 x 70 mm tiles (1-8, then "Daily" with an amber top edge, serif shrunk to fit) and the "Random" tile, 70 x 70 mm, last, after the daily or the shared puzzle: "Random" in serif, never smaller than "Daily", with the run's next step ("Step 3") under it in muted body type. The row is no wider than the nine 50 mm tiles were, so the outer tile still sits inside the 35 degree cone (tests/unit/ui.test.ts). A solved tile shows its best m:ss in muted text and a small amber check |
| HUD (playing, calibrate) | 0.30 x 0.096 | top: the goal line (muted "Turn the marked gear", the drawn turn arrow, ink bold "60 rpm", an amber check once matched); below: eyebrow "Level" over Number XL level (or "Daily"); Number XL time; the countdown ring and its "Left" time (see Time limit); round pause button right, kept on the bottom row so it is no higher in view |
| Level complete | 0.35 x 0.17 | amber "Solved" pill, then muted eyebrow "PAR m:ss"; Heading "Level N complete"; Number XL time right, an amber check just before it when under par, an amber "New best" pill under it when a saved time was beaten, else muted "Best m:ss"; row: Next (primary), Restart, Levels. On the daily: Levels (primary), Restart. Over par: see Time limit |
| Initials | 0.58 x 0.14 | Over the complete card, before it, when a solve makes its board's top ten (see Best times). Amber tint pill "#3 BEST TIMES"; Heading "Level 4" or "Random · Step 6" at the left, the time in Number XL at the right; then the one button row: three slots, each a 30 x 46 mm Cream deep rounded slot holding one letter in Number XL (Ink), the slot typing fills ringed in Amber (3 mm, the hover ring's look), a 40 x 46 mm down arrow touching its left (3 mm) and an up arrow touching its right, so slot and arrows read as one control, 14 mm between slots; then Save (the primary, 80 mm) and Skip (60 mm). One row only, so every target stays inside the panel zone (the row is about as wide as before, widest edge about 31 degrees yaw against 35). On a phone 0.30 x 0.29: each slot is a 81 x 40 mm Cream deep slot with an up pill (81 x 44 mm) 3 mm over it and a down pill 3 mm under it, the Amber ring on the active one; Save (150 mm) and Skip (106 mm) under the thumb |
| High scores (the best times board) | 0.48 x 0.22 | Heading "High scores" at the top left with a tab strip just after it (see Start screen, High scores); the top ten as two columns of five rows (rank in muted 12 mm, initials in ink bold, the time in ink 600 so the digits stack, the date muted "4 Nov"; a Random row shows "Step 6" before the time). Every row's time is m:ss.t (0:08.0, 0:10.0, 1:01.5), right-aligned so the digits stack, and the date follows it 12 mm after its right edge, so no wide gap opens between them); an empty board shows one muted line in the middle of the rows, "No times yet. Solve level 3 to set one." (Random: "Solve a Random puzzle"). One row: Back pill at the left, then at the right a round arrow, the board's name in serif ("Level 3", "Random") and a round arrow. On a phone 0.30 x 0.29: one column of ten rows at 11.5 mm (13 px) with the same time-then-date order, the same row of Back and arrows under the thumb |
| Pause | 0.42 x 0.15 | Heading "Paused"; muted "Level N - m:ss"; row: Resume (primary), Restart, Levels, "No timer" toggle. The card is wider than the others so the fourth pill stays on the bottom row, inside the panel zone (src/ui.ts) |

## Start screen (src/ui.ts `title`, src/panels.ts, tests/unit/start.test.ts, tests/e2e/start.spec.ts, tests/e2e/dev-start.spec.ts)
The first card on desktop, phone and in XR, over the live board and the workshop scenery: a game title, not a form.
- Layout, top to bottom, centred: eyebrow "A CLOCKWORK PUZZLE" (Eyebrow type, Muted, +3 px tracking) between two short Amber
  rules (12 mm x 1.2 mm; the one accent, here as a flourish only); the game name in the Title face (46 mm, Georgia serif 600,
  Ink; shrunk to fit if a font is wide); one tagline line, "Mesh the gears. Wake the bird." in Body type, Muted; then the buttons.
- Buttons: one clear primary, Start game, near-black Ink pill with cream words (reads "Continue" once any level is solved, as
  before), and two Cream deep secondaries, Options and High scores. They are bigger than the 46 mm pills elsewhere: 50 mm tall
  in XR and on a desktop (their top edge stays under the panel zone's 18 degrees, tests/unit/start.test.ts), 52 mm on a phone
  (59 px), with Button type at 1.1x (13.75 mm). Gap 12 mm. Wide: one row, primary 130 mm, Options 90 mm, High scores 110 mm.
  Phone: Start game full width at the foot under the thumb, Options and High scores half a row each above it.
- Start game opens level select, whose Back returns here. Touching a gear on the board still starts the level.
- The settings that used to be title pills (No timer) live only in Options; the pause card keeps its own No timer pill.
- XR: every edge of every target is inside the panel zone (yaw 35, pitch 18, 60 cm) above every level, checked in
  tests/unit/start.test.ts; the card is 0.17 m tall (a taller card pushes the desktop camera back at 1440 x 900).
- Phone: 0.208 m tall, no taller than the old title sheet, so the camera and the board's room are as before; every button is 44 px or more and every word 12 px or more.

### Options
- Heading "Options" (Heading type) and one static muted line saying how to grab a gear, set by input: in XR "Grab a gear:
  pinch it, carry it, let go."; on a phone "Grab a gear: touch and drag it."; otherwise "Grab a gear: click and drag it." There is no hint switch (the ghost hand
  teaches level 1 on its own), so the line is the whole hint section.
- One row of targets, Back first: "No timer" (toggle, key `chronogrip.relaxed.v1`, see Time limit), "Sound" (toggle, on by
  default, key `chronogrip.sound.v1`, `0` is off; off makes no voice at all), and "Reset progress". Toggles read as before: Cream
  deep and an empty circle when off, Amber tint and a check when on. Both settings are saved and read at load.
- Reset progress asks first. The card turns to the heading "Reset progress?" over the line "Clears levels and Random. Best
  times stay." and the row becomes Back, Keep it (secondary) and Reset now (the one primary). Keep it returns to the options as
  they were; Back leaves Options; Reset now clears the saved level progress (best times on the tiles, passes, so Continue
  reads Start game again and level 1 is on the board) and the Random run's step (`chronogrip.random.v1` back to step 1), then
  returns to the start panel. The high scores boards (`chronogrip.scores.v1`) are kept: they are a separate store, and a
  reset is a fresh start on the levels, not a wipe of names on the boards. No red: the destructive step is a plain pill, the primary.
- Phone: Back and Reset progress (or Reset now and Keep it, with Back above) under the thumb, the two switches above them.
- Test hooks: `__chrono.options` (while up: confirm, relaxed, sound), `__chrono.soundOn`, `__chrono.card.screen === 'options'`.

### High scores
The best times board (see Best times) reached from the start panel's High scores button, headed "High scores". Just after
the heading, on a phone only, is a tab strip (130 mm wide). On a phone the strip holds both tabs, LOCAL 58 mm and GLOBAL 60 mm, 40 mm tall (44 px), 12 mm apart.
On a wide card (desktop and XR) both tabs are 50 mm x 46 mm buttons in the bottom row between Back and the level arrows, 12 mm apart, so every tab is
inside the hand's reach like any other button (the heading line is above the panel zone). Selected: Amber tint pill; unselected: muted words, no fill.
Both are buttons (`tab-local`, `tab-global`), so mouse, tap, poke and ray work as on any other. The card keeps its size.
GLOBAL shows the shared top ten in the same rows as LOCAL (src/global.ts): "Loading global scores" in the middle while it asks; when the
backend is offline, errors or takes over 4 s, the local rows with one muted line, "Global scores offline" (at the right of the heading's line; on a
phone in the free half of the first row). Never an error card. Back returns to the start panel.

## Time limit (src/timer.ts, tests/e2e/timer.spec.ts)
Every level, the daily and a shared puzzle has a par time: 60 s plus 25 s per gear to place, 20 s per compound pair and
10 s per decoy, never under 120 s, in steps of 5 s (levels 1-8: 120, 120, 150, 120, 175, 170, 210, 190). Solved at or
under par is a pass; over it the bird still wakes but the card says over time.
- Countdown ring (HUD, bottom row between the clock and the pause button): a 19 mm ring, 3 mm stroke, Cream deep track with
  an Amber arc for the share of par left, sweeping down from twelve o'clock; beside it eyebrow "LEFT" over the whole
  seconds left in body type 700, Ink. It stays inside the card at 1440 x 900 and 375 x 812. At zero the arc is gone and it
  reads "OVER" over "+m:ss" counting up, still Ink and Muted: red is kept for faults, so running out is calm, not alarming.
  The clock still stops when the train is solved, and in calibrate and pause.
- Complete card, over par: the status pill reads "OVER TIME" (the same Amber tint pill as "Solved") with "PAR m:ss" beside it;
  the row is Retry (the primary, restarts the level), Next, Levels. The best time is saved either way. Under par: "Solved",
  "PAR m:ss" and the amber check before the time.
- "No timer" toggle (accessibility, the Relaxed mode): a pill labelled "No timer" in button type, so a first-time player
  knows what it does; the stored key and test hooks keep the name `relaxed`. Off: Cream deep with an empty
  Muted circle before the words. On: Amber tint fill, Amber tint ink words and a small Amber check disc, so the state reads
  without colour alone; hover is the usual Amber ring. It lives in Options (see Start screen) and on the pause card (fourth
  pill; top right on a phone, where the row is full). Default is the timer on; the choice is saved (localStorage
  `chronogrip.relaxed.v1`). While on: no ring, no par, no "over time", and the solve is not marked pass or over.
- Pass or over is saved per level next to the best times (`outcome` in the progress save, a pass is never undone by a slower
  run); old saves without it load as before.

Puzzle code line and Copy link (tinker puzzles only, never on levels 1-8): under the heading, left aligned on the row of the
"New best" pill / "Best" line, a muted line "Puzzle code CY9J" in body type (600, Muted), not a box or pill. The row gets a
third pill, "Copy link", after Levels and Restart: a secondary pill, so the near-black primary stays the one action. It
is outside XR only (desktop and phone) and reads "Copied" for 2.5 s after a copy. If the clipboard refuses, the code line
becomes the link itself, shrunk to the card's width if long, and the pill keeps its label. On a phone the primary gives
8 mm to the Copy pill (92 / 72 / 82 mm) so "Copy link" fits at 14 mm type. A shared puzzle (`?seed=`) is neither a numbered level nor the daily:
the complete card reads "Shared puzzle complete" (shrunk to stop short of the time on a phone), the pause card "Shared
puzzle", the HUD eyebrow "Shared" over "Puzzle" (the time moves right), and its level-select tile "Shared" in serif like
"Daily", without the amber edge, shrunk to fit the tile. An invalid code shows one cream pill, centred at the top of the
page (the hint pills' look, ink 600 text), "That puzzle code didn't work. Pick any level to play.", for 8 s; the title
board is level 1, so the words stay true.
Tests: tests/e2e/seed.spec.ts (incl. 375 x 812).

## Random mode (src/random.ts, tests/e2e/random.spec.ts)
An endless run after the levels, opened from the "Random" tile on level select (the title row has no Random pill).
The player plays a generated puzzle of a step; step 1 is like level 1 (one idler, one decoy), each step up adds an axle to
fill, a compound pair or a decoy, 12 steps in all, and past step 12 the puzzles stay as hard as that. Par (see Time limit)
climbs with the step: 120, 120, 120, 130, 165, 175, 190, 200, 235, 245, 280, 290 s.
- Adapt rule, on the first solve of a puzzle: solved within half of par, up two steps; at or under par, up one; over par,
  hold, and over par twice in a row eases one step (never below 1). With No timer, one step up. Retry after going over does
  not count again. The step is saved (localStorage `chronogrip.random.v1`, `{ step, slow }`); a Random solve is never a
  level progress entry.
- HUD: no column split. One eyebrow line "RANDOM · STEP 3" (eyebrow type, Muted, 12 px or more on a phone) with the time in
  Number XL under it at the left and no "TIME" word. The countdown ring's centre sits at 183 mm, 4 mm from its words, which
  shrink to stop 6 mm short of the pause button when "+10:23" runs long; a shared puzzle's time sits at 80 mm. Nothing on
  the HUD overlaps at 375 x 812 and words on a line keep 10 px apart, "STEP 12" with "12:34" and "0:08.8" included, for
  level 8, the daily and a shared puzzle too (tests/e2e/random.spec.ts). Complete card:
  title "Random · Step 3 complete", the puzzle code line and Copy link as for any tinker puzzle; the row is Next puzzle
  (primary), Restart, Copy link; over par Retry leads and Next puzzle follows. Pause card reads "Random · Step 3  ·  m:ss".
  On a phone the row gives Next puzzle 104 mm, Restart or Retry 62 mm and Copy link 80 mm.
- The puzzle code carries the step in its top 4 bits (28 random bits below), so `?seed=CODE` opens the very same puzzle
  (as a "Shared puzzle"); a code with top bits 0 is a plain tinker puzzle, so the daily's and older shared codes are unchanged.

## Best times (src/scores.ts, tests/e2e/scores.spec.ts)
A top-ten board for each hand-made level (1-8) and one for Random, kept on this device only (localStorage
`chronogrip.scores.v1`, `{ version: 1, initials, boards }`). The daily and a shared puzzle change every day or are
one-offs, so they get no board and never ask for initials. Level progress (the best time on the tile, Continue) is
untouched: it stays in `chronogrip.progress.v1`.
- Entry: a level entry is `{ name, ms, date }`, ranked by time, fastest first. A Random entry is `{ name, step, ms, date }`,
  one Random solve (the step solved and that solve's time), ranked by step, highest first, then time. The earlier date
  wins a tie, and a later entry with the same everything ranks after the one already there. `date` is the local day
  (YYYY-MM-DD), shown "4 Nov". Each board keeps ten: insert, sort, trim.
- Names are exactly three capital letters A-Z. Anything else is dropped on load and a short name is padded with A, so a
  hand-edited save never shows a lowercase letter or a digit. The last initials used are saved with the boards and come
  back as the default; a new player starts on AAA.
- Qualifying: a solve that would reach a board's top ten (an empty board always does) shows the Initials card (see
  Screens) before the complete card, with its rank, prefilled with the last initials. Save writes the entry and shows the
  complete card; Skip (Esc on a keyboard) shows it without saving; neither touches the level's best time, the pass or
  over-time mark, the Random step or the Next puzzle button. A solve that misses a full board goes straight to the
  complete card. Every solve of a level can qualify, retries included; a Random puzzle only counts on its first solve (a
  Retry after going over par does not add a second row for the same puzzle). With No timer the clock still ran, so
  those solves count like any other.
- Initials: desktop and phone with a keyboard type letters A-Z, filling the slots left to right (anything else is ignored;
  once all three are in, typing waits for Backspace), Backspace goes back a slot so the next letter replaces it, Enter
  presses Save. The up and down arrows step one letter through the alphabet (Z wraps to A) and make that slot the one
  typing fills. In XR the arrows, Save and Skip are poked or pinched like any other button.
- High scores: the start panel's High scores button opens it; it lies over the start panel, and starting a level (touching a
  gear) closes it. It opens on the board of the level last started (Random counts), else level 1. The arrows cycle level 1 to
  8, then Random, then round to 1; Back (or Esc) returns to the title. An empty board says how to set a time.
- Phone: one job per screen. The title is two rows so each pill is 44 px or more tall at 14 mm type; the board is one
  column of ten at 13 px, since two columns of five would leave too little room for a name, a step, a time and a date.
  The sheet lies over the foot of the board without moving the camera. Back, the arrows, Save and Skip are all in the
  lower half, under the thumb (tests/e2e/scores.spec.ts at 375 x 812).
- XR: every target is on the one button row, so each sits inside the panel zone, edge to edge, above every level
  (tests/unit/ui.test.ts). The tallest panel is 0.22 m (the board), words only above the row.
- Test hooks: `__chrono.scores` (the boards as saved), `__chrono.initials` (the card up: board, rank, letters, cursor).

Progress (best times) is saved in localStorage; the title board is the first unsolved level, so Continue picks up there.
The daily is a seeded "tinker" puzzle generated from the local date and played after the eight levels, as a ninth.

The start panel leaves the board live: touching a gear starts the level. Level 1 has no text at all: a translucent
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
- Small table: when the detected table cannot hold the tray, the tray stays at the default spot and a cream pill (0.03 m high,
  the hand hint's style: ink 600 body text, no icon) reads "Table's a bit small, tray kept in easy reach". The floating pills
  are sized to their words (measured, 2 cm side padding) and share the width of the longer one; they stack centred over the
  card with a 12 mm gap to the card and between each other, the hand hint nearest the card. The line goes when a table that
  fits is found or the session ends.
- Hands: depth-only spheres and capsules on the 25 joints, drawn first, so the real hand shows in front of the board.

## Light and material (world)
- Tray and ledge: walnut grain (a canvas texture, warm streaks on `#573822`), 18 mm thick with a 6 mm rounded bevel;
  the ledge sits a step below the board.
- Lights: a warm key (`#ffe2b0`, 1.5) from the upper left, off the camera's mirror angle so no gear glares; a warm rim
  (`#ffcf8a`, 2.2) from behind and above the tray that picks out teeth, the bevel and the bird; a hemisphere fill (0.6)
  and the room environment (0.75).
- Contact shadows, no shadow maps: a soft radial disc under every gear (one instanced draw call; a lifted gear's spreads)
  and a wide soft one under the whole tray.
- Render budget (src/budget.ts): at most 100 draw calls and 60k triangles a frame; level 5 draws 67 calls, 36.6k triangles on desktop with the workshop scenery (56 and 34.7k without it; the scenery adds 11 calls and 1.9k triangles, and in MR only the four props).

## Scenery (src/scenery.ts, tests/unit/scenery.test.ts, tests/e2e/scenery.spec.ts, tests/e2e/dev-scenery.spec.ts)
A low-poly clockmaker's workshop, built in code (no models), all colours from the `SCENE` palette in src/palette.ts.
- Desktop and phone (inline): a plank workbench whose top sits 4 mm under the tray's lowest edge, two wedge cheeks holding
  the tilted tray up, a back wall of dark plank 0.95 m behind the head with a wainscot and rail, four shelves (honey and
  glass jars, a leaning row of books, a small clock with a brass bell, a hammer, a tin), loose props on the bench (books,
  honey jar, mug, brass gear) and a desk lamp on the left. Walnut and plaster stay dark and low in saturation so the cream
  panels and the brass gears read first; the lamp, its halo (additive, from a generated glow texture) and the wall wash
  carry the warm highlight. There is no scene light for the lamp (a point light costs every gear and panel pixel on software GL); the glow is faked. A dark fog (1.6-3.6 m) lets the wall
  recede on a phone's longer eye distance. `scene.background` stays null; the page's walnut vignette shows past the wall.
- Cost: vertex-coloured, flat-shaded and merged, one mesh per part and material: 11 meshes, 1.9k triangles (the MR props: 4 meshes, 620 triangles).
- MR (immersive-ar): passthrough is the only background. No backdrop, wall, shelves, fog, lamp light or `scene.background`
  (the lamp is only its glow meshes, hidden with the group). Four small props (oil can,
  screwdriver, loupe, spare-gear dish, each under 12 cm) stand on the real table, 26-45 cm to either side of the tray's
  centre, outside the comfort cone and the panels' cone at every table height, and only once a table plane places the tray.
  Their colours avoid the brass hue the "table found" ring is measured by.

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

Keys (desktop): Enter presses the card's primary pill (Start game on the start panel); Esc pauses, resumes from the pause card and goes back from level
select, Options and High scores. Held keys do not repeat. The canvas is labelled for screen readers (role img).

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
the orbit. The same screens and buttons in one phone width: the title in two rows (see Screens); pause and complete a
100 mm primary and 72 mm secondaries; the HUD as wide as the others. Level select is a 5-column grid of 44 x 60 mm cells
in two rows: Back (chevron over the word, tile corners) top left where a phone keeps it, then 1-8 and Daily, and under them
the Random tile as a full-width bar (a third row, 46 mm tall, "Random" in serif with the muted "Step 3" beside it; see Random mode). Buttons and
eyebrows grow to 14 mm and 11 mm, so every button is 44 px or more and every word 12 px or more on screen
(tests/e2e/phone.spec.ts). The board fits the room between the header and the tallest card of its kind, and the view is
raised (a camera view offset) to centre it there, so it holds still from title to HUD to complete.
