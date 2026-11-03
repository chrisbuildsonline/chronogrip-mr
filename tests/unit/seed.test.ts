import { describe, expect, it } from 'vitest';
import { decodeSeed, encodeSeed } from '../../src/seed';
import { dailySeed } from '../../src/tinker';

const MAX = 2 ** 32 - 1;

describe('encodeSeed / decodeSeed', () => {
  it('round-trips many seeds, the ends and real dailies', () => {
    const seeds = [0, 1, 31, 32, 1023, 1024, 20260101, MAX, MAX - 1, 2 ** 31, 2 ** 25];
    for (let y = 2024; y <= 2040; y++) for (const m of [0, 5, 11]) seeds.push(dailySeed(new Date(y, m, 1 + (y % 28))));
    let x = 12345;
    for (let i = 0; i < 2000; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      seeds.push(x);
    }
    for (const s of seeds) expect(decodeSeed(encodeSeed(s)), String(s)).toBe(s);
  });

  it('makes short readable uppercase codes of 4 to 8 characters, with no look-alikes', () => {
    for (const s of [0, 1, 20261104, MAX, 424242]) {
      const code = encodeSeed(s);
      expect(code).toMatch(/^[0-9A-Z]{4,8}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('decodes case-insensitively', () => {
    const code = encodeSeed(20261104);
    expect(decodeSeed(code.toLowerCase())).toBe(20261104);
    expect(decodeSeed(`  ${code} `)).toBe(20261104);
  });

  it('rejects empty, too short, too long, bad characters and out of range', () => {
    for (const bad of ['', ' ', 'ABC', 'ABCDEFGHJKMN', 'ZZZZZZZ', '8ZZZZZZ', 'AB-CD', 'AB CD', 'ABCU', 'ébcd', 'ABCD\n1', '0x-234']) {
      expect(decodeSeed(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('never throws on odd inputs', () => {
    for (const odd of [undefined, null, 5, {}, [], Symbol.for('x'), () => 1] as unknown[]) {
      expect(() => decodeSeed(odd as string)).not.toThrow();
      expect(decodeSeed(odd as string)).toBeNull();
    }
    for (const s of [-1, 1.5, Number.NaN, Infinity, MAX + 1]) expect(() => encodeSeed(s)).not.toThrow();
  });

  it('fuzz: 2500 random strings never throw and give a valid number or null', () => {
    const pool = '0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz ILOUilou-_!?é\u0000\n';
    let x = 987654321;
    const rnd = (n: number) => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0), x % n);
    for (let i = 0; i < 2500; i++) {
      const code = Array.from({ length: rnd(12) }, () => pool[rnd(pool.length)]).join('');
      const got = decodeSeed(code);
      if (got !== null) {
        expect(Number.isInteger(got) && got >= 0 && got <= MAX, code).toBe(true);
        expect(decodeSeed(encodeSeed(got))).toBe(got);
      }
    }
  });
});
