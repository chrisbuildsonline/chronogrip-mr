import { describe, expect, it } from 'vitest';
import { MENU_THEME, STAGES, type ThemeId } from '../../src/stages';
import { THEMES, beatOf, pitchClassesOf, BASS, BEATS_PER_BAR, BEAT_S, BPM, DUCK, FADE_S, LOWPASS_HZ, MUSIC_DB, MUSIC_GAIN, SCALE, composer, loadMusicOn, midiToHz, saveMusicOn } from '../../src/music';

const bars = (seed: number, n = 64) => {
  const c = composer(seed);
  return Array.from({ length: n }, () => c.next());
};
const pitchClasses = (xs: readonly number[]) => new Set(xs.map((m) => m % 12));

describe('the music box composer', () => {
  it('plays only notes of the A minor pentatonic scale: melody in the scale, pad on the bass notes and the notes above them', () => {
    const scale = pitchClasses(SCALE);
    for (const seed of [1, 7, 424242, 2 ** 31]) {
      for (const bar of bars(seed)) {
        for (const n of bar.melody) expect(SCALE, `seed ${seed}`).toContain(n.midi);
        for (const n of bar.pad) expect(scale.has(n.midi % 12), `pad ${n.midi}`).toBe(true);
        expect(bar.pad[0]!.midi).toBeLessThan(55);
      }
    }
    expect(pitchClasses(SCALE)).toEqual(new Set([9, 0, 2, 4, 7])); // A C D E G
    expect(BASS.every((m) => scale.has(m % 12))).toBe(true);
  });

  it('keeps every note inside its bar of four beats, with a velocity from 0 to 1, and never overlaps two melody notes on one beat', () => {
    for (const bar of bars(99)) {
      let prev = -1;
      for (const n of [...bar.melody, ...bar.pad]) {
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.at).toBeLessThan(BEATS_PER_BAR);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
        expect(n.beats).toBeGreaterThan(0);
      }
      for (const n of bar.melody) {
        expect(n.at, 'notes come in order, one at a time').toBeGreaterThan(prev);
        prev = n.at;
      }
    }
  });

  it('is the same for the same seed, differs between seeds, and does not loop obviously within a run', () => {
    const key = (seed: number) => JSON.stringify(bars(seed, 16));
    expect(key(5)).toBe(key(5));
    expect(key(5)).not.toBe(key(6));
    const all = bars(5, 32).map((b) => JSON.stringify(b.melody));
    expect(new Set(all).size, 'bars of a run are mostly different').toBeGreaterThan(24);
  });

  it('always plays something, and a fourth bar comes home to A4', () => {
    const list = bars(3, 40);
    for (const b of list) expect(b.melody.length).toBeGreaterThan(0);
    list.forEach((b, i) => i % 4 === 3 && expect(b.melody.at(-1)!.midi).toBe(69));
  });
});

describe('the music settings', () => {
  it('runs at 70 to 80 bpm, at -24 dB with a 2 s fade and a gentle low-pass, ducking under the fanfare', () => {
    expect(BPM).toBeGreaterThanOrEqual(70);
    expect(BPM).toBeLessThanOrEqual(80);
    expect(BEAT_S).toBeCloseTo(60 / BPM, 9);
    expect(MUSIC_DB).toBe(-24);
    expect(MUSIC_GAIN).toBeCloseTo(0.0631, 3);
    expect(MUSIC_GAIN).toBeLessThan(0.1);
    expect(FADE_S).toBe(2);
    expect(LOWPASS_HZ).toBeGreaterThan(1000);
    expect(LOWPASS_HZ).toBeLessThan(5000);
    expect(DUCK.to).toBeGreaterThan(0.2);
    expect(DUCK.to).toBeLessThan(1);
  });

  it('turns MIDI into hertz', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
  });

  it('is on unless the saved value is exactly 0, and round trips', () => {
    const store = (v?: string) => {
      const m = new Map<string, string>(v === undefined ? [] : [['chronogrip.music.v1', v]]);
      return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => void m.set(k, x), m };
    };
    expect(loadMusicOn(store())).toBe(true);
    expect(loadMusicOn(store('1'))).toBe(true);
    expect(loadMusicOn(store('0'))).toBe(false);
    expect(loadMusicOn(store('junk'))).toBe(true);
    expect(loadMusicOn(null)).toBe(true);
    const s = store();
    saveMusicOn(s, false);
    expect(s.m.get('chronogrip.music.v1')).toBe('0');
    expect(loadMusicOn(s)).toBe(false);
    saveMusicOn(s, true);
    expect(loadMusicOn(s)).toBe(true);
    const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    expect(loadMusicOn(bad)).toBe(true);
    expect(() => saveMusicOn(bad, false)).not.toThrow();
  });
});

const IDS: ThemeId[] = ['box', 'marimba', 'clockwork'];
const themeBars = (id: ThemeId, seed: number, n = 64) => {
  const c = composer(seed, id);
  return Array.from({ length: n }, () => c.next());
};

describe('a theme per stage', () => {
  it('the stage table names them: Easy the music box, Medium the marimba, Hard the clockwork; the menus play Easy\'s', () => {
    expect(STAGES.map((s) => s.theme)).toEqual(['box', 'marimba', 'clockwork']);
    expect(MENU_THEME).toBe(STAGES[0]!.theme);
  });

  it('runs at about 72, 84 and 96 bpm', () => {
    expect(THEMES.box.bpm).toBeGreaterThanOrEqual(70);
    expect(THEMES.box.bpm).toBeLessThanOrEqual(76);
    expect(THEMES.marimba.bpm).toBe(84);
    expect(THEMES.clockwork.bpm).toBe(96);
    for (const id of IDS) expect(beatOf(id)).toBeCloseTo(60 / THEMES[id].bpm, 9);
    expect(beatOf('clockwork')).toBeLessThan(beatOf('marimba'));
    expect(beatOf('marimba')).toBeLessThan(beatOf('box'));
  });

  it.each([
    ['box', [9, 0, 2, 4, 7]], // A minor pentatonic: A C D E G
    ['marimba', [2, 4, 5, 7, 9, 11, 0]], // D Dorian: D E F G A B C
    ['clockwork', [4, 5, 7, 9, 11, 0, 2]], // E Phrygian: E F G A B C D
  ] as const)('%s emits only notes of its own scale, in every voice', (id, pcs) => {
    expect(pitchClassesOf(id)).toEqual(new Set(pcs));
    const scale = new Set(pcs as readonly number[]);
    for (const seed of [1, 7, 424242, 2 ** 31]) {
      for (const bar of themeBars(id, seed)) {
        for (const n of [...bar.melody, ...bar.pad, ...bar.counter, ...bar.ostinato]) {
          expect(scale.has(n.midi % 12), `${id} seed ${seed} note ${n.midi}`).toBe(true);
          expect(n.at).toBeGreaterThanOrEqual(0);
          expect(n.at).toBeLessThan(BEATS_PER_BAR);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
        expect(bar.melody.length, 'always something').toBeGreaterThan(0);
      }
    }
  });

  it('is different music: the marimba adds a counterline, the clockwork a low pulse and eighth ticks, the box neither', () => {
    for (const bar of themeBars('box', 3, 8)) {
      expect([bar.counter.length, bar.ostinato.length, bar.ticks.length]).toEqual([0, 0, 4]);
    }
    expect(themeBars('marimba', 3, 16).every((b) => b.counter.length > 0 && b.counter.every((n) => n.midi < 64))).toBe(true);
    for (const bar of themeBars('clockwork', 3, 8)) {
      expect(bar.ostinato).toHaveLength(8);
      expect(Math.max(...bar.ostinato.map((n) => n.midi)), 'a low pulse').toBeLessThan(48);
      expect(Math.min(...bar.melody.map((n) => n.midi)), 'sparse high notes').toBeGreaterThanOrEqual(76);
      expect(bar.ticks).toHaveLength(8);
      expect(bar.ticks.filter((t) => t.accent)).toHaveLength(4);
    }
    // Busier than the box: more melody notes a bar in the marimba than in the box.
    const notes = (id: ThemeId) => themeBars(id, 5, 64).reduce((sum, b) => sum + b.melody.length, 0);
    expect(notes('marimba')).toBeGreaterThan(notes('box'));
    // The same seed plays the same theme, and a seed differs from another.
    for (const id of IDS) expect(JSON.stringify(themeBars(id, 9, 8))).toBe(JSON.stringify(themeBars(id, 9, 8)));
    expect(JSON.stringify(themeBars('marimba', 9, 8))).not.toBe(JSON.stringify(themeBars('marimba', 10, 8)));
  });
});
