import { describe, expect, it } from 'vitest';
import readme from '../../README.md?raw';
import pkg from '../../package.json?raw';

const scripts = Object.keys((JSON.parse(pkg) as { scripts: Record<string, string> }).scripts);

/** Claims the code does not back: config.ts asks for hit-test and anchors, but nothing calls them; gaze is the head ray. */
const DENY: readonly RegExp[] = [/hit[- ]?test/i, /\banchors?\b(?!\.ts)/i, /eye[- ]?(tracking|gaze)/i, /controllers? (support|work)/i];

describe('README', () => {
  it('only names bun scripts that exist', () => {
    const named = [...readme.matchAll(/bun run ([\w:-]+)/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((n) => !scripts.includes(n))).toEqual([]);
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

  it('claims nothing that was not built or measured', () => {
    expect(readme).not.toMatch(/MRUK/);
    expect(readme).not.toMatch(/persistent anchors? (are|is) (used|supported)/i);
    expect(readme).not.toMatch(/(runs|holds|measured|hits|steady) (at )?(a )?(steady )?60 ?fps/i);
  });
});
