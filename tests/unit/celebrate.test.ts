import { BoxGeometry, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { CELEBRATE, createConfetti, spinUpBeats } from '../../src/celebrate';

describe('spinUpBeats', () => {
  test('nothing before it starts, the full spin once it is over', () => {
    expect(spinUpBeats(-1)).toBe(0);
    expect(spinUpBeats(0)).toBe(0);
    expect(spinUpBeats(CELEBRATE.spinSeconds)).toBe(CELEBRATE.spinBeats);
    expect(spinUpBeats(99)).toBe(CELEBRATE.spinBeats);
  });
  test('only ever turns forward, fastest in the middle, still at both ends', () => {
    const dt = 0.01, speed = (t: number) => (spinUpBeats(t + dt) - spinUpBeats(t)) / dt;
    for (let t = 0; t < CELEBRATE.spinSeconds; t += 0.1) expect(spinUpBeats(t + 0.1)).toBeGreaterThanOrEqual(spinUpBeats(t));
    expect(speed(0)).toBeLessThan(0.5);
    expect(speed(CELEBRATE.spinSeconds - dt)).toBeLessThan(0.5);
    expect(speed(CELEBRATE.spinSeconds / 2)).toBeGreaterThan(speed(CELEBRATE.spinSeconds / 4));
  });
});

describe('createConfetti', () => {
  const make = () => createConfetti(new BoxGeometry(0.01, 0.01, 0.002), new MeshBasicMaterial());
  test('hidden until started, then flying for CELEBRATE.seconds and hidden again', () => {
    const c = make();
    expect(c.flying).toBe(false);
    expect(c.update(0)).toBe(false);
    c.start(new Vector3(), new Vector3(0, 1, 0), 1000);
    expect(c.flying).toBe(true);
    expect(c.mesh.count).toBe(CELEBRATE.gears);
    expect(c.update(1000 + (CELEBRATE.seconds - 0.1) * 1000)).toBe(true);
    expect(c.update(1000 + CELEBRATE.seconds * 1000)).toBe(false);
    expect(c.mesh.visible).toBe(false);
  });
  test('every gear goes up first, then falls back under gravity', () => {
    const c = make();
    c.start(new Vector3(0, 0, 0), new Vector3(0, 1, 0), 0, 7);
    for (let i = 0; i < CELEBRATE.gears; i++) {
      expect(c.at(i, 0.3).y).toBeGreaterThan(0);
      expect(c.at(i, 4).y).toBeLessThan(c.at(i, 0.6).y);
    }
  });
  test('the same seed makes the same burst; another seed a different one', () => {
    const a = make(), b = make(), d = make();
    a.start(new Vector3(), new Vector3(0, 1, 0), 0, 3);
    b.start(new Vector3(), new Vector3(0, 1, 0), 0, 3);
    d.start(new Vector3(), new Vector3(0, 1, 0), 0, 4);
    expect(a.at(5, 1).toArray()).toEqual(b.at(5, 1).toArray());
    expect(a.at(5, 1).toArray()).not.toEqual(d.at(5, 1).toArray());
  });
  test('with a floor, every gear lands on it and lies still', () => {
    const c = make();
    c.start(new Vector3(0, 0, 0), new Vector3(0, 1, 0), 0, 5, -0.1);
    for (let i = 0; i < CELEBRATE.gears; i++) {
      expect(c.at(i, 4).y).toBeCloseTo(-0.1, 6);
      expect(c.at(i, 4.4).toArray()).toEqual(c.at(i, 4).toArray());
      expect(c.at(i, 0.2).y).toBeGreaterThan(-0.1);
    }
  });
  test('the sky can point anywhere (the tray is tilted)', () => {
    const c = make(), sky = new Vector3(0, 0.6, 0.8);
    c.start(new Vector3(1, 1, 1), sky, 0, 2);
    expect(c.at(0, 0.3).sub(new Vector3(1, 1, 1)).dot(sky)).toBeGreaterThan(0);
  });
});
