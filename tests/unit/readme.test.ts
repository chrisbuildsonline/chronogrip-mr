import { describe, expect, it } from 'vitest';
import readme from '../../README.md?raw';
import pkg from '../../package.json?raw';
import e2eConfig from '../../playwright.config.ts?raw';

const scripts = Object.keys((JSON.parse(pkg) as { scripts: Record<string, string> }).scripts);

/** Claims the code does not back: config.ts asks for hit-test, but nothing calls it; gaze is the head ray. */
const DENY: readonly RegExp[] = [/hit[- ]?test/i, /eye[- ]?(tracking|gaze)/i, /controllers? (support|work)/i];

/**
 * The one anchor claim the code backs (src/keeper.ts): the tray's spot is pinned with a persistent anchor where the
 * browser offers them, and the tests run that path in the IWER emulator only. Any other mention of anchors is a claim
 * nothing checks.
 */
const ANCHOR_CLAIM = 'where the browser offers WebXR persistent anchors, also pinned to the room with one (tested in the IWER emulator only, not yet on a Quest)';

describe('README', () => {
  it('makes exactly one, honest claim about anchors', () => {
    expect(readme).toContain(ANCHOR_CLAIM);
    expect(readme.replace(ANCHOR_CLAIM, '')).not.toMatch(/\banchors?\b(?!\.ts)/i);
  });

  it('says what passthrough does: hands hide the board, the tray spot is remembered', () => {
    expect(readme).toMatch(/hands? (hide|hides) the (tray|board)/i);
    expect(readme).toMatch(/remember/i);
    expect(readme).not.toMatch(/^- (Real-hand occlusion|A tray pose that persists)/m);
  });

  it('only names bun scripts that exist', () => {
    const named = [...readme.matchAll(/bun run ([\w:-]+)/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((n) => !scripts.includes(n))).toEqual([]);
  });

  it('says IWSDK grabs the gears, names ?grab=pinch, and no longer says grabbing is off', () => {
    expect(readme).toContain('GrabSystem');
    expect(readme).toContain('?grab=pinch');
    expect(readme).not.toMatch(/switched (its )?grabbing off|grabbing (is )?(switched|turned) off/i);
  });

  it('links the live build', () => {
    expect(readme).toContain('https://chrisbuildsonline.github.io/chronogrip-mr/');
  });

  it.each(DENY.map((r) => [String(r), r] as const))('makes no claim matching %s', (_, r) => {
    expect(readme).not.toMatch(r);
  });
});

const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December)';

/** The write-up the rules ask for (inspiration, build, plans, launch date, track) and a test path for judges. */
describe('README submission write-up', () => {
  it.each([
    ['Inspiration', /^##+ Inspiration\b/m],
    ['How we built it', /^##+ How we built it\b/im],
    ['Challenges', /^##+ Challenges\b/m],
    ["What's next", /^##+ What['’]s next\b/im],
    ['How it fits the judging', /^##+ How it fits the judging\b/im],
    ['Testing it', /^##+ Testing it\b/im],
  ])('has a %s section', (_, r) => {
    expect(readme).toMatch(r);
  });

  it('names the track and division', () => {
    expect(readme).toMatch(/Track:?\**:? ?\**Gaming\b/);
    expect(readme).toMatch(/Division:?\**:? ?\**New Experience\b/);
  });

  it('gives a target launch date with month and year', () => {
    expect(readme).toMatch(new RegExp(`Target launch date:?\\**:? ?\\**${MONTH} 20\\d\\d\\b`));
  });

  it.each(['Innovation & Creativity', 'Experience Design', 'Technical Implementation', 'Polish & Presentation'])(
    'maps the %s criterion',
    (criterion) => {
      expect(readme).toContain(criterion);
    },
  );

  it('tells judges how to run it in Docker and run every check', () => {
    expect(readme).toContain('docker run --rm -p 4173:4173');
    expect(readme).toContain('bun run docker:build');
    expect(readme).toContain('http://localhost:4173');
    expect(readme).toContain('bun run check');
  });

  it('names the desktop keys in Testing it', () => {
    const testing = /^##+ Testing it\b[\s\S]*?(?=^## )/m.exec(readme)?.[0] ?? '';
    expect(testing).toMatch(/\*\*Enter\*\*/);
    expect(testing).toMatch(/\*\*Esc\*\*/);
    expect(testing).not.toMatch(/no keyboard/i);
  });

  it('claims nothing that was not built or measured', () => {
    expect(readme).not.toMatch(/MRUK/);
    expect(readme).not.toMatch(/persistent anchors? (are|is) (used|supported)/i);
    expect(readme).not.toMatch(/(runs|holds|measured|hits|steady) (at )?(a )?(steady )?60 ?fps/i);
  });
});

/** The docs/ screenshots as base64 data URLs (Vite `?inline`), keyed by path from the repo root. */
const pngs = import.meta.glob('/docs/*.png', { query: '?inline', import: 'default', eager: true }) as Record<string, string>;
const bytesOf = (dataUrl: string) => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SHOTS = ['title', 'puzzle', 'complete'] as const;

/** Real screenshots of the game near the top, so a judge sees it before reading. */
describe('README screenshots', () => {
  const top = readme.slice(0, Math.max(0, readme.search(/^## What it is\b/m)));

  it.each(SHOTS)('links docs/%s.png with alt text before "What it is"', (name) => {
    const img = new RegExp(`!\\[[^\\]]{12,}\\]\\(docs/${name}\\.png\\)|<img(?=[^>]*\\bsrc="docs/${name}\\.png")(?=[^>]*\\balt="[^"]{12,}")[^>]*>`);
    expect(top).toMatch(img);
  });

  it.each(SHOTS)('captions docs/%s.png', (name) => {
    const at = top.indexOf(`docs/${name}.png`);
    expect(at).toBeGreaterThan(0);
    // A caption follows the image closely: an <em> or <sub> line, or an *italic* markdown line.
    expect(top.slice(at, at + 600)).toMatch(/<(em|sub)>[^<]{10,}<\/\1>|\n\*[^*\n]{10,}\*/);
  });

  it.each(SHOTS)('docs/%s.png is a real, wide, reasonably sized PNG', (name) => {
    const url = pngs[`/docs/${name}.png`];
    expect(url, `docs/${name}.png exists`).toBeDefined();
    const bytes = bytesOf(url!);
    expect([...bytes.slice(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('IHDR');
    const view = new DataView(bytes.buffer);
    const [width, height] = [view.getUint32(16), view.getUint32(20)];
    expect(width).toBeGreaterThanOrEqual(1200);
    expect(height).toBeGreaterThanOrEqual(600);
    expect(width / height).toBeLessThan(2.5);
    expect(bytes.length).toBeGreaterThan(50_000);
    expect(bytes.length).toBeLessThan(1_500_000);
  });

  it('links only screenshots that exist in docs/', () => {
    const linked = [...new Set([...readme.matchAll(/docs\/[\w-]+\.png/g)].map((m) => `/${m[0]}`))];
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.filter((p) => !pngs[p])).toEqual([]);
  });

  it('is honest that the only images in the repo are these screenshots', () => {
    expect(readme).not.toMatch(/repo (has|contains) no image/i);
    expect(readme).toMatch(/only images are the README screenshots in `?docs\/`?/);
  });

  it('regenerates them with their own Playwright config, outside the e2e run', () => {
    const scripts = (JSON.parse(pkg) as { scripts: Record<string, string> }).scripts;
    expect(scripts.screenshots).toMatch(/playwright test -c \S+/);
    expect(scripts.e2e).toBe('playwright test');
    expect(e2eConfig).toMatch(/testDir: 'tests\/e2e'/);
  });
});
