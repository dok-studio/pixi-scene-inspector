import type { Node } from '../../adapters/types.js';
import type { Matrix, Point } from '../nodeSpace.js';
import { worldMatrix } from '../nodeSpace.js';

/**
 * The sign on a node's zero: where it is, and which way its coordinates run.
 *
 * **The arrows are the parent's axes, not the node's own**, and that is the
 * whole design of this module. The zero is the node's — the point its children
 * are laid out from — but the numbers anyone reads next to it are `position.x`
 * and `position.y`, and those are measured in the space the node sits *in*.
 *
 * Drawing the node's own axes was tried first and it lies about movement. Give a
 * sprite `scale.x = -1` and its own +X runs left, while raising its `position.x`
 * still moves it right: the mirroring is inside the node and `position` is
 * outside it. An arrow that turns with the mirror is pointing at the wrong
 * answer to the only question the arrow is asked.
 *
 * So the gizmo ignores the node's own rotation, scale and mirroring, and follows
 * an **ancestor's** — because that one is real. Put a child in a parent turned
 * 30° and raising the child's `position.x` really does move it along that
 * diagonal, which is what the arrow then shows.
 *
 * A node with no parent is measured against the canvas, where the axes are the
 * screen's own.
 *
 * The DOM that draws all this is in `overlay.ts`; what is here is the
 * arithmetic, for the same reason `geometry.ts` next door exists.
 */

export interface Axes {
  /** The node's local (0,0) in canvas coordinates — `globalBounds`' space. */
  origin: Point;
  /**
   * The unit direction in which the node's `position.x` grows, or null when the
   * axis has collapsed — an ancestor scaled to zero, which is a normal thing
   * for a scene to contain and not something to divide by.
   */
  x: Point | null;
  y: Point | null;
}

/**
 * Below this a vector is not a direction, it is floating-point noise left over
 * from a transform that scaled the axis to nothing.
 */
const EPSILON = 1e-9;

/** The canvas's own axes: what a node parented to nothing is measured against. */
const CANVAS: Matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/** The unit vector along one, or null when it has no length to speak of. */
export function direction(vector: Point): Point | null {
  const length = Math.hypot(vector.x, vector.y);

  return length < EPSILON ? null : { x: vector.x / length, y: vector.y / length };
}

/**
 * @param parent the node's parent, or null for one that has none — the stage,
 * or a node that has been taken out of the scene. Ask the adapter for it
 * (`parentOf`) rather than reading a field.
 * @returns null for a node that cannot be placed at all: one that has been
 * destroyed, or that never had a transform to ask about. A destroyed node is
 * not asked rather than asked carefully — `globalBounds` takes the same care,
 * and for the same reason: some versions throw.
 */
export function axesOf(node: Node, parent: Node | null): Axes | null {
  const own = worldMatrix(node);
  if (own === null) return null;

  // The parent's transform, and only its rotation and scale are taken from it:
  // where the parent's own origin sits has nothing to do with where this node's
  // is, and a direction is the same wherever it is measured from.
  const frame = (parent === null ? null : worldMatrix(parent)) ?? CANVAS;

  return {
    origin: { x: own.tx, y: own.ty },
    x: direction({ x: frame.a, y: frame.b }),
    y: direction({ x: frame.c, y: frame.d }),
  };
}

/**
 * The three corners of an arrowhead: the tip, and two shoulders set back along
 * the shaft.
 *
 * @param heading a unit vector pointing the way the arrow does.
 * @param length how far back from the tip the shoulders sit.
 * @param width how far apart they are, across the shaft.
 */
export function arrowHead(
  tip: Point,
  heading: Point,
  length: number,
  width: number,
): [Point, Point, Point] {
  // The shaft's normal, which is the heading turned a quarter turn.
  const nx = -heading.y;
  const ny = heading.x;

  const backX = tip.x - heading.x * length;
  const backY = tip.y - heading.y * length;
  const half = width / 2;

  return [
    tip,
    { x: backX + nx * half, y: backY + ny * half },
    { x: backX - nx * half, y: backY - ny * half },
  ];
}
