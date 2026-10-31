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
