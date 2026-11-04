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
    expect(ids('title')).toEqual(['start', 'random', 'options', 'scores']);
    expect(ids('select')).toEqual(['back', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5']);
    expect(ids('hud')).toEqual(['pause']);
    expect(ids('complete')).toEqual(['next', 'restart', 'levels']);
    expect(ids('paused')).toEqual(['resume', 'restart', 'levels', 'relaxed']);
    expect(layout('complete', { level: 4, levels: 5 }).buttons[0]!.label).toBe('Levels');
  });

  it('an over-time complete card leads with Retry (restart) and keeps Next and Levels as secondaries', () => {
    const over = layout('complete', { level: 0, levels: 9, over: true }).buttons;
    expect(over.map((b) => [b.id, b.label, b.kind])).toEqual([['restart', 'Retry', 'primary'], ['next', 'Next', 'secondary'], ['levels', 'Levels', 'secondary']]);
    const last = layout('complete', { level: 8, levels: 9, over: true, copy: 'Copy link' }).buttons;
    expect(last.map((b) => [b.id, b.kind])).toEqual([['restart', 'primary'], ['next', 'secondary'], ['copy', 'secondary']]);
    expect(layout('complete', { level: 0, levels: 9, over: true, narrow: true }).buttons.map((b) => b.id)).toEqual(['restart', 'next', 'levels']);
  });

  it('the Relaxed toggle is the last pill on the wide pause row and the options row (in reach), and sits top right on the phone pause card, clear of the words', () => {
    for (const narrow of [false, true]) {
      const options = layout('options', { level: 0, levels: 9, narrow });
      const t = options.buttons.find((b) => b.id === 'relaxed')!;
      expect(t.kind).toBe('toggle');
      expect(t.label).toBe('No timer'); // plain about what it does, to a first-time player
      expect(layout('paused', { level: 0, levels: 9, narrow }).buttons.find((b) => b.id === 'relaxed')!.label).toBe('No timer');
      expect(layout('title', { level: 0, levels: 9, narrow }).buttons.map((b) => b.id)).not.toContain('relaxed'); // the settings live in Options now

      const paused = layout('paused', { level: 0, levels: 9, narrow });
      const p = paused.buttons.find((b) => b.id === 'relaxed')!;
      expect(p.kind).toBe('toggle');
      if (!narrow) expect(p.y).toBe(paused.buttons[0]!.y);
      else {
        expect(p.x).toBeGreaterThan(0.05 + p.w / 2); // right of the centred "Paused" and level line
        expect(Math.max(...paused.buttons.filter((b) => b !== p).map((b) => b.y + b.h / 2)) + 0.012).toBeLessThanOrEqual(p.y - p.h / 2 + 1e-9);
      }
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
  const ctx = { level: 0, levels: LEVELS.length + 1, daily: true };
  const narrow = (s: (typeof SCREENS)[number], c: Partial<typeof ctx> = {}) => layout(s, { ...ctx, ...c, narrow: true });

  it('every card is one phone width, with the same buttons as the wide card', () => {
    for (const s of SCREENS) {
      expect(narrow(s).width, s).toBeCloseTo(NARROW_W, 9);
      expect(narrow(s).buttons.map((b) => b.id), s).toEqual(layout(s, ctx).buttons.map((b) => b.id));
      expect(narrow(s).buttons.map((b) => b.label), s).toEqual(layout(s, ctx).buttons.map((b) => b.label));
    }
    expect(narrow('complete', { level: 8 }).buttons.map((b) => b.id)).toEqual(['next', 'restart']);
  });

  it('every target is at least 4 cm, 12 mm apart and inside the padding', () => {
    for (const s of SCREENS) {
      const l = layout(s, { ...ctx, narrow: true, cols: 2 });
      for (const b of l.buttons) {
        expect(Math.min(b.w, b.h), `${s} ${b.id}`).toBeGreaterThanOrEqual(BUTTON_MIN_M);
        expect(Math.abs(b.x) + b.w / 2, `${s} ${b.id}`).toBeLessThanOrEqual(l.width / 2 - 0.008 + 1e-9);
        expect(b.y - b.h / 2, `${s} ${b.id}`).toBeGreaterThanOrEqual(0.008 - 1e-9);
        expect(b.y + b.h / 2, `${s} ${b.id}`).toBeLessThanOrEqual(l.height);
      }
      for (const a of l.buttons) for (const b of l.buttons) {
        if (a === b) continue;
        const apart = Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= 0.012 - 1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= 0.012 - 1e-9;
        expect(apart, `${s} ${a.id} ${b.id}`).toBe(true);
      }
    }
  });

  it('level select puts the nine tiles in two centred columns of five rows, reading left to right then down, Back under them', () => {
    const sel = layout('select', { ...ctx, narrow: true, cols: 2 });
    expect(sel.buttons.map((b) => b.id)).toEqual(['back', ...Array.from({ length: 9 }, (_, i) => `level-${i + 1}`)]);
    const [back, ...tiles] = sel.buttons;
    expect(new Set(tiles.map((t) => t.y.toFixed(6))).size).toBe(5);
    expect(tiles[0]!.x).toBeCloseTo(-tiles[1]!.x, 9); // the two columns are centred on the card
    expect(tiles[0]!.y).toBe(tiles[1]!.y);
    expect(tiles[0]!.y).toBeGreaterThan(tiles[2]!.y);
    expect(tiles[8]!.x, 'an odd last tile sits in the middle').toBe(0);
    expect(back!.x).toBe(0);
    expect(back!.y).toBeLessThan(Math.min(...tiles.map((t) => t.y)));
    for (const t of tiles) expect(t.h * phonePx375).toBeGreaterThanOrEqual(44);
  });

  it('the wide cards stay as they were when narrow is off', () => {
    for (const s of SCREENS) expect(layout(s, { ...ctx, narrow: false })).toEqual(layout(s, ctx));
    expect(layout('select', ctx).width).toBe(NARROW_W);
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

describe('level select with the daily', () => {
  const sel = layout('select', { level: 0, levels: LEVELS.length + 1, daily: true });

  it('has a Back pill and nine tiles: the eight levels, then the daily', () => {
    expect(LEVELS).toHaveLength(8);
    expect(sel.buttons.map((b) => b.id)).toEqual(['back', ...Array.from({ length: 9 }, (_, i) => `level-${i + 1}`)]);
    expect(sel.buttons.map((b) => b.label)).toEqual(['Back', '1', '2', '3', '4', '5', '6', '7', '8', 'Daily']);
    expect(sel.buttons.filter((b) => b.kind === 'tile')).toHaveLength(9);
  });

  it('every target is at least 4 cm, inside the panel and clear of its neighbours: 6 mm in one column, 12 mm in two', () => {
    for (const [cols, gap] of [[1, 0.006], [2, 0.012]] as const) {
      const l = layout('select', { level: 0, levels: LEVELS.length + 1, daily: true, cols });
      for (const b of l.buttons) {
        expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(BUTTON_MIN_M);
        expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(l.width / 2 - 0.016 + 1e-9);
        expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0.016 - 1e-9);
        expect(b.y + b.h / 2).toBeLessThanOrEqual(l.height - 0.016 + 1e-9);
      }
      for (const a of l.buttons) for (const b of l.buttons) {
        if (a === b) continue;
        const apart = Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= gap - 1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= gap - 1e-9;
        expect(apart, `${cols} ${a.id} ${b.id}`).toBe(true);
      }
    }
  });

  it('one column: every tile shares one x centre and the ids climb down the card, Back last and lowest', () => {
    const l = layout('select', { level: 0, levels: LEVELS.length + 2, daily: true, random: true, cols: 1 });
    const tiles = l.buttons.filter((b) => b.kind === 'tile');
    expect(tiles).toHaveLength(10);
    expect(new Set(tiles.map((t) => t.x))).toEqual(new Set([0]));
    tiles.forEach((t, i) => i && expect(t.y).toBeLessThan(tiles[i - 1]!.y));
    expect(l.buttons.find((b) => b.id === 'back')!.y).toBeLessThan(tiles.at(-1)!.y);
  });

  it('every target is within reach above every level, the daily included (two columns, the XR shape)', () => {
    const sel = layout('select', { level: 0, levels: LEVELS.length + 1, daily: true, cols: 2 });
    for (const level of [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 9, 30))), tinkerLevel(dailySeed(new Date(2027, 0, 1)))]) {
      const a = menuAnchor(sel, level);
      for (const b of sel.buttons) {
        const w = panelToWorld(a, [b.x, b.y, 0]);
        expect(inZone(w, PANEL_ZONE)).toBe(true);
        expect(Math.hypot(...w)).toBeLessThanOrEqual(0.6);
      }
    }
  });
});

describe('level select with Random', () => {
  const N = LEVELS.length + 2; // eight levels, the daily or shared puzzle, Random
  const wide = (extra = {}) => layout('select', { level: 0, levels: N, daily: true, random: true, ...extra });

  it('has a Random tile after the daily, and the daily or shared tile keeps its place', () => {
    expect(wide().buttons.map((b) => b.label)).toEqual(['Back', '1', '2', '3', '4', '5', '6', '7', '8', 'Daily', 'Random']);
    expect(wide({ daily: false, shared: true }).buttons.at(-2)!.label).toBe('Shared');
    expect(wide().buttons.at(-1)).toMatchObject({ id: 'level-10', kind: 'tile' });
    expect(layout('select', { level: 0, levels: N - 1, daily: true }).buttons.some((b) => b.label === 'Random')).toBe(false);
  });

  it('keeps every target 4 cm or more, 12 mm apart (two columns) and inside the panel, wide and on a phone', () => {
    for (const sel of [wide({ cols: 2 }), wide({ cols: 2, narrow: true })]) {
      for (const b of sel.buttons) {
        expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(BUTTON_MIN_M);
        expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(sel.width / 2 - 0.016 + 1e-9);
        expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0.016 - 1e-9);
        expect(b.y + b.h / 2).toBeLessThanOrEqual(sel.height - 0.016 + 1e-9);
      }
      for (const a of sel.buttons) for (const b of sel.buttons) {
        if (a === b) continue;
        const apart = Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= 0.012 - 1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= 0.012 - 1e-9;
        expect(apart, `${a.id} ${b.id}`).toBe(true);
      }
    }
  });

  it('is one phone wide, and every target stays inside the comfort cone above every level (two columns)', () => {
    expect(wide().width).toBe(NARROW_W);
    for (const level of [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 10, 4)))]) {
      const sel = wide({ cols: 2 });
      const a = menuAnchor(sel, level);
      for (const b of sel.buttons) {
        const w = panelToWorld(a, [b.x, b.y, 0]);
        expect(inZone(w, PANEL_ZONE), `${level.id} ${b.id}`).toBe(true);
        expect(Math.hypot(...w)).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('Random is the last tile of the column, or the right one on the last row of two', () => {
    const one = wide({ cols: 1 });
    expect(one.buttons.filter((b) => b.kind === 'tile').at(-1)).toMatchObject({ id: 'level-10', x: 0 });
    const two = wide({ cols: 2 });
    const rnd = two.buttons.find((b) => b.id === 'level-10')!;
    expect(rnd.x).toBeGreaterThan(0);
    expect(two.buttons.find((b) => b.id === 'level-9')!.y).toBe(rnd.y);
  });

  it('the Random complete card leads with Next puzzle; over par Retry leads and Next puzzle follows', () => {
    const at = { level: N - 1, levels: N, daily: true, random: true } as const;
    expect(layout('complete', at).buttons.map((b) => [b.id, b.label, b.kind])).toEqual([['next', 'Next puzzle', 'primary'], ['restart', 'Restart', 'secondary']]);
    expect(layout('complete', { ...at, over: true }).buttons.map((b) => [b.id, b.label, b.kind])).toEqual([['restart', 'Retry', 'primary'], ['next', 'Next puzzle', 'secondary']]);
    expect(layout('complete', { ...at, copy: 'Copy link' }).buttons.map((b) => b.id)).toEqual(['next', 'restart', 'copy']);
    // the daily's own card is unchanged when Random is on the select card: it still leads back to level select
    expect(layout('complete', { level: N - 2, levels: N, daily: true, random: true }).buttons.map((b) => b.label)).toEqual(['Levels', 'Restart']);
  });

  it('the Random complete card fits its row on a phone and desktop', () => {
    for (const narrow of [false, true]) {
      for (const over of [false, true]) {
        const l = layout('complete', { level: N - 1, levels: N, daily: true, random: true, copy: 'Copy link', over, narrow });
        for (const b of l.buttons) expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(l.width / 2 - 0.0145 + 1e-9);
      }
    }
  });
});

describe('HUD', () => {
  it('has a goal line across the top, above the level, the time and the pause button', () => {
    const hud = layout('hud', { level: 0, levels: 9, daily: true });
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
        const l = layout(s, { level: 0, levels: 5, cols: 2 });
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
  const ctx = { level: 0, levels: LEVELS.length + 2, daily: true, random: true };
  const levels = [...LEVELS, tinkerLevel(dailySeed(new Date(2026, 10, 4))), tinkerLevel(dailySeed(new Date(2027, 0, 1)))];

  it('has the buttons each card needs, in the same order on a phone', () => {
    for (const narrow of [false, true]) {
      expect(layout('initials', { ...ctx, narrow }).buttons.map((b) => b.id)).toEqual(['up-0', 'down-0', 'up-1', 'down-1', 'up-2', 'down-2', 'save', 'skip']);
      const board = layout('board', { ...ctx, narrow });
      expect(board.buttons.map((b) => b.id)).toEqual(['back', 'tab-local', 'tab-global', 'board-prev', 'board-next']);
      expect(layout('initials', { ...ctx, narrow }).buttons.filter((b) => b.kind === 'primary').map((b) => b.id), 'one primary').toEqual(['save']);
    }
    expect(OVERLAY_SCREENS).toEqual(['initials', 'board', 'options']);
  });

  it('shows every best time as m:ss.t, tenths included from 10 s up', () => {
    for (const s of [0, 0.4, 8, 9.97, 10, 59.99, 61.5, 600, 754.3]) expect(clockTenths(s), String(s)).toMatch(/^\d+:\d\d\.\d$/);
    expect(clockTenths(8)).toBe('0:08.0');
    expect(clockTenths(10)).toBe('0:10.0');
    expect(clockTenths(9.97)).toBe('0:09.9'); // truncated like the clock
    expect(clockTenths(61.5)).toBe('1:01.5');
    expect(clockTenths(754.3)).toBe('12:34.3');
  });

  it('each initials letter sits in a slot with its up and down arrows touching it: left and right in the zone, over and under on a phone', () => {
    for (const narrow of [false, true]) {
      const l = layout('initials', { ...ctx, narrow });
      expect(l.slots, `slots ${narrow}`).toHaveLength(3);
      for (let k = 0; k < 3; k++) {
        const s = l.slots![k]!;
        const [up, down] = [`up-${k}`, `down-${k}`].map((id) => l.buttons.find((b) => b.id === id)!) as [Button, Button];
        expect(s.w, 'slot wide enough for a 24 mm letter').toBeGreaterThanOrEqual(0.03);
        expect(s.h, 'slot tall enough for a 24 mm letter').toBeGreaterThanOrEqual(0.036);
        if (narrow) {
          near(up.y - up.h / 2 - (s.y + s.h / 2), 'up pill just over the slot');
          near(s.y - s.h / 2 - (down.y + down.h / 2), 'down pill just under the slot');
          expect([up.x, down.x]).toEqual([s.x, s.x]);
        } else {
          expect(down.x + down.w / 2, 'down left of the slot').toBeLessThanOrEqual(s.x - s.w / 2 + 1e-9);
          expect(s.x - s.w / 2 - (down.x + down.w / 2), 'down touches the slot').toBeLessThanOrEqual(0.006);
          near(up.x - up.w / 2 - (s.x + s.w / 2), 'up touches the slot');
          expect([up.y, down.y]).toEqual([s.y, s.y]);
        }
      }
    }
  });

  it('every target is 4 cm or more, 12 mm apart and inside its card, wide and on a phone', () => {
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
          const apart = Math.abs(a.x - b.x) - (a.w + b.w) / 2 >= 0.012 - 1e-9 || Math.abs(a.y - b.y) - (a.h + b.h) / 2 >= 0.012 - 1e-9;
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

  it('the start panel is one column of five, Continue on top', () => {
    const wide = layout('title', { ...ctx, resume: true });
    expect(wide.buttons.map((b) => b.label)).toEqual(['Continue', 'New Game', 'Random level', 'Options', 'High scores']);
    expect(new Set(wide.buttons.map((b) => b.y)).size).toBe(5);
    expect(wide.width).toBe(NARROW_W);
    const phone = layout('title', { ...ctx, resume: true, narrow: true });
    expect(phone.buttons.map((b) => b.id)).toEqual(['continue', 'start', 'random', 'options', 'scores']);
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
