/** Crockford base32: digits and letters without I, L, O, U, so a code read aloud or off a screen is hard to get wrong. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_SEED = 2 ** 32 - 1;
const MIN_LEN = 4;
const MAX_LEN = 7; // 32 bits is 7 base32 digits

/** A puzzle seed (a whole number 0..2^32-1) as a short uppercase code of 4 to 7 characters; '' for anything else. */
export function encodeSeed(seed: number): string {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) return '';
  let code = '';
  for (let n = seed; n > 0; n = Math.floor(n / 32)) code = ALPHABET[n % 32]! + code;
  return code.padStart(MIN_LEN, '0');
}

/** The seed a code stands for, or null for anything invalid. Case-insensitive; like Crockford, O reads as 0 and I or L as 1. Never throws. */
export function decodeSeed(code: string): number | null {
  if (typeof code !== 'string') return null;
  const s = code.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length < MIN_LEN || s.length > MAX_LEN) return null;
  let n = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    n = n * 32 + v;
  }
  return n <= MAX_SEED ? n : null;
}
