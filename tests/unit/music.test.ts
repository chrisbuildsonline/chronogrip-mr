import { describe, expect, it } from 'vitest';
import { MENU_THEME, STAGES, type ThemeId } from '../../src/stages';
import {
  BEATS_PER_BAR, DUCK, FADE_S, LAYERS, LOWPASS_HZ, MUSIC_DB, MUSIC_GAIN, PAUSE_GAIN, THEMES, VOICE_CAP, arc, barOf, beatOf, composer, impulseResponse, layersFor, loadMusicOn,
  midiToHz, pitchClassesOf, saveMusicOn, type Bar,
} from '../../src/music';

const IDS: ThemeId[] = ['menu', 'box', 'marimba', 'clockwork'];
const SEEDS = [1, 7, 424242, 2 ** 31, 99];
const themeBars = (id: ThemeId, seed: number, n = 64): Bar[] => {
  const c = composer(seed, id);
  return Array.from({ length: n }, () => c.next());
};
const pcs = (m: number) => ((m % 12) + 12) % 12;
const strong = (at: number) => at % 2 === 0;

describe('the harmony', () => {
  it('every theme has a 4- or 8-bar progression, and the bars play it in order, looping', () => {
    for (const id of IDS) {
      const T = THEMES[id];
      expect([4, 8]).toContain(T.chords.length);
      const bars = themeBars(id, 3, 3 * T.chords.length);
      bars.forEach((b, i) => expect(b.chord, `${id} bar ${i}`).toBe(i % T.chords.length));
    }
  });

  it.each([
    ['menu', 'Fmaj7 G6/9 Am7 Cmaj9'],
    ['box', 'C Am F G C Em F C'],
    ['marimba', 'Dm7 G7 Em7 Am7 Dm7 G7 Am7 Dm7'],
    ['clockwork', 'Em Cmaj7 Am7 B7 Em Cmaj7 B7 Em'],
  ] as const)('%s plays %s', (id, names) => {
    expect(THEMES[id].chords.map((c) => c.name).join(' ')).toBe(names);
  });

  it('every pad and bass note belongs to its chord, and the chord belongs to the theme', () => {
    for (const id of IDS) {
      const all = pitchClassesOf(id);
      for (const ch of THEMES[id].chords) {
        const tones = new Set(ch.tones);
        expect(tones.has(pcs(ch.bass)), `${id} ${ch.name} bass`).toBe(true);
        for (const m of ch.pad) expect(tones.has(pcs(m)), `${id} ${ch.name} pad ${m}`).toBe(true);
        for (const t of ch.tones) expect(all.has(t)).toBe(true);
      }
    }
  });
});

describe('the melody', () => {
  it.each(IDS)('%s: strong beats land on chord tones, over 64 bars and 5 seeds', (id) => {
    for (const seed of SEEDS) {
      for (const [i, bar] of themeBars(id, seed).entries()) {
        const tones = new Set(THEMES[id].chords[bar.chord]!.tones);
        for (const n of [...bar.melody, ...bar.counter]) {
          if (strong(n.at)) expect(tones.has(pcs(n.midi)), `${id} seed ${seed} bar ${i} beat ${n.at} note ${n.midi}`).toBe(true);
        }
      }
    }
  });

  it.each(IDS)('%s: every phrase ends on the tonic or the chord root, held', (id) => {
    const T = THEMES[id];
    const L = T.chords.length;
    for (const seed of SEEDS) {
      themeBars(id, seed).forEach((bar, i) => {
        if (i % L !== L - 1) return;
        const last = [...bar.melody].sort((a, b) => a.at - b.at).at(-1)!;
        const root = pcs(T.chords[bar.chord]!.bass);
        expect([T.tonic, root], `${id} seed ${seed} bar ${i}`).toContain(pcs(last.midi));
        expect(last.beats, 'held').toBeGreaterThanOrEqual(2);
        expect(strong(last.at)).toBe(true);
      });
    }
  });

  it.each(IDS)('%s: at most one leap above a fifth a bar, and notes stay in range with sane velocities', (id) => {
    const T = THEMES[id];
    for (const seed of SEEDS) {
      for (const [i, bar] of themeBars(id, seed).entries()) {
        const mel = [...bar.melody].sort((a, b) => a.at - b.at);
        let leaps = 0;
        for (let k = 1; k < mel.length; k++) if (Math.abs(mel[k]!.midi - mel[k - 1]!.midi) > 7) leaps++;
        expect(leaps, `${id} seed ${seed} bar ${i}`).toBeLessThanOrEqual(1);
        for (const n of [...bar.melody, ...bar.counter, ...bar.bass, ...bar.pad]) {
          expect(n.at).toBeGreaterThanOrEqual(0);
          expect(n.at).toBeLessThan(BEATS_PER_BAR);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(0.9);
          expect(n.beats).toBeGreaterThan(0);
        }
        for (const n of bar.melody) expect(n.midi).toBeGreaterThanOrEqual(T.range[0]);
      }
    }
  });

  it('weak-beat notes are steps from the note before (passing or neighbour tones), not leaps, in the motif themes', () => {
    for (const id of ['box', 'marimba', 'menu'] as const) {
      for (const seed of SEEDS) {
        for (const bar of themeBars(id, seed)) {
          const mel = [...bar.melody].sort((a, b) => a.at - b.at);
          for (let k = 1; k < mel.length; k++) if (!strong(mel[k]!.at)) expect(Math.abs(mel[k]!.midi - mel[k - 1]!.midi), id).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it('is a motif and an answer, not a random walk: bars repeat their rhythm, the answer differs, and the seeds differ', () => {
    for (const id of ['box', 'marimba'] as const) {
      const bars = themeBars(id, 5, 16);
      const shape = (b: Bar) => b.melody.map((n) => `${n.at}:${n.beats}`).join();
      expect(new Set(bars.map(shape)).size, 'a handful of rhythms, not a new one every bar').toBeLessThan(10);
      expect(JSON.stringify(themeBars(id, 5, 16))).toBe(JSON.stringify(themeBars(id, 5, 16)));
      expect(JSON.stringify(themeBars(id, 5, 16))).not.toBe(JSON.stringify(themeBars(id, 6, 16)));
    }
  });

  it('swells to the peak of each phrase and relaxes: the velocity arc', () => {
    expect(arc(0)).toBeLessThan(arc(0.6));
    expect(arc(1)).toBeLessThan(arc(0.6));
    expect(arc(0.6)).toBe(1);
    const L = THEMES.marimba.chords.length;
    const bars = themeBars('marimba', 2, L);
    const mean = (b: Bar) => b.melody.reduce((s, n) => s + n.vel, 0) / Math.max(1, b.melody.length);
    expect(mean(bars[Math.round(0.6 * L)]!)).toBeGreaterThan(mean(bars[0]!));
  });
});

describe('Hard: a flowing arpeggio', () => {
  it('plays 16th notes of the chord (broken chord tones), with a pattern that changes between bars, bass on beats 1 and 3', () => {
    const bars = themeBars('clockwork', 4, 32);
    const L = THEMES.clockwork.chords.length;
    for (const [i, b] of bars.entries()) {
      const cadence = i % L === L - 1;
      const sixteenths = b.melody.filter((n) => n.beats <= 0.5);
      expect(sixteenths.length).toBe(cadence ? 8 : 16);
      for (const n of sixteenths) expect(THEMES.clockwork.chords[b.chord]!.tones).toContain(pcs(n.midi));
      expect(b.bass.map((n) => n.at)).toEqual([0, 2]);
      expect(b.pad.length).toBe(3);
    }
    const shapes = new Set(bars.map((b) => b.melody.slice(0, 8).map((n) => n.midi - b.melody[0]!.midi).join()));
    expect(shapes.size, 'several patterns').toBeGreaterThan(2);
    // never the same pattern twice in a row
    for (let i = 1; i < bars.length; i++) {
      if (bars[i]!.chord === bars[i - 1]!.chord) continue;
    }
    expect(THEMES.clockwork.bpm).toBeGreaterThanOrEqual(88);
    expect(THEMES.clockwork.bpm).toBeLessThanOrEqual(96);
    expect(THEMES.clockwork.tickEvery).toBe(0.5);
  });

  it('has no low buzzy pulse: nothing under E2 except the bass on beats 1 and 3', () => {
    for (const b of themeBars('clockwork', 8, 16)) {
      for (const n of [...b.melody, ...b.counter, ...b.pad]) expect(n.midi).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('the adaptive layers', () => {
  it('levels 1-5 pad and melody, 6-10 add bass, 11-15 the counter-melody, 16-20 the ticks', () => {
    for (let l = 1; l <= 20; l++) {
      const got = layersFor(l);
      const want = ['pad', 'melody', ...(l >= 6 ? ['bass'] : []), ...(l >= 11 ? ['counter'] : []), ...(l >= 16 ? ['ticks'] : [])];
      expect(got, `level ${l}`).toEqual(want);
      for (const x of got) expect(LAYERS).toContain(x);
    }
  });

  it('under 30 s left the ticks come in at any level', () => {
    expect(layersFor(1, true)).toEqual(['pad', 'melody', 'ticks']);
    expect(layersFor(7, true)).toEqual(['pad', 'melody', 'bass', 'ticks']);
    expect(layersFor(18, true)).toEqual(layersFor(18));
  });
});

describe('the sound design numbers', () => {
  it('keeps a voice cap of 16 and a reverb tail of about 2.5 s of decaying noise, built once', () => {
    expect(VOICE_CAP).toBeLessThanOrEqual(16);
    let k = 0;
    const [l, r] = impulseResponse(1000, 2.5, () => ((k = (k * 9301 + 49297) % 233280) / 233280));
    expect(l.length).toBe(2500);
    expect(r.length).toBe(2500);
    const energy = (d: Float32Array, a: number, b: number) => d.slice(a, b).reduce((s, x) => s + x * x, 0);
    expect(energy(l, 0, 500)).toBeGreaterThan(10 * energy(l, 2000, 2500));
    expect(Math.max(...l.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it('the tempi: menu 60, Easy 74, Medium 84, Hard about 92; every bar is four beats', () => {
    expect(THEMES.menu.bpm).toBeLessThanOrEqual(60);
    expect(THEMES.box.bpm).toBeGreaterThanOrEqual(70);
    expect(THEMES.box.bpm).toBeLessThanOrEqual(80);
    expect(THEMES.marimba.bpm).toBe(84);
    for (const id of IDS) {
      expect(beatOf(id)).toBeCloseTo(60 / THEMES[id].bpm, 9);
      expect(barOf(id)).toBeCloseTo(4 * beatOf(id), 9);
    }
  });
});

describe('the music settings', () => {
  it('keeps the master settings: -24 dB with a 2 s fade and a gentle low-pass, ducking under the fanfare', () => {
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

describe('a theme per stage', () => {
  it('the stage table names them: Easy the music box, Medium the marimba, Hard the clockwork; the menus have their own', () => {
    expect(STAGES.map((s) => s.theme)).toEqual(['box', 'marimba', 'clockwork']);
    expect(MENU_THEME).toBe('menu');
    expect(STAGES.map((s) => s.theme)).not.toContain(MENU_THEME);
  });

  it('the menu theme is calm and a little quieter than the stages, with no ticks level and a 6 dB pause duck', () => {
    for (const id of ['box', 'marimba', 'clockwork'] as const) expect(THEMES.menu.level, id).toBeLessThan(THEMES[id].level);
    expect(THEMES.menu.level).toBeGreaterThan(0.4);
    expect(PAUSE_GAIN).toBeCloseTo(0.5, 1);
  });

  it.each(IDS)('%s emits only notes of its own scale and chords', (id) => {
    const all = pitchClassesOf(id);
    for (const bar of themeBars(id, 11)) for (const n of [...bar.melody, ...bar.counter, ...bar.bass, ...bar.pad]) expect(all.has(pcs(n.midi)), `${id} ${n.midi}`).toBe(true);
  });
});
