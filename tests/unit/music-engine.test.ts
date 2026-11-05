import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSound } from '../../src/sound';
import { MUSIC_GAIN, FADE_S, PAUSE_GAIN, THEMES, VOICE_CAP, barOf, beatOf } from '../../src/music';

/** A stand-in for WebAudio: records every node made and lets the test move the clock. */
class FakeParam {
  value = 0;
  calls: [string, number, number?][] = [];
  setValueAtTime(v: number, t: number) { this.value = v; this.calls.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.calls.push(['ramp', v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.calls.push(['exp', v, t]); return this; }
  setTargetAtTime(v: number, t: number) { this.calls.push(['target', v, t]); return this; }
  cancelScheduledValues() { return this; }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  detune = new FakeParam();
  Q = new FakeParam();
  delayTime = new FakeParam();
  buffer: unknown = null;
  onended: unknown = null;
  type = '';
  connect(n: unknown) { return n; }
  start() {}
  stop() {}
}
const made = { osc: [] as FakeNode[], gains: [] as FakeNode[], filters: [] as FakeNode[], convolvers: [] as FakeNode[], delays: [] as FakeNode[], sources: [] as FakeNode[] };
const irs: Float32Array[] = [];
let now = 0;
let state = 'suspended';
let created = 0;
class FakeContext {
  sampleRate = 8000;
  destination = new FakeNode();
  listener = {};
  constructor() { created++; }
  get currentTime() { return now; }
  get state() { return state; }
  resume() { state = 'running'; return Promise.resolve(); }
  suspend() { state = 'suspended'; return Promise.resolve(); }
  createGain() { const g = new FakeNode(); made.gains.push(g); return g; }
  createOscillator() { const o = new FakeNode(); made.osc.push(o); return o; }
  createBiquadFilter() { const f = new FakeNode(); made.filters.push(f); return f; }
  createPanner() { return Object.assign(new FakeNode(), { positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam() }); }
  createBuffer(_c: number, n: number) { const chans = [new Float32Array(n), new Float32Array(n)]; irs.push(...chans); return { duration: n / this.sampleRate, getChannelData: (i = 0) => chans[i]! }; }
  createBufferSource() { const n = new FakeNode(); made.sources.push(n); return n; }
  createConvolver() { const n = new FakeNode(); made.convolvers.push(n); return n; }
  createDelay() { const n = new FakeNode(); made.delays.push(n); return n; }
}

beforeEach(() => {
  vi.useFakeTimers();
  made.osc = []; made.gains = []; made.filters = []; made.convolvers = []; made.delays = []; made.sources = []; irs.length = 0;
  now = 0; state = 'suspended'; created = 0;
  vi.stubGlobal('AudioContext', FakeContext);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const run = (secs: number) => {
  for (let t = 0; t < secs; t += 0.25) {
    now += 0.25;
    vi.advanceTimersByTime(250);
  }
};
const hz = (o: FakeNode) => o.frequency.value;
/** Gains that carry sound (not the FM modulators' and the pad LFO's depths, which are in hertz and so start above 1). */
const amplitudeGains = () => made.gains.filter((g) => !g.gain.calls.some(([k, v]) => k === 'set' && v > 1) && !(g.gain.calls.length === 0 && g.gain.value > 1));

describe('the music bed', () => {
  it('makes nothing before the first gesture, then starts with the context', async () => {
    const s = createSound();
    run(3);
    expect(created).toBe(0);
    expect(s.counts.notes).toBe(0);
    s.unlock();
    await Promise.resolve();
    run(4);
    expect(created).toBe(1);
    expect(s.counts.notes).toBeGreaterThan(3);
  });

  it('sits under the -24 dB master, fading in from silence over 2 s, through a soft low-pass, no envelope above 0.7', async () => {
    const s = createSound();
    s.unlock();
    await Promise.resolve();
    run(20);
    const master = made.gains.find((g) => g.gain.calls.some(([k, v]) => k === 'ramp' && Math.abs(v - MUSIC_GAIN) < 1e-9))!;
    expect(master).toBeDefined();
    const ramp = master.gain.calls.find(([k]) => k === 'ramp')!;
    expect(ramp[1]).toBeCloseTo(MUSIC_GAIN, 9);
    expect(ramp[2]).toBeCloseTo(2, 6);
    for (const g of amplitudeGains()) for (const [k, v] of g.gain.calls) if (k === 'exp') expect(v).toBeLessThan(0.7);
    expect(MUSIC_GAIN).toBeLessThan(0.07);
    expect(made.filters.some((f) => f.type === 'lowpass' && f.frequency.value >= 1000 && f.frequency.value <= 5000)).toBe(true);
  });

  it('keeps the bed about 1.5 s ahead: a bar of notes every bar of the theme', async () => {
    const s = createSound();
    s.unlock();
    await Promise.resolve();
    run(12);
    const bars = Math.floor(12 / barOf('box'));
    // pad (3 notes) + melody (2 to 5) a bar at level 1
    expect(s.counts.notes).toBeGreaterThanOrEqual(5 * bars);
    expect(s.counts.notes).toBeLessThanOrEqual(10 * (bars + 3));
  });

  it('creates no music while Music is off, resumes (with a fresh fade) when turned on, and Sound off silences it too', async () => {
    const s = createSound();
    s.setMusic(false);
    s.unlock();
    await Promise.resolve();
    run(6);
    expect(s.musicOn).toBe(false);
    expect(s.counts.notes).toBe(0);
    expect(made.osc).toHaveLength(0);

    s.setMusic(true);
    run(4);
    const played = s.counts.notes;
    expect(played).toBeGreaterThan(0);

    s.setMuted(true); // Sound off
    run(2); // the fade
    const after = s.counts.notes;
    run(8);
    expect(s.counts.notes, 'nothing is scheduled while sound is off').toBe(after);
    s.setMuted(false);
    run(4);
    expect(s.counts.notes).toBeGreaterThan(after);
  });

  it('steps back under the fanfare: the chime ducks the music gain and brings it back', async () => {
    const s = createSound();
    s.unlock();
    await Promise.resolve();
    run(4);
    s.chime();
    const master = made.gains.find((g) => g.gain.calls.some(([k]) => k === 'target'))!;
    const targets = master.gain.calls.filter(([k]) => k === 'target');
    expect(targets[0]![1]).toBeLessThan(MUSIC_GAIN);
    expect(targets[0]![1]).toBeGreaterThan(0);
    expect(targets[1]![1]).toBeCloseTo(MUSIC_GAIN, 9);
    expect(targets[1]![2]!).toBeGreaterThan(targets[0]![2]!);
  });

  it('never throws without WebAudio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const s = createSound();
    expect(() => {
      s.setMusic(true);
      s.unlock();
      s.setMuted(true);
    }).not.toThrow();
  });
});

describe('the escapement tick after a solve', () => {
  it('makes a voice that stops itself, scaled by the fade, and none once the fade has reached zero', async () => {
    const s = createSound();
    s.setMusic(false); // only the effects, so the count is the tick's
    s.unlock();
    await Promise.resolve();
    const before = made.osc.length;
    s.tick(1);
    s.tick(0.4);
    expect(made.osc.length - before).toBe(2);
    expect(s.counts.ticks).toBe(2);
    s.tick(0); // 3 s after the solve: silent, nothing started
    expect(made.osc.length - before).toBe(2);
    expect(s.counts.ticks).toBe(2);
  });
});

describe('the themes', () => {
  it('a theme set before the first gesture is the one that plays, with its own tempo, and each entry restarts its progression', async () => {
    const s = createSound();
    expect(s.theme).toBe('box');
    s.setTheme('clockwork');
    expect(s.theme).toBe('clockwork');
    s.unlock();
    await Promise.resolve();
    run(8);
    expect(s.counts.notes).toBeGreaterThan(20); // a 16th arpeggio is busy
    expect(made.delays.some((d) => Math.abs(d.delayTime.value - 0.75 * beatOf('clockwork')) < 1e-9), 'a dotted-eighth delay at Hard\'s tempo').toBe(true);
  });

  it('crossfades over 2 s: the old theme\'s gain ramps down to 0 and the new one\'s up to 1, then only the new theme is composed', async () => {
    const s = createSound();
    s.unlock();
    await Promise.resolve();
    run(6);
    const before = made.gains.length;
    const t0 = now;
    s.setTheme('marimba');
    expect(s.theme).toBe('marimba');
    run(0.5);
    const ramps = made.gains.flatMap((g) => g.gain.calls.filter(([k, , t]) => k === 'ramp' && Math.abs((t ?? 0) - (t0 + FADE_S)) < 1e-6).map(([, v]) => v));
    expect(ramps.sort(), 'one theme down, one up, both over the fade').toEqual([0, 1]);
    // The new theme's gain was created at silence and only ever ramps up; the old one only down.
    const up = made.gains.slice(before).filter((g) => g.gain.calls.some(([k, v]) => k === 'ramp' && v === 1));
    expect(up).toHaveLength(1);
    expect(up[0]!.gain.calls.find(([k]) => k === 'set')![1]).toBe(0);
    run(8);
    // The same theme again changes nothing; going back crossfades again.
    const n = made.gains.length;
    s.setTheme('marimba');
    run(0.5);
    expect(made.gains.length).toBe(n);
    s.setTheme('box');
    run(0.5);
    expect(s.theme).toBe('box');
  });

  it('keeps the rules: Music off or Sound off silences every theme, the master level stays -24 dB, and a theme change makes no sound by itself', async () => {
    const s = createSound();
    s.setMusic(false);
    s.setTheme('clockwork');
    s.unlock();
    await Promise.resolve();
    run(6);
    expect(s.counts.notes).toBe(0);
    expect(s.theme).toBe('clockwork');
    s.setMusic(true);
    run(4);
    expect(s.counts.notes).toBeGreaterThan(0);
    s.setMuted(true);
    run(2);
    const after = s.counts.notes;
    s.setTheme('marimba');
    run(6);
    expect(s.counts.notes, 'silent while Sound is off, whatever the theme').toBe(after);
    const masters = made.gains.filter((g) => g.gain.calls.some(([k, v]) => k === 'ramp' && Math.abs(v - MUSIC_GAIN) < 1e-9));
    expect(masters.length).toBe(1);
    for (const g of made.gains) for (const [k, v] of g.gain.calls) if (k === 'ramp') expect(v).toBeLessThanOrEqual(1);
    expect(MUSIC_GAIN).toBeLessThan(0.07);
  });

  it('the menu theme fades in at a lower level than a stage theme and has only pad and melody layers', async () => {
    const s = createSound();
    s.setTheme('menu');
    s.setIntensity(20, true); // the menus ignore the level and the clock
    s.unlock();
    await Promise.resolve();
    run(10);
    expect(made.gains.some((g) => g.gain.value === THEMES.menu.level), 'its gain sits at the menu level, under 1').toBe(true);
    expect(THEMES.menu.level).toBeLessThan(1);
    expect(s.layers.layers).toEqual(['pad', 'melody']);
    expect(made.sources.length, 'no ticks in the menus').toBe(0);
    const t0 = now;
    s.setTheme('clockwork');
    run(0.5);
    const ramps = made.gains.flatMap((g) => g.gain.calls.filter(([k, , t]) => k === 'ramp' && Math.abs((t ?? 0) - (t0 + FADE_S)) < 1e-6).map(([, v]) => v));
    expect(ramps.sort()).toEqual([0, 1]);
  });

  it('a pause keeps the theme and steps the music down 6 dB over half a second, and back up on resume', async () => {
    const s = createSound();
    s.setTheme('marimba');
    s.unlock();
    await Promise.resolve();
    run(4);
    const t0 = now;
    s.setDucked(true);
    expect(s.theme).toBe('marimba');
    expect(s.ducked).toBe(true);
    const down = made.gains.flatMap((g) => g.gain.calls.filter(([k, v, t]) => k === 'ramp' && Math.abs(v - PAUSE_GAIN) < 1e-9 && Math.abs((t ?? 0) - (t0 + 0.5)) < 1e-6));
    expect(down).toHaveLength(1);
    expect(20 * Math.log10(PAUSE_GAIN)).toBeCloseTo(-6, 0);
    run(2);
    s.setDucked(false);
    const up = made.gains.flatMap((g) => g.gain.calls.filter(([k, v]) => k === 'ramp' && v === 1));
    expect(up.length).toBeGreaterThan(0);
    expect(s.ducked).toBe(false);
  });
});

describe('the flow: reverb, delay, layers, voices', () => {
  it('builds one reverb convolver with a 2.5 s stereo impulse, once, and a delay only for the themes that play', async () => {
    const s = createSound();
    s.unlock();
    await Promise.resolve();
    run(10);
    expect(made.convolvers).toHaveLength(1);
    const ir = irs.filter((x) => x.length === Math.floor(8000 * 2.5));
    expect(ir.length, 'a stereo impulse of 2.5 s').toBe(2);
    expect(ir[0]!.some((x) => x !== 0)).toBe(true);
    s.setTheme('marimba');
    run(8);
    expect(made.convolvers, 'still one').toHaveLength(1);
    expect(made.delays.length).toBe(2);
    for (const d of made.delays) expect(d.delayTime.value).toBeCloseTo(0.75 * (made.delays.indexOf(d) === 0 ? beatOf('box') : beatOf('marimba')), 9);
  });

  it('the layers follow the level: pad + melody, then bass, counter-melody, ticks; they fade in over two bars; fewer when the level falls', async () => {
    const s = createSound();
    s.setIntensity(3, false);
    s.unlock();
    await Promise.resolve();
    run(8);
    expect(s.layers.layers).toEqual(['pad', 'melody']);
    expect(made.sources.length).toBe(0);
    const t0 = now;
    s.setIntensity(8, false);
    expect(s.layers.layers).toEqual(['pad', 'melody', 'bass']);
    const fade = made.gains.flatMap((g) => g.gain.calls.filter(([k, v, t]) => k === 'ramp' && v === 1 && Math.abs((t ?? 0) - (t0 + 2 * barOf('box'))) < 1e-6));
    expect(fade.length, 'the new layer ramps in over two bars').toBeGreaterThan(0);
    s.setIntensity(12, false);
    expect(s.layers.layers).toEqual(['pad', 'melody', 'bass', 'counter']);
    run(6);
    expect(made.sources.length).toBe(0);
    s.setIntensity(17, false);
    run(6);
    expect(s.layers.layers).toEqual(['pad', 'melody', 'bass', 'counter', 'ticks']);
    expect(made.sources.length, 'noise ticks play from level 16').toBeGreaterThan(0);
    s.setIntensity(2, false);
    expect(s.layers.layers).toEqual(['pad', 'melody']);
    expect(s.layers.level).toBe(2);
  });

  it('under 30 s left the ticks come up and the pad filter opens; solving or restarting puts it back', async () => {
    const s = createSound();
    s.setIntensity(2, false);
    s.unlock();
    await Promise.resolve();
    run(6);
    const pad = made.filters.find((f) => f.type === 'lowpass' && f.frequency.value === THEMES.box.padCutoff)!;
    expect(pad).toBeDefined();
    const before = made.sources.length;
    s.setIntensity(2, true);
    run(6);
    expect(s.layers.low).toBe(true);
    expect(s.layers.layers).toContain('ticks');
    expect(made.sources.length).toBeGreaterThan(before);
    const open = pad.frequency.calls.filter(([k]) => k === 'target').at(-1)!;
    expect(open[1]).toBeGreaterThan(THEMES.box.padCutoff);
    s.setIntensity(2, false);
    expect(s.layers.layers).toEqual(['pad', 'melody']);
    expect(pad.frequency.calls.filter(([k]) => k === 'target').at(-1)![1]).toBe(THEMES.box.padCutoff);
  });

  it.each(['menu', 'box', 'marimba', 'clockwork'] as const)('%s: never more than the voice cap sounding, and every gain stays at or under 1', async (id) => {
    const s = createSound();
    s.setTheme(id);
    s.setIntensity(20, true);
    s.unlock();
    await Promise.resolve();
    run(40);
    expect(s.voicePeak).toBeGreaterThan(0);
    expect(s.voicePeak).toBeLessThanOrEqual(VOICE_CAP);
    for (const g of amplitudeGains()) {
      expect(g.gain.value, `${id} gain`).toBeLessThanOrEqual(1);
      for (const [k, v] of g.gain.calls) expect(v, `${id} ${k}`).toBeLessThanOrEqual(1);
    }
    for (const g of amplitudeGains()) for (const [k, v] of g.gain.calls) if (k === 'exp') expect(v).toBeLessThan(0.7);
  });

  it('every note stops itself: each oscillator has a stop time (nothing keeps running after its release)', async () => {
    const s = createSound();
    const stops: number[] = [];
    const starts: number[] = [];
    vi.spyOn(FakeNode.prototype, 'stop').mockImplementation(function (this: FakeNode, t?: unknown) { stops.push(Number(t)); });
    vi.spyOn(FakeNode.prototype, 'start').mockImplementation(function (this: FakeNode, t?: unknown) { starts.push(Number(t)); });
    s.setIntensity(20, false);
    s.unlock();
    await Promise.resolve();
    run(20);
    // everything but the pad LFOs (one per theme, started with no time) stops
    expect(stops.filter((t) => Number.isFinite(t)).length).toBeGreaterThanOrEqual(starts.filter((t) => Number.isFinite(t)).length - 1);
    vi.restoreAllMocks();
  });
});

