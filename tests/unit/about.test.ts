import { describe, expect, it } from 'vitest';
import { ABOUT } from '../../src/panels';
import rules from '../../src/main.ts?raw';

const all = ABOUT.flatMap((b) => [b.heading, ...b.lines]).join('\n');

describe('the About text', () => {
  it('says what it is, who made it and for which competition', () => {
    expect(ABOUT.map((b) => b.heading)).toEqual(['WHAT IT IS', 'HOW TO PLAY', 'MECHANICS', 'CREDITS']);
    expect(all).toContain('mixed-reality clockwork puzzle');
    expect(all).toContain('made by Chris');
    expect(all).toContain('Meta VR Start Developer Competition 2026');
  });

  it('explains how to play: fit gears on axles, the target rpm and direction, the regulator and the bird', () => {
    const how = ABOUT.find((b) => b.heading === 'HOW TO PLAY')!.lines.join(' ');
    for (const w of ['gear', 'axle', 'rpm', 'direction', 'regulator', 'bird']) expect(how, w).toContain(w);
  });

  it('lists the mechanics: stages, the time limit and No timer, the pause penalty, Give up, initials on a stage board, Random as practice', () => {
    const m = ABOUT.find((b) => b.heading === 'MECHANICS')!.lines.join('\n');
    expect(m).toContain('Three stages of 20 levels');
    expect(m).toMatch(/time limit/);
    expect(m).toContain('No timer');
    expect(m).toContain('Pausing stops the clock and hides the board');
    expect(m).toContain('3-second countdown');
    expect(m).toMatch(/Give up, or run out of time/);
    expect(m).toMatch(/three initials on that stage/);
    expect(m).toMatch(/Random level is practice/);
  });

  it('credits the tools and the font', () => {
    const c = ABOUT.find((b) => b.heading === 'CREDITS')!.lines.join(' ');
    for (const w of ['IWSDK', 'Three.js', 'generated in code', 'Blender', 'Josefin Sans', 'SIL']) expect(c, w).toContain(w);
  });

  it('is wired to a row on the start screen', () => {
    expect(rules).toContain("id === 'about'");
  });
});
