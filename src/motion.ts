/**
 * The stage cards' slow motion (src/cards.ts), as pure functions of time so a test can read them: each card floats up and down
 * on its own 4-6 s sine, and its art drifts and breathes in a 20 s loop (a slow pan and zoom, "Ken Burns"). With reduced motion
 * (the user's prefers-reduced-motion) nothing moves: the art sits still, centred and a little zoomed.
 */

/** A card's float period in seconds (4, 5, 6 for cards 0, 1, 2) and its phase (radians), so the three never bob together. */
export const bobPeriod = (i: number): number => 4 + (i % 3);
const phaseOf = (i: number): number => i * 2.1;
/** How far the cards float, metres: a few millimetres each way. */
export const BOB_M = 0.003;
/** The art's loop, seconds. */
export const KEN_PERIOD_S = 20;
/** The art is shown this much zoomed in at least, and breathes up to ZOOM_MAX. */
export const ZOOM_MIN = 1.08;
export const ZOOM_MAX = 1.16;

/** Vertical offset of card `i` at time `t` seconds, metres; 0 with reduced motion. */
export const bob = (t: number, i: number, reduced = false): number => (reduced ? 0 : BOB_M * Math.sin((2 * Math.PI * t) / bobPeriod(i) + phaseOf(i)));

/**
 * The texture window for card `i` at time `t`: `repeat` is the share of the image shown (so the card's aspect is never stretched
 * and the zoom is in it), `offset` where its lower left sits; the window never leaves the image. A still, centred frame with
 * reduced motion.
 */
export function kenBurns(t: number, i: number, cardAspect: number, imageAspect: number, reduced = false) {
  const [fx, fy] = cardAspect > imageAspect ? [1, imageAspect / cardAspect] : [cardAspect / imageAspect, 1];
  const wave = (2 * Math.PI * t) / KEN_PERIOD_S + phaseOf(i);
  const zoom = reduced ? ZOOM_MIN : ZOOM_MIN + ((ZOOM_MAX - ZOOM_MIN) * (0.5 + 0.5 * Math.sin(wave))) ;
  const repeat = { x: fx / zoom, y: fy / zoom };
  const pan = reduced ? { x: 0, y: 0 } : { x: Math.sin(wave + 1), y: Math.cos(wave) * 0.6 };
  return { repeat, offset: { x: (1 - repeat.x) * (0.5 + 0.5 * pan.x), y: (1 - repeat.y) * (0.5 + 0.5 * pan.y) } };
}
