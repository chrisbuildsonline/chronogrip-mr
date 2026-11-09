import { defineConfig } from '@playwright/test';

// No @types/node in this project; only the env is read from Node.
declare const process: { env: Record<string, string | undefined> };

const launchOptions = {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/artifacts',
  // ponytail: software GL is CPU-bound; 10 workers starve each other into timeouts. Ceiling 4; on CI one worker per 2 CPUs. E2E_WORKERS overrides.
  workers: Number(process.env.E2E_WORKERS) || (process.env.CI ? Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))) : 4),
  // ponytail: cold servers plus software GL push default-30s specs over; 120s on a host, 240s on CI. Specs must not override it. Lower it if CI has a GPU.
  timeout: process.env.CI ? 240_000 : 120_000,
  reporter: 'list',
  projects: [
    // Production build, no emulator.
    { name: 'preview', testIgnore: /(dev|devmode)-.*\.spec\.ts/, use: { baseURL: 'http://localhost:4173', browserName: 'chromium', launchOptions } },
    // Dev server, IWER emulator injected.
    { name: 'dev', testMatch: /dev-.*\.spec\.ts/, use: { baseURL: 'http://localhost:5174', browserName: 'chromium', launchOptions } },
    // A DEV_MODE=on production build (the cheat panel), in its own folder and port.
    { name: 'devmode', testMatch: /devmode-.*\.spec\.ts/, use: { baseURL: 'http://localhost:4179', browserName: 'chromium', launchOptions } },
  ],
  webServer: [
    {
      command: 'bun run build && bun run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'bun run dev --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'bun run build --outDir dist-dev && bun run preview --outDir dist-dev --port 4179 --strictPort',
      env: { DEV_MODE: 'on' },
      url: 'http://localhost:4179',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
