import { COLS, ROWS, START_LENGTH } from '../config.js';
import type { Cell, Dir } from './grid.js';
import { same } from './grid.js';

/**
 * `playing` → `dying` → `over`.
 *
 * Death is not instant on purpose: `dying` is the second or so the head spends
 * on its `die` animation, and it is both the most interesting thing the Spine
 * section has to show and the calmest moment to photograph the panel in.
 */
export type Phase = 'playing' | 'dying' | 'over';

/**
 * How the snake is driven.
 *
 * `run` is the game: it moves on its own and the arrows steer it. `step` is the
 * one that makes this a stand — nothing moves until an arrow is pressed, and
 * each press advances exactly one cell. A scene that holds still is a scene
 * that can be framed, inspected and shot.
 */
export type Mode = 'run' | 'step';

export type Random = () => number;

export interface GameState {
  /** Head first. */
  body: Cell[];
  /**
   * Where the body was before the last step, head first.
   *
   * Drawing interpolates from this to `body`, which is the only way the head can
   * slide at all: it has no cell in front of it to move towards, so without a
   * record of where it came from it could only be drawn on its current square —
   * jumping a whole cell each step while the body glided. Shorter than `body` by
   * one after the snake grows: the new tail segment has nowhere to come from,
   * and stays where it is.
   */
  previous: Cell[];
  dir: Dir;
  /** Directions waiting to be taken, at most two. See `input.ts`. */
  queue: Dir[];
  food: Cell;
  score: number;
  phase: Phase;
  mode: Mode;
  /** Completed steps, for anything that wants to animate off the beat. */
  ticks: number;
}

/**
 * Somewhere free to put a berry.
 *
 * Rejection sampling, with a scan as the fallback: on a nearly full board the
 * sampler could keep missing for a long time, and a stand that hangs at the end
 * of a good run would be a poor advertisement.
 */
export function placeFood(body: Cell[], random: Random): Cell {
  const occupied = (cell: Cell): boolean => body.some((part) => same(part, cell));

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = {
      x: Math.floor(random() * COLS),
      y: Math.floor(random() * ROWS),
    };

    if (!occupied(candidate)) return candidate;
  }

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!occupied({ x, y })) return { x, y };
    }
  }

  // Every cell is snake: the board is won. Anywhere will do; nothing can move.
  return { x: 0, y: 0 };
}

export function createState(mode: Mode, random: Random): GameState {
  const y = Math.floor(ROWS / 2);
  const startX = Math.floor(COLS / 3);
  const body: Cell[] = [];

  for (let i = 0; i < START_LENGTH; i += 1) body.push({ x: startX - i, y });

  return {
    body,
    previous: body.map((cell) => ({ ...cell })),
    dir: 'right',
    queue: [],
    food: placeFood(body, random),
    score: 0,
    phase: 'playing',
    mode,
    ticks: 0,
  };
}

/** Puts a finished game back to the start, keeping the mode the player chose. */
export function resetState(state: GameState, random: Random): void {
  Object.assign(state, createState(state.mode, random));
}
