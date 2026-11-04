import type { Vec3 } from './seat';
import { BEATS_PER_BAR, DUCK, FADE_S, LOWPASS_HZ, MUSIC_GAIN, PAUSE_GAIN, THEMES, beatOf, composer, midiToHz, type Bar } from './music';
import type { ThemeId } from './stages';

/** Seconds between ticks at a rate in ticks per second; no rate, no ticks. */
export const tickInterval = (rate: number) => (rate > 0 && Number.isFinite(rate) ? 1 / rate : Infinity);

/** Ticks to emit as the escapement phase (one whole step per tick) moves from one frame to the next. */
export const ticksBetween = (from: number, to: number) => (to > from ? Math.floor(to) - Math.floor(from) : 0);

/**
 * How loud the escapement's ticks (the bird's flapping, heard once a level is solved) are `seconds` after the solve: full
 * until 2 s, then a linear fade to silence at 3 s, and none after. The bird can keep flapping on screen; it is silent.
 */
export const tickGain = (seconds: number): number => (seconds <= 2 ? 1 : seconds >= 3 ? 0 : 3 - seconds);

export type SoundState = 'none' | 'suspended' | 'running' | 'closed';
export type SoundCounts = { ticks: number; clicks: number; grinds: number; chimes: number; notes: number };

const KEY = 'chronogrip.sound.v1';

/** Whether sound is on: it is unless the saved value is exactly '0'. Never throws. */
export function loadSoundOn(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveSoundOn(storage: Pick<Storage, 'setItem'> | null | undefined, on: boolean): void {
  try {
    storage?.setItem(KEY, on ? '1' : '0');
  } catch {
    // quota or security error: the choice just will not persist
  }
}

/** Everything is built from oscillators and noise: no audio files. Nothing plays, throws or logs until unlock(). */
export function createSound() {
  let ctx: AudioContext | null = null;
  let out: GainNode;
  let panner: PannerNode;
  let noise: AudioBuffer;
  const source: [number, number, number] = [0, 0, 0];
  const counts: SoundCounts = { ticks: 0, clicks: 0, grinds: 0, chimes: 0, notes: 0 };

  /** A one-shot voice: a source into a gain that falls to silence over `len` seconds, into `to`. */
  const voice = (c: AudioContext, src: AudioScheduledSourceNode, peak: number, len: number, to: AudioNode, chain: AudioNode[] = []) => {
    const env = c.createGain();
    const t = c.currentTime;
    env.gain.setValueAtTime(peak, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    [src, ...chain, env, to].reduce((a, b) => (a.connect(b), b));
    src.start(t);
    src.stop(t + len + 0.02);
  };
  const noiseSource = (c: AudioContext) => Object.assign(c.createBufferSource(), { buffer: noise });
  const filter = (c: AudioContext, type: BiquadFilterType, freq: number, q = 1) => {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };
  let muted = false;
  const live = () => (ctx && ctx.state !== 'closed' && !muted ? ctx : null);

  // The music bed (src/music.ts composes it): a gentle music box, a low pad and a quiet tick, at -24 dB through a low-pass.
  // It starts with the context (after the first gesture), fades in and out over 2 s, and plays only while Music and Sound are both on.
  let musicOn = true;
  let musicGain: GainNode | null = null;
  let pauseGain: GainNode | null = null;
  let ducked = false;
  let nextBar = 0;
  let pump: ReturnType<typeof setInterval> | null = null;
  let hiddenSuspend = false;
  // One theme at a time (src/music.ts THEMES): each has its own gain into the music bed, so changing theme is a 2 s crossfade
  // (the old one fades down while the notes already scheduled ring out, the new one fades up from its first bar).
  let theme: ThemeId = 'box';
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const composers = new Map<ThemeId, ReturnType<typeof composer>>();
  const composing = (id: ThemeId) => composers.get(id) ?? composers.set(id, composer(seed, id)).get(id)!;
  const themeGains = new Map<ThemeId, GainNode>();
  const themeGain = (c: AudioContext, id: ThemeId, start: number) => {
    let g = themeGains.get(id);
    if (!g) {
      g = c.createGain();
      g.gain.value = start;
      g.connect(musicGain!);
      themeGains.set(id, g);
    }
    return g;
  };
  /** Fades every theme to its place: the current one up to 1, the rest down to 0, over the fade time. */
  const crossfade = (c: AudioContext) => {
    const t = c.currentTime;
    themeGain(c, theme, 0);
    for (const [id, g] of themeGains) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(id === theme ? THEMES[id].level : 0, t + FADE_S);
    }
  };
  const musicWanted = () => musicOn && !muted;
  /** Fades the bed to its level, or to silence, over the fade time. */
  const musicLevel = () => {
    if (!ctx || !musicGain) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(musicWanted() ? MUSIC_GAIN : 0, t + FADE_S);
    if (musicWanted()) nextBar = Math.max(nextBar, t + 0.3);
  };
  /** One note of the bed: a pluck (sine and a slightly detuned triangle, a fast attack, a long decay) or a pad (a slow swell). */
  const note = (c: AudioContext, at: number, midi: number, beats: number, vel: number, voice: 'pluck' | 'pad' | 'mallet' | 'pulse', id: ThemeId) => {
    if (!musicGain) return;
    counts.notes++;
    const pad = voice === 'pad';
    const beat = beatOf(id);
    const len = beats * beat * (pad ? 1 : voice === 'pluck' ? 2.2 : voice === 'mallet' ? 1.6 : 0.9);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel * (pad ? 0.35 : voice === 'pulse' ? 0.45 : 0.6)), at + (pad ? 1.2 : voice === 'pulse' ? 0.012 : 0.006));
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    env.connect(themeGain(c, id, id === theme ? THEMES[id].level : 0));
    (pad ? (id === 'menu' ? ['sine', 'sine'] : ['sine']) : voice === 'pulse' ? ['triangle'] : ['sine', 'triangle']).forEach((type, i) => {
      const o = c.createOscillator();
      o.type = type as OscillatorType;
      o.frequency.value = midiToHz(midi);
      o.detune.value = pad ? (id === 'menu' ? i * 10 - 5 : 0) : i * 7 - 3; // the menu pad's two voices drift a little apart, like tape
      o.connect(env);
      o.start(at);
      o.stop(at + len + 0.05);
    });
  };
  const scheduleBar = (c: AudioContext, at: number, bar: Bar, id: ThemeId) => {
    const beat = beatOf(id);
    for (const n of bar.melody) note(c, at + n.at * beat, n.midi, n.beats, n.vel, id === 'box' ? 'pluck' : id === 'marimba' ? 'mallet' : 'pluck', id);
    for (const n of bar.counter) note(c, at + n.at * beat, n.midi, n.beats, n.vel, 'mallet', id);
    for (const n of bar.ostinato) note(c, at + n.at * beat, n.midi, n.beats, n.vel, 'pulse', id);
    for (const n of bar.pad) note(c, at, n.midi, n.beats, n.vel, 'pad', id);
    // A very quiet escapement tick: every beat, or in eighths with an accent in the Hard theme.
    for (const tick of bar.ticks) {
      const when = at + tick.at * beat;
      const o = c.createOscillator();
      const env = c.createGain();
      o.type = 'triangle';
      o.frequency.value = tick.accent ? 1900 : 1700;
      env.gain.setValueAtTime(id === 'clockwork' ? (tick.accent ? 0.06 : 0.035) : 0.05, when);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
      o.connect(env);
      env.connect(themeGain(c, id, id === theme ? THEMES[id].level : 0));
      o.start(when);
      o.stop(when + 0.04);
    }
  };
  /** Keeps the bed scheduled about a second and a half ahead, while the context runs and the music is wanted. */
  const feed = () => {
    const c = ctx;
    if (!c || c.state !== 'running' || !musicWanted()) return;
    while (nextBar < c.currentTime + 1.5) {
      scheduleBar(c, nextBar, composing(theme).next(), theme);
      nextBar += BEATS_PER_BAR * beatOf(theme);
    }
  };

  return {
    counts,
    /** Options: sound off makes no voice at all (the context stays, so turning it on again needs no new gesture). */
    get muted() {
      return muted;
    },
    setMuted(m: boolean): void {
      muted = m;
      musicLevel();
    },
    /** Options: the Music switch. Sound off silences the music too. */
    get musicOn() {
      return musicOn;
    },
    setMusic(on: boolean): void {
      musicOn = on;
      musicLevel();
    },
    /** The pause card: the stage's music stays but steps down about 6 dB, and comes back with the level. */
    get ducked() {
      return ducked;
    },
    setDucked(on: boolean): void {
      ducked = on;
      if (!ctx || !pauseGain) return;
      const t = ctx.currentTime;
      pauseGain.gain.cancelScheduledValues(t);
      pauseGain.gain.setValueAtTime(pauseGain.gain.value, t);
      pauseGain.gain.linearRampToValueAtTime(on ? PAUSE_GAIN : 1, t + 0.5);
    },
    /** The theme playing (or about to, before the first gesture). */
    get theme(): ThemeId {
      return theme;
    },
    /** Moves the music to another theme: a 2 s crossfade, the new one starting on its own first bar. The same theme again changes nothing. */
    setTheme(id: ThemeId): void {
      if (id === theme) return;
      theme = id;
      if (!ctx || !musicGain) return;
      crossfade(ctx);
      nextBar = ctx.currentTime + 0.3;
    },
    state: (): SoundState => (ctx ? (ctx.state === 'interrupted' ? 'suspended' : ctx.state) : 'none'),
    /** Creates the context on the first call and resumes it; a user gesture must have started the call. */
    unlock(): void {
      try {
        if (!ctx) {
          const c = (ctx = new AudioContext());
          out = c.createGain();
          out.gain.value = 0.5;
          out.connect(c.destination);
          panner = c.createPanner();
          panner.panningModel = 'HRTF';
          panner.distanceModel = 'inverse';
          panner.refDistance = 0.3;
          panner.connect(out);
          noise = c.createBuffer(1, c.sampleRate / 2, c.sampleRate);
          const d = noise.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          this.setSource(source);
          // The music bed: its own gain (faded in from silence), a gentle low-pass, then the speakers.
          musicGain = c.createGain();
          musicGain.gain.value = 0;
          const soft = filter(c, 'lowpass', LOWPASS_HZ, 0.5);
          // A pause steps the music down about 6 dB (`setDucked`), through its own gain so it never fights the fanfare's duck.
          pauseGain = c.createGain();
          musicGain.connect(pauseGain);
          pauseGain.connect(soft);
          soft.connect(c.destination);
          themeGain(c, theme, THEMES[theme].level);
          nextBar = c.currentTime + 0.3;
          pump = setInterval(feed, 250);
          musicLevel();
          // The tab hidden: the whole context rests, and wakes with the tab.
          if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
              if (!ctx) return;
              if (document.visibilityState === 'hidden' && ctx.state === 'running') {
                hiddenSuspend = true;
                void ctx.suspend().catch(() => undefined);
              } else if (document.visibilityState === 'visible' && hiddenSuspend) {
                hiddenSuspend = false;
                void ctx.resume().catch(() => undefined);
              }
            });
          }
        }
        void ctx.resume().catch(() => undefined);
      } catch {
        ctx = null;
      }
    },
    /** One tick of the escapement, from where it sits in the room. */
    tick(level = 1): void {
      const c = live();
      if (!c || level <= 0) return;
      counts.ticks++;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 1800 + 200 * (counts.ticks % 2);
      voice(c, o, 0.5 * Math.min(1, level), 0.03, panner, [filter(c, 'bandpass', 2400, 2)]);
    },
    /** A gear snaps onto an axle: a short metallic click. */
    click(): void {
      const c = live();
      if (!c) return;
      counts.clicks++;
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 1500;
      voice(c, o, 0.4, 0.07, out);
      voice(c, noiseSource(c), 0.3, 0.025, out, [filter(c, 'highpass', 3500)]);
    },
    /** A placement jams the train: a short, low, noisy buzz. */
    grind(): void {
      const c = live();
      if (!c) return;
      counts.grinds++;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 70;
      voice(c, o, 0.3, 0.35, out, [filter(c, 'lowpass', 400)]);
      voice(c, noiseSource(c), 0.35, 0.35, out, [filter(c, 'bandpass', 220, 0.8)]);
    },
    /** Calibrated: a soft bell of a few inharmonic partials. */
    chime(): void {
      const c = live();
      if (!c) return;
      counts.chimes++;
      // The music steps back under the fanfare, then returns.
      if (musicGain && musicWanted()) {
        const t = c.currentTime;
        musicGain.gain.cancelScheduledValues(t);
        musicGain.gain.setTargetAtTime(MUSIC_GAIN * DUCK.to, t, 0.15);
        musicGain.gain.setTargetAtTime(MUSIC_GAIN, t + DUCK.seconds, 0.8);
      }
      [[880, 0.16, 1.6], [1318.5, 0.1, 1.2], [2217, 0.05, 0.8]].forEach(([f, peak, len]) => {
        const o = c.createOscillator();
        o.frequency.value = f!;
        voice(c, o, peak!, len!, out);
      });
    },
    /** Keeps the listener on the head: position, forward and up in world space. */
    setListener(pos: Vec3, forward: Vec3, up: Vec3): void {
      const l = ctx?.listener;
      if (!l) return;
      l.positionX.value = pos[0];
      l.positionY.value = pos[1];
      l.positionZ.value = pos[2];
      l.forwardX.value = forward[0];
      l.forwardY.value = forward[1];
      l.forwardZ.value = forward[2];
      l.upX.value = up[0];
      l.upY.value = up[1];
      l.upZ.value = up[2];
    },
    /** Where the ticks come from, in world space. The caller may reuse `pos`: it is copied. */
    setSource(pos: Vec3): void {
      source[0] = pos[0];
      source[1] = pos[1];
      source[2] = pos[2];
      if (!ctx) return;
      panner.positionX.value = pos[0];
      panner.positionY.value = pos[1];
      panner.positionZ.value = pos[2];
    },
    suspend(): void {
      if (ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
    },
    resume(): void {
      if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
    },
  };
}
