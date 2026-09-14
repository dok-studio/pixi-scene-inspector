import { describe, expect, it } from 'vitest';

import type { Node } from '../adapters/types.js';
import type { Point } from './nodeSpace.js';
import {
  apply,
  applyVector,
  corners,
  invert,
  localBoundsOf,
  mapRect,
  multiply,
  worldMatrix,
} from './nodeSpace.js';

/**
 * Reading a node's own coordinate system off the node.
 *
 * Everything the overlay draws goes through here — the highlight, the wrap box
 * and the origin gizmo — so the probing is worth holding still on its own
 * rather than only through the three of them.
 */

function node(map: ((point: Point) => Point) | null, extra: Record<string, unknown> = {}): Node {
  return {
    ...(map === null ? {} : { toGlobal: map }),
    ...extra,
  } as unknown as Node;
}

describe('corners', () => {
  it('walks the rectangle so a closed polygon comes out of it', () => {
    expect(corners({ x: 10, y: 20, width: 30, height: 40 })).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 60 },
      { x: 10, y: 60 },
    ]);
  });
});

describe('worldMatrix', () => {
  /**
   * The transform is derived from three mapped points rather than read off the
   * node, so what it reports is whatever `toGlobal` currently does — which is
   * the point of asking that way.
   */
  it('recovers the transform from the points it maps', () => {
    const matrix = worldMatrix(
      node((point) => ({ x: 2 * point.x - point.y + 7, y: 3 * point.x + 4 * point.y - 1 })),
    );

    expect(matrix).toEqual({ a: 2, b: 3, c: -1, d: 4, tx: 7, ty: -1 });
  });

  it('reports nothing for a destroyed node, and does not ask it', () => {
    const destroyed = node(
      () => {
        throw new Error('a destroyed node must not be asked');
      },
      { destroyed: true },
    );

    expect(worldMatrix(destroyed)).toBeNull();
  });

  it('reports nothing for an object with no transform at all', () => {
    expect(worldMatrix(node(null))).toBeNull();
  });
});

describe('mapRect', () => {
  it('puts a rectangle given in the node’s own space onto the canvas', () => {
    // A quarter turn: the rectangle's own top-right corner ends up below it.
    const turned = node((point) => ({ x: -point.y, y: point.x }));

    expect(mapRect(turned, { x: 0, y: 0, width: 100, height: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: -40, y: 100 },
      { x: -40, y: 0 },
    ]);
  });

  it('reports nothing for a node it cannot place', () => {
    expect(mapRect(node(null), { x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });
});

describe('invert', () => {
  it('undoes a transform that turns, scales and mirrors', () => {
    const matrix = { a: 0, b: 3, c: 2, d: 0, tx: 15, ty: -4 };
    const back = invert(matrix);
    expect(back).not.toBeNull();

    const point = { x: 7, y: -11 };
    const there = apply(matrix, point);
    const home = apply(back!, there);

    expect(home.x).toBeCloseTo(point.x, 9);
    expect(home.y).toBeCloseTo(point.y, 9);
  });

  it('refuses a transform that has flattened a whole axis', () => {
    // A node at `scale.x = 0` draws nothing along its own x, and there is no
    // matrix that brings that dimension back.
    expect(invert({ a: 0, b: 0, c: 0, d: 1, tx: 5, ty: 5 })).toBeNull();
  });
});

describe('multiply', () => {
  it('is one transform after the other, in that order', () => {
    const outer = { a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 0 };
    const inner = { a: 1, b: 0, c: 0, d: 1, tx: 3, ty: 4 };
    const point = { x: 1, y: 1 };

    expect(apply(multiply(outer, inner), point)).toEqual(apply(outer, apply(inner, point)));
  });
});

describe('applyVector', () => {
  it('leaves the translation out, because a difference has no origin', () => {
    const matrix = { a: 0, b: 1, c: -1, d: 0, tx: 100, ty: 200 };

    expect(applyVector(matrix, { x: 3, y: 0 })).toEqual({ x: 0, y: 3 });
  });
});

/**
 * A scene contains broken nodes: a game divides by a size that is zero for one
 * frame, or reads a position out of an animation that has not started, and
 * leaves a node at `NaN`. It draws nothing and the game carries on none the
 * wiser — and then the inspector asks it where it is.
 */
describe('probing a node whose answer is not a number', () => {
  it('refuses a transform rather than passing NaN on', () => {
    expect(worldMatrix(node((point) => ({ x: NaN, y: point.y })))).toBeNull();
    expect(worldMatrix(node(() => ({ x: Infinity, y: 0 })))).toBeNull();
  });

  it('refuses a measurement that is not a rectangle', () => {
    // The empty container: a box around nothing runs from positive infinity to
    // negative infinity, and the width of that is not a number.
    const empty = node(null, {
      getLocalBounds: () => ({ x: Infinity, y: Infinity, width: -Infinity, height: -Infinity }),
    });

    expect(localBoundsOf(empty)).toBeNull();
  });

  it('still measures a rectangle that is merely empty', () => {
    const flat = node(null, { getLocalBounds: () => ({ x: 5, y: 5, width: 0, height: 0 }) });

    expect(localBoundsOf(flat)).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });
});
