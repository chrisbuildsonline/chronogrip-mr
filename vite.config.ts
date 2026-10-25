import { injectIWER } from '@iwsdk/vite-plugin-iwer';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: './',
  build: { outDir: 'dist' },
  // IWER (WebXR emulator) is injected by `vite` dev only; builds skip it unless injectOnBuild is set.
  plugins: mode === 'test' ? [] : [injectIWER({ device: 'metaQuest3' })],
  // @iwsdk/core ships its own three; one copy keeps instanceof checks and the renderer consistent.
  resolve: { dedupe: ['three'] },
  test: { include: ['tests/unit/**/*.test.ts'] },
}));
