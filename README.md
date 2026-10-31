# ChronoGrip MR

A seated mixed-reality clockwork puzzle you play with your bare hands: pinch brass gears onto axles, then twist your wrist to regulate the escapement until a little automaton bird comes to life.

**Play it:** https://chrisbuildsonline.github.io/chronogrip-mr/ (open it in the Quest browser and press **Enter MR**; any desktop browser gets a mouse-driven preview).

Built for the [Meta VR Start Developer Competition 2026](https://start-developer-competition-26.devpost.com/). **Track:** Gaming. **Division:** New Experience.

## What it is and who it is for

ChronoGrip is a small puzzle game for people who are sitting down: on a plane, on a bus, on the couch. Everything sits on a 40 x 30 cm tray in front of you, within arm's reach and inside a comfortable view cone (the tests check every part of every level against the cone in `src/seat.ts`), so you never stand, turn or stretch. You see your real surroundings through passthrough. There are five hand-made levels and a new seeded daily puzzle each day.

## Inspiration

Most VR games want you standing in an empty room. A lot of the time you are not: you are in an airplane seat with your forearms on the armrests, or on a bench at a bus stop, with not much space in front of you. We wanted something you could play right there.

A pocket watch felt right. It is small, it sits on your lap, and fixing one is all fingertips and wrists. So ChronoGrip is a pocket-sized clockwork repair: a brass tray stands on your lap tray or table in passthrough, and you fix it with your hands only. No controllers, no standing, no turning around.

## How to play (Quest browser)

1. Open the live URL and press **Enter MR** (an immersive-ar session in passthrough; hand tracking and plane detection are requested as optional features).
2. **Tray placement.** For the first 3 seconds the game looks for a detected horizontal surface (a table or tray table) 25-70 cm below your head, within 70 cm ahead and at least 25 cm across. If it finds one, the tray stands on it (with a riser if the surface is low). Otherwise the tray takes the default comfort pose: 32 cm ahead of and 19 cm below your head, tilted 50 degrees towards you.
3. **Title card.** A cream card floats just above the board: **Start** (or **Continue** once you have solved something) and **Levels**. Touching a gear on the board also starts the level.
4. **Place gears.** Loose gears wait on a ledge along the far edge. Pinch one (thumb and index tip together, within 4 cm of the gear) to pick it up, carry it and let go over an axle. While you carry it, the axles it could go on pulse with an amber ring. Released within 2.5 cm of a free axle it snaps on with a click; anywhere else it floats back to the ledge. Connect the driver to the target gear so it turns the right way at the right speed. A loop of gears that cannot turn jams and grinds.
5. **Calibrate the escapement.** When the train is right, the level clock stops and the escapement in the near-right corner starts ticking. Pinch the regulator dial and roll your wrist like turning a key: the knob turns one to one with your wrist (160 degrees end to end), clockwise ticks faster, anticlockwise slower, from 1 to 5 ticks a second. Hold the needle in the amber target band (within 10% of the target rate) for 0.8 s.
6. **Reward.** The gears flash, the train runs at its true speeds, the brass bird on its perch flaps and bobs on every tick, and the complete card shows your time, with **Next**, **Restart** and **Levels** (on the daily: **Levels** and **Restart**).

In level 1 there is no text: a translucent ghost hand shows the pinch, carry and drop until you first grab a gear, then shows the wrist twist on the dial.

## Controls (hands only)

| Action | How |
| --- | --- |
| Pick up, carry, drop a gear | Pinch it, move, open the pinch |
| Press a card button | Poke it with your index tip, or start a pinch on it. A hand carrying a gear presses nothing |
| Pause | The round pause button on the in-game card; opening the headset menu also pauses |
| Turn the regulator | Pinch the dial and roll your wrist |
| Recenter the tray | Pinch with both hands and hold for 1 second (not while carrying a gear) |

A free hand makes a loose gear glow when it comes within 5 cm of it, and the gear or axle your head points at gets a soft tint. If no hands are tracked, a hint above the card reads "Put the controllers down and use your hands": the game is played with hands, not controllers.

## Desktop preview (mouse)

The same scene and cards run in any desktop browser with WebGL. Where the browser cannot start an immersive-ar session, **Enter MR** stays disabled with the note "Mixed reality needs a Quest browser".

- **Click** a card button to press it.
- **Drag** a loose gear across the tray and drop it on an axle.
- **Drag** empty space to orbit the view; **scroll** to zoom.
- **Calibrate:** press the dial's knob and drag sideways (right is faster); the cursor turns into a sideways arrow over it.
- Switching to another tab pauses the level.

## Saved progress

- Best times are saved in the browser's localStorage (key `chronogrip.progress.v1`); corrupt or blocked storage starts clean.
- The title card says **Continue** once any level is solved, and it starts the first level you have not solved.
- **Levels** shows six tiles: levels 1-5 and **Daily**. Solved tiles show your best time and a check. Beating a saved time shows **New best**.
- The **Daily** is a puzzle generated from today's local date: the same for everyone on a given day, different the next. If the game is left open past midnight, the new daily swaps in the next time you are on the title or level select.

## Testing it (for judges)

**On a Quest 3 (the real thing).** Open https://chrisbuildsonline.github.io/chronogrip-mr/ in the Quest browser. Put the controllers down, sit with a table or tray table in front of you and press **Enter MR**. Then follow [How to play](#how-to-play-quest-browser): pinch a gear onto its axle, then pinch the dial and roll your wrist.

**In any desktop browser (preview).** Open the same URL. Enter MR stays disabled, but the whole game runs with the mouse (there are no keyboard controls):

- Click **Start**, then drag the loose gear from the ledge onto a free axle.
- When the escapement starts ticking, press the dial's knob and drag sideways (right is faster) until the needle sits in the amber band.
- Drag empty space to orbit, scroll to zoom.

**Locally with Docker.** No Bun or browsers needed on the host:

```
bun run docker:build             # or: docker build -t chronogrip-mr .
docker run --rm -p 4173:4173 chronogrip-mr
```

Then open http://localhost:4173.

**The test suite.** `bun run check` runs the typecheck, the unit tests and both Playwright e2e projects (after `bun install`; the e2e run takes about 7 minutes on software GL). `bun run docker:test` runs the same inside the image.

## Run, build, test

Needs [Bun](https://bun.sh).

```
bun install
bunx playwright install chromium   # once, for the e2e tests
bun run dev         # dev server with the WebXR emulator (Quest 3) injected
bun run build       # production build into dist/
bun run preview     # serve dist/ on http://localhost:4173
bun run typecheck   # tsc --noEmit
bun run test        # unit tests (Vitest)
bun run e2e         # Playwright, both projects; starts its own servers (about 7 minutes on software GL)
```

Or in Docker, with no browsers or Node tools on the host:

```
docker build -t chronogrip-mr .
docker run --rm -p 4173:4173 chronogrip-mr
```

That serves the production build at http://localhost:4173 (`bun run docker:build` and `bun run docker:serve` do the same, in the background; `bun run docker:stop` stops it).

`bun run docker:test` runs the whole suite in the image: typecheck, the unit tests and both e2e projects (about 10 minutes, mostly the e2e run).

`bun run e2e` runs two Playwright projects (pick one with `bun run e2e --project=preview` or `--project=dev`):

- **preview**: the production build on port 4173, no emulator, mouse only. Page load with a clean console, rendering, drag-and-drop gears, hover hints, the level flow, calibration, saved progress and the daily, sound, and the render budget on every level.
- **dev**: the dev server on port 5174 with the IWER emulator posing as a Quest 3. Entering the XR session, the default tray pose, the hands hint, pinch grab and drop, head gaze and hand glow, two-hand recenter, poking card buttons, pause from the headset menu and on session end.

The unit tests cover the gear geometry, the train solver, the levels, tray placement, the regulator, the flow (including Given/When/Then acceptance tests), saved progress and the daily generator, with fuzz tests for the gear geometry, the train solver and level parsing.

Deploys: `.github/workflows/deploy.yml` typechecks, runs the unit tests, builds and publishes `dist/` to GitHub Pages on every push to `main` (the repo's Pages source must be set to "GitHub Actions"). The build uses relative asset paths, so it works under `/chronogrip-mr/`.

## How we built it

ChronoGrip is a web app: TypeScript, IWSDK (`@iwsdk/core`, the Immersive Web SDK) for the WebXR `immersive-ar` session, three.js for rendering and Vite for the build. It runs in the Quest browser with nothing to install.

- **Hands.** Every frame `mr.ts` reads the thumb tip, index tip and wrist joints straight from the XR frame. Tips closer than 2 cm are a pinch; the index tip pokes card buttons; the wrist's roll turns the regulator.
- **Tray placement.** With plane detection, `anchor.ts` stands the tray on the nearest usable horizontal plane, adding a riser if it is low. If no plane qualifies, the tray takes a fixed comfort pose in front of you.
- **Gears.** `gear.ts` draws real involute tooth outlines in code and extrudes them into meshes. There are no model files.
- **Gear train.** `train.ts` is a deterministic solver: it walks the meshed gears, works out each speed and direction, and reports a jam when a loop disagrees or gears collide.
- **Escapement.** `escapement.ts` maps wrist twist to a tick rate from 1 to 5 ticks a second, and checks you hold it in the target band.
- **Sound.** `sound.ts` synthesises every tick, click, grind and chime with WebAudio oscillators and noise; the ticks are placed at the dial.
- **Tests.** Vitest unit, fuzz and Given/When/Then tests cover the geometry, solver, levels, placement and flow. Playwright e2e tests drive the game in the IWER emulator posing as a Quest 3, with hands. A Docker image serves the build and runs the whole suite.

### Code map

| Module | Does |
| --- | --- |
| `main.ts` | Wires everything: input, flow, per-frame update |
| `config.ts`, `enter.ts` | The immersive-ar session options; Enter MR |
| `mr.ts`, `anchor.ts` | Per-frame hand joints (pinch, poke tip, wrist), plane search and tray placement, two-hand recenter |
| `seat.ts` | Seated layout, comfort cone, tray coordinates |
| `gear.ts` | Involute spur gear outlines generated in code, extruded into meshes |
| `train.ts` | Deterministic gear-train solver: speeds, directions, jams, collisions |
| `levels.ts`, `tinker.ts` | The five levels and the seeded daily generator |
| `grab.ts`, `hover.ts` | Pick and snap rules; gaze, hand glow and valid-axle hints |
| `escapement.ts`, `clockwork.ts` | The regulator (wrist twist to tick rate); the dial, balance wheel and bird |
| `flow.ts`, `progress.ts` | Title, play, calibrate, complete, pause, level select; level clock; saved best times |
| `ui.ts`, `panels.ts` | In-world card layouts, poke and pinch hits; canvas-drawn cards |
| `sound.ts` | Procedural WebAudio: ticks positioned at the dial (HRTF), click, grind, chime |
| `ghost.ts`, `tween.ts`, `scene.ts`, `budget.ts` | Ghost hand tutorial; easing; scene build; render budget |

- **Render budget:** at most 100 draw calls and 60,000 triangles a frame while playing (measured at 47-52 calls and 25,000-33,000 triangles in software GL); gears with the same tooth count share one geometry, and the hover and sound updates in the frame loop reuse scratch vectors. An e2e test checks every level and the daily.
- **Headless XR tests:** the IWER emulator (`@iwsdk/vite-plugin-iwer`) is injected by `bun run dev` only, so the dev e2e project can drive hands and pinches without a headset. Production builds do not include it.

## Challenges

- **No pinch point to read.** IWSDK's grab system can turn a pinch into a generic grab, but we needed the pinch point, the index tip for pokes and the wrist's roll. So we switched its grabbing off and read the joints ourselves.
- **Testing hands without a headset.** The IWER emulator has hands, but a test has to set each hand's pinch value and move the emulated hand one step at a time, then wait for the game to see it. Shared helpers for pinch, carry and poke let the whole demo story run headless, end to end.
- **Slow software GL.** In containers there is no GPU, so WebGL runs on the CPU. Too many parallel workers starved each other into timeouts. We cut the worker count and gave each e2e test 90 to 120 seconds.
- **Seated comfort.** Every card, gear, axle and dial has to stay inside a comfortable view cone and within arm's reach. `seat.ts` defines the cone and a unit test checks every part of every level against it.
- **Two copies of three.js.** IWSDK brought its own three.js, and two copies break `instanceof` checks between them. Vite's `resolve.dedupe` keeps one.

## What's next

Target launch date: January 2027, free in the Quest browser at the live URL.

- Real-hand occlusion, so your fingers hide the tray where they pass in front of it.
- A tray pose that persists between sessions, so the board comes back where you left it.
- More levels, and a level editor so players can share puzzles.
- On-device profiling on a Quest 3 to hold 60 fps on every level. The render budget so far is measured in software GL only.

## How it fits the judging

- **Innovation & Creativity:** a hands-only clockwork repair built for seated passthrough. Turning the regulator is a real wrist twist, like winding a key.
- **Experience Design:** nothing asks you to stand, turn or stretch; tests keep every part inside a comfort cone. Level 1 teaches by a ghost hand, with no text.
- **Technical Implementation:** joint-level hand input, plane-based tray placement with a fallback pose, involute gear geometry and a deterministic gear-train solver with jam detection, covered by unit, fuzz and emulated-headset e2e tests.
- **Polish & Presentation:** synthesised sound placed at the dial, a bird that comes to life, a render budget checked on every level, saved best times and a daily puzzle. One live URL, one Docker command.

## Credits and license

MIT, see LICENSE.

All geometry, textures (canvas-drawn cards and dial) and sounds (oscillators and noise) are generated in code; the repo has no image, model, font or audio files. Text uses the system's own fonts. The production build also includes the font, decoder and physics chunks bundled with `@iwsdk/core`; the game's own text and models do not use them. Third-party code: IWSDK, three.js, and for development Vite, TypeScript, Vitest and Playwright.
