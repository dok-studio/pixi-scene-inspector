import { describe, expect, it } from 'vitest';

import type { Node } from '../../adapters/types.js';
import type { Point } from '../nodeSpace.js';
import { offsetOutward, outlineOf, spread } from './outline.js';

/**
 * The shape of a highlight.
 *
 * The property that matters throughout: the corners are the node's own bounds
 * put through the node's own transform, so a turned node gets a turned frame
 * rather than the larger axis-aligned box around it.
 */

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

function node(
  local: { x: number; y: number; width: number; height: number } | null,
  matrix: Partial<Matrix> = {},
): Node {
  const { a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0 } = matrix;

  return {
    toGlobal: (point: Point) => ({
      x: a * point.x + c * point.y + tx,
      y: b * point.x + d * point.y + ty,
    }),
    ...(local === null ? {} : { getLocalBounds: () => local }),
  } as unknown as Node;
}

function close(points: Point[] | null, expected: Point[]): void {
  expect(points).not.toBeNull();
  expect(points).toHaveLength(expected.length);

  expected.forEach((want, index) => {
    expect(points?.[index]?.x).toBeCloseTo(want.x, 6);
    expect(points?.[index]?.y).toBeCloseTo(want.y, 6);
  });
}

describe('outlineOf', () => {
  it('places an untransformed node exactly where its bounds are', () => {
    close(outlineOf(node({ x: 0, y: 0, width: 100, height: 50 }, { tx: 5, ty: 7 })), [
      { x: 5, y: 7 },
      { x: 105, y: 7 },
      { x: 105, y: 57 },
      { x: 5, y: 57 },
    ]);
  });

  /**
   * The whole point. A quarter turn takes the top-right corner to the
   * bottom-right, and the frame goes with it instead of growing into the box
   * around all four.
   */
  it('turns the frame with the node', () => {
    close(
      outlineOf(node({ x: 0, y: 0, width: 100, height: 50 }, { a: 0, b: 1, c: -1, d: 0 })),
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: -50, y: 100 },
        { x: -50, y: 0 },
      ],
    );
  });

  it('carries the node’s scale into the frame', () => {
    close(outlineOf(node({ x: 0, y: 0, width: 10, height: 10 }, { a: 3, d: 2 })), [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
      { x: 0, y: 20 },
    ]);
  });

  it('keeps bounds that do not start at the node’s zero', () => {
    close(outlineOf(node({ x: -20, y: -10, width: 40, height: 20 }, { tx: 100, ty: 100 })), [
      { x: 80, y: 90 },
      { x: 120, y: 90 },
      { x: 120, y: 110 },
      { x: 80, y: 110 },
    ]);
  });

  /** The caller falls back to the adapter's axis-aligned bounds for these. */
  it('reports nothing for a node it cannot measure in its own space', () => {
    expect(outlineOf(node(null))).toBeNull();
    expect(outlineOf({} as Node)).toBeNull();
  });
});

/**
 * Pushing a frame off what it frames.
 *
 * The wrap box is four pixels thick and is drawn straight over the caption it
 * measures, so half a stroke landing inside the box is half a stroke on the
 * text. The corners have to move outwards along their own bisectors, whichever
 * way the caption has been turned.
 */
describe('offsetOutward', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('grows a square by the distance on every side', () => {
    close(offsetOutward(square, 2), [
      { x: -2, y: -2 },
      { x: 102, y: -2 },
      { x: 102, y: 102 },
      { x: -2, y: 102 },
    ]);
  });

  /**
   * A mirrored node hands its corners back wound the other way. Assuming a
   * winding would send the frame inwards for exactly those nodes — the ink
   * would land on the text instead of beside it.
   */
  it('still grows when the corners come round the other way', () => {
    close(offsetOutward([...square].reverse(), 2), [
      { x: -2, y: 102 },
      { x: 102, y: 102 },
      { x: 102, y: -2 },
      { x: -2, y: -2 },
    ]);
  });

  it('mitres the corners of a turned frame', () => {
    // The same square, turned a quarter turn: the offset has to follow it
    // rather than staying axis-aligned.
    const turned = square.map((point) => ({ x: -point.y, y: point.x }));

    close(offsetOutward(turned, 2), [
      { x: 2, y: -2 },
      { x: 2, y: 102 },
      { x: -102, y: 102 },
      { x: -102, y: -2 },
    ]);
  });

  /** A caption scaled to a line has no outside; the corners stay where they are. */
  it('leaves a frame with no area alone', () => {
    const flat = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ];

    expect(offsetOutward(flat, 2)).toEqual(flat);
  });
});

describe('spread', () => {
  it('says a real frame has something to enclose', () => {
    expect(spread([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 }])).toBe(true);
  });

  it('still says so for a node that is thin rather than empty', () => {
    // A rule or a divider: no height, but it is somewhere and it is worth a frame.
    expect(spread([{ x: 0, y: 7 }, { x: 90, y: 7 }, { x: 90, y: 7 }, { x: 0, y: 7 }])).toBe(true);
  });

  it('says an empty container encloses nothing', () => {
    const point = { x: 0, y: 0 };
    expect(spread([point, point, point, point])).toBe(false);
  });
});
