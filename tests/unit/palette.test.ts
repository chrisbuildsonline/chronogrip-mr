import { describe, expect, it } from 'vitest';
import { C } from '../../src/palette';
import html from '../../index.html?raw';
import design from '../../design/DESIGN.md?raw';

const sources = import.meta.glob('../../src/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** WCAG 2.x relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
/** WCAG contrast ratio, 1..21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Every text colour in the UI on each surface it is drawn on (src/panels.ts, index.html). */
const TEXT: [string, string, string][] = [
  ['ink titles on cream panels', C.ink, C.cream],
  ['ink labels on cream-deep buttons and tiles', C.ink, C.deep],
  ['ink labels on a hovered secondary or tile', C.ink, C.deepHover],
  ['cream labels on the primary pill', C.cream, C.ink],
  ['cream labels on a hovered primary pill', C.cream, C.inkHover],
  ['muted text on cream panels', C.muted, C.cream],
  ['muted best times on cream-deep tiles', C.muted, C.deep],
  ['muted best times on a hovered tile', C.muted, C.deepHover],
  ['status pill text on amber tint', C.tintInk, C.tint],
  ['ink goal text on the matched (amber) goal badge', C.ink, C.amber],
  ['red "Jammed:" and "Wrong way:" on the cream HUD', C.jamInk, C.cream],
  ['the cream "!" on the red fault disc', C.cream, C.jamInk],
  ['the cream wordmark on the lightest vignette', C.cream, C.vignette],
  ['the Enter MR note on the lightest vignette', C.note, C.vignette],
];

describe('palette contrast (WCAG AA)', () => {
  it('computes the WCAG ratio', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#777777')).toBeCloseTo(4.48, 2);
  });

  it.each(TEXT)('%s reaches 4.5:1', (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the old 4.26:1 muted is gone from the code, the page and the design doc', () => {
    for (const [path, src] of Object.entries(sources)) expect(src, path).not.toMatch(/#7d6f5f/i);
    expect(html).not.toMatch(/#7d6f5f/i);
    expect(design).not.toMatch(/#7d6f5f/i);
  });

  it('every text colour in index.html is a checked palette colour', () => {
    const used = [...html.matchAll(/(?<![-\w])color:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]!.toLowerCase());
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((c) => !TEXT.some(([, fg]) => fg === c))).toEqual([]);
  });

  it("DESIGN.md's colour table matches the palette", () => {
    expect(design).toContain(`| Muted | \`${C.muted}\``);
    expect(design).toContain(`| Cream | \`${C.cream}\``);
    expect(design).toContain(`| Ink | \`${C.ink}\``);
    expect(design).toContain(`| Jam | \`${C.jam}\``);
    expect(design).toContain(`| Jam ink | \`${C.jamInk}\``);
  });

  it('the jam red reads apart from the brass it tints and the amber accent: a clearly redder hue', () => {
    const hue = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
      const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
      expect(max, hex).toBe(r);
      return (60 * (g - b)) / (max - min);
    };
    for (const red of [C.jam, C.jamInk]) {
      expect(hue(red), red).toBeLessThan(15);
      expect(hue(C.brass) - hue(red)).toBeGreaterThan(20);
      expect(hue(C.amber) - hue(red)).toBeGreaterThan(20);
    }
  });
});
