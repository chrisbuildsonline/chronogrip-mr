import { describe, expect, it } from 'vitest';
import { BASS, BEATS_PER_BAR, BEAT_S, BPM, DUCK, FADE_S, LOWPASS_HZ, MUSIC_DB, MUSIC_GAIN, SCALE, composer, loadMusicOn, midiToHz, saveMusicOn } from '../../src/music';

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
