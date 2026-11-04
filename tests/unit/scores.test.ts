import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/levels';
import { MAX_STEP } from '../../src/random';
import { BOARDS, DEFAULT_INITIALS, TOP, addEntry, backInitial, boardOf, emptyScores, formatDate, loadScores, qualifies, saveScores, stepInitial, typeInitial, type Entry } from '../../src/scores';

const KEY = 'chronogrip.scores.v1';
const store = (raw: string | null) => ({ getItem: (k: string) => (k === KEY ? raw : null) });
const lvl = (ms: number, date = '2026-11-04', name = 'ABC'): Entry => ({ name, ms, date });
const rnd = (step: number, ms: number, date = '2026-11-04', name = 'ABC'): Entry => ({ name, step, ms, date });

describe('boards', () => {
  it('has one board per hand-made level and one for Random, and none for the daily or a shared puzzle', () => {
    expect(BOARDS).toEqual([...LEVELS.map((l) => l.id), 'random']);
    expect(boardOf('l1')).toBe('l1');
    expect(boardOf('l8')).toBe('l8');
    expect(boardOf('t123456')).toBeNull();
    expect(boardOf('l9')).toBeNull();
    expect(boardOf('constructor')).toBeNull();
  });
});

describe('addEntry and qualifies on a level board', () => {
  it('sorts by time, fastest first', () => {
    let s = emptyScores();
    for (const ms of [30000, 10000, 20000]) s = addEntry(s, 'l1', lvl(ms));
    expect(s.boards.l1!.map((e) => e.ms)).toEqual([10000, 20000, 30000]);
  });

  it('breaks a tie by the earlier date, then by who got there first', () => {
    let s = emptyScores();
    s = addEntry(s, 'l1', lvl(5000, '2026-11-03', 'OLD'));
    s = addEntry(s, 'l1', lvl(5000, '2026-11-04', 'NEW'));
    s = addEntry(s, 'l1', lvl(5000, '2026-11-02', 'EAR'));
    s = addEntry(s, 'l1', lvl(5000, '2026-11-04', 'TOO'));
    expect(s.boards.l1!.map((e) => e.name)).toEqual(['EAR', 'OLD', 'NEW', 'TOO']);
  });

  it('keeps the top ten and drops the slowest', () => {
    let s = emptyScores();
    for (let i = 1; i <= 12; i++) s = addEntry(s, 'l1', lvl(i * 1000));
    expect(s.boards.l1).toHaveLength(TOP);
    expect(s.boards.l1!.map((e) => e.ms)).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]);
  });

  it('tells whether an entry would make the top ten, and its rank', () => {
    let s = emptyScores();
    expect(qualifies(s, 'l2', lvl(99000))).toEqual({ ok: true, rank: 1 });
    for (let i = 1; i <= 10; i++) s = addEntry(s, 'l2', lvl(i * 1000));
    expect(qualifies(s, 'l2', lvl(500))).toEqual({ ok: true, rank: 1 });
    expect(qualifies(s, 'l2', lvl(3500))).toEqual({ ok: true, rank: 4 });
    expect(qualifies(s, 'l2', lvl(10000, '2026-11-05'))).toEqual({ ok: false, rank: 11 }); // ties the tenth but is later
    expect(qualifies(s, 'l2', lvl(10000, '2026-11-03'))).toEqual({ ok: true, rank: 10 });
    expect(qualifies(s, 'l2', lvl(20000))).toEqual({ ok: false, rank: 11 });
  });

  it('ranks a later tie after the entry already there', () => {
    const s = addEntry(emptyScores(), 'l1', lvl(5000));
    expect(qualifies(s, 'l1', lvl(5000))).toEqual({ ok: true, rank: 2 });
  });

  it('does not change a board that was not qualified for', () => {
    let s = emptyScores();
    for (let i = 1; i <= 10; i++) s = addEntry(s, 'l1', lvl(i * 1000));
    expect(addEntry(s, 'l1', lvl(50000, '2026-11-04', 'ZZZ'))).toBe(s);
  });

  it('never mutates the scores it is given', () => {
    const s = emptyScores();
    const t = addEntry(s, 'l1', lvl(1000));
    expect(s.boards.l1).toEqual([]);
    expect(t.boards.l1).toHaveLength(1);
  });

  it('refuses a bad board, a bad time or a bad date', () => {
    const s = emptyScores();
    expect(qualifies(s, 't99', lvl(1000)).ok).toBe(false);
    for (const ms of [0, -5, NaN, Infinity]) expect(qualifies(s, 'l1', lvl(ms)).ok).toBe(false);
    expect(qualifies(s, 'l1', lvl(1000, 'yesterday')).ok).toBe(false);
    expect(addEntry(s, 'l1', lvl(0))).toBe(s);
  });

  it('remembers the initials of the last saved entry, and keeps boards apart', () => {
    let s = emptyScores();
    expect(s.initials).toBe(DEFAULT_INITIALS);
    s = addEntry(s, 'l3', lvl(4000, '2026-11-04', 'KIM'));
    expect(s.initials).toBe('KIM');
    expect(s.boards.l3).toHaveLength(1);
    expect(s.boards.l1).toHaveLength(0);
  });
});

describe('the Random board', () => {
  it('ranks by step, highest first, then by time', () => {
    let s = emptyScores();
    s = addEntry(s, 'random', rnd(3, 20000, '2026-11-04', 'AAA'));
    s = addEntry(s, 'random', rnd(6, 90000, '2026-11-04', 'BBB'));
    s = addEntry(s, 'random', rnd(6, 80000, '2026-11-04', 'CCC'));
    s = addEntry(s, 'random', rnd(1, 5000, '2026-11-04', 'DDD'));
    expect(s.boards.random!.map((e) => e.name)).toEqual(['CCC', 'BBB', 'AAA', 'DDD']);
  });

  it('ties on step and time go to the earlier date', () => {
    let s = addEntry(emptyScores(), 'random', rnd(4, 9000, '2026-11-05', 'LAT'));
    s = addEntry(s, 'random', rnd(4, 9000, '2026-11-01', 'EAR'));
    expect(s.boards.random!.map((e) => e.name)).toEqual(['EAR', 'LAT']);
  });

  it('trims to ten and qualifies by step first', () => {
    let s = emptyScores();
    for (let i = 0; i < 10; i++) s = addEntry(s, 'random', rnd(5, 10000 + i * 1000));
    expect(qualifies(s, 'random', rnd(6, 999999))).toEqual({ ok: true, rank: 1 });
    expect(qualifies(s, 'random', rnd(4, 1000))).toEqual({ ok: false, rank: 11 });
    expect(qualifies(s, 'random', rnd(5, 12500))).toEqual({ ok: true, rank: 4 });
    s = addEntry(s, 'random', rnd(6, 999999));
    expect(s.boards.random).toHaveLength(TOP);
    expect(s.boards.random![0]).toMatchObject({ step: 6 });
    expect(s.boards.random!.at(-1)!.ms).toBe(18000);
  });

  it('needs a step in range', () => {
    const s = emptyScores();
    expect(qualifies(s, 'random', lvl(1000)).ok).toBe(false);
    expect(qualifies(s, 'random', rnd(0, 1000)).ok).toBe(false);
    expect(qualifies(s, 'random', rnd(MAX_STEP + 1, 1000)).ok).toBe(false);
    expect(qualifies(s, 'random', rnd(1.5, 1000)).ok).toBe(false);
    expect(qualifies(s, 'random', rnd(MAX_STEP, 1000)).ok).toBe(true);
  });
});

describe('names', () => {
  it('are exactly three capital letters, whatever is typed', () => {
    const s = addEntry(emptyScores(), 'l1', lvl(1000, '2026-11-04', 'a1b'));
    expect(s.boards.l1![0]!.name).toBe('ABA');
    expect(addEntry(emptyScores(), 'l1', lvl(1000, '2026-11-04', 'toolong')).boards.l1![0]!.name).toBe('TOO');
    expect(addEntry(emptyScores(), 'l1', lvl(1000, '2026-11-04', '')).boards.l1![0]!.name).toBe('AAA');
  });
});

describe('saveScores and loadScores', () => {
  it('round trips', () => {
    const data: Record<string, string> = {};
    let s = addEntry(emptyScores(), 'l4', lvl(7200, '2026-11-04', 'ZED'));
    s = addEntry(s, 'random', rnd(6, 61000, '2026-11-03', 'QUX'));
    saveScores({ setItem: (k, v) => void (data[k] = v) }, s);
    expect(Object.keys(data)).toEqual([KEY]);
    expect(loadScores({ getItem: (k) => data[k] ?? null })).toEqual(s);
  });

  it('is empty without storage or without the key', () => {
    expect(loadScores(null)).toEqual(emptyScores());
    expect(loadScores(undefined)).toEqual(emptyScores());
    expect(loadScores(store(null))).toEqual(emptyScores());
  });

  for (const [name, raw] of [
    ['garbage', 'not json{'],
    ['null', 'null'],
    ['an array', '[1,2]'],
    ['a number', '7'],
    ['the wrong version', '{"version":2,"initials":"ZZZ","boards":{"l1":[{"name":"ABC","ms":1000,"date":"2026-11-04"}]}}'],
    ['no version', '{"initials":"ZZZ","boards":{"l1":[{"name":"ABC","ms":1000,"date":"2026-11-04"}]}}'],
    ['boards as a string', '{"version":1,"boards":"x"}'],
    ['boards as an array', '{"version":1,"boards":[]}'],
  ] as const) {
    it(`loads empty for ${name}`, () => expect(loadScores(store(raw))).toEqual(emptyScores()));
  }

  it('survives storage that throws on read or on write', () => {
    expect(loadScores({ getItem: () => { throw new Error('SecurityError'); } })).toEqual(emptyScores());
    const full = { setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => saveScores(full, addEntry(emptyScores(), 'l1', lvl(1000)))).not.toThrow();
    expect(() => saveScores(null, emptyScores())).not.toThrow();
  });

  it('sanitises names and drops bad entries on load, keeping the good ones sorted and trimmed', () => {
    const entries = [
      { name: 'abc', ms: 3000, date: '2026-11-04' },
      { name: 'x-y!z', ms: 2000, date: '2026-11-04' },
      { name: 'Q', ms: 1000, date: '2026-11-04' },
      { name: 42, ms: 4000, date: '2026-11-04' },
      { name: 'BAD', ms: -1, date: '2026-11-04' },
      { name: 'BAD', ms: 'x', date: '2026-11-04' },
      { name: 'BAD', ms: 5000, date: 'soon' },
      null,
      'str',
      { name: 'ZZZ', ms: 6000 },
    ];
    const raw = JSON.stringify({ version: 1, initials: 'k9', boards: { l1: entries, l2: 'nope', constructor: [{ name: 'ABC', ms: 1, date: '2026-11-04' }] } });
    const s = loadScores(store(raw));
    expect(s.boards.l1!.map((e) => [e.name, e.ms])).toEqual([['QAA', 1000], ['XYZ', 2000], ['ABC', 3000], ['AAA', 4000]]);
    expect(s.boards.l2).toEqual([]);
    expect(s.initials).toBe('KAA');
    expect(Object.keys(s.boards)).toEqual([...BOARDS]);
  });

  it('trims an oversized stored board to ten', () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({ name: 'ABC', ms: (15 - i) * 1000, date: '2026-11-04' }));
    const s = loadScores(store(JSON.stringify({ version: 1, initials: 'ABC', boards: { l5: entries } })));
    expect(s.boards.l5).toHaveLength(TOP);
    expect(s.boards.l5![0]!.ms).toBe(1000);
  });

  it('drops a Random entry without a valid step, and a level entry keeps no step', () => {
    const raw = JSON.stringify({
      version: 1,
      boards: {
        random: [{ name: 'ABC', ms: 1000, date: '2026-11-04' }, { name: 'ABC', step: 99, ms: 1000, date: '2026-11-04' }, { name: 'ABC', step: 3, ms: 1000, date: '2026-11-04' }],
        l1: [{ name: 'ABC', step: 3, ms: 1000, date: '2026-11-04' }],
      },
    });
    const s = loadScores(store(raw));
    expect(s.boards.random).toEqual([{ name: 'ABC', step: 3, ms: 1000, date: '2026-11-04' }]);
    expect(s.boards.l1).toEqual([{ name: 'ABC', ms: 1000, date: '2026-11-04' }]);
  });

  it('does not leak a __proto__ key', () => {
    const s = loadScores(store('{"version":1,"boards":{"__proto__":[{"name":"ABC","ms":1,"date":"2026-11-04"}],"l1":[]},"__proto__":{"polluted":1}}'));
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(s.boards)).toBe(Object.prototype);
    expect(Object.keys(s.boards)).toEqual([...BOARDS]);
  });
});

describe('formatDate', () => {
  it('reads like 4 Nov', () => {
    expect(formatDate('2026-11-04')).toBe('4 Nov');
    expect(formatDate('2027-01-31')).toBe('31 Jan');
    expect(formatDate('2026-12-25')).toBe('25 Dec');
  });
  it('is empty for anything that is not a date', () => {
    expect(formatDate('nope')).toBe('');
    expect(formatDate('2026-13-04')).toBe('');
  });
});

describe('typing initials', () => {
  const start = { letters: 'AAA', cursor: 0 };

  it('fills the slots left to right, upper-cased, and ignores anything but A-Z', () => {
    let i = typeInitial(start, 'k');
    expect(i).toEqual({ letters: 'KAA', cursor: 1 });
    i = typeInitial(i, '7');
    i = typeInitial(i, 'Enter');
    expect(i).toEqual({ letters: 'KAA', cursor: 1 });
    i = typeInitial(typeInitial(i, 'i'), 'M');
    expect(i).toEqual({ letters: 'KIM', cursor: 3 });
    expect(typeInitial(i, 'z')).toEqual(i); // all three are in; Backspace to change one
  });

  it('Backspace steps back to the slot before the cursor', () => {
    let i = { letters: 'KIM', cursor: 3 };
    i = backInitial(i);
    expect(i).toEqual({ letters: 'KIM', cursor: 2 });
    expect(typeInitial(i, 'n')).toEqual({ letters: 'KIN', cursor: 3 });
    expect(backInitial({ letters: 'KIM', cursor: 0 }).cursor).toBe(0);
  });

  it('up and down cycle one slot through the alphabet, wrapping, and pick that slot', () => {
    expect(stepInitial(start, 0, 1)).toEqual({ letters: 'BAA', cursor: 0 });
    expect(stepInitial(start, 2, -1)).toEqual({ letters: 'AAZ', cursor: 2 });
    expect(stepInitial({ letters: 'AZA', cursor: 3 }, 1, 1)).toEqual({ letters: 'AAA', cursor: 1 });
  });
});
