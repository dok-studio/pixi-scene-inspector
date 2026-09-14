/**
 * The curve the logo snake's body follows.
 *
 * Shared by the art and the skeleton, and that is the entire reason it is a
 * module. The body is drawn as discs along this curve; the skeleton has to know
 * where the curve *ends* to hang the head off it, and where the tail begins to
 * hang the tail bone off that. When those numbers were written twice — once in
 * each file — the head came out floating beside the coil instead of growing out
 * of it. Now there is one place to be wrong in.
 *
 * Coordinates are the **skeleton's**: origin at the middle of the coil, Y up.
 * The art converts to texture space when it draws; nothing else has to think
 * about the flip.
 */

/** Where the body sits, as an ellipse. */
const RX = 34.5;
const RY = 23;

/** How many discs the whole body is made of, tail included. */
export const COUNT = 18;

/**
 * Start of the sweep, at the upper right, going clockwise through the bottom.
 *
 * The quarter it leaves open is at the top: the thick end of the body is on the
 * right of that gap, where the head rises, and the tail comes up on the left.
 */
const START = -0.25 * Math.PI;
const SWEEP = 1.75 * Math.PI;

/** Where the coil stops being the coil and starts being the tail. */
export const TAIL_FROM = 0.72;

/** The body's thickness, thick at the neck and tapering away. */
const thickness = (t) => 12 - t * 6.5;

/**
 * A point on the body.
 *
 * @param t 0 at the thick end under the head, 1 at the tip of the tail.
 * @returns `{ x, y, radius }` in skeleton space.
 */
export function pointAt(t) {
  const angle = START + t * SWEEP;

  return {
    x: Math.cos(angle) * RX,
    // Negated: the sweep is written to read clockwise on screen, and screen Y
    // runs the other way from the skeleton's.
    y: -Math.sin(angle) * RY,
    radius: thickness(t),
  };
}

/** Evenly spaced `t` values across a stretch of the body. */
export function span(from, to) {
  const steps = Math.round((to - from) * COUNT);

  return Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);
}

/** Where the head attaches: the thick end of the body. */
export const NECK_AT = pointAt(0);

/** Where the tail bone sits: the middle of the stretch it owns. */
export const TAIL_AT = pointAt((TAIL_FROM + 1) / 2);
