import { Container, Graphics } from 'pixi.js';

import { ARENA_HEIGHT, ARENA_WIDTH, CELL, COLS, ROWS } from '../config.js';

export interface Arena {
  root: Container;
  /** Where the snake, the berry and the sparks go. */
  play: Container;
}

/**
 * The board: a grid, a border, and a mask that clips everything to it.
 *
 * The mask is not decoration. A sprite interpolating towards a wall reaches
 * slightly past it between steps, and without clipping the last frame before a
 * death has a head sticking out of the arena.
 */
export function createArena(): Arena {
  const root = new Container({ label: 'arena' });

  const floor = new Graphics({ label: 'floor' });

  // The board is darkened against the tiled ground, so the playfield reads as a
  // surface of its own rather than as the same floor with lines on it.
  floor.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT).fill({ color: 0x0c111a, alpha: 0.62 });

  for (let x = 1; x < COLS; x += 1) {
    floor.moveTo(x * CELL, 0).lineTo(x * CELL, ARENA_HEIGHT);
  }
  for (let y = 1; y < ROWS; y += 1) {
    floor.moveTo(0, y * CELL).lineTo(ARENA_WIDTH, y * CELL);
  }
  floor.stroke({ color: 0x1b2430, width: 1, pixelLine: true });


  const clip = new Graphics({ label: 'arena-clip' })
    .rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT)
    .fill(0xffffff);

  const play = new Container({ label: 'play' });

  root.addChild(floor, play, clip);
  root.mask = clip;

  return { root, play };
}
