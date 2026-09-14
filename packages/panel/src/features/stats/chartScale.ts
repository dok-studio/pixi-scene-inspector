/**
 * Where the top of a chart sits.
 *
 * Two requirements pull against each other. The ceiling has to be a number a
 * person can read off the axis — 60, not 58.3 — and it has to be able to come
 * **down** again. The previous project only ever raised it (`max` was a
 * lifetime maximum that nothing reset), so one spike flattened the chart for
 * the rest of the session: a game that stuttered once to 900 draw calls drew
 * its steady 140 as a line along the floor from then on.
 *
 * So the ceiling follows the data, and the only thing holding it up is
 * hysteresis: it rises the moment it must, and falls only once the data has
 * been comfortably below it, so a series hovering near a step does not make the
 * axis flicker between two values on alternate frames.
 */

/** Steps a person reads without doing arithmetic: 1, 2, 5 and their decades. */
const STEPS = [1, 2, 5];

/**
 * The smallest readable number at or above `value`.
 *
 * @param floor never return less than this — an FPS chart is worth drawing
 * against 60 even when the game is managing 12, because the question is how far
 * short it is falling.
 */
export function niceCeiling(value: number, floor = 0): number {
  // The floor is an exact number the caller means — 60 frames a second — not a
  // value to round in turn. Anything at or under it draws against it as it is.
  if (!Number.isFinite(value) || value <= floor) return Math.max(floor, 1);

  const decade = 10 ** Math.floor(Math.log10(value));
  for (const step of STEPS) {
    const candidate = step * decade;
    if (candidate >= value) return candidate;
  }

  return 10 * decade;
}

/**
 * The ceiling to draw at, given the one currently drawn.
 *
 * Rises immediately: a value above the top would otherwise be drawn outside the
 * box. Falls only once the peak is clear of the step below by a margin — not
 * merely under half the ceiling, which is the boundary itself and would let a
 * series hovering at 99 against a top of 200 drop to 100, exceed it on the next
 * sample, and rewrite the axis on alternate frames.
 */
const FALL_AT = 0.45;

export function nextCeiling(current: number, peak: number, floor = 0): number {
  const wanted = niceCeiling(peak, floor);
  if (wanted > current) return wanted;
  if (peak < current * FALL_AT) return wanted;

  return Math.max(current, floor);
}

/** The largest value in a series, or zero for one with nothing in it. */
export function peakOf(values: readonly number[]): number {
  let peak = 0;
  for (const value of values) if (Number.isFinite(value) && value > peak) peak = value;

  return peak;
}
