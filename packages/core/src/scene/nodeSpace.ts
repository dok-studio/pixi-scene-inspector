import type { Rect } from '@scene-inspector/protocol';

import type { Node } from '../adapters/types.js';

/**
 * A node's own coordinate system, read off the node itself.
 *
 * Duck-typed rather than routed through `PixiAdapter`: `toGlobal` and
 * `getLocalBounds` are on the container of every supported line, so there is no
 * version branch here and nothing for the adapter to hide (rule 2 in CLAUDE.md).
 *
 * It lives on its own because three callers need it — the wrap box of a caption
 * (`text/wrapBox.ts`), the origin gizmo and the highlight's outline (both in
 * `scene/overlay/`) — and none of them is a natural home for the others' copy.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * A 2×3 affine transform, spelled the way both PixiJS and CSS spell one: a
 * point maps to `(a·x + c·y + tx, b·x + d·y + ty)`.
 */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

interface Measurable {
  toGlobal?: (point: Point) => Partial<Point>;
  getLocalBounds?: () => Partial<Rect>;
}

/**
 * @returns the point unchanged for a node that cannot map it. That is the same
 * answer a node at the origin with no transform would give, which is the least
 * wrong thing to draw when there is nothing to go on.
 */
export function toGlobal(node: Node, point: Point): Point {
  const map = (node as Measurable).toGlobal;
  if (typeof map !== 'function') return point;

  const mapped = map.call(node, point);

  return {
    x: typeof mapped.x === 'number' ? mapped.x : point.x,
    y: typeof mapped.y === 'number' ? mapped.y : point.y,
  };
}

/** Whether the node can be asked about its place in the scene at all. */
export function mappable(node: Node): boolean {
  const target = node as Measurable & { destroyed?: unknown };
  return target.destroyed !== true && typeof target.toGlobal === 'function';
}

/**
 * The node's transform into canvas coordinates, **probed rather than read**.
 *
 * Three points are mapped and the transform is whatever maps them: the origin,
 * and one unit along each local axis. Reading `worldTransform` off the node
 * would give the same answer on a good day, but that field's freshness is the
 * renderer's business — `toGlobal` is the method that answers for the state the
 * node is actually in, and every version has it.
 *
 * @returns null for a destroyed node, for one with no transform to ask about,
 * and for one whose answer is not a number — see `finite`.
 */
export function worldMatrix(node: Node): Matrix | null {
  if (!mappable(node)) return null;

  const origin = toGlobal(node, { x: 0, y: 0 });
  const alongX = toGlobal(node, { x: 1, y: 0 });
  const alongY = toGlobal(node, { x: 0, y: 1 });

  const matrix = {
    a: alongX.x - origin.x,
    b: alongX.y - origin.y,
    c: alongY.x - origin.x,
    d: alongY.y - origin.y,
    tx: origin.x,
    ty: origin.y,
  };

  return finite(matrix) ? matrix : null;
}

/**
 * Whether a transform is made of real numbers.
 *
 * **A scene contains broken nodes.** A game divides by a size that is zero for
 * one frame, or writes a position out of an animation that has not started, and
 * a node is left at `NaN` — it draws nothing and the game carries on, none the
 * wiser. The inspector then asks it where it is, and NaN spreads through
 * everything downstream of the answer: an outline of `NaN,NaN`, which the
 * browser rejects with a console error for every frame the node stays selected.
 *
 * So the probe refuses to answer rather than answering with nonsense, and every
 * caller here already knows what to do with "this node cannot be placed": draw
 * nothing for it. The one thing none of them can do is notice it themselves.
 */
function finite(matrix: Matrix): boolean {
  return (
    Number.isFinite(matrix.a) &&
    Number.isFinite(matrix.b) &&
    Number.isFinite(matrix.c) &&
    Number.isFinite(matrix.d) &&
    Number.isFinite(matrix.tx) &&
    Number.isFinite(matrix.ty)
  );
}

/** Where a point in the node's own coordinates lands on the canvas. */
export function apply(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
    y: matrix.b * point.x + matrix.d * point.y + matrix.ty,
  };
}

/**
 * The vector, rather than the point: the translation is left out.
 *
 * A difference between two points has no origin to be offset from — putting one
 * through `apply` would add the translation twice over. This is what turns a
 * direction, a size or a delta from one space into another.
 */
export function applyVector(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y,
    y: matrix.b * point.x + matrix.d * point.y,
  };
}

/** `a` after `b` — the transform that maps a point through `b` and then `a`. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    tx: a.a * b.tx + a.c * b.ty + a.tx,
    ty: a.b * b.tx + a.d * b.ty + a.ty,
  };
}

/**
 * The transform that undoes this one.
 *
 * @returns null when there is nothing to undo: a node scaled to zero on an axis
 * has flattened a whole dimension of its space, and no transform brings one
 * back. Callers treat that as "this node cannot answer where the pointer is",
 * which is the truth of it.
 */
export function invert(matrix: Matrix): Matrix | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || determinant === 0) return null;

  const a = matrix.d / determinant;
  const b = -matrix.b / determinant;
  const c = -matrix.c / determinant;
  const d = matrix.a / determinant;

  return {
    a,
    b,
    c,
    d,
    tx: -(a * matrix.tx + c * matrix.ty),
    ty: -(b * matrix.tx + d * matrix.ty),
  };
}

/** The transform that leaves every point where it is. */
export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/**
 * The corners of a rectangle, in the order a closed polygon is drawn: top left,
 * top right, bottom right, bottom left.
 */
export function corners(rect: Rect): [Point, Point, Point, Point] {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  return [
    { x: rect.x, y: rect.y },
    { x: right, y: rect.y },
    { x: right, y: bottom },
    { x: rect.x, y: bottom },
  ];
}

/**
 * A rectangle **given in the node's own coordinates**, as four points on the
 * canvas.
 *
 * Four corners rather than a rectangle back, because the node may be turned:
 * flattening them into the axis-aligned box around them is exactly the loss
 * every caller here is avoiding.
 *
 * @returns null for a node with no transform to put the rectangle through.
 */
export function mapRect(node: Node, rect: Rect): [Point, Point, Point, Point] | null {
  const matrix = worldMatrix(node);
  if (matrix === null) return null;

  const [a, b, c, d] = corners(rect);

  return [apply(matrix, a), apply(matrix, b), apply(matrix, c), apply(matrix, d)];
}

/**
 * What the node covers **in its own coordinates** — before its own rotation,
 * scale and position are applied to it.
 *
 * @returns null for a node that cannot be measured this way, and for one whose
 * measurement is not made of numbers.
 *
 * The second case is the empty container: a box around nothing starts at
 * positive infinity and ends at negative infinity, so its width is
 * `-Infinity - Infinity` on some versions and the corners come out `NaN`. A
 * rectangle that is not a rectangle is no measurement, and saying so is the
 * only answer that lets a caller draw nothing instead of nonsense.
 */
export function localBoundsOf(node: Node): Rect | null {
  const measure = (node as Measurable).getLocalBounds;
  if (typeof measure !== 'function') return null;

  // Copied out for the same reason `globalBounds` copies: every version hands
  // back an instance it reuses on the next call.
  const bounds = measure.call(node);

  const rect = {
    x: typeof bounds.x === 'number' ? bounds.x : 0,
    y: typeof bounds.y === 'number' ? bounds.y : 0,
    width: typeof bounds.width === 'number' ? bounds.width : 0,
    height: typeof bounds.height === 'number' ? bounds.height : 0,
  };

  return Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
    ? rect
    : null;
}
