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

## Seeing the scene

`bun run dev` (or `bun run build && bun run preview`) shows level 1 on a brass-and-walnut tray. Without a headset the page is a desktop preview: drag to orbit the tray, scroll to zoom. The **Enter MR** button is always visible; it starts the immersive-ar session through IWSDK when the browser supports it, and is disabled with a note ("needs a Quest browser") otherwise.

`bun run dev` also injects the IWER WebXR emulator (Meta Quest 3, `@iwsdk/vite-plugin-iwer`), so Enter MR is enabled on localhost. Production builds do not include it; set `injectOnBuild: true` in `vite.config.ts` only if a test build needs it.

The seated layout lives in `src/seat.ts`: the tray is 0.32 m ahead of and 0.19 m below the head, tilted 50 degrees towards the player, and every level's axles, gears and parts are checked to stay within 0.6 m and the view cone.

## License

MIT, see LICENSE.
