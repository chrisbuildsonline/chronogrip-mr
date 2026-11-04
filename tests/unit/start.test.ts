import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { PANEL_ZONE, layout, panelAnchor, panelToWorld, boardGrid, NARROW_W } from '../../src/ui';
import { inZone, type Vec3 } from '../../src/seat';
import { tinkerLevel, dailySeed } from '../../src/tinker';
import { loadSoundOn, saveSoundOn, createSound } from '../../src/sound';
import { phonePx } from '../../src/fit';

const ctx = { level: 0, levels: LEVELS.length + 2, daily: true, random: true };
const levels = [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 10, 4))), tinkerLevel(dailySeed(new Date(2027, 0, 1)))];

describe('start panel layout', () => {
  it('has three buttons: a primary Start game and two secondaries, Options and High scores', () => {
    for (const narrow of [false, true]) {
      const l = layout('title', { ...ctx, narrow });
      expect(l.buttons.map((b) => [b.id, b.label, b.kind]), `narrow ${narrow}`).toEqual([
        ['start', 'Start game', 'primary'],
        ['options', 'Options', 'secondary'],
        ['scores', 'High scores', 'secondary'],
      ]);
    }
  });

  it('reads Continue once any level is solved, Start game before', () => {
    for (const narrow of [false, true]) {
      expect(layout('title', { ...ctx, narrow }).buttons[0]!.label).toBe('Start game');
      expect(layout('title', { ...ctx, narrow, resume: true }).buttons[0]).toMatchObject({ id: 'start', label: 'Continue', kind: 'primary' });
    }
  });

  it('the old title pills are gone: no Levels or No timer toggle on the start panel', () => {
    for (const narrow of [false, true]) {
      const ids = layout('title', { ...ctx, narrow }).buttons.map((b) => b.id);
      expect(ids).not.toContain('levels');
      expect(ids).not.toContain('relaxed');
    }
  });

  it('on a phone every button is 44 px or more tall at the sheet scale and the primary sits lowest, full width', () => {
    const l = layout('title', { ...ctx, narrow: true });
    expect(l.width).toBe(NARROW_W);
    for (const w of [360, 375, 390, 430]) {
      for (const b of l.buttons) expect(b.h * phonePx(w), `${w} ${b.id}`).toBeGreaterThanOrEqual(44);
    }
    const [start, ...rest] = l.buttons;
    for (const b of rest) expect(start!.y, 'Start game is lowest, under the thumb').toBeLessThan(b.y);
    expect(start!.w).toBeGreaterThan(0.25);
    for (const b of l.buttons) {
      expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(l.width / 2 - 0.008 + 1e-9);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0.008 - 1e-9);
    }
    for (const a of l.buttons) for (const b of l.buttons) if (a !== b) expect(Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= 0.012 - 1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= 0.012 - 1e-9).toBe(true);
  });

  it('wide: the three buttons are big, one row, and the primary is the widest', () => {
    const l = layout('title', ctx);
    expect(new Set(l.buttons.map((b) => b.y)).size).toBe(1);
    for (const b of l.buttons) expect(b.h).toBeGreaterThanOrEqual(0.05);
    expect(l.buttons[0]!.w).toBe(Math.max(...l.buttons.map((b) => b.w)));
    for (const b of l.buttons) expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(l.width / 2 - 0.016 + 1e-9);
  });

  it('every target on the start panel and the options panel (also confirming) sits in the XR panel zone above every level', () => {
    for (const level of levels) {
      const a = panelAnchor(level);
      for (const [screen, extra] of [['title', {}], ['title', { resume: true }], ['options', {}], ['options', { confirm: true }]] as const) {
        const l = layout(screen, { ...ctx, ...extra });
        for (const b of l.buttons) {
          for (const x of [b.x - b.w / 2, b.x, b.x + b.w / 2]) {
            for (const y of [b.y - b.h / 2, b.y + b.h / 2]) {
              const w = panelToWorld(a, [x, y, 0] as Vec3);
              expect(inZone(w, PANEL_ZONE), `${level.id} ${screen} ${b.id}`).toBe(true);
              expect(Math.hypot(...w), `${level.id} ${screen} ${b.id} reach`).toBeLessThanOrEqual(0.6);
            }
          }
        }
      }
    }
  });
});

describe('options panel layout', () => {
  it('collects Back, No timer, Sound and Reset progress; confirming swaps in Keep it and Reset now', () => {
    for (const narrow of [false, true]) {
      const l = layout('options', { ...ctx, narrow });
      expect(l.buttons.map((b) => [b.id, b.label, b.kind]), `narrow ${narrow}`).toEqual([
        ['back', 'Back', 'secondary'],
        ['relaxed', 'No timer', 'toggle'],
        ['sound', 'Sound', 'toggle'],
        ['reset', 'Reset progress', 'secondary'],
      ]);
      const c = layout('options', { ...ctx, narrow, confirm: true });
      expect(c.buttons.map((b) => [b.id, b.label, b.kind])).toEqual([
        ['back', 'Back', 'secondary'],
        ['reset-cancel', 'Keep it', 'secondary'],
        ['reset-yes', 'Reset now', 'primary'],
      ]);
    }
  });

  it('on a phone every button is 44 px or more tall and inside the card, 12 mm apart', () => {
    for (const confirm of [false, true]) {
      const l = layout('options', { ...ctx, narrow: true, confirm });
      expect(l.width).toBe(NARROW_W);
      for (const b of l.buttons) {
        expect(b.h * phonePx(375), b.id).toBeGreaterThanOrEqual(44);
        expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(l.width / 2 - 0.008 + 1e-9);
        expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0.008 - 1e-9);
        expect(b.y + b.h / 2).toBeLessThanOrEqual(l.height);
      }
      for (const a of l.buttons) for (const b of l.buttons) if (a !== b) expect(Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= 0.012 - 1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= 0.012 - 1e-9, `${a.id} ${b.id}`).toBe(true);
    }
  });

  it('is no taller on a phone than the start panel, so the board keeps its room', () => {
    expect(layout('options', { ...ctx, narrow: true }).height).toBeLessThanOrEqual(layout('title', { ...ctx, narrow: true }).height);
  });
});

describe('high scores board', () => {
  it('puts one segmented control on the heading line of a phone card: a track of two pill segments, 44 px tall, after the heading and inside the padding', () => {
    const g = boardGrid(true);
    const l = layout('board', { level: 0, levels: 10, daily: true, random: true, narrow: true });
    const [a, b] = l.tabs!;
    expect([a!.id, b!.id]).toEqual(['tab-local', 'tab-global']);
    for (const s of [a!, b!]) {
      expect(s.w, 'a pill, not a circle').toBeGreaterThan(s.h);
      expect(s.h, '44 px at about 1143 px per metre').toBeGreaterThanOrEqual(0.0385);
      expect(s.x - s.w / 2).toBeGreaterThanOrEqual(l.track!.x - l.track!.w / 2 - 1e-9);
      expect(s.x + s.w / 2).toBeLessThanOrEqual(l.track!.x + l.track!.w / 2 + 1e-9);
    }
    expect(l.track!.x - l.track!.w / 2, 'after the 18 mm serif heading').toBeGreaterThanOrEqual(-g.width / 2 + 0.016 + 0.12);
    expect(l.track!.x + l.track!.w / 2, 'inside the padding').toBeLessThanOrEqual(g.width / 2 - 0.016 + 1e-9);
    expect(l.track!.y + l.track!.h / 2).toBeLessThanOrEqual(g.height - 0.008);
  });

  it('keeps one segmented control in the button row of a wide card: pill segments of 4 cm or more, 12 mm from Back and the arrow', () => {
    expect(boardGrid(false).tabs).toBeNull();
    const l = layout('board', { level: 0, levels: 10, daily: true, random: true });
    const by = (id: string) => l.buttons.find((b) => b.id === id)!;
    const [back, a, b, prev] = [by('back'), by('tab-local'), by('tab-global'), by('board-prev')];
    for (const s of [a, b]) {
      expect(s.w, 'a pill, not a circle').toBeGreaterThan(s.h);
      expect(Math.min(s.w, s.h)).toBeGreaterThanOrEqual(0.04);
      expect(s.x - s.w / 2).toBeGreaterThanOrEqual(l.track!.x - l.track!.w / 2 - 1e-9);
      expect(s.x + s.w / 2).toBeLessThanOrEqual(l.track!.x + l.track!.w / 2 + 1e-9);
    }
    expect(l.track!.x - l.track!.w / 2 - (back.x + back.w / 2)).toBeGreaterThanOrEqual(0.012 - 1e-9);
    expect(prev.x - prev.w / 2 - (l.track!.x + l.track!.w / 2)).toBeGreaterThanOrEqual(0.012 - 1e-9);
    expect(l.track!.h, 'no taller than the button row').toBeLessThanOrEqual(0.046 + 1e-9);
    expect(a.x).toBeLessThan(b.x);
  });
});

describe('sound setting', () => {
  const store = (init?: string) => {
    const m = new Map<string, string>(init === undefined ? [] : [['chronogrip.sound.v1', init]]);
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  it('is on unless the saved value is exactly 0, and round trips', () => {
    expect(loadSoundOn(store())).toBe(true);
    expect(loadSoundOn(store('1'))).toBe(true);
    expect(loadSoundOn(store('0'))).toBe(false);
    expect(loadSoundOn(store('junk'))).toBe(true);
    expect(loadSoundOn(null)).toBe(true);
    const s = store();
    saveSoundOn(s, false);
    expect(s.m.get('chronogrip.sound.v1')).toBe('0');
    expect(loadSoundOn(s)).toBe(false);
    saveSoundOn(s, true);
    expect(loadSoundOn(s)).toBe(true);
  });
  it('never throws on broken storage', () => {
    const bad = {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
    };
    expect(loadSoundOn(bad)).toBe(true);
    expect(() => saveSoundOn(bad, false)).not.toThrow();
  });
  it('a muted sound makes no voices and counts nothing', () => {
    const s = createSound();
    s.setMuted(true);
    expect(s.muted).toBe(true);
    s.tick();
    s.click();
    s.grind();
    s.chime();
    expect(s.counts).toEqual({ ticks: 0, clicks: 0, grinds: 0, chimes: 0 });
  });
});
