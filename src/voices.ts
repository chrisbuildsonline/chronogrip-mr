import { midiToHz } from './music';

/**
 * The music's voices, all WebAudio oscillators (no audio files). Each plays one note from `at` for `len` seconds (the release
 * included: every envelope falls to silence by then, and the oscillators stop themselves) into `out`, and returns the end time.
 * `vel` 0..1 scales the peak; no voice peaks above 0.6.
 */
type Ctx = AudioContext;

/** An envelope gain: from silence to `peak` in `attack` seconds, then an exponential fall to silence at `len`. */
function envelope(c: Ctx, at: number, peak: number, attack: number, len: number, out: AudioNode): GainNode {
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + len);
  env.connect(out);
  return env;
}

const run = (o: OscillatorNode, at: number, len: number, env: GainNode) => {
  o.start(at);
  o.stop(at + len + 0.05);
  o.onended = () => env.disconnect();
};

/** A celesta or music box: FM with the modulator at 3.5 times the pitch, a bright strike that dies in a third of a second. */
export function celesta(c: Ctx, out: AudioNode, at: number, midi: number, len: number, vel: number): number {
  const f = midiToHz(midi);
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const depth = c.createGain();
  const env = envelope(c, at, 0.5 * vel, 0.004, len, out);
  car.frequency.value = f;
  mod.frequency.value = f * 3.5;
  depth.gain.setValueAtTime(f * 0.9, at);
  depth.gain.exponentialRampToValueAtTime(f * 0.03, at + Math.min(0.35, len));
  mod.connect(depth);
  depth.connect(car.frequency);
  car.connect(env);
  run(car, at, len, env);
  mod.start(at);
  mod.stop(at + len + 0.05);
  return at + len;
}

/** A soft electric piano or mallet: FM at a 1:1 ratio with a low index that mellows as the note decays. */
export function epiano(c: Ctx, out: AudioNode, at: number, midi: number, len: number, vel: number): number {
  const f = midiToHz(midi);
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const depth = c.createGain();
  const env = envelope(c, at, 0.42 * vel, 0.008, len, out);
  car.frequency.value = f;
  mod.frequency.value = f;
  depth.gain.setValueAtTime(f * 0.9, at);
  depth.gain.exponentialRampToValueAtTime(f * 0.12, at + Math.min(0.6, len));
  mod.connect(depth);
  depth.connect(car.frequency);
  car.connect(env);
  run(car, at, len, env);
  mod.start(at);
  mod.stop(at + len + 0.05);
  return at + len;
}

/** A pad note: three slightly detuned saws, a slow attack and a long release (`out` is the pad's low-pass, which carries the slow LFO). */
export function padNote(c: Ctx, out: AudioNode, at: number, midi: number, len: number, vel: number): number {
  const f = midiToHz(midi);
  const attack = Math.min(0.9, len * 0.3);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.16 * vel), at + attack);
  env.gain.setValueAtTime(Math.max(0.0002, 0.16 * vel), at + len - Math.min(1.4, len * 0.5));
  env.gain.exponentialRampToValueAtTime(0.0001, at + len);
  env.connect(out);
  [-9, 0, 9].forEach((cents) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = cents;
    g.gain.value = 0.34;
    o.connect(g);
    g.connect(env);
    o.start(at);
    o.stop(at + len + 0.05);
    if (cents === 0) o.onended = () => env.disconnect();
  });
  return at + len;
}

/** A soft bass: a sine with a little triangle on top, gliding down a touch as it lets go. */
export function bassNote(c: Ctx, out: AudioNode, at: number, midi: number, len: number, vel: number): number {
  const f = midiToHz(midi);
  const env = envelope(c, at, 0.5 * vel, 0.02, len, out);
  (['sine', 'triangle'] as const).forEach((type, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    o.frequency.setValueAtTime(f, at + len * 0.6);
    o.frequency.exponentialRampToValueAtTime(f * 0.98, at + len);
    g.gain.value = i === 0 ? 1 : 0.22;
    o.connect(g);
    g.connect(env);
    o.start(at);
    o.stop(at + len + 0.05);
    if (i === 0) o.onended = () => env.disconnect();
  });
  return at + len;
}
