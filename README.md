# ChronoGrip MR

A seated, hands-first mixed-reality puzzle game: repair tiny clockwork automata on your lap tray by pinching gears into place, with 5-minute levels that pass the airplane-seat and bus-stop tests.

Built for [Meta VR Start Developer Competition 2026](https://start-developer-competition-26.devpost.com/). Submissions close 2026-11-18.

## What it does

A seated, hands-first mixed-reality puzzle game: repair tiny clockwork automata on your lap tray by pinching gears into place, with 5-minute levels that pass the airplane-seat and bus-stop tests.

## Stack

IWSDK (Immersive Web SDK, WebXR) + Three.js + TypeScript, WebXR hand tracking (pinch/poke/grab), plane detection + hit-test for tray/table anchoring in passthrough, procedural gear meshes (involute teeth generated in code), deterministic gear-train solver, WebAudio spatial ticking, IWER emulator + Playwright for tests, hosted on GitHub Pages

## Run it

```
bun install
bunx playwright install chromium   # once, for e2e
bun run dev         # dev server
bun run build       # production build into dist/
bun run typecheck   # tsc --noEmit
bun run test        # unit tests (vitest)
bun run e2e         # Playwright, builds and previews the app itself
```

## License

MIT, see LICENSE.
