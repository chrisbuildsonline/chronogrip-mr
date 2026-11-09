import { defineConfig } from '@playwright/test';

// README screenshots (`bun run screenshots`): writes docs/*.png. Kept out of playwright.config.ts so `bun run e2e` never rewrites docs/.
export default defineConfig({
  testDir: 'tests/shots',
  outputDir: 'test-results/shots',
  workers: 1,
  // ?shots draws the high tier on software GL: each new backdrop's first frame can take tens of seconds.
  timeout: 600_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    // A desktop window; the shots are the whole window.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: 'bun run build && bun run preview', url: 'http://localhost:4173', reuseExistingServer: false, timeout: 120_000 },
});
