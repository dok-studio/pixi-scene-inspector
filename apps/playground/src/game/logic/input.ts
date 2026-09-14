import type { Dir } from './grid.js';
import { opposite } from './grid.js';
import type { GameState } from './state.js';

/** Two is enough to take a corner cleanly and few enough to stay predictable. */
const QUEUE_LIMIT = 2;

/**
 * Asks the snake to turn.
 *
 * The reversal is checked against **the last direction queued**, not against
 * the one currently being travelled. Checking the current one looks right and
 * is wrong: press up then left inside a single step and the second press is
 * measured against a heading the snake has not taken yet, so a legal pair of
 * turns registers as a reversal — or, worse, a genuine reversal slips through
 * and the head eats its own neck.
 *
 * @returns whether the direction was taken.
 */
export function queueDirection(state: GameState, dir: Dir): boolean {
  if (state.phase !== 'playing') return false;
  if (state.queue.length >= QUEUE_LIMIT) return false;

  const last = state.queue[state.queue.length - 1] ?? state.dir;
  if (dir === last || dir === opposite(last)) return false;

  state.queue.push(dir);
  return true;
}
