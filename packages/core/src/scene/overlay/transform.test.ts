import type { Rect } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { Matrix, Point } from '../nodeSpace.js';
import { IDENTITY, apply, multiply } from '../nodeSpace.js';
import type { Change, DragStart } from './transform.js';
import {
  centreOf,
  cursorFor,
  handlePoint,
  movedTo,
  rotatedTo,
  scaledTo,
  turnCursorFor,
} from './transform.js';

/**
 * The one property every test here is really asking about: **the anchor did not
 * move**. Scale a node from its bottom right corner and its top left must be
 * exactly where it was, on the canvas, to the last decimal — whatever the node's
 * pivot is, whatever its parent is doing.
 *
 * That is the whole difference between a free transform and writing `scale` in
 * the properties pane, and it is the reason each solver returns a position too.
 * So the tests do not check the numbers the solver produced; they rebuild the
 * node's transform out of them and ask where the anchor ended up.
 */

/** How PixiJS composes a node's own transform, on every supported line. */
function localOf(node: {
  position: Point;
  rotation: number;
  scale: Point;
  pivot: Point;
}): Matrix {
  const cos = Math.cos(node.rotation);
  const sin = Math.sin(node.rotation);

  const a = cos * node.scale.x;
  const b = sin * node.scale.x;
  const c = -sin * node.scale.y;
  const d = cos * node.scale.y;

  return {
    a,
    b,
    c,
    d,
    tx: node.position.x - (a * node.pivot.x + c * node.pivot.y),
    ty: node.position.y - (b * node.pivot.x + d * node.pivot.y),
  };
}

interface Placed {
  position: Point;
  rotation: number;
  scale: Point;
  pivot: Point;
}

const BOUNDS: Rect = { x: 0, y: 0, width: 100, height: 40 };

/** A node in a parent, as the drag reads it at `pointerdown`. */
function start(node: Partial<Placed>, parent: Matrix = IDENTITY, bounds: Rect = BOUNDS): DragStart {
  const placed: Placed = {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    pivot: { x: 0, y: 0 },
    ...node,
  };

  return {
    bounds,
    world: multiply(parent, localOf(placed)),
    parent,
    ...placed,
    pointer: { x: 0, y: 0 },
  };
}

/** The same node with the drag's answer written onto it. */
function after(from: DragStart, change: Change, parent: Matrix = IDENTITY): Matrix {
  return multiply(
    parent,
    localOf({
      position: change.position,
      rotation: change.rotation ?? from.rotation,
      scale: change.scale ?? from.scale,
      pivot: from.pivot,
    }),
  );
}

/** Where a local point of the node lands on the canvas. */
function canvas(world: Matrix, point: Point): Point {
  return apply(world, point);
}

function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

/** A parent turned a quarter turn and scaled, so nothing lines up by accident. */
const AWKWARD_PARENT: Matrix = { a: 0, b: 2, c: -2, d: 0, tx: 40, ty: -10 };

/** A parent that mirrors: what tells a turn measured in the right space apart. */
const MIRRORED_PARENT: Matrix = { a: -1, b: 0, c: 0, d: 1, tx: 300, ty: 0 };

describe('movedTo', () => {
  it('follows the pointer one for one under an untransformed parent', () => {
    const from = start({ position: { x: 10, y: 20 } });
    const change = movedTo(from, { x: 35, y: 5 });

    expect(change?.position).toEqual({ x: 45, y: 25 });
  });

  it('measures the delta in the parent, not on the canvas', () => {
    const from = start({ position: { x: 10, y: 20 } }, AWKWARD_PARENT);
    const change = movedTo(from, { x: 0, y: 8 });
    expect(change).not.toBeNull();

    // The parent turns and doubles, so eight canvas pixels down the screen are
    // four along the node's own x, and the node must end up under the pointer.
    expectPoint(change!.position, { x: 14, y: 20 });
    expectPoint(canvas(after(from, change!, AWKWARD_PARENT), from.pivot), {
      x: canvas(from.world, from.pivot).x,
      y: canvas(from.world, from.pivot).y + 8,
    });
  });

  it('gives up on a parent flattened to nothing', () => {
    const flat: Matrix = { a: 0, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    expect(movedTo(start({}, flat), { x: 5, y: 5 })).toBeNull();
  });
});

describe('scaledTo', () => {
  /** Nothing held: a corner keeps the node's proportions. */
  const plain = { shift: false, alt: false };
  /** Shift: the two axes go their own way. */
  const free = { shift: true, alt: false };

  it('leaves the opposite corner exactly where it was', () => {
    const from = start({ position: { x: 30, y: 30 }, rotation: 0.4, scale: { x: 2, y: 1.5 } });
    const anchor = handlePoint(BOUNDS, 'nw');
    const before = canvas(from.world, anchor);

    const change = scaledTo(from, 'se', { x: 220, y: 180 }, plain);
    expect(change).not.toBeNull();

    expectPoint(canvas(after(from, change!), anchor), before);
  });

  /**
   * Only once Shift is down. A corner that is keeping the proportions cannot
   * also be wherever the pointer went — that is what keeping them means.
   */
  it('keeps the seized handle under the pointer once Shift frees the axes', () => {
    const from = start({ position: { x: 30, y: 30 }, rotation: 0.4, scale: { x: 2, y: 1.5 } });
    const pointer = { x: 220, y: 180 };

    const change = scaledTo(from, 'se', pointer, free);
    expect(change).not.toBeNull();

    expectPoint(canvas(after(from, change!), handlePoint(BOUNDS, 'se')), pointer);
  });

  it('holds the anchor even when the node turns about a pivot far from it', () => {
    const from = start({
      position: { x: 120, y: 90 },
      rotation: -0.9,
      scale: { x: 1.25, y: 0.8 },
      pivot: { x: 70, y: 25 },
    });
    const anchor = handlePoint(BOUNDS, 'ne');
    const before = canvas(from.world, anchor);

    const change = scaledTo(from, 'sw', { x: -40, y: 60 }, plain);
    expect(change).not.toBeNull();

    expectPoint(canvas(after(from, change!), anchor), before);
  });

  it('holds the anchor under a turned, scaled parent', () => {
    const from = start({ position: { x: 12, y: 8 }, rotation: 0.2 }, AWKWARD_PARENT);
    const anchor = handlePoint(BOUNDS, 'nw');
    const before = canvas(from.world, anchor);

    const change = scaledTo(from, 'se', { x: -100, y: 260 }, plain);
    expect(change).not.toBeNull();

    expectPoint(canvas(after(from, change!, AWKWARD_PARENT), anchor), before);
  });

  /** Shift is a corner's business: a side handle only ever has the one axis. */
  it('moves one axis only from an edge handle, Shift or no Shift', () => {
    const from = start({ scale: { x: 3, y: 3 } });

    for (const modifiers of [plain, free]) {
      const change = scaledTo(from, 'e', { x: 50, y: 999 }, modifiers);

      expect(change?.scale?.y).toBe(3);
      expect(change?.scale?.x).toBeCloseTo(0.5, 6);
    }
  });

  it('mirrors when a handle is dragged past its anchor', () => {
    const from = start({});

    const change = scaledTo(from, 'e', { x: -25, y: 0 }, plain);

    expect(change?.scale?.x).toBeCloseTo(-0.25, 6);
  });

  /**
   * The default, and the reason it is the default: an unmodified corner drag
   * that let the axes go their own way squashed every sprite it resized.
   */
  it('keeps the proportions on a corner with nothing held', () => {
    const from = start({ scale: { x: 2, y: 2 } });

    // Far along x, barely at all along y: x decides the size of both.
    const change = scaledTo(from, 'se', { x: 400, y: 42 }, plain);

    expect(change?.scale?.x).toBeCloseTo(4, 6);
    expect(change?.scale?.y).toBeCloseTo(4, 6);
  });

  it('keeps each axis its own side of the anchor while doing so', () => {
    const from = start({ scale: { x: 2, y: 2 } });

    // Far along x, a little the *other* way along y: x still decides the size,
    // and y keeps the mirror the pointer put it on.
    const change = scaledTo(from, 'se', { x: 400, y: -20 }, plain);

    expect(change?.scale?.x).toBeCloseTo(4, 6);
    expect(change?.scale?.y).toBeCloseTo(-4, 6);
  });

  it('with Shift, lets the two axes go their own way', () => {
    const from = start({ scale: { x: 2, y: 2 } });

    const change = scaledTo(from, 'se', { x: 400, y: 42 }, free);

    expect(change?.scale?.x).toBeCloseTo(4, 6);
    expect(change?.scale?.y).toBeCloseTo(1.05, 6);
  });

  it('with Alt, holds the middle of the frame instead of the far corner', () => {
    const from = start({ position: { x: 50, y: 50 }, rotation: 0.3 });
    const middle = centreOf(BOUNDS);
    const before = canvas(from.world, middle);

    const change = scaledTo(from, 'se', { x: 200, y: 120 }, { shift: false, alt: true });
    expect(change).not.toBeNull();

    expectPoint(canvas(after(from, change!), middle), before);
  });

  it('gives up on a node with an axis scaled to nothing', () => {
    expect(scaledTo(start({ scale: { x: 0, y: 1 } }), 'se', { x: 10, y: 10 }, plain)).toBeNull();
  });
});

describe('rotatedTo', () => {
  const free = { shift: false, alt: false };

  it('turns by the angle the pointer swept about the middle of the frame', () => {
    const from = { ...start({ position: { x: 0, y: 0 } }), pointer: { x: 100, y: 20 } };

    // From due east of the middle to due south of it: a quarter turn.
    const change = rotatedTo(from, { x: 50, y: 120 }, free);

    expect(change?.rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  it('leaves the middle of the frame exactly where it was', () => {
    const from = {
      ...start({ position: { x: 60, y: 40 }, rotation: 0.3, scale: { x: 1.5, y: 0.7 } }),
      pointer: { x: 200, y: 100 },
    };
    const middle = centreOf(BOUNDS);
    const before = canvas(from.world, middle);

    const change = rotatedTo(from, { x: 140, y: 220 }, free);
    expect(change).not.toBeNull();

    expectPoint(canvas(after(from, change!), middle), before);
  });

  it('holds the middle even with the pivot somewhere else entirely', () => {
    const from = {
      ...start({ position: { x: 60, y: 40 }, rotation: 1.1, pivot: { x: -30, y: 90 } }),
      pointer: { x: 10, y: 10 },
    };
    const middle = centreOf(BOUNDS);
    const before = canvas(from.world, middle);

    const change = rotatedTo(from, { x: 90, y: -40 }, free);
    expect(change).not.toBeNull();

    expectPoint(canvas(after(from, change!), middle), before);
  });

  it('turns the way the pointer went under a mirrored parent', () => {
    const from = {
      ...start({ position: { x: 50, y: 20 } }, MIRRORED_PARENT),
      pointer: canvasOf(MIRRORED_PARENT, { x: 200, y: 40 }),
    };
    const middle = centreOf(BOUNDS);
    const before = canvas(from.world, middle);

    // The pointer is moved in the parent's own space, and the node has to
    // follow it there — a turn read off the canvas would come out backwards.
    const change = rotatedTo(from, canvasOf(MIRRORED_PARENT, { x: 100, y: 200 }), free);
    expect(change).not.toBeNull();

    expect(change!.rotation).toBeGreaterThan(0);
    expectPoint(canvas(after(from, change!, MIRRORED_PARENT), middle), before);
  });

  it('with Shift, lands on a whole fifteen degrees rather than an offset one', () => {
    const from = { ...start({ rotation: 0.05 }), pointer: { x: 100, y: 20 } };

    const change = rotatedTo(from, { x: 100, y: 21 }, { shift: true, alt: false });

    expect(change?.rotation).toBe(0);
  });
});

/** A point given in a parent's space, as the canvas sees it. */
function canvasOf(parent: Matrix, point: Point): Point {
  return apply(parent, point);
}

describe('turnCursorFor', () => {
  const middle = { x: 0, y: 0 };

  /**
   * CSS has no rotate cursor, so the frame carries a drawn one. The fallback
   * after the comma is what a page with a strict `img-src` gets instead — and
   * it must not be a hand, which is the whole point of drawing this.
   */
  it('hands back a drawn image with a plain cursor to fall back on', () => {
    const cursor = turnCursorFor({ x: 10, y: 10 }, middle);

    expect(cursor.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(cursor.endsWith('") 12 12, crosshair')).toBe(true);
    expect(cursor).not.toContain('grab');
  });

  it('faces the arrow away from the middle, so it curves around the frame', () => {
    // A quarter turn apart on screen is a quarter turn apart in the glyph.
    expect(turnCursorFor({ x: 10, y: 0 }, middle)).not.toBe(
      turnCursorFor({ x: 0, y: 10 }, middle),
    );
  });

  it('builds one image per direction rather than one per frame', () => {
    // Same corner, asked twice: the very same string, not an equal one.
    expect(turnCursorFor({ x: 10, y: 10 }, middle)).toBe(turnCursorFor({ x: 20, y: 20 }, middle));
  });
});

describe('cursorFor', () => {
  it('names the cursor by where the handle is, not by what it is called', () => {
    const middle = { x: 0, y: 0 };

    expect(cursorFor({ x: 10, y: 0 }, middle)).toBe('ew-resize');
    expect(cursorFor({ x: 10, y: 10 }, middle)).toBe('nwse-resize');
    expect(cursorFor({ x: 0, y: 10 }, middle)).toBe('ns-resize');
    expect(cursorFor({ x: -10, y: 10 }, middle)).toBe('nesw-resize');
    // Opposite ends of the same diagonal share a cursor, which is what keeps a
    // turned frame from showing eight different ones.
    expect(cursorFor({ x: -10, y: -10 }, middle)).toBe('nwse-resize');
  });
});
