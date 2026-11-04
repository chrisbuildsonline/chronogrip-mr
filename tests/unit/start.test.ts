import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { PANEL_ZONE, layout, menuAnchor, panelToWorld, boardGrid, NARROW_W } from '../../src/ui';
import { inZone, type Vec3 } from '../../src/seat';
import { tinkerLevel, dailySeed } from '../../src/tinker';
import { loadSoundOn, saveSoundOn, createSound } from '../../src/sound';
import { phonePx } from '../../src/fit';

const ctx = { level: 0, levels: LEVELS.length + 2, random: true };
const levels = [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 10, 4))), tinkerLevel(dailySeed(new Date(2027, 0, 1)))];

describe('start panel layout', () => {
  it('has four buttons with no progress: a primary New Game, Random level, Options and High scores; no level list', () => {
    for (const narrow of [false, true]) {
      const l = layout('title', { ...ctx, narrow });
      expect(l.buttons.map((b) => [b.id, b.label, b.kind]), `narrow ${narrow}`).toEqual([
        ['start', 'New Game', 'primary'],
        ['random', 'Random level', 'secondary'],
        ['options', 'Options', 'secondary'],
        ['scores', 'High scores', 'secondary'],
      ]);
    }
  });

  it('adds a primary Continue on top once any level is solved, and New Game steps down to a secondary', () => {
    for (const narrow of [false, true]) {
      const l = layout('title', { ...ctx, narrow, resume: true });
      expect(l.buttons.map((b) => [b.id, b.label, b.kind])).toEqual([
        ['continue', 'Continue', 'primary'],
        ['start', 'New Game', 'secondary'],
        ['random', 'Random level', 'secondary'],
        ['options', 'Options', 'secondary'],
        ['scores', 'High scores', 'secondary'],
      ]);
    }
  });

  it('the old title pills are gone: no Levels or No timer toggle on the start panel', () => {
    for (const narrow of [false, true]) {
      const ids = layout('title', { ...ctx, narrow }).buttons.map((b) => b.id);
      expect(ids).not.toContain('levels');
      expect(ids).not.toContain('relaxed');
    }
  });

  it('is one centred column, whatever the screen', () => {
    for (const narrow of [false, true]) {
      const l = layout('title', { ...ctx, narrow, resume: narrow });
      expect(l.width).toBe(NARROW_W);
      expect(new Set(l.buttons.map((b) => b.x)), `narrow ${narrow}: one x centre`).toEqual(new Set([0]));
      const ys = l.buttons.map((b) => b.y);
      expect(ys, 'top to bottom').toEqual([...ys].sort((p, q) => q - p));
      expect(new Set(ys).size).toBe(ys.length);
    }
  });

  it('every button is 50 mm tall (44 px or more at the phone sheet scale), inside the card, 12 mm apart', () => {
    const l = layout('title', { ...ctx, narrow: true });
    for (const w of [360, 375, 390, 430]) {
      for (const b of l.buttons) expect(b.h * phonePx(w), `${w} ${b.id}`).toBeGreaterThanOrEqual(44);
    }
    for (const b of l.buttons) {
      expect(b.h).toBeGreaterThanOrEqual(0.05);
      expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(l.width / 2 - 0.016 + 1e-9);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0.016 - 1e-9);
      expect(b.y + b.h / 2).toBeLessThanOrEqual(l.height);
    }
    for (const a of l.buttons) for (const b of l.buttons) if (a !== b) expect(Math.abs(a.y - b.y) - (a.h + b.h) / 2).toBeGreaterThanOrEqual(0.012 - 1e-9);
  });

  it('in XR the menu card hangs low enough that every button, edge to edge, is in the panel zone and 60 cm reach, above every level', () => {
    for (const level of levels) {
      for (const [screen, extra] of [['title', {}], ['title', { resume: true }], ['options', {}], ['options', { confirm: true }], ['board', {}], ['picker', {}]] as const) {
        const l = layout(screen, { ...ctx, ...extra });
        const a = menuAnchor(l, level);
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

  it('in XR the start buttons keep their 50 mm and the card is tilted to face the head', () => {
    const l = layout('title', { ...ctx, resume: true });
    const a = menuAnchor(l, levels[0]!);
    for (const b of l.buttons) expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(0.05);
    const mid = panelToWorld(a, [0, l.height / 2, 0]);
    const n = panelToWorld(a, [0, l.height / 2, 1]).map((v, i) => v - mid[i]!);
    const cos = -(n[0]! * mid[0] + n[1]! * mid[1] + n[2]! * mid[2]) / Math.hypot(...mid);
    expect(cos).toBeGreaterThan(0.99);
  });
});

describe('options panel layout', () => {
  it('collects No timer, Sound, Music, Reset progress and Back in one column; confirming swaps in Reset now and Keep it', () => {
    for (const narrow of [false, true]) {
      const l = layout('options', { ...ctx, narrow });
      expect(l.buttons.map((b) => [b.id, b.label, b.kind]), `narrow ${narrow}`).toEqual([
        ['relaxed', 'No timer', 'toggle'],
        ['sound', 'Sound', 'toggle'],
        ['music', 'Music', 'toggle'],
        ['reset', 'Reset progress', 'secondary'],
        ['back', 'Back', 'secondary'],
      ]);
      const c = layout('options', { ...ctx, narrow, confirm: true });
      expect(c.buttons.map((b) => [b.id, b.label, b.kind])).toEqual([
        ['reset-yes', 'Reset now', 'primary'],
        ['reset-cancel', 'Keep it', 'secondary'],
        ['back', 'Back', 'secondary'],
      ]);
      for (const k of [l, c]) {
        expect(new Set(k.buttons.map((b) => b.x))).toEqual(new Set([0]));
        const ys = k.buttons.map((b) => b.y);
        expect(ys, 'top to bottom').toEqual([...ys].sort((p, q) => q - p));
      }
    }
  });

  it('every button is 44 px or more tall at the phone sheet scale, inside the card, 12 mm apart', () => {
    for (const confirm of [false, true]) {
      const l = layout('options', { ...ctx, narrow: true, confirm });
      expect(l.width).toBe(NARROW_W);
      for (const b of l.buttons) {
        expect(b.h * phonePx(375), b.id).toBeGreaterThanOrEqual(44);
        expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(l.width / 2 - 0.008 + 1e-9);
        expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0.008 - 1e-9);
        expect(b.y + b.h / 2).toBeLessThanOrEqual(l.height);
      }
      for (const a of l.buttons) for (const b of l.buttons) if (a !== b) expect(Math.abs(a.y - b.y) - (a.h + b.h) / 2, `${a.id} ${b.id}`).toBeGreaterThanOrEqual(0.012 - 1e-9);
    }
  });
});

describe('high scores board', () => {
  it('stacks, top to bottom: the Local / Global control, the ten rows, the level switcher, Back; all centred', () => {
    for (const narrow of [false, true]) {
      const g = boardGrid(narrow);
      const l = layout('board', { level: 0, levels: 10, random: true, narrow });
      const by = (id: string) => l.buttons.find((b) => b.id === id)!;
      const [back, a, b, prev, next] = [by('back'), by('tab-local'), by('tab-global'), by('board-prev'), by('board-next')];
      expect(l.width).toBe(NARROW_W);
      expect(g).toMatchObject({ cols: 1, rows: 10 });
      expect(back.x).toBe(0);
      expect(l.track!.x).toBe(0);
      expect(a.x + b.x, 'the two segments are centred').toBeCloseTo(0, 9);
      expect(prev.x + next.x, 'the arrows are centred').toBeCloseTo(0, 9);
      const rowsTop = g.y0 + g.pitch / 2;
      const rowsFoot = g.y0 - (g.rows - 1) * g.pitch - g.pitch / 2;
      expect(l.track!.y - l.track!.h / 2, 'the control is over the rows').toBeGreaterThanOrEqual(rowsTop + 0.012 - 1e-9);
      expect(prev.y + prev.h / 2, 'the switcher is under the rows').toBeLessThanOrEqual(rowsFoot - 0.012 + 1e-9);
      expect(back.y + back.h / 2, 'Back is the lowest').toBeLessThanOrEqual(prev.y - prev.h / 2 - 0.012 + 1e-9);
    }
  });

  it('has pill segments 44 px or more tall at the phone sheet scale, inside their track', () => {
    const l = layout('board', { level: 0, levels: 10, random: true, narrow: true });
    for (const s of l.buttons.filter((x) => x.kind === 'tab')) {
      expect(s.w, 'a pill, not a circle').toBeGreaterThan(s.h);
      expect(s.h * phonePx(375)).toBeGreaterThanOrEqual(44);
      expect(s.x - s.w / 2).toBeGreaterThanOrEqual(l.track!.x - l.track!.w / 2 - 1e-9);
      expect(s.x + s.w / 2).toBeLessThanOrEqual(l.track!.x + l.track!.w / 2 + 1e-9);
    }
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
    expect(s.counts).toEqual({ ticks: 0, clicks: 0, grinds: 0, chimes: 0, notes: 0 });
  });
});
