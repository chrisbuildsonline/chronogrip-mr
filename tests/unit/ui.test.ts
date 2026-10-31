import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { dailySeed, tinkerLevel } from '../../src/tinker';
import { TRAY_POSE, inZone, ledgeFar, trayToWorld, type Vec3 } from '../../src/seat';
import { BUTTON_MIN_M, PANEL_ZONE, SCREENS, buttonAt, clock, layout, panelAnchor, panelToWorld, pokeHit, worldToPanel } from '../../src/ui';

const pitch = (p: Vec3) => (Math.atan2(p[1], Math.hypot(p[0], p[2])) * 180) / Math.PI;
const yaw = (p: Vec3) => Math.atan2(p[0], -p[2]);

describe('panel layouts', () => {
  it('every button is at least 4 cm on each side and inside its panel', () => {
    for (const s of SCREENS) {
      const { width, height, buttons } = layout(s, { level: 0, levels: 5 });
      for (const b of buttons) {
        expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(BUTTON_MIN_M);
        expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(width / 2);
        expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h / 2).toBeLessThanOrEqual(height);
      }
    }
  });

  it('has the buttons each screen needs', () => {
    const ids = (s: (typeof SCREENS)[number], level = 0) => layout(s, { level, levels: 5 }).buttons.map((b) => b.id);
    expect(ids('title')).toEqual(['start', 'levels']);
    expect(ids('select')).toEqual(['back', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5']);
    expect(ids('hud')).toEqual(['pause']);
    expect(ids('complete')).toEqual(['next', 'restart', 'levels']);
    expect(ids('paused')).toEqual(['resume', 'restart', 'levels']);
    expect(layout('complete', { level: 4, levels: 5 }).buttons[0]!.label).toBe('Levels');
  });

  it('buttons do not overlap', () => {
    for (const s of SCREENS) {
      const bs = layout(s, { level: 0, levels: 5 }).buttons;
      for (const a of bs) for (const b of bs) {
        if (a === b) continue;
        const apart = Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2;
        expect(apart).toBe(true);
      }
    }
  });
});

describe('level select with the daily', () => {
  const sel = layout('select', { level: 0, levels: 6, daily: true });

  it('has a Back pill and six tiles, the last one the daily', () => {
    expect(sel.buttons.map((b) => b.id)).toEqual(['back', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6']);
    expect(sel.buttons.map((b) => b.label)).toEqual(['Back', '1', '2', '3', '4', '5', 'Daily']);
    expect(sel.buttons.filter((b) => b.kind === 'tile')).toHaveLength(6);
  });

  it('every target is at least 4 cm, 12 mm apart, inside the panel', () => {
    for (const b of sel.buttons) {
      expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(BUTTON_MIN_M);
      expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(sel.width / 2 - 0.016 + 1e-9);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0.016 - 1e-9);
      expect(b.y + b.h / 2).toBeLessThanOrEqual(sel.height - 0.016 + 1e-9);
    }
    for (const a of sel.buttons) for (const b of sel.buttons) {
      if (a === b) continue;
      const apart = Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= 0.012 - 1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= 0.012 - 1e-9;
      expect(apart).toBe(true);
    }
  });

  it('every target is within reach above every level, the daily included', () => {
    for (const level of [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 9, 30))), tinkerLevel(dailySeed(new Date(2027, 0, 1)))]) {
      const a = panelAnchor(level);
      for (const b of sel.buttons) {
        const w = panelToWorld(a, [b.x, b.y, 0]);
        expect(inZone(w, PANEL_ZONE)).toBe(true);
        expect(Math.hypot(...w)).toBeLessThanOrEqual(0.6);
      }
    }
  });
});

describe('title', () => {
  it('reads Start with nothing solved and Continue once a level is solved', () => {
    expect(layout('title', { level: 0, levels: 6 }).buttons[0]!.label).toBe('Start');
    expect(layout('title', { level: 1, levels: 6, resume: true }).buttons[0]).toMatchObject({ id: 'start', label: 'Continue', kind: 'primary' });
  });

  it('the complete card on the daily leads back to level select', () => {
    expect(layout('complete', { level: 4, levels: 6, daily: true }).buttons[0]!.label).toBe('Next');
    expect(layout('complete', { level: 5, levels: 6, daily: true }).buttons[0]!.label).toBe('Levels');
  });
});

describe('pressing buttons', () => {
  const { buttons } = layout('title', { level: 0, levels: 5 });
  const start = buttons[0]!;

  it('buttonAt finds the button under a point within touch depth', () => {
    expect(buttonAt([start.x, start.y, 0.005], buttons)).toBe('start');
    expect(buttonAt([start.x, start.y, 0.03], buttons)).toBeNull();
    expect(buttonAt([start.x + start.w, start.y + 1, 0], buttons)).toBeNull();
  });

  it('a poke fires only when the tip arrives from in front of the panel', () => {
    const at: Vec3 = [start.x, start.y, 0.004];
    expect(pokeHit(0.05, at, buttons)).toBe('start');
    expect(pokeHit(null, at, buttons)).toBeNull();
    expect(pokeHit(0.01, at, buttons)).toBeNull(); // already touching: no repeat
    expect(pokeHit(-0.05, at, buttons)).toBeNull(); // from behind
  });
});

describe('panel placement', () => {
  it('panel space round-trips to world space', () => {
    const a = panelAnchor(LEVELS[2]!, { ...TRAY_POSE, yaw: 0.3 });
    const p: Vec3 = [0.05, 0.07, 0.01];
    const back = worldToPanel(a, panelToWorld(a, p));
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i]!, 9));
  });

  it('every button of every screen is within reach, and the panel never covers the board', () => {
    for (const level of LEVELS) {
      const a = panelAnchor(level);
      // The board's far edge is its highest line in view; the panel must sit above it at every yaw.
      const edge = trayToWorld(0, ledgeFar(level));
      const edgeAt = (yawRad: number): Vec3 => [-edge[2] * Math.tan(yawRad), edge[1], edge[2]];
      for (const s of SCREENS) {
        const { width, buttons } = layout(s, { level: 0, levels: 5 });
        for (const b of buttons) {
          const w = panelToWorld(a, [b.x, b.y, 0]);
          expect(inZone(w, PANEL_ZONE)).toBe(true);
          expect(Math.hypot(...w)).toBeLessThanOrEqual(0.6);
        }
        for (const x of [-width / 2, 0, width / 2]) {
          const bottom = panelToWorld(a, [x, 0, 0]);
          expect(pitch(bottom)).toBeGreaterThan(pitch(edgeAt(yaw(bottom))) + 0.5);
        }
      }
    }
  });

  it('the panel faces the head and follows the tray', () => {
    const a = panelAnchor(LEVELS[0]!);
    const n = panelToWorld(a, [0, 0, 1]).map((v, i) => v - a.position[i]!);
    const toHead = a.position.map((v) => -v);
    const cos = (n[0]! * toHead[0]! + n[1]! * toHead[1]! + n[2]! * toHead[2]!) / Math.hypot(...toHead);
    expect(cos).toBeGreaterThan(0.99);
    const moved = panelAnchor(LEVELS[0]!, { ...TRAY_POSE, position: [0.04, -0.17, -0.31] });
    expect(moved.position[0] - a.position[0]).toBeCloseTo(0.04, 9);
    expect(moved.position[1] - a.position[1]).toBeCloseTo(0.02, 9);
  });
});

describe('clock text', () => {
  it('formats 10 s and over as m:ss', () => {
    expect(clock(10)).toBe('0:10');
    expect(clock(59.99)).toBe('0:59');
    expect(clock(75)).toBe('1:15');
    expect(clock(3600)).toBe('60:00');
  });

  it('shows tenths under 10 s, so a quick solve never reads 0:00', () => {
    expect(clock(0.4)).toBe('0:00.4');
    expect(clock(0.05)).toBe('0:00.0');
    expect(clock(0)).toBe('0:00.0');
    expect(clock(0.7)).toBe('0:00.7');
    expect(clock(7.25)).toBe('0:07.2');
    expect(clock(9.97)).toBe('0:09.9'); // truncated, never rounded up past what was played
  });
});
