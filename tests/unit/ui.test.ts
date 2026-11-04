import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { dailySeed, tinkerLevel } from '../../src/tinker';
import { TRAY_POSE, inZone, ledgeFar, trayToWorld, type Vec3 } from '../../src/seat';
import { BUTTON_MIN_M, MENU_SCREENS, NARROW_W, OVERLAY_SCREENS, PANEL_ZONE, SCREENS, type Button, boardGrid, buttonAt, clock, clockTenths, layout, menuAnchor, panelAnchor, panelToWorld, pokeHit, worldToPanel } from '../../src/ui';

const phonePx375 = (375 - 32) / NARROW_W;
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
    expect(ids('title')).toEqual(['start', 'random', 'options', 'scores', 'about']);
    expect(ids('hud')).toEqual(['pause']);
    expect(ids('complete')).toEqual(['next']);
    expect(ids('paused')).toEqual(['resume', 'restart', 'giveup', 'menu', 'relaxed']);
    expect(layout('picker', { level: 0, levels: 21 }).buttons.map((b) => b.id)).toEqual(['easy', 'medium', 'hard', 'expert', 'back']);
    // No level list anywhere: nothing offers Choose level or a tile for a level.
    for (const s of [...SCREENS, 'picker', 'board', 'options'] as const) expect(layout(s, { level: 0, levels: 21 }).buttons.map((b) => b.label), s).not.toContain('Choose level');
    expect(layout('paused', { level: 0, levels: 21 }).buttons.map((b) => b.label)).toEqual(['Resume', 'Restart', 'Give up', 'Main menu', 'No timer']);
  });

  it('a level cleared offers Next, and nothing else: no Retry, no Copy link, no code; a Random level (practice) offers Play again and Main menu', () => {
    expect(layout('complete', { level: 0, levels: 21 }).buttons.map((b) => [b.id, b.label, b.kind])).toEqual([['next', 'Next', 'primary']]);
    expect(layout('complete', { level: 20, levels: 21, random: true }).buttons.map((b) => [b.id, b.label])).toEqual([['next', 'Play again'], ['menu', 'Main menu']]);
    expect(layout('complete', { level: 0, levels: 21, narrow: true }).buttons.map((b) => b.id)).toEqual(['next']);
  });

  it('after level 20 the primary is Finish; a shared puzzle offers Restart and Menu', () => {
    expect(layout('complete', { level: 19, levels: 21 }).buttons.map((b) => [b.id, b.label])).toEqual([['next', 'Finish']]);
    expect(layout('complete', { level: 20, levels: 21, shared: true }).buttons.map((b) => [b.id, b.label])).toEqual([['restart', 'Restart'], ['menu', 'Menu']]);
  });

  it('the pause card is one centred column: Resume, Restart, Give up, Main menu, No timer', () => {
    for (const narrow of [false, true]) {
      const l = layout('paused', { level: 0, levels: 21, narrow });
      expect(l.buttons.map((b) => [b.id, b.label, b.kind])).toEqual([['resume', 'Resume', 'primary'], ['restart', 'Restart', 'secondary'], ['giveup', 'Give up', 'secondary'], ['menu', 'Main menu', 'secondary'], ['relaxed', 'No timer', 'toggle']]);
      expect(new Set(l.buttons.map((b) => b.x))).toEqual(new Set([0]));
      const ys = l.buttons.map((b) => b.y);
      expect(ys, 'top to bottom').toEqual([...ys].sort((p, q) => q - p));
      for (const b of l.buttons) expect(b.h).toBeGreaterThanOrEqual(0.04);
    }
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

describe('phone layouts (narrow, outside XR)', () => {
  const ctx = { level: 0, levels: 21 };
  const narrow = (s: (typeof SCREENS)[number], c: Partial<typeof ctx> = {}) => layout(s, { ...ctx, ...c, narrow: true });

  it('every card is one phone width, with the same buttons as the wide card', () => {
    for (const s of SCREENS) {
      expect(narrow(s).width, s).toBeCloseTo(NARROW_W, 9);
      expect(narrow(s).buttons.map((b) => b.id), s).toEqual(layout(s, ctx).buttons.map((b) => b.id));
      expect(narrow(s).buttons.map((b) => b.label), s).toEqual(layout(s, ctx).buttons.map((b) => b.label));
    }
    expect(narrow('complete', { level: 19 }).buttons.map((b) => b.id)).toEqual(['next']);
  });

  it('every target is at least 4 cm, clear of the others and inside the padding', () => {
    for (const s of SCREENS) {
      const l = layout(s, { ...ctx, narrow: true });
      for (const b of l.buttons) {
        expect(Math.min(b.w, b.h), `${s} ${b.id}`).toBeGreaterThanOrEqual(BUTTON_MIN_M);
        expect(Math.abs(b.x) + b.w / 2, `${s} ${b.id}`).toBeLessThanOrEqual(l.width / 2 - 0.008 + 1e-9);
        expect(b.y - b.h / 2, `${s} ${b.id}`).toBeGreaterThanOrEqual(0.008 - 1e-9);
        expect(b.y + b.h / 2, `${s} ${b.id}`).toBeLessThanOrEqual(l.height);
      }
      for (const a of l.buttons) for (const b of l.buttons) {
        if (a === b) continue;
        const apart = Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= -1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= -1e-9; // the menu rows nearly touch (4 mm), the letter arrows touch their slot
        expect(apart, `${s} ${a.id} ${b.id}`).toBe(true);
      }
    }
  });

  it('the wide cards stay as they were when narrow is off', () => {
    for (const s of SCREENS) expect(layout(s, { ...ctx, narrow: false })).toEqual(layout(s, ctx));
    expect(layout('picker', ctx).width).toBe(NARROW_W);
  });
});

describe('a scaled anchor (the phone card)', () => {
  it('scales panel space about the anchor and round-trips', () => {
    const a = { ...panelAnchor(LEVELS[0]!), scale: 0.4 };
    const p: Vec3 = [0.05, 0.07, 0.01];
    const w = panelToWorld(a, p);
    const plain = panelToWorld({ ...a, scale: 1 }, [p[0] * 0.4, p[1] * 0.4, p[2] * 0.4]);
    w.forEach((v, i) => expect(v).toBeCloseTo(plain[i]!, 12));
    worldToPanel(a, w).forEach((v, i) => expect(v).toBeCloseTo(p[i]!, 9));
  });
});

describe('HUD', () => {
  it('has a goal line across the top, above the level, the time and the pause button', () => {
    const hud = layout('hud', { level: 0, levels: 9 });
    const pause = hud.buttons.find((b) => b.id === 'pause')!;
    expect(hud.width).toBeGreaterThanOrEqual(0.26);
    // The goal line (body type) needs about 3 cm over the 6.2 cm level and time row.
    expect(hud.height - (pause.y + pause.h / 2)).toBeGreaterThanOrEqual(0.03);
  });
});

describe('title', () => {
  it('reads New Game with nothing solved and adds Continue once a level is solved', () => {
    expect(layout('title', { level: 0, levels: 6 }).buttons[0]).toMatchObject({ id: 'start', label: 'New Game', kind: 'primary' });
    expect(layout('title', { level: 1, levels: 6, resume: true }).buttons[0]).toMatchObject({ id: 'continue', label: 'Continue', kind: 'primary' });
  });

  it('the complete card on level 20 leads to the result of the run', () => {
    expect(layout('complete', { level: 18, levels: 21 }).buttons[0]!.label).toBe('Next');
    expect(layout('complete', { level: 19, levels: 21 }).buttons[0]!.label).toBe('Finish');
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
        const l = layout(s, { level: 0, levels: 5 });
        const { width, buttons } = l;
        // The menu cards are tall columns: they hang lower (menuAnchor), over the board's ledge, on a black backing panel.
        const at = MENU_SCREENS.includes(s) ? menuAnchor(l, level) : a;
        for (const b of buttons) {
          const w = panelToWorld(at, [b.x, b.y, 0]);
          expect(inZone(w, PANEL_ZONE)).toBe(true);
          expect(Math.hypot(...w)).toBeLessThanOrEqual(0.6);
        }
        if (MENU_SCREENS.includes(s)) continue;
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

describe('best times and initials cards', () => {
  /** A gap of 0 to 6 mm: close enough that the arrow and its slot read as one control. */
  const near = (gap: number, what: string) => {
    expect(gap, what).toBeGreaterThanOrEqual(-1e-9);
    expect(gap, what).toBeLessThanOrEqual(0.006);
  };
  const ctx = { level: 0, levels: LEVELS.length + 2, random: true };
  const levels = [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 10, 4))), tinkerLevel(dailySeed(new Date(2027, 0, 1)))];

  it('has the buttons each card needs, in the same order on a phone', () => {
    for (const narrow of [false, true]) {
      expect(layout('initials', { ...ctx, narrow }).buttons.map((b) => b.id)).toEqual(['up-0', 'slot-0', 'down-0', 'up-1', 'slot-1', 'down-1', 'up-2', 'slot-2', 'down-2', 'save', 'skip']);
      const board = layout('board', { ...ctx, narrow });
      expect(board.buttons.map((b) => b.id)).toEqual(['back', 'tab-local', 'tab-global', 'tab-easy', 'tab-medium', 'tab-hard']);
      expect(layout('initials', { ...ctx, narrow }).buttons.filter((b) => b.kind === 'primary').map((b) => b.id), 'one primary').toEqual(['save']);
    }
    expect(OVERLAY_SCREENS).toEqual(['initials', 'board', 'options', 'about', 'stages', 'picker', 'result']);
  });

  it('shows every best time as m:ss.t, tenths included from 10 s up', () => {
    for (const s of [0, 0.4, 8, 9.97, 10, 59.99, 61.5, 600, 754.3]) expect(clockTenths(s), String(s)).toMatch(/^\d+:\d\d\.\d$/);
    expect(clockTenths(8)).toBe('0:08.0');
    expect(clockTenths(10)).toBe('0:10.0');
    expect(clockTenths(9.97)).toBe('0:09.9'); // truncated like the clock
    expect(clockTenths(61.5)).toBe('1:01.5');
    expect(clockTenths(754.3)).toBe('12:34.3');
  });

  it('the name entry has three big letter slots, each with an arrow over it and one under it, all touching and centred on one column, then OK and Skip', () => {
    for (const narrow of [false, true]) {
      const l = layout('initials', { ...ctx, narrow });
      expect(l.slots, `slots ${narrow}`).toHaveLength(3);
      for (let k = 0; k < 3; k++) {
        const s = l.slots![k]!;
        const by = (id: string) => l.buttons.find((b) => b.id === id)!;
        const [up, slot, down] = [by(`up-${k}`), by(`slot-${k}`), by(`down-${k}`)];
        expect(slot.kind, 'a slot is tappable').toBe('slot');
        expect([up.x, slot.x, down.x]).toEqual([s.x, s.x, s.x]);
        expect(s.w, 'slot wide enough for a 24 mm letter').toBeGreaterThanOrEqual(0.05);
        expect(s.h, 'slot tall enough for a 24 mm letter').toBeGreaterThanOrEqual(0.05);
        near(up.y - up.h / 2 - (s.y + s.h / 2), 'the up arrow sits on the slot');
        near(s.y - s.h / 2 - (down.y + down.h / 2), 'the down arrow sits under the slot');
        expect(up.h, 'arrows are 50 mm tall: pinchable in XR').toBeGreaterThanOrEqual(0.05);
      }
      const xs = l.slots!.map((s) => s.x);
      expect(xs[0]! + xs[2]!, 'the three slots are centred').toBeCloseTo(0, 9);
      const [ok, skip] = ['save', 'skip'].map((id) => l.buttons.find((b) => b.id === id)!) as [Button, Button];
      expect([ok.label, skip.label]).toEqual(['OK', 'Skip']);
      expect(ok.kind).toBe('primary');
      expect(ok.y).toBeGreaterThan(skip.y);
    }
  });

  it('every target is 4 cm or more, clear of its neighbours and inside its card, wide and on a phone', () => {
    for (const s of OVERLAY_SCREENS) {
      for (const narrow of [false, true]) {
        const l = layout(s, { ...ctx, narrow });
        for (const b of l.buttons) {
          expect(Math.min(b.w, b.h), `${s} ${b.id}`).toBeGreaterThanOrEqual(BUTTON_MIN_M);
          expect(Math.abs(b.x) + b.w / 2, `${s} ${b.id}`).toBeLessThanOrEqual(l.width / 2 - (narrow ? 0.008 : 0.016) + 1e-9);
          expect(b.y - b.h / 2, `${s} ${b.id}`).toBeGreaterThanOrEqual(0.008 - 1e-9);
          expect(b.y + b.h / 2, `${s} ${b.id}`).toBeLessThanOrEqual(l.height);
        }
        for (const a of l.buttons) for (const b of l.buttons) {
          if (a === b || (a.kind === 'tab' && b.kind === 'tab')) continue; // the two segments of one control touch
          const apart = Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= -1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= -1e-9; // the menu rows nearly touch (4 mm), the letter arrows touch their slot
          expect(apart, `${s} ${narrow} ${a.id} ${b.id}`).toBe(true);
        }
      }
    }
    expect(layout('initials', { ...ctx, narrow: true }).width).toBe(NARROW_W);
    expect(layout('board', { ...ctx, narrow: true }).width).toBe(NARROW_W);
  });

  it('every target, edge to edge, sits inside the panel zone and 60 cm reach above every level, and the card never covers the board', () => {
    for (const level of levels) {
      const a = panelAnchor(level);
      const edge = trayToWorld(0, ledgeFar(level));
      for (const s of [...OVERLAY_SCREENS, 'title'] as const) {
        const l = layout(s, { ...ctx, resume: true });
        // The menus hang low (menuAnchor) on a black backing, over the ledge; the initials card keeps to the clear sky above the board.
        const menu = MENU_SCREENS.includes(s);
        const at = menu ? menuAnchor(l, level) : a;
        for (const b of l.buttons) {
          for (const x of [b.x - b.w / 2, b.x, b.x + b.w / 2]) {
            const w = panelToWorld(at, [x, b.y, 0]);
            expect(inZone(w, PANEL_ZONE), `${level.id} ${s} ${b.id}`).toBe(true);
            expect(Math.hypot(...w), `${level.id} ${s} ${b.id} reach`).toBeLessThanOrEqual(0.6);
          }
        }
        for (const x of menu ? [] : [-l.width / 2, 0, l.width / 2]) {
          const bottom = panelToWorld(a, [x, 0, 0]);
          const edgeAt: Vec3 = [-edge[2] * Math.tan(yaw(bottom)), edge[1], edge[2]];
          expect(pitch(bottom), `${level.id} ${s}`).toBeGreaterThan(pitch(edgeAt) + 0.5);
        }
      }
    }
  });

  it('the start panel is one column of six, Continue on top', () => {
    const wide = layout('title', { ...ctx, resume: true });
    expect(wide.buttons.map((b) => b.label)).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores', 'About']);
    expect(new Set(wide.buttons.map((b) => b.y)).size).toBe(6);
    expect(wide.width).toBe(NARROW_W);
    const phone = layout('title', { ...ctx, resume: true, narrow: true });
    expect(phone.buttons.map((b) => b.id)).toEqual(['continue', 'start', 'random', 'options', 'scores', 'about']);
    expect(phone.buttons.map((b) => b.y)).toEqual(wide.buttons.map((b) => b.y));
    for (const b of phone.buttons) expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(phone.width / 2 - 0.008 + 1e-9);
  });

  it('the board holds ten rows in one column inside the card, over the buttons and under the control and heading', () => {
    expect(boardGrid(false)).toMatchObject({ cols: 1, rows: 10 });
    expect(boardGrid(true)).toMatchObject({ cols: 1, rows: 10 });
    for (const narrow of [false, true]) {
      const g = boardGrid(narrow);
      expect(g.cols * g.rows).toBe(10);
      const l = layout('board', { ...ctx, narrow });
      expect(l.height).toBeCloseTo(g.height, 9);
      const lowerTop = Math.max(...l.buttons.filter((b) => b.y < g.y0 - (g.rows - 1) * g.pitch).map((b) => b.y + b.h / 2));
      const lastRow = g.y0 - (g.rows - 1) * g.pitch;
      expect(lastRow - g.pitch / 2, 'rows clear the buttons under them').toBeGreaterThanOrEqual(lowerTop + 0.012 - 1e-9);
      expect(g.headY - 0.009, 'the heading clears the first row').toBeGreaterThan(g.y0 + g.pitch / 2);
      expect(g.headY + 0.009).toBeLessThanOrEqual(g.height - 0.016);
      expect(g.cols * g.colW + (g.cols - 1) * g.gap + 0.032).toBeCloseTo(g.width, 9);
      expect(g.pitch, 'rows clear of each other').toBeGreaterThanOrEqual(narrow ? 0.0165 : 0.0185);
    }
  });
});

describe('the stage picker (New Game)', () => {
  const l = layout('stages', { level: 0, levels: 21 });
  const rows = l.buttons.filter((b) => b.id.startsWith('stage-'));

  it('is three cards side by side, Easy, Medium, Hard, each with its hint, and Back as a row under them', () => {
    expect(rows.map((b) => [b.id, b.label, b.hint, b.kind])).toEqual([
      ['stage-easy', 'Easy', 'A gentle climb', 'card'],
      ['stage-medium', 'Medium', 'Starts where Easy ends', 'card'],
      ['stage-hard', 'Hard', 'For clockmakers', 'card'],
    ]);
    expect(l.buttons.map((b) => b.id)).toEqual(['stage-easy', 'stage-medium', 'stage-hard', 'back']);
    expect(new Set(rows.map((b) => b.y)).size, 'one row of cards').toBe(1);
    rows.forEach((b, i) => i && expect(b.x, `${b.id} right of ${rows[i - 1]!.id}`).toBeGreaterThan(rows[i - 1]!.x + rows[i - 1]!.w - 1e-9));
    expect(rows[1]!.x, 'centred').toBeCloseTo(0, 9);
    for (const b of rows) {
      expect(b.h / b.w, 'portrait-ish, about 3:4').toBeGreaterThan(1.2);
      expect(b.w, 'a pinchable target, 50 mm or more').toBeGreaterThanOrEqual(0.05);
      expect(b.kind).not.toBe('primary'); // nothing is selected when the picker opens
    }
    const back = l.buttons.find((b) => b.id === 'back')!;
    expect(back.y + back.h / 2).toBeLessThan(rows[0]!.y - rows[0]!.h / 2);
    expect(back.h).toBeGreaterThanOrEqual(0.05);
  });

  it('on a phone the cards stack, shorter and landscape-shaped, top to bottom, with Back last', () => {
    const p = layout('stages', { level: 0, levels: 21, narrow: true });
    const cards = p.buttons.filter((b) => b.kind === 'card');
    expect(p.width).toBe(NARROW_W);
    cards.forEach((b, i) => {
      expect(b.x).toBe(0);
      expect(b.w / b.h, 'landscape').toBeGreaterThan(2.5);
      expect(b.h * phonePx375, 'a 44 px target or more').toBeGreaterThanOrEqual(44);
      if (i) expect(b.y).toBeLessThan(cards[i - 1]!.y);
    });
    expect(p.buttons.at(-1)!.id).toBe('back');
    expect(p.buttons.at(-1)!.y).toBeLessThan(cards.at(-1)!.y);
    expect(l.height).toBeLessThan(0.45);
    expect(p.height).toBeLessThan(0.5);
  });

  it('is a menu laid over the title, and in XR hangs where every button is in reach', () => {
    expect(MENU_SCREENS).toContain('stages');
    expect(OVERLAY_SCREENS).toContain('stages');
    for (const [name, card] of [['stages', l], ['board', layout('board', { level: 0, levels: 21 })]] as const) {
      for (const level of LEVELS) {
        const a = menuAnchor(card, level);
        for (const b of card.buttons) for (const x of [b.x - b.w / 2, b.x, b.x + b.w / 2]) for (const y of [b.y - b.h / 2, b.y + b.h / 2]) {
          expect(inZone(panelToWorld(a, [x, y, 0]), PANEL_ZONE), `${name} ${level.id} ${b.id}`).toBe(true);
        }
      }
    }
  });
});

describe('the countdown and About cards', () => {
  it('the countdown is a menu card with nothing to press; About has Back and two scroll arrows, each 40 mm or more, inside the card', () => {
    expect(MENU_SCREENS).toEqual(expect.arrayContaining(['countdown', 'about']));
    expect(layout('countdown', { level: 0, levels: 21 }).buttons).toEqual([]);
    for (const narrow of [false, true]) {
      const l = layout('about', { level: 0, levels: 21, narrow });
      expect(l.buttons.map((b) => b.id)).toEqual(['back', 'up-scroll', 'down-scroll']);
      for (const b of l.buttons) {
        expect(Math.min(b.w, b.h), b.id).toBeGreaterThanOrEqual(BUTTON_MIN_M);
        expect(Math.abs(b.x) + b.w / 2, b.id).toBeLessThanOrEqual(l.width / 2 - 0.008 + 1e-9);
      }
      const [back, up, down] = l.buttons as [Button, Button, Button];
      expect(back.h, 'Back is a 50 mm row').toBeGreaterThanOrEqual(0.05);
      expect(up.x + up.w / 2, 'the arrows do not touch Back').toBeLessThan(down.x - down.w / 2 + 1e-9);
      expect(back.x + back.w / 2).toBeLessThan(up.x - up.w / 2);
      expect(l.height).toBeLessThan(0.45);
    }
  });

  it('the pause card has a line more for what a pause costs, and still fits in XR reach', () => {
    const l = layout('paused', { level: 0, levels: 21 });
    expect(l.buttons.map((b) => b.id)).toEqual(['resume', 'restart', 'giveup', 'menu', 'relaxed']);
    for (const level of LEVELS) {
      const a = menuAnchor(l, level);
      for (const b of l.buttons) for (const y of [b.y - b.h / 2, b.y + b.h / 2]) expect(inZone(panelToWorld(a, [b.x, y, 0]), PANEL_ZONE), `${level.id} ${b.id}`).toBe(true);
    }
  });
});
