import { COLS, ROWS } from '../config.js';

/** A square of the arena. Integer coordinates, origin top left. */
export interface Cell {
  x: number;
  y: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

const DELTA: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function opposite(dir: Dir): Dir {
  return OPPOSITE[dir];
}

export function advance(cell: Cell, dir: Dir): Cell {
  const delta = DELTA[dir];

  return { x: cell.x + delta.x, y: cell.y + delta.y };
}

export function inside(cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < COLS && cell.y < ROWS;
}

export function same(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * The heading, in radians, with zero pointing right.
 *
 * That is PixiJS's own convention and the dragon's art is drawn to match it, so
 * the head's rotation is this value with nothing added to it.
 */
export function angleOf(dir: Dir): number {
  switch (dir) {
    case 'right':
      return 0;
    case 'down':
      return Math.PI / 2;
    case 'left':
      return Math.PI;
    case 'up':
      return -Math.PI / 2;
  }
}

/** The centre of a cell, in arena pixels. */
export function centreOf(cell: Cell, cellSize: number): { x: number; y: number } {
  return { x: (cell.x + 0.5) * cellSize, y: (cell.y + 0.5) * cellSize };
}
