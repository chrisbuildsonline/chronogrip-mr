import type { ThemeId } from './stages';

/**
 * The background music (src/sound.ts plays it with WebAudio; no audio files). This file is the composing: pure functions from
 * a seed to notes, so a test can read every note. Harmony comes first: each theme is a 4- or 8-bar chord progression (one chord a
 * bar). The melody is a 2-bar motif and a varied answer (transposed, inverted or rhythm-shifted) over those chords: strong beats
 * (1 and 3) land on chord tones, the notes between are passing or neighbour tones a step apart, a leap is answered by a step, and
 * the last bar of every phrase comes home on the chord's root. Velocities swell to the peak of each phrase and relax.
 * Themes: menu (F Lydian, slow), box = Easy (C major), marimba = Medium (D Dorian), clockwork = Hard (E minor, harmonic colour).
 */

export const BEATS_PER_BAR = 4;
/** The Easy theme's tempo (and the old single tempo some tests still read). */
export const BPM = 74;
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
/** Most voices (notes, not oscillators) sounding at once. */
export const VOICE_CAP = 16;
/** Humanize: each melodic note starts up to this many seconds early or late. */
export const HUMANIZE_S = 0.008;
/** Under this many seconds left on the level clock the pad opens up and the ticks come in. */
export const LOW_TIME_S = 30;
/** Layers fade in over this many bars. */
export const LAYER_FADE_BARS = 2;

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** `at` and `beats` in beats from the start of the bar; `vel` 0..1. */
export type Note = { at: number; midi: number; beats: number; vel: number };
/** A tick of the escapement texture: `at` in beats, `accent` for the louder one. */
export type Tick = { at: number; accent: boolean };
/** One bar: `chord` indexes the theme's progression; the layers are the voices (the arp of Hard is its `melody`). */
export type Bar = { chord: number; melody: Note[]; counter: Note[]; bass: Note[]; pad: Note[]; ticks: Tick[] };

/** The adaptive layers, in the order they come in. */
export type Layer = 'pad' | 'melody' | 'bass' | 'counter' | 'ticks';
export const LAYERS: readonly Layer[] = ['pad', 'melody', 'bass', 'counter', 'ticks'];

/** Level 1-5: pad and melody (the arp, in Hard); 6-10 add the bass; 11-15 the counter-melody; 16-20 the ticks. Under 30 s left the ticks come up at any level. */
export function layersFor(level: number, low = false): Layer[] {
  const out: Layer[] = ['pad', 'melody'];
  if (level >= 6) out.push('bass');
  if (level >= 11) out.push('counter');
  if (level >= 16 || low) out.push('ticks');
  return out;
}

/** A chord: its bass note, the three upper pad notes (MIDI) and every pitch class that counts as a chord tone. */
export type Chord = { name: string; bass: number; pad: readonly number[]; tones: readonly number[] };

/** The voices a theme plays its melody and counter-melody on (src/voices.ts). */
export type VoiceName = 'celesta' | 'epiano';
export type Theme = {
  id: ThemeId;
  bpm: number;
  /** Its share of the music level (1 is the stage themes'). */
  level: number;
  mode: string;
  /** The tonic's pitch class. */
  tonic: number;
  /** Scale pitch classes: the passing and neighbour tones come from here (chord tones are always allowed too). */
  scale: readonly number[];
  chords: readonly Chord[];
  /** Melody range (MIDI, lowest and highest) and the counter-melody's. */
  range: readonly [number, number];
  counterRange: readonly [number, number];
  voice: VoiceName;
  counterVoice: VoiceName;
  /** Rhythms a melody bar may use, as [at, beats] pairs. */
  rhythms: readonly (readonly (readonly [number, number])[])[];
  /** Hard: the melody layer is a flowing 16th-note arpeggio instead of a motif. */
  arp: boolean;
  /** The pad's low-pass cutoff in Hz, and the ticks (every beat, or every eighth). */
  padCutoff: number;
  tickEvery: number;
};

const c = (name: string, bass: number, pad: number[], tones: number[]): Chord => ({ name, bass, pad, tones });

const SLOW: Theme['rhythms'] = [
  [[0, 1.5], [1.5, 0.5], [2, 2]],
  [[0, 2], [2, 1], [3, 1]],
  [[0, 1], [1, 1], [2, 2]],
];
const MID: Theme['rhythms'] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 2]],
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 2]],
  [[0, 2], [2, 1], [3, 1]],
];
const BUSY: Theme['rhythms'] = [
  [[0, 0.5], [0.5, 0.5], [1, 1], [2, 1.5], [3.5, 0.5]],
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
  [[0, 1], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1]],
];

export const THEMES: Record<ThemeId, Theme> = {
  // F Lydian, 60 bpm: Fmaj7 - G6/9 - Am7 - Cmaj9, one chord a bar. Celesta over a slow pad, no ticks.
  menu: {
    id: 'menu', bpm: 60, level: 0.7, mode: 'F Lydian', tonic: 5, scale: [5, 7, 9, 11, 0, 2, 4],
    chords: [c('Fmaj7', 41, [57, 60, 64], [5, 9, 0, 4]), c('G6/9', 43, [59, 62, 64], [7, 11, 2, 4, 9]), c('Am7', 45, [55, 60, 64], [9, 0, 4, 7]), c('Cmaj9', 36, [59, 62, 64], [0, 4, 7, 11, 2])],
    range: [69, 88], counterRange: [57, 72], voice: 'celesta', counterVoice: 'epiano', rhythms: SLOW, arp: false, padCutoff: 1100, tickEvery: 1,
  },
  // C major, 74 bpm: I - vi - IV - V, then I - iii - IV - I. A warm pentatonic celesta tune.
  box: {
    id: 'box', bpm: BPM, level: 1, mode: 'C major pentatonic', tonic: 0, scale: [0, 2, 4, 7, 9],
    chords: [c('C', 36, [55, 60, 64], [0, 4, 7]), c('Am', 45, [57, 60, 64], [9, 0, 4]), c('F', 41, [57, 60, 65], [5, 9, 0]), c('G', 43, [55, 59, 62], [7, 11, 2]),
      c('C', 36, [55, 60, 64], [0, 4, 7]), c('Em', 40, [55, 59, 64], [4, 7, 11]), c('F', 41, [57, 60, 65], [5, 9, 0]), c('C', 36, [55, 60, 64], [0, 4, 7])],
    range: [67, 86], counterRange: [55, 69], voice: 'celesta', counterVoice: 'epiano', rhythms: MID, arp: false, padCutoff: 1500, tickEvery: 1,
  },
  // D Dorian, 84 bpm: Dm7 - G7 - Em7 - Am7, then Dm7 - G7 - Am7 - Dm7. A soft e-piano melody and a celesta counter-line.
  marimba: {
    id: 'marimba', bpm: 84, level: 1, mode: 'D Dorian', tonic: 2, scale: [2, 4, 5, 7, 9, 11, 0],
    chords: [c('Dm7', 38, [53, 57, 60], [2, 5, 9, 0]), c('G7', 43, [53, 59, 62], [7, 11, 2, 5]), c('Em7', 40, [55, 59, 62], [4, 7, 11, 2]), c('Am7', 45, [55, 60, 64], [9, 0, 4, 7]),
      c('Dm7', 38, [53, 57, 60], [2, 5, 9, 0]), c('G7', 43, [53, 59, 62], [7, 11, 2, 5]), c('Am7', 45, [55, 60, 64], [9, 0, 4, 7]), c('Dm7', 38, [53, 57, 60], [2, 5, 9, 0])],
    range: [62, 81], counterRange: [53, 67], voice: 'epiano', counterVoice: 'celesta', rhythms: BUSY, arp: false, padCutoff: 1700, tickEvery: 1,
  },
  // E minor, 92 bpm: Em - Cmaj7 - Am7 - B7 (D# is the harmonic-minor colour), then Em - Cmaj7 - B7 - Em. A flowing 16th arpeggio.
  clockwork: {
    id: 'clockwork', bpm: 92, level: 1, mode: 'E minor (harmonic colour)', tonic: 4, scale: [4, 6, 7, 9, 11, 0, 2, 3],
    chords: [c('Em', 40, [55, 59, 64], [4, 7, 11]), c('Cmaj7', 36, [55, 59, 64], [0, 4, 7, 11]), c('Am7', 45, [55, 60, 64], [9, 0, 4, 7]), c('B7', 47, [57, 63, 66], [11, 3, 6, 9]),
      c('Em', 40, [55, 59, 64], [4, 7, 11]), c('Cmaj7', 36, [55, 59, 64], [0, 4, 7, 11]), c('B7', 47, [57, 63, 66], [11, 3, 6, 9]), c('Em', 40, [55, 59, 64], [4, 7, 11])],
    range: [48, 83], counterRange: [64, 79], voice: 'epiano', counterVoice: 'celesta', rhythms: MID, arp: true, padCutoff: 1300, tickEvery: 0.5,
  },
};
/** Seconds per beat of a theme. */
export const beatOf = (id: ThemeId): number => 60 / THEMES[id].bpm;
/** Seconds in one bar of a theme. */
export const barOf = (id: ThemeId): number => BEATS_PER_BAR * beatOf(id);
/** Every pitch class a theme may play: its scale and the tones of its chords. */
export const pitchClassesOf = (id: ThemeId): Set<number> => {
  const t = THEMES[id];
  return new Set([...t.scale, ...t.chords.flatMap((x) => [...x.tones, x.bass % 12, ...x.pad.map((m) => m % 12)])]);
};

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

/** A phrase's loudness: a rise to the peak at 60% of the phrase, then a relax. `pos` 0..1. */
export const arc = (pos: number): number => (pos < 0.6 ? 0.6 + 0.4 * (pos / 0.6) : 1 - 0.35 * ((pos - 0.6) / 0.4));

const pickFrom = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
/** The MIDI notes in [lo, hi] whose pitch class is in `pcs`, ascending. */
const pitchesIn = (pcs: readonly number[], lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
};
const nearest = (xs: readonly number[], to: number): number => xs.reduce((a, b) => (Math.abs(b - to) < Math.abs(a - to) ? b : a));

/** One step along the scale from `from` in direction `dir`, staying inside the range. */
function stepFrom(from: number, dir: number, scale: readonly number[], range: readonly [number, number]): number {
  let m = from;
  for (let i = 0; i < 3; i++) {
    m += dir;
    if (m < range[0] || m > range[1]) return from;
    if (scale.includes(m % 12)) return m;
  }
  return from;
}

/** A motif note: its place in the 2 bars (beats), length, and a contour step (scale steps, signed). */
type MotifNote = { at: number; beats: number; step: number };

function makeMotif(r: () => number, t: Theme): MotifNote[] {
  const out: MotifNote[] = [];
  let last = pickFrom(r, [1, -1]);
  for (const bar of [0, 1]) {
    for (const [at, beats] of pickFrom(r, t.rhythms)) {
      // mostly steps, now and then a skip; the contour tends to come back the way it went
      let step = r() < 0.7 ? pickFrom(r, [-1, 1]) : pickFrom(r, [-2, 2, 0]);
      if (r() < 0.5) step = -Math.sign(last) * Math.abs(step || 1);
      last = step || last;
      out.push({ at: bar * BEATS_PER_BAR + at, beats, step });
    }
  }
  return out;
}

/** The answer to a motif: inverted, shifted a little in time (one eighth later, the first note holding on), or transposed (same contour, a third up). */
function answerTo(r: () => number, motif: MotifNote[]): { notes: MotifNote[]; lift: number } {
  const kind = pickFrom(r, ['invert', 'shift', 'transpose'] as const);
  if (kind === 'invert') return { notes: motif.map((n) => ({ ...n, step: -n.step })), lift: 0 };
  if (kind === 'shift') {
    // rhythm-shifted: every note after the first moves an eighth later (those that would cross the 2 bars end there)
    return { notes: motif.map((n, i) => (i === 0 || n.at + 0.5 >= 2 * BEATS_PER_BAR ? n : { ...n, at: n.at + 0.5, beats: n.beats })), lift: 0 };
  }
  return { notes: motif, lift: 3 };
}

/** Builds one phrase of melody: [bar][notes]. */
function phraseMelody(r: () => number, t: Theme, start: number): { notes: Note[][]; end: number } {
  const L = t.chords.length;
  const bars: Note[][] = Array.from({ length: L }, () => []);
  let prev = start;
  let leap = 0; // the direction of the last leap, to answer it with a step the other way
  const motif = makeMotif(r, t);
  for (let sub = 0; sub < L / 2; sub++) {
    const isAnswer = sub % 2 === 1;
    const lastSub = sub === L / 2 - 1;
    let notes = motif;
    let lift = 0;
    if (isAnswer) ({ notes, lift } = answerTo(r, motif));
    else if (sub > 0) lift = 2; // the motif returns a step higher
    for (const n of notes) {
      const bar = sub * 2 + Math.floor(n.at / BEATS_PER_BAR);
      const at = n.at % BEATS_PER_BAR;
      if (lastSub && bar === L - 1) continue; // the cadence bar is written below
      const chord = t.chords[bar]!;
      const strong = at % 2 === 0;
      const dir = leap ? -leap : Math.sign(n.step) || 1;
      let midi: number;
      if (strong) {
        const tones = pitchesIn(chord.tones, t.range[0], t.range[1]);
        const target = Math.max(t.range[0], Math.min(t.range[1], prev + (leap ? dir * 2 : n.step * 2 + lift)));
        const ahead = leap ? tones.filter((m) => Math.sign(m - prev) === dir) : tones;
        midi = nearest(ahead.length ? ahead : tones, target);
      } else {
        midi = stepFrom(prev, dir, [...t.scale, ...chord.tones], t.range);
      }
      const jump = midi - prev;
      leap = Math.abs(jump) > 4 ? Math.sign(jump) : 0;
      prev = midi;
      const pos = (bar + at / BEATS_PER_BAR) / L;
      bars[bar]!.push({ at, midi, beats: n.beats, vel: Math.min(0.9, 0.55 * arc(pos) + (strong ? 0.12 : 0.04) + r() * 0.08) });
    }
  }
  // The cadence: a step down towards the root, a passing note, and the chord's root held through the last two beats.
  const last = t.chords[L - 1]!;
  const roots = pitchesIn([last.bass % 12], t.range[0], t.range[1]);
  const tones = pitchesIn(last.tones, t.range[0], t.range[1]);
  const root = nearest(roots, prev);
  const lead = nearest(tones.filter((m) => m !== root), (prev + root) / 2);
  const pass = stepFrom(lead, Math.sign(root - lead) || 1, [...t.scale, ...last.tones], t.range);
  const pos = (L - 1) / L;
  bars[L - 1]!.push({ at: 0, midi: lead, beats: 1, vel: 0.5 * arc(pos) + 0.1 });
  if (pass !== lead && pass !== root && Math.abs(pass - root) <= 2) bars[L - 1]!.push({ at: 1, midi: pass, beats: 1, vel: 0.4 * arc(pos) + 0.06 });
  bars[L - 1]!.push({ at: 2, midi: root, beats: 4, vel: 0.5 * arc(1) + 0.15 });
  return { notes: bars, end: root };
}

/** The flowing arpeggio patterns (indices into the chord's tones, two octaves up from the root). All move by a step of the chord or a third. */
const ARP: readonly ((k: number, top: number) => number)[] = [
  (k, top) => bounce(k, top), // up and down
  (k, top) => top - bounce(k, top), // down and up
  (k) => [0, 2, 1, 2][k % 4]!, // alberti
  (k) => [0, 1, 2, 1][k % 4]!, // a rocking third
];
/** 0, 1, 2 .. top, top-1 .. 1, 0, 1 ..: a triangle wave. */
function bounce(k: number, top: number): number {
  const period = 2 * top;
  const m = k % period;
  return m <= top ? m : period - m;
}

/** The chord's tones as MIDI, ascending for two octaves from its root. */
function arpTones(chord: Chord): number[] {
  const base = chord.bass + 12;
  const offs = chord.tones.map((pc) => (pc - chord.bass + 1200) % 12).sort((a, b) => a - b);
  return [...offs.map((o) => base + o), ...offs.map((o) => base + 12 + o)];
}

/**
 * The composer: call `next()` for each bar in turn; the progression and the phrase loop on their own. The same seed always gives
 * the same music.
 */
export function composer(seed: number, theme: ThemeId = 'box'): { next(): Bar } {
  const t = THEMES[theme];
  const r = stream(seed);
  const L = t.chords.length;
  let bar = 0;
  let phrase: Note[][] = [];
  let carry = Math.round((t.range[0] + t.range[1]) / 2);
  let counterAt = Math.round((t.counterRange[0] + t.counterRange[1]) / 2);
  let pattern = -1;
  return {
    next(): Bar {
      const i = bar % L;
      const chord = t.chords[i]!;
      const pos = i / L;
      if (i === 0) {
        const p = phraseMelody(r, t, carry);
        phrase = p.notes;
        carry = p.end;
      }
      let melody: Note[] = phrase[i]!;
      if (t.arp) {
        const tones = arpTones(chord);
        const top = tones.length - 1;
        let p = Math.floor(r() * ARP.length);
        if (p === pattern) p = (p + 1) % ARP.length;
        pattern = p;
        const cadence = i === L - 1;
        const count = cadence ? 8 : 16;
        melody = [];
        for (let k = 0; k < count; k++) {
          const accent = k % 4 === 0 ? 0.12 : k % 2 === 0 ? 0.04 : 0;
          melody.push({ at: k * 0.25, midi: tones[Math.min(top, ARP[p]!(k, top))]!, beats: 0.5, vel: Math.min(0.9, 0.4 * arc(pos) + accent + 0.1 + r() * 0.05) });
        }
        // the cadence bar: the arpeggio settles and the root rings through the last two beats
        if (cadence) melody.push({ at: 2, midi: chord.bass + 12, beats: 4, vel: 0.5 });
      }
      const counter: Note[] = [];
      const ctones = pitchesIn(chord.tones, t.counterRange[0], t.counterRange[1]);
      for (const at of [0, 2]) {
        const others = ctones.filter((m) => m !== counterAt && Math.abs(m - counterAt) <= 5);
        counterAt = others.length ? pickFrom(r, others) : nearest(ctones, counterAt);
        counter.push({ at, midi: counterAt, beats: 2, vel: 0.3 * arc(pos) + 0.1 });
      }
      const bass: Note[] = [{ at: 0, midi: chord.bass, beats: 2, vel: 0.55 }];
      if (t.id !== 'menu') bass.push({ at: 2, midi: i === L - 1 ? chord.bass : chord.bass + (r() < 0.5 ? 7 : 0), beats: 2, vel: 0.42 });
      const pad = chord.pad.map((midi, k) => ({ at: 0, midi, beats: BEATS_PER_BAR, vel: k === 0 ? 0.5 : 0.4 }));
      const ticks: Tick[] = [];
      for (let at = 0; at < BEATS_PER_BAR; at += t.tickEvery) ticks.push({ at, accent: at % 2 === 0 });
      bar++;
      return { chord: i, melody, counter, bass, pad, ticks };
    },
  };
}

/** A stereo impulse response of decaying noise (a room or hall tail), built once: `rand` gives numbers in 0..1. */
export function impulseResponse(sampleRate: number, seconds = 2.5, rand: () => number = Math.random): [Float32Array, Float32Array] {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const make = () => {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = (rand() * 2 - 1) * (1 - i / n) ** 3;
    return d;
  };
  return [make(), make()];
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
