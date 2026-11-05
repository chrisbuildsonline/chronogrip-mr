import { describe, expect, it } from 'vitest';
import { isHeadsetBrowser, qualityOf } from '../../src/quality';

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

  const QUEST = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.0.0.1.36 SamsungBrowser/4.0 Chrome/126.0.0.0 VR Safari/537.36';
  const QUEST_OLD = 'Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
  const PICO = 'Mozilla/5.0 (Linux; Android 10; Pico Neo 3 Link) AppleWebKit/537.36 (KHTML, like Gecko) PicoBrowser/3.0 Chrome/100.0 Mobile Safari/537.36';
  const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

  it('a standalone headset browser (Quest, Pico) runs the low tier on its real GPU, a desktop browser the high one', () => {
    for (const ua of [QUEST, QUEST_OLD, PICO]) {
      expect(isHeadsetBrowser(ua), ua).toBe(true);
      expect(qualityOf('', false, ua), ua).toBe('low');
    }
    expect(isHeadsetBrowser(DESKTOP)).toBe(false);
    expect(qualityOf('', false, DESKTOP)).toBe('high');
    expect(qualityOf('', false)).toBe('high');
  });

  it('?quality=high still wins on a headset', () => {
    expect(qualityOf('?quality=high', false, QUEST)).toBe('high');
    expect(qualityOf('?quality=low', false, DESKTOP)).toBe('low');
  });
});
