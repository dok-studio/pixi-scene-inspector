import { describe, expect, it } from 'vitest';

import type { Node } from '../../adapters/types.js';
import type { Point } from '../nodeSpace.js';
import { arrowHead, axesOf, direction } from './axes.js';

/**
 * Where a node's zero is, and which way the coordinates it is placed by run.
 *
 * The node is a matrix and a `toGlobal` built out of it, which is all the real
 * thing offers this module. The distinction every test below turns on: the
 * origin comes from the **node**, the arrows come from its **parent** — see
 * `axes.ts` for the movement this gets wrong the other way round.
 */

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/** A node that maps a point the way PixiJS's `worldTransform` would. */
function node(matrix: Partial<Matrix> = {}, extra: Record<string, unknown> = {}): Node {
  const { a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0 } = matrix;

  return {
    toGlobal: (point: Point) => ({
      x: a * point.x + c * point.y + tx,
      y: b * point.x + d * point.y + ty,
    }),
    ...extra,
  } as unknown as Node;
}

/** A turn, as both a matrix and the pair of directions it produces. */
function turned(degrees: number): Matrix {
  const angle = (degrees * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
}

/** Directions are unit vectors, so they are compared to the digit that matters. */
function close(actual: Point | null, expected: Point): void {
  expect(actual).not.toBeNull();
  expect(actual?.x).toBeCloseTo(expected.x, 6);
  expect(actual?.y).toBeCloseTo(expected.y, 6);
}

describe('axesOf', () => {
  it('puts the origin where the node maps its own zero, not at a corner of its bounds', () => {
    expect(axesOf(node({ tx: 120, ty: 45 }), null)?.origin).toEqual({ x: 120, y: 45 });
  });

  /**
   * PixiJS's local +Y points **down**, so `position.y` grows downwards and the
   * green arrow goes down with it. It looks wrong to anyone expecting the
   * maths-textbook picture, and it is what the scene actually does.
   */
  it('reports X to the right and Y downwards for a node parented to nothing', () => {
    const axes = axesOf(node(turned(40)), null);

    close(axes?.x ?? null, { x: 1, y: 0 });
    close(axes?.y ?? null, { x: 0, y: 1 });
  });

  /**
   * The regression this module was rewritten for. A mirrored sprite's own +X
   * runs left, while raising its `position.x` still moves it right — so an
   * arrow drawn from the node's own transform points at the wrong answer.
   */
  it('ignores the node’s own mirroring, because position does not mirror with it', () => {
    close(axesOf(node({ a: -1 }), node())?.x ?? null, { x: 1, y: 0 });
  });

  it('ignores the node’s own rotation for the same reason', () => {
    const axes = axesOf(node(turned(30)), node());

    close(axes?.x ?? null, { x: 1, y: 0 });
    close(axes?.y ?? null, { x: 0, y: 1 });
  });

  /**
   * And follows an ancestor's, because that one is real: inside a parent turned
   * 30°, raising a child's `position.x` moves it along that diagonal.
   */
  it('turns with the parent, whose axes the node is actually placed by', () => {
    const parent = turned(30);
    const axes = axesOf(node({ tx: 10, ty: 20 }), node(parent));

    expect(axes?.origin).toEqual({ x: 10, y: 20 });
    close(axes?.x ?? null, { x: parent.a, y: parent.b });
    close(axes?.y ?? null, { x: parent.c, y: parent.d });
  });

  /** The parent's scale is a length, and only its direction is kept. */
  it('reports a direction rather than a length', () => {
    close(axesOf(node(), node({ a: 40, d: 0.25 }))?.x ?? null, { x: 1, y: 0 });
    close(axesOf(node(), node({ a: 40, d: 0.25 }))?.y ?? null, { x: 0, y: 1 });
  });

  /**
   * A scene contains nodes scaled to nothing — that is how things are hidden —
   * and an axis with no length is not a direction to normalise, it is a
   * division by zero.
   */
  it('drops an axis the parent has collapsed, and keeps the origin', () => {
    const axes = axesOf(node({ tx: 10, ty: 20 }), node({ a: 0 }));

    expect(axes?.origin).toEqual({ x: 10, y: 20 });
    expect(axes?.x).toBeNull();
    close(axes?.y ?? null, { x: 0, y: 1 });
  });

  /** A parent that answers nothing is no reason to lose the node's own zero. */
  it('falls back to the canvas’s axes for a parent it cannot read', () => {
    const axes = axesOf(node({ tx: 5, ty: 6 }), {} as Node);

    expect(axes?.origin).toEqual({ x: 5, y: 6 });
    close(axes?.x ?? null, { x: 1, y: 0 });
  });

  /** The same care `globalBounds` takes, and for the same reason: some throw. */
  it('does not ask a destroyed node where it is', () => {
    const destroyed = node(
      {},
      {
        destroyed: true,
        toGlobal: () => {
          throw new Error('a destroyed node must not be asked');
        },
      },
    );

    expect(axesOf(destroyed, null)).toBeNull();
  });

  it('reports nothing for an object that has no transform to ask about', () => {
    expect(axesOf({} as Node, null)).toBeNull();
  });
});

describe('direction', () => {
  it('is null for a vector with no length to speak of', () => {
    expect(direction({ x: 0, y: 0 })).toBeNull();
  });

  it('normalises a diagonal', () => {
    close(direction({ x: 3, y: 4 }), { x: 0.6, y: 0.8 });
  });
});

describe('arrowHead', () => {
  it('keeps the tip and sets the shoulders back across the shaft', () => {
    const [tip, left, right] = arrowHead({ x: 30, y: 0 }, { x: 1, y: 0 }, 10, 8);

    expect(tip).toEqual({ x: 30, y: 0 });
    close(left, { x: 20, y: 4 });
    close(right, { x: 20, y: -4 });
  });

  it('turns with the heading it is given', () => {
    const [tip, left, right] = arrowHead({ x: 0, y: 30 }, { x: 0, y: 1 }, 10, 8);

    expect(tip).toEqual({ x: 0, y: 30 });
    close(left, { x: -4, y: 20 });
    close(right, { x: 4, y: 20 });
  });
});
