import { expect, test, type Page } from './fixtures';
import { beginByMouse } from './start';

/** A spy on WebAudio: counts the contexts the page makes, and the oscillators on them. */
const spy = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext; __ac: { contexts: number; oscillators: number } };
    w.__ac = { contexts: 0, oscillators: 0 };
    const Real = w.AudioContext;
    w.AudioContext = class extends Real {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__ac.contexts++;
        const make = this.createOscillator.bind(this);
        this.createOscillator = () => {
          w.__ac.oscillators++;
          return make();
        };
      }
    };
  });

const seen = (page: Page) => page.evaluate(() => (window as unknown as { __ac: { contexts: number; oscillators: number } }).__ac);
const notes = (page: Page) => page.evaluate(() => window.__chrono!.audio.notes);

async function open(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await spy(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__chrono?.ready === true);
  return errors;
}

async function click(page: Page, id: string) {
  await page.waitForFunction((b) => !window.__chrono!.cameraMoving && window.__chrono!.buttons().some((x) => x.id === b), id);
  const [x, y] = await page.evaluate((b) => window.__chrono!.buttons().find((x) => x.id === b)!.screen, id);
  await page.mouse.click(x, y);
}

/** The notes stop growing: the count holds still over `ms`. */
async function silent(page: Page, ms = 3000) {
  const a = await notes(page);
  await page.waitForTimeout(ms);
  expect(await notes(page)).toBe(a);
}

test('the music starts only after the first click, and plays without console errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__chrono!.musicOn)).toBe(true);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__chrono!.audio.state), 'the game makes no AudioContext before a gesture').toBe('none');
  expect((await seen(page)).oscillators, 'and no music oscillator').toBe(0);
  expect(await notes(page)).toBe(0);

  await beginByMouse(page); // a real click on New Game
  await page.waitForFunction(() => window.__chrono!.audio.state === 'running');
  await page.waitForFunction(() => window.__chrono!.audio.notes > 3, undefined, { timeout: 15_000 });
  expect((await seen(page)).oscillators).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('Options has a Music switch, on by default and saved; off stops the notes, and it stays off after a reload', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'options');
  await page.waitForFunction(() => window.__chrono!.card?.screen === 'options');
  expect(await page.evaluate(() => window.__chrono!.buttons().map((b) => b.label))).toEqual(['No timer', 'Sound', 'Music', 'Reset progress', 'Back']);
  expect(await page.evaluate(() => window.__chrono!.options)).toMatchObject({ music: true, sound: true });
  // The click that opened Options started the context: notes are coming.
  await page.waitForFunction(() => window.__chrono!.audio.notes > 2, undefined, { timeout: 15_000 });

  await click(page, 'music');
  await page.waitForFunction(() => !window.__chrono!.musicOn);
  expect(await page.evaluate(() => localStorage.getItem('chronogrip.music.v1'))).toBe('0');
  expect(await page.evaluate(() => window.__chrono!.options)).toMatchObject({ music: false });
  await page.waitForTimeout(4000); // the fade and what was scheduled ahead
  await silent(page);
  await page.screenshot({ path: 'test-results/music/options-off.png' });

  await click(page, 'music');
  await page.waitForFunction(() => window.__chrono!.musicOn);
  expect(await page.evaluate(() => localStorage.getItem('chronogrip.music.v1'))).toBe('1');
  const before = await notes(page);
  await page.waitForFunction((n) => window.__chrono!.audio.notes > n + 2, before, { timeout: 15_000 });

  await click(page, 'music'); // off again, then reload
  await page.reload();
  await page.waitForFunction(() => window.__chrono?.ready === true);
  expect(await page.evaluate(() => window.__chrono!.musicOn)).toBe(false);
  await beginByMouse(page);
  await page.waitForFunction(() => window.__chrono!.audio.state === 'running');
  await silent(page);
  expect((await seen(page)).oscillators, 'no music oscillators while it is off').toBe(0);
  expect(errors).toEqual([]);
});

test('Sound off silences the music too', async ({ page }) => {
  const errors = await open(page);
  await click(page, 'options');
  await page.waitForFunction(() => window.__chrono!.audio.notes > 2, undefined, { timeout: 15_000 });
  await click(page, 'sound');
  await page.waitForFunction(() => !window.__chrono!.soundOn);
  await page.waitForTimeout(4000);
  await silent(page);
  expect(errors).toEqual([]);
});
