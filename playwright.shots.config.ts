import { defineConfig } from '@playwright/test';

// README screenshots (`bun run screenshots`): writes docs/*.png. Kept out of playwright.config.ts so `bun run e2e` never rewrites docs/.
export default defineConfig({
  testDir: 'tests/shots',
  outputDir: 'test-results/shots',
  workers: 1,
  timeout: 240_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    // 1280 x 720 is the layout the e2e checks keep every card inside; at 1.75x the 700 x 720 crop round the tray is 1225 x 1260.
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1.75,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'bun run build && bun run preview', url: 'http://localhost:4173', reuseExistingServer: false, timeout: 120_000 },
});
