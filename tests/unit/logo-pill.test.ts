import html from '../../index.html?raw';
import { expect, test } from 'vitest';

const rule = (sel: string) => new RegExp(`${sel.replace(/[#.]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(html)![1]!;
const bg = (css: string) => /background:\s*(rgba\([^)]*\))/.exec(css)?.[1];

test('the header logo sits on the same dark translucent pill as the level chip, so a bright moon never washes it', () => {
  const [logo, chip] = [rule('h1'), rule('#progress')];
  expect(bg(logo), 'the logo has a pill background').toBeTruthy();
  expect(bg(logo)).toBe(bg(chip));
  expect(/border-radius:\s*10px/.test(logo)).toBe(true);
  expect(/height:\s*46px/.test(logo) && /height:\s*46px/.test(chip), 'both are one height').toBe(true);
});
