import { describe, expect, it } from 'vitest';

import { COLS, ROWS, SCORE_PER_BERRY } from '../config.js';
import type { Cell } from './grid.js';
import { queueDirection } from './input.js';
import type { GameState } from './state.js';
import { createState } from './state.js';
import { step } from './step.js';

/**
 * The rules of the game, which is all there is to test here — the rest of the
 * playground is arrangement, and a scene graph is checked by looking at it.
 *
 * The random source is fixed so that a berry lands where the test puts it
 * rather than where chance does.
 */

const never = (): number => 0;

function stateWith(overrides: Partial<GameState>): GameState {
  return Object.assign(createState('run', never), overrides);
}

/** A horizontal snake, head first, running right from (x, y). */
function bodyAt(x: number, y: number, length: number): Cell[] {
  return Array.from({ length }, (_, i) => ({ x: x - i, y }));
}

describe('step', () => {
  it('moves the head and drags the tail', () => {
    const state = stateWith({ body: bodyAt(5, 5, 3), dir: 'right', food: { x: 19, y: 1 } });

    const events = step(state, never);

    expect(events).toEqual({ moved: true, ate: false, died: false });
    expect(state.body[0]).toEqual({ x: 6, y: 5 });
    expect(state.body).toHaveLength(3);
    expect(state.ticks).toBe(1);
  });

  it('grows and scores when it reaches the berry', () => {
    const state = stateWith({ body: bodyAt(5, 5, 3), dir: 'right', food: { x: 6, y: 5 } });

    const events = step(state, never);

    expect(events.ate).toBe(true);
    expect(state.body).toHaveLength(4);
    expect(state.score).toBe(SCORE_PER_BERRY);
  });

  it('puts the next berry somewhere the snake is not', () => {
    const state = stateWith({ body: bodyAt(5, 5, 3), dir: 'right', food: { x: 6, y: 5 } });

    step(state, never);

    expect(state.body.some((part) => part.x === state.food.x && part.y === state.food.y)).toBe(
      false,
    );
  });

  it('dies against a wall', () => {
    const state = stateWith({ body: bodyAt(COLS - 1, 5, 3), dir: 'right', food: { x: 1, y: 1 } });

    expect(step(state, never).died).toBe(true);
    expect(state.phase).toBe('dying');
  });

  it('dies against itself', () => {
    // A closed loop: turning down walks into its own flank.
    const state = stateWith({
      body: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
      ],
      dir: 'down',
      food: { x: 1, y: 1 },
    });

    expect(step(state, never).died).toBe(true);
  });

  it('follows its own tail, because the tail moves out of the way', () => {
    const state = stateWith({
      body: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
      ],
      dir: 'down',
      food: { x: 1, y: 1 },
    });

    expect(step(state, never).died).toBe(false);
    expect(state.body[0]).toEqual({ x: 5, y: 6 });
  });

  it('does nothing once the game is over', () => {
    const state = stateWith({ body: bodyAt(5, 5, 3), phase: 'over' });

    expect(step(state, never)).toEqual({ moved: false, ate: false, died: false });
  });

  it('takes one queued direction per step', () => {
    const state = stateWith({ body: bodyAt(5, 5, 3), dir: 'right', food: { x: 19, y: 1 } });

    queueDirection(state, 'up');
    queueDirection(state, 'left');
    step(state, never);

    expect(state.dir).toBe('up');
    expect(state.queue).toEqual(['left']);
  });

  it('stays inside the board after a full lap of turns', () => {
    const state = stateWith({ body: bodyAt(5, 5, 3), dir: 'right', food: { x: 19, y: 1 } });

    for (const dir of ['down', 'left', 'up', 'right'] as const) {
      queueDirection(state, dir);
      step(state, never);
    }

    expect(state.body.every((part) => part.x >= 0 && part.x < COLS && part.y >= 0 && part.y < ROWS)).toBe(
      true,
    );
  });
});

describe('queueDirection', () => {
  it('refuses a reversal', () => {
    const state = stateWith({ dir: 'right' });

    expect(queueDirection(state, 'left')).toBe(false);
    expect(state.queue).toEqual([]);
  });

  it('refuses the direction already being travelled', () => {
    const state = stateWith({ dir: 'right' });

    expect(queueDirection(state, 'right')).toBe(false);
  });

  it('measures a reversal against the last queued turn, not the current one', () => {
    // Up then left is legal; left is only a reversal of `right`, which the snake
    // will have stopped travelling by the time the second turn is taken.
    const state = stateWith({ dir: 'right' });

    expect(queueDirection(state, 'up')).toBe(true);
    expect(queueDirection(state, 'left')).toBe(true);
    expect(state.queue).toEqual(['up', 'left']);
  });

  it('rejects a reversal of a queued turn', () => {
    const state = stateWith({ dir: 'right' });

    queueDirection(state, 'up');

    expect(queueDirection(state, 'down')).toBe(false);
  });

  it('holds at most two turns', () => {
    const state = stateWith({ dir: 'right' });

    queueDirection(state, 'up');
    queueDirection(state, 'left');

    expect(queueDirection(state, 'down')).toBe(false);
    expect(state.queue).toHaveLength(2);
  });

  it('ignores input once the game is over', () => {
    const state = stateWith({ dir: 'right', phase: 'over' });

    expect(queueDirection(state, 'up')).toBe(false);
  });
});
