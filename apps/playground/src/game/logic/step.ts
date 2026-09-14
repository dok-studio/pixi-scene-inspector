import { SCORE_PER_BERRY } from '../config.js';
import { advance, inside, same } from './grid.js';
import type { GameState, Random } from './state.js';
import { placeFood } from './state.js';

/** What one step changed, for the scene and the skeleton to react to. */
export interface StepEvents {
  moved: boolean;
  ate: boolean;
  died: boolean;
}

const NOTHING: StepEvents = { moved: false, ate: false, died: false };

/**
 * One discrete move of the snake.
 *
 * A pure function over the state, which is what makes it the one part of the
 * game worth a test: everything else is arrangement, and this is the part with
 * rules in it.
 */
export function step(state: GameState, random: Random): StepEvents {
  if (state.phase !== 'playing') return NOTHING;

  // Taken before anything moves: this is what the next second of drawing
  // interpolates away from — see `GameState.previous`.
  state.previous = state.body.map((cell) => ({ ...cell }));

  const next = state.queue.shift();
  if (next !== undefined) state.dir = next;

  const head = advance(state.body[0]!, state.dir);

  /*
   * The tail is about to move out of the way, so the square it occupies is free
   * — unless the snake is growing this step, in which case it stays put. Without
   * this, following your own tail at full length is a death, which is a bug
   * every implementation of this game gets to have once.
   */
  const growing = same(head, state.food);
  const blocking = growing ? state.body : state.body.slice(0, -1);

  if (!inside(head) || blocking.some((part) => same(part, head))) {
    state.phase = 'dying';
    return { moved: false, ate: false, died: true };
  }

  state.body.unshift(head);
  state.ticks += 1;

  if (!growing) {
    state.body.pop();
    return { moved: true, ate: false, died: false };
  }

  state.score += SCORE_PER_BERRY;
  state.food = placeFood(state.body, random);

  return { moved: true, ate: true, died: false };
}
