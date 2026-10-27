import { describe, expect, it } from 'vitest';
import { handNear, rayPick, validAxles, type HoverTarget } from '../../src/hover';
import { LEVELS } from '../../src/levels';

const l1 = LEVELS[0]!;
const l3 = LEVELS[2]!;

const t = (kind: 'gear' | 'axle', id: string, center: [number, number, number], radius: number): HoverTarget => ({ kind, id, center, radius });

describe('rayPick', () => {
  it('hits the nearest of overlapping targets', () => {
    const targets = [t('gear', 'far', [0, 0, -1.0], 0.1), t('axle', 'near', [0, 0, -0.5], 0.1)];
    expect(rayPick([0, 0, 0], [0, 0, -1], targets)).toEqual({ kind: 'axle', id: 'near' });
  });
  it('misses when the ray passes outside every radius', () => {
    expect(rayPick([0, 0, 0], [0, 0, -1], [t('gear', 'g', [0.3, 0, -0.5], 0.1)])).toBeNull();
  });
  it('ignores targets behind the origin', () => {
    expect(rayPick([0, 0, 0], [0, 0, -1], [t('gear', 'g', [0, 0, 0.5], 0.1)])).toBeNull();
  });
  it('works with an unnormalised direction', () => {
    const targets = [t('gear', 'g', [0, 0, -0.5], 0.05)];
    expect(rayPick([0, 0, 0], [0, 0, -40], targets)).toEqual({ kind: 'gear', id: 'g' });
    expect(rayPick([0, 0, 0], [0, 8, -40], targets)).toBeNull();
  });
  it('returns null with no targets', () => {
    expect(rayPick([0, 0, 0], [0, 0, -1], [])).toBeNull();
  });
});

describe('handNear', () => {
  const gears = [
    { id: 'a', center: [0, 0, 0] as const },
    { id: 'b', center: [0.2, 0, 0] as const },
  ];
  it('lists gears with a hand point inside the radius', () => {
    expect(handNear([[0.03, 0, 0]], gears, 0.05)).toEqual(['a']);
    expect(handNear([[0.03, 0, 0], [0.18, 0, 0.01]], gears, 0.05)).toEqual(['a', 'b']);
  });
  it('ignores points outside the radius', () => {
    expect(handNear([[0.06, 0, 0]], gears, 0.05)).toEqual([]);
  });
  it('is empty with no hands, and skips untracked hands', () => {
    expect(handNear([], gears, 0.05)).toEqual([]);
    expect(handNear([null, null], gears, 0.05)).toEqual([]);
  });
});

describe('validAxles', () => {
  it('is empty when nothing is held', () => {
    expect(validAxles(l1, {}, null)).toEqual([]);
  });
  it('lists every axle free at the held gear layer', () => {
    expect(validAxles(l1, {}, 'br')).toEqual(['a1']);
  });
  it('excludes an axle taken at the held gear layer', () => {
    expect(validAxles(l3, {}, 'p')).toEqual(['b', 'a2']);
    expect(validAxles(l3, { p: 'b' }, 'x')).toEqual(['a2']);
  });
  it('keeps an axle when only another layer is taken', () => {
    expect(validAxles(l3, {}, 'q')).toEqual(['a0', 'b']);
    expect(validAxles(l3, { p: 'b' }, 'y')).toEqual(['a0', 'b']);
  });
  it('does not count the held gear own placement', () => {
    expect(validAxles(l3, { p: 'b' }, 'p')).toEqual(['b', 'a2']);
  });
});
