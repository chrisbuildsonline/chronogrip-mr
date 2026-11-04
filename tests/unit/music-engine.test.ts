import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSound } from '../../src/sound';
import { BEAT_S, MUSIC_GAIN, SCALE, BASS, FADE_S, beatOf, pitchClassesOf } from '../../src/music';

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
  type = '';
  connect(n: unknown) { return n; }
  start() {}
  stop() {}
}
const made = { osc: [] as FakeNode[], gains: [] as FakeNode[], filters: [] as FakeNode[] };
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
  createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
  createBufferSource() { return new FakeNode(); }
}

beforeEach(() => {
  vi.useFakeTimers();
  made.osc = []; made.gains = []; made.filters = [];
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

  it('plays only scale notes (melody) and bass notes (pad), under the -24 dB master, fading in from silence over 2 s', async () => {
    const s = createSound();
    s.unlock();
    await Promise.resolve();
    run(20);
    const scale = new Set([...SCALE, ...BASS].map((m) => m % 12));
    const ticks = new Set([1700, 1900]);
    for (const o of made.osc) {
      if (ticks.has(hz(o))) continue;
      const midi = Math.round(69 + 12 * Math.log2(hz(o) / 440));
      expect(scale.has(midi % 12), `${hz(o)} Hz`).toBe(true);
    }
    // The master gain: starts at 0 and ramps to -24 dB over the fade.
    const master = made.gains.find((g) => g.gain.calls.some(([k, v]) => k === 'ramp' && Math.abs(v - MUSIC_GAIN) < 1e-9))!;
    expect(master).toBeDefined();
    const ramp = master.gain.calls.find(([k]) => k === 'ramp')!;
    expect(ramp[1]).toBeCloseTo(MUSIC_GAIN, 9);
    expect(ramp[2]).toBeCloseTo(2, 6);
    // No note is louder than a pluck: every envelope peak is well under 1.
    for (const g of made.gains) for (const [k, v] of g.gain.calls) if (k === 'exp') expect(v).toBeLessThan(0.7);
    expect(MUSIC_GAIN).toBeLessThan(0.07);
    // A soft low-pass sits in the chain.
    expect(made.filters.some((f) => f.type === 'lowpass' && f.frequency.value >= 1000 && f.frequency.value <= 5000)).toBe(true);
  });

  it('keeps the bed about 1.5 s ahead: a bar every four beats, a tick on each beat', async () => {
    const s = createSound();
    s.unlock();
    await Promise.resolve();
    run(10);
    const bars = Math.floor(10 / (4 * BEAT_S));
    const ticks = made.osc.filter((o) => hz(o) === 1700 || hz(o) === 1900).length;
    expect(ticks).toBeGreaterThanOrEqual(4 * bars);
    expect(ticks).toBeLessThanOrEqual(4 * (bars + 3));
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
  const pc = (o: FakeNode) => Math.round(69 + 12 * Math.log2(hz(o) / 440)) % 12;
  const isTick = (o: FakeNode) => hz(o) === 1700 || hz(o) === 1900;

  it('starts on the menus\' theme, and a theme set before the first gesture is the one that plays', async () => {
    const s = createSound();
    expect(s.theme).toBe('box');
    s.setTheme('clockwork');
    expect(s.theme).toBe('clockwork');
    s.unlock();
    await Promise.resolve();
    run(8);
    const scale = pitchClassesOf('clockwork');
    for (const o of made.osc.filter((x) => !isTick(x))) expect(scale.has(pc(o)), `${hz(o)} Hz`).toBe(true);
    // A tick in eighths: a bar of the Hard theme holds eight.
    const ticks = made.osc.filter(isTick).length;
    const bars = Math.floor(8 / (4 * beatOf('clockwork')));
    expect(ticks).toBeGreaterThanOrEqual(8 * bars);
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
    const scale = pitchClassesOf('marimba');
    const fresh = made.osc.slice(made.osc.length - 40).filter((o) => !isTick(o));
    for (const o of fresh) expect(scale.has(pc(o)), `${hz(o)} Hz`).toBe(true);
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
});

