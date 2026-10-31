import type { Vec3 } from './seat';

/** Seconds between ticks at a rate in ticks per second; no rate, no ticks. */
export const tickInterval = (rate: number) => (rate > 0 && Number.isFinite(rate) ? 1 / rate : Infinity);

/** Ticks to emit as the escapement phase (one whole step per tick) moves from one frame to the next. */
export const ticksBetween = (from: number, to: number) => (to > from ? Math.floor(to) - Math.floor(from) : 0);

export type SoundState = 'none' | 'suspended' | 'running' | 'closed';
export type SoundCounts = { ticks: number; clicks: number; grinds: number; chimes: number };

/** Everything is built from oscillators and noise: no audio files. Nothing plays, throws or logs until unlock(). */
export function createSound() {
  let ctx: AudioContext | null = null;
  let out: GainNode;
  let panner: PannerNode;
  let noise: AudioBuffer;
  const source: [number, number, number] = [0, 0, 0];
  const counts: SoundCounts = { ticks: 0, clicks: 0, grinds: 0, chimes: 0 };

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
  const live = () => (ctx && ctx.state !== 'closed' ? ctx : null);

  return {
    counts,
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
        }
        void ctx.resume().catch(() => undefined);
      } catch {
        ctx = null;
      }
    },
    /** One tick of the escapement, from where it sits in the room. */
    tick(): void {
      const c = live();
      if (!c) return;
      counts.ticks++;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 1800 + 200 * (counts.ticks % 2);
      voice(c, o, 0.5, 0.03, panner, [filter(c, 'bandpass', 2400, 2)]);
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
