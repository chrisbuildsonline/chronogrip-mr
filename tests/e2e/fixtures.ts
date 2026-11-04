import { test as base } from '@playwright/test';

export * from '@playwright/test';

/**
 * Every spec gets its page with the global scores backend stubbed (an empty board, posts accepted), so no test ever reaches the
 * real one. A spec that wants other answers registers its own route; the later route wins.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/rest/v1/chronogrip_scores**', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, body: '' }) : r.fulfill({ json: [] })));
    await use(page);
  },
});
