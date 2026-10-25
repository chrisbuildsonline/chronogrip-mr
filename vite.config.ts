import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
