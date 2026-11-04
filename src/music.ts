/**
 * The background music, a clockmaker's music box (src/sound.ts plays it with WebAudio; no audio files). This file is the
 * composing: pure functions from a seed to notes, so a phrase never repeats obviously and a test can read every note.
 * A slow pentatonic melody (A minor pentatonic, two octaves), a low pad that follows the bass, and a quiet tick on every beat.
 */

/** Beats per minute, between 70 and 80; four beats to a bar. */
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

/** A minor pentatonic as MIDI notes, A3 up to E5: the melody never leaves this scale. */
export const SCALE: readonly number[] = [57, 60, 62, 64, 67, 69, 72, 74, 76];
/** The pad: the roots under the melody, A2, D3 and E3, and the note held above each (a fifth, or for E a minor third): all in the scale's pitch classes. */
export const BASS: readonly number[] = [45, 50, 52];
const ABOVE: readonly number[] = [52, 57, 55];

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** `at` and `beats` in beats from the start of the bar; `vel` 0..1. */
export type Note = { at: number; midi: number; beats: number; vel: number };
export type Bar = { melody: Note[]; pad: Note[] };

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
export function composer(seed: number): { next(): Bar } {
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
      return { melody, pad };
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
