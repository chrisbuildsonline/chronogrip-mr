import type { ThemeId } from './stages';

/**
 * The background music, a clockmaker's music box (src/sound.ts plays it with WebAudio; no audio files). This file is the
 * composing: pure functions from a seed to notes, so a phrase never repeats obviously and a test can read every note.
 * A slow pentatonic melody (A minor pentatonic, two octaves), a low pad that follows the bass, and a quiet tick on every beat.
 * That is the Easy theme ('box', also the menus'). Medium ('marimba') is D Dorian at 84 bpm with a mallet counterline under the
 * melody; Hard ('clockwork') is E Phrygian at 96 bpm over a low pulsing ostinato, with a ticking escapement pattern and a few
 * high notes (THEMES). Each stage plays its own; src/sound.ts crossfades between them.
 */

/** Beats per minute of the box theme, between 70 and 80; four beats to a bar. */
export const BPM = 74;
export const BEATS_PER_BAR = 4;
export const BEAT_S = 60 / BPM;
/** The music's master level: -24 dB, well under the effects. */
export const MUSIC_DB = -24;
export const MUSIC_GAIN = 10 ** (MUSIC_DB / 20);
/** Seconds to fade in and out, the gentle low-pass in Hz, and how far the fanfare ducks the music (a share of its level) for how long. */
export const FADE_S = 2;
export const LOWPASS_HZ = 2400;
export const DUCK = { to: 0.45, seconds: 3 } as const;
/** The pause menu steps the stage music down 6 dB. */
export const PAUSE_GAIN = 10 ** (-6 / 20);

/** A minor pentatonic as MIDI notes, A3 up to E5: the melody never leaves this scale. */
export const SCALE: readonly number[] = [57, 60, 62, 64, 67, 69, 72, 74, 76];
/** The pad: the roots under the melody, A2, D3 and E3, and the note held above each (a fifth, or for E a minor third): all in the scale's pitch classes. */
export const BASS: readonly number[] = [45, 50, 52];
const ABOVE: readonly number[] = [52, 57, 55];

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** `at` and `beats` in beats from the start of the bar; `vel` 0..1. */
export type Note = { at: number; midi: number; beats: number; vel: number };
/** A tick of the escapement pattern: `at` in beats, `accent` for the louder, higher one. */
export type Tick = { at: number; accent: boolean };
/** `counter`: the mallet counterline (Medium); `ostinato`: the low pulse (Hard); both empty in the box theme. `ticks`: the pattern for the bar. */
export type Bar = { melody: Note[]; pad: Note[]; counter: Note[]; ostinato: Note[]; ticks: Tick[] };

/** A theme: its tempo and the notes it may play (MIDI), every one of them in its mode. */
export type Theme = { id: ThemeId; bpm: number; /** Its share of the music level (1 is the stage themes'). */ level: number; mode: string; melody: readonly number[]; counter: readonly number[]; bass: readonly number[]; above: readonly number[]; pulse: readonly number[] };

export const THEMES: Record<ThemeId, Theme> = {
  // F Lydian at 60 bpm: soft sustained chords (Fmaj7, G add9, Am7, Cmaj9) and now and then a distant chime, a little under the stage themes.
  menu: { id: 'menu', bpm: 60, level: 0.7, mode: 'F Lydian', melody: [72, 74, 76, 77, 79, 81, 84], counter: [], bass: [41, 43, 45, 36], above: [], pulse: [] },
  box: { id: 'box', bpm: BPM, level: 1, mode: 'A minor pentatonic', melody: SCALE, counter: [], bass: BASS, above: ABOVE, pulse: [] },
  // D Dorian: D E F G A B C. The melody D4-E5, the counterline D3-D4, the pad on D, G and A with a fifth or third above.
  marimba: { id: 'marimba', bpm: 84, level: 1, mode: 'D Dorian', melody: [62, 64, 65, 67, 69, 71, 72, 74, 76], counter: [50, 52, 53, 55, 57, 59, 60, 62], bass: [50, 55, 57], above: [57, 62, 64], pulse: [] },
  // E Phrygian: E F G A B C D. A few high notes, a drone on E and B, the ostinato on E and now and then F.
  clockwork: { id: 'clockwork', bpm: 96, level: 1, mode: 'E Phrygian', melody: [76, 77, 79, 81, 83, 84, 86], counter: [], bass: [52], above: [59], pulse: [40, 41] },
};
/** Seconds per beat of a theme. */
export const beatOf = (id: ThemeId): number => 60 / THEMES[id].bpm;
/** Every pitch class a theme may play: the test of "only notes of its scale". */
export const pitchClassesOf = (id: ThemeId): Set<number> => {
  const t = THEMES[id];
  return new Set([...t.melody, ...t.counter, ...t.bass, ...t.above, ...t.pulse, ...(id === 'menu' ? CHORDS.flat() : [])].map((m) => m % 12));
};

const BEAT_TICKS: Tick[] = [0, 1, 2, 3].map((at) => ({ at, accent: at % 2 === 0 }));
const ESCAPEMENT_TICKS: Tick[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((at, i) => ({ at, accent: i % 2 === 0 }));

/** A small seeded random stream (mulberry32), so the same seed plays the same music. */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The composer: call `next()` for each bar in turn. The melody is a walk along the scale (steps, sometimes a leap), in
 * eighth and quarter notes with rests, resting on the tonic at the end of every fourth bar; the pad holds one bass note
 * and its fifth for the bar, the bass moving by the seeded stream.
 */
export function composer(seed: number, theme: ThemeId = 'box'): { next(): Bar } {
  if (theme === 'menu') return menuComposer(seed);
  if (theme === 'marimba') return marimbaComposer(seed);
  if (theme === 'clockwork') return clockworkComposer(seed);
  const r = stream(seed);
  let degree = 5; // A4
  let bass = 0;
  let bar = 0;
  return {
    next(): Bar {
      const melody: Note[] = [];
      let at = 0;
      const phraseEnd = bar % 4 === 3;
      while (at < BEATS_PER_BAR) {
        const beats = r() < 0.55 ? 1 : 0.5;
        const left = BEATS_PER_BAR - at;
        const len = Math.min(beats, left);
        if (r() < 0.22 && !(phraseEnd && left <= 2)) {
          at += len; // a rest
          continue;
        }
        const step = r() < 0.8 ? (r() < 0.5 ? -1 : 1) : r() < 0.5 ? -2 : 2;
        degree = Math.min(SCALE.length - 1, Math.max(0, degree + step));
        const last = phraseEnd && at + len >= BEATS_PER_BAR - 1e-9;
        if (last) degree = 5; // home on A4
        melody.push({ at, midi: SCALE[degree]!, beats: last ? 2 : len * 1.6, vel: (last ? 0.7 : 0.45) + r() * 0.3 });
        at += len;
      }
      if (r() < 0.4) bass = Math.floor(r() * BASS.length);
      if (phraseEnd) bass = 0;
      const root = BASS[bass]!;
      const pad: Note[] = [
        { at: 0, midi: root, beats: BEATS_PER_BAR, vel: 0.6 },
        { at: 0, midi: ABOVE[bass]!, beats: BEATS_PER_BAR, vel: 0.35 },
      ];
      bar++;
      return { melody, pad, counter: [], ostinato: [], ticks: BEAT_TICKS };
    },
  };
}

/** The menu's chords, four voices each: Fmaj7, G add9, Am7 and Cmaj9, all of F Lydian. */
export const CHORDS: readonly (readonly number[])[] = [[41, 53, 57, 60, 64], [43, 55, 59, 62, 64], [45, 57, 60, 64, 67], [36, 52, 55, 59, 62]];

/**
 * The menus: F Lydian at 60 bpm. One soft chord is held for a bar (it comes home to Fmaj7 every fourth bar), no ticks, and in
 * about two bars of five a single distant chime rings over it, high and far apart.
 */
function menuComposer(seed: number): { next(): Bar } {
  const r = stream(seed);
  const T = THEMES.menu;
  let chord = 0;
  let bar = 0;
  return {
    next(): Bar {
      if (r() < 0.55) chord = Math.floor(r() * CHORDS.length);
      if (bar % 4 === 3) chord = 0;
      const pad: Note[] = CHORDS[chord]!.map((midi, i) => ({ at: 0, midi, beats: BEATS_PER_BAR, vel: i === 0 ? 0.5 : 0.3 }));
      const melody: Note[] = [];
      if (r() < 0.4) melody.push({ at: Math.floor(r() * 3) + (r() < 0.5 ? 0 : 0.5), midi: T.melody[Math.floor(r() * T.melody.length)]!, beats: 3, vel: 0.3 + r() * 0.2 });
      bar++;
      return { melody, pad, counter: [], ostinato: [], ticks: [] };
    },
  };
}

/**
 * Medium: D Dorian at 84 bpm. The melody walks the mode in eighths and quarters with fewer rests than the box, home on D5 every
 * fourth bar; under it a soft mallet counterline in the octave below plays on the off-beats, a step at a time.
 */
function marimbaComposer(seed: number): { next(): Bar } {
  const r = stream(seed);
  const T = THEMES.marimba;
  let degree = 4;
  let low = 3;
  let bass = 0;
  let bar = 0;
  return {
    next(): Bar {
      const melody: Note[] = [];
      const counter: Note[] = [];
      const phraseEnd = bar % 4 === 3;
      let at = 0;
      while (at < BEATS_PER_BAR) {
        const len = Math.min(r() < 0.5 ? 1 : 0.5, BEATS_PER_BAR - at);
        if (r() < 0.12 && !(phraseEnd && BEATS_PER_BAR - at <= 2)) {
          at += len;
          continue;
        }
        degree = Math.min(T.melody.length - 1, Math.max(0, degree + (r() < 0.75 ? (r() < 0.5 ? -1 : 1) : r() < 0.5 ? -3 : 3)));
        const last = phraseEnd && at + len >= BEATS_PER_BAR - 1e-9;
        if (last) degree = 7; // home on D5
        melody.push({ at, midi: T.melody[degree]!, beats: last ? 2 : len * 1.3, vel: (last ? 0.7 : 0.45) + r() * 0.3 });
        at += len;
      }
      for (const off of [0.5, 1.5, 2.5, 3.5]) {
        if (r() < 0.25) continue;
        low = Math.min(T.counter.length - 1, Math.max(0, low + (r() < 0.5 ? -1 : 1)));
        counter.push({ at: off, midi: T.counter[low]!, beats: 0.5, vel: 0.3 + r() * 0.2 });
      }
      if (r() < 0.4) bass = Math.floor(r() * T.bass.length);
      if (phraseEnd) bass = 0;
      const pad: Note[] = [
        { at: 0, midi: T.bass[bass]!, beats: BEATS_PER_BAR, vel: 0.55 },
        { at: 0, midi: T.above[bass]!, beats: BEATS_PER_BAR, vel: 0.3 },
      ];
      bar++;
      return { melody, pad, counter, ostinato: [], ticks: BEAT_TICKS };
    },
  };
}

/**
 * Hard: E Phrygian at 96 bpm. A low ostinato pulses on E in eighths (an F on the fourth bar leans on the flat second), a drone on
 * E and B holds the bar, a few high notes ring over the top, and the ticks run in eighths like an escapement.
 */
function clockworkComposer(seed: number): { next(): Bar } {
  const r = stream(seed);
  const T = THEMES.clockwork;
  const accents = [1, 0.5, 0.7, 0.5, 0.9, 0.5, 0.7, 0.6];
  let degree = 0;
  let bar = 0;
  return {
    next(): Bar {
      const melody: Note[] = [];
      const ostinato: Note[] = [];
      const root = T.pulse[bar % 4 === 3 ? 1 : 0]!;
      accents.forEach((a, i) => ostinato.push({ at: i * 0.5, midi: root, beats: 0.5, vel: 0.35 + 0.35 * a }));
      for (const at of [0, 2]) {
        if (r() < 0.45) continue;
        degree = Math.min(T.melody.length - 1, Math.max(0, degree + (r() < 0.5 ? -1 : 1) * (r() < 0.7 ? 1 : 2)));
        melody.push({ at: at + (r() < 0.3 ? 1 : 0), midi: T.melody[degree]!, beats: 2, vel: 0.35 + r() * 0.25 });
      }
      if (!melody.length) melody.push({ at: 0, midi: T.melody[degree]!, beats: 2, vel: 0.35 });
      const pad: Note[] = [
        { at: 0, midi: T.bass[0]!, beats: BEATS_PER_BAR, vel: 0.5 },
        { at: 0, midi: T.above[0]!, beats: BEATS_PER_BAR, vel: 0.3 },
      ];
      bar++;
      return { melody, pad, counter: [], ostinato, ticks: ESCAPEMENT_TICKS };
    },
  };
}

const KEY = 'chronogrip.music.v1';

/** Whether the music is on: it is unless the saved value is exactly '0'. Never throws. */
export function loadMusicOn(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveMusicOn(storage: Pick<Storage, 'setItem'> | null | undefined, on: boolean): void {
  try {
    storage?.setItem(KEY, on ? '1' : '0');
  } catch {
    // quota or security error: the choice just will not persist
  }
}
