import { injectIWER } from '@iwsdk/vite-plugin-iwer';
import { loadEnv } from 'vite';

import { defineConfig } from 'vitest/config';

// No @types/node in this project; only the env is read from Node.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig(({ mode }) => ({
  base: './',
  // DEV_MODE=on (in .env or the shell) builds in the cheat panel (src/cheats.ts). Any other value folds the flag to false, so
  // the panel's import is dead code and no build without it carries a byte of it.
  define: { __DEV_MODE__: JSON.stringify((process.env.DEV_MODE ?? loadEnv(mode, '.', '').DEV_MODE) === 'on') },
  build: {
    outDir: 'dist',
    // Splitting cannot get under the default 500 kB: the biggest chunks are @iwsdk/core (5.5 MB, needed at boot, one unsplittable
    // library with its UI kit and ECS) and the SDK's own lazily fetched fonts and decoders (400-700 kB each, loaded only on demand).
    // The limit sits just above that SDK chunk, so the warning still fires if our own code or another dependency grows a big chunk.
    chunkSizeWarningLimit: 5600,
    rollupOptions: {
      output: {
        // Vendor code in its own long-lived chunks: a change to the game's code no longer re-downloads three.js or the SDK.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          return /node_modules\/three\//.test(id) ? 'three' : undefined;
        },
      },
    },
  },
  // IWER (WebXR emulator) is injected by `vite` dev only; builds skip it unless injectOnBuild is set.
  plugins: mode === 'test' ? [] : [injectIWER({ device: 'metaQuest3', sem: { defaultScene: 'living_room' } })],
  // @iwsdk/core ships its own three; one copy keeps instanceof checks and the renderer consistent.
  resolve: { dedupe: ['three'] },
  // Reachable from outside a container (docker run -p 4173:4173).
  preview: { host: true, port: 4173, strictPort: true },
  test: { include: ['tests/unit/**/*.test.ts'] },
}));
