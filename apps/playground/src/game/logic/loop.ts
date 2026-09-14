import { STEP_MS } from '../config.js';

/**
 * The fixed-step accumulator.
 *
 * Logic advances in whole steps of `STEP_MS` and drawing interpolates between
 * them, which is what keeps the snake on its grid while still moving smoothly.
 * On a screenshot it is the difference between crisp cells and a blur.
 *
 * The clamp matters more here than in a normal game. A backgrounded tab
 * throttles its frames, and without a ceiling the first frame after coming back
 * would carry a second of arrears and replay it all at once — the snake would
 * teleport, probably into itself. Four steps is enough to absorb a hitch and
 * too few to hide a death.
 */
const MAX_ARREARS_MS = STEP_MS * 4;

export interface Loop {
  /** Feeds elapsed time in and runs whole steps. @returns the interpolation alpha. */
  advance(elapsedMs: number, run: () => void): number;
  /** Drops the accumulated remainder — after a pause, or a restart. */
  reset(): void;
  /** How far the current step has come, 0…1. */
  alpha(): number;
}

export function createLoop(): Loop {
  let accumulated = 0;

  return {
    advance(elapsedMs, run) {
      accumulated = Math.min(accumulated + elapsedMs, MAX_ARREARS_MS);

      while (accumulated >= STEP_MS) {
        accumulated -= STEP_MS;
        run();
      }

      return accumulated / STEP_MS;
    },

    reset() {
      accumulated = 0;
    },

    alpha() {
      return accumulated / STEP_MS;
    },
  };
}
