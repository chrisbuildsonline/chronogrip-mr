import { describe, expect, it } from 'vitest';
import { qualityOf } from '../../src/quality';

describe('render quality', () => {
  it('is high on a real GPU and low on software GL', () => {
    expect(qualityOf('', false)).toBe('high');
    expect(qualityOf('', true)).toBe('low');
  });

  it('?quality=high|low overrides the detection either way; junk values are ignored', () => {
    expect(qualityOf('?quality=high', true)).toBe('high');
    expect(qualityOf('?quality=low', false)).toBe('low');
    expect(qualityOf('?quality=ultra', true)).toBe('low');
    expect(qualityOf('?quality=ultra', false)).toBe('high');
  });

  it('?shots (README screenshots) asks for the full look, but an explicit quality wins', () => {
    expect(qualityOf('?shots', true)).toBe('high');
    expect(qualityOf('?shots&quality=low', true)).toBe('low');
  });
});
