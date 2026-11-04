import { test as base } from '@playwright/test';

export * from '@playwright/test';

/**
 * Every spec gets its page with the global scores backend stubbed (an empty board, posts accepted), so no test ever reaches the
 * real one. A spec that wants other answers registers its own route; the later route wins.
 *
 * `classic` (on by default) sets the flag that plays the hand-made levels l1-l8 in their places, so a spec can drive a puzzle it
 * knows; levels 9-20 are generated either way. The campaign, Random level and retry specs turn it off with `test.use({ classic: false })`.
 */
export const test = base.extend<{ classic: boolean }>({
  classic: [true, { option: true }],
  page: async ({ page, classic }, use) => {
    await page.route('**/rest/v1/chronogrip_scores**', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, body: '' }) : r.fulfill({ json: [] })));
    if (classic) await page.addInitScript(() => window.localStorage.setItem('chronogrip.classic.v1', '1'));
    await use(page);
  },
});
