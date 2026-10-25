import { defineConfig } from '@playwright/test';

const launchOptions = {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/artifacts',
  reporter: 'list',
  projects: [
    // Production build, no emulator.
    { name: 'preview', testIgnore: /dev-.*\.spec\.ts/, use: { baseURL: 'http://localhost:4173', browserName: 'chromium', launchOptions } },
    // Dev server, IWER emulator injected.
    { name: 'dev', testMatch: /dev-.*\.spec\.ts/, use: { baseURL: 'http://localhost:5174', browserName: 'chromium', launchOptions } },
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
  ],
});
