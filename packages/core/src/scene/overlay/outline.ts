import type { Node } from '../../adapters/types.js';
import type { Point } from '../nodeSpace.js';
import { localBoundsOf, mapRect } from '../nodeSpace.js';

/**
 * The shapes the overlay draws its frames as: four corners, in canvas
 * coordinates.
 *
 * Four corners rather than a rectangle because **a rotated node gets a rotated
 * frame**. The axis-aligned box around a node turned 30° is a good deal bigger
 * than the node and touches it in four places; on a scene where parents are
 * rotated, every child inherited a frame that said nothing about how it was
 * actually sitting.
 *
 * The highlight's corners are the node's **local** bounds put through its
 * **own** transform — the opposite decision to the origin gizmo next door, and
 * for a reason: the gizmo answers "which way does this move", which is the
 * parent's business, while a frame answers "what does this cover", which is the
 * node's own.
 *
 * A polygon, and not a div with a `matrix()` on it, because a div carries its
 * border through the transform: a node at `scale = 8` would be outlined in an
 * eight-pixel band. A stroke on a polygon whose points are already in canvas
 * coordinates stays the width it is set to.
 */

/**
 * The node's own bounds, turned the way the node is.
 *
 * @returns null for a node that answers neither probe — destroyed, or not a
 * display object at all. The overlay falls back to the adapter's axis-aligned
 * `globalBounds` there rather than drawing nothing: a frame in the right place
 * with the wrong orientation still says where the node is.
 */
export function outlineOf(node: Node): Point[] | null {
  const local = localBoundsOf(node);

  return local === null ? null : mapRect(node, local);
}

/**
 * Whether these corners enclose anything at all.
 *
 * An empty container, and a node whose transform has gone bad, both measure as
 * a single point — and a polygon drawn on four copies of one point is a stroked
 * dot rather than a frame. Callers draw nothing for those instead. A node that
 * is thin but not empty still spreads: a rule one pixel high has two corners
 * apart from the other two, and that is a frame worth drawing.
 */
export function spread(points: Point[]): boolean {
  const [first] = points;
  if (first === undefined) return false;

  return points.some((point) => point.x !== first.x || point.y !== first.y);
}

/**
 * Below this an edge has no direction to be outside of, and the corner it meets
 * is left where it is rather than sent off to infinity.
 */
const EPSILON = 1e-9;

function unit(from: Point, to: Point): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  return length < EPSILON ? null : { x: dx / length, y: dy / length };
}

/** Twice the signed area, whose sign is the winding — see `offsetOutward`. */
function turning(points: Point[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    return sum + (point.x * next.y - next.x * point.y);
  }, 0);
}

/**
 * The same convex outline, pushed out of itself by `distance` on every side.
 *
 * This is what keeps a thick frame **outside** what it is framing. An SVG
 * stroke straddles its path — half the width falls inwards — so a four-pixel
 * frame drawn straight onto a caption's wrap box would cover the first two
 * pixels of text on every side. Pushing the path out by half the stroke puts
 * all of the ink beyond the measurement, which is where the previous project's
 * `content-box` border had it.
 *
 * Each corner moves along the bisector of its two edges and far enough that
 * both offset edges still meet there — the ordinary mitre, and the reason the
 * corners of the frame stay corners instead of being rounded off.
 *
 * A mirrored node hands its corners over wound the other way, which would send
 * "outwards" inwards; the winding is measured rather than assumed.
 */
export function offsetOutward(points: Point[], distance: number): Point[] {
  // `turning` is worked out the y-up way, so a ring that reads as clockwise on
  // a y-down canvas comes back positive — and for that one the outward normal
  // is the edge direction turned a quarter turn anticlockwise on screen.
  const facing = turning(points) > 0 ? 1 : -1;

  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length] ?? point;
    const next = points[(index + 1) % points.length] ?? point;

    const incoming = unit(previous, point);
    const outgoing = unit(point, next);
    if (incoming === null || outgoing === null) return point;

    const normalIn = { x: incoming.y * facing, y: -incoming.x * facing };
    const normalOut = { x: outgoing.y * facing, y: -outgoing.x * facing };

    // The mitre: the two offset edges meet at `d · (n₁ + n₂) / (1 + n₁·n₂)`.
    // The divisor vanishes only when the edges double back on each other, which
    // a rectangle's corners cannot do unless the node has been flattened to a
    // line — and there the corner stays put rather than shooting off.
    const scale = 1 + (normalIn.x * normalOut.x + normalIn.y * normalOut.y);
    if (Math.abs(scale) < EPSILON) return point;

    return {
      x: point.x + (distance * (normalIn.x + normalOut.x)) / scale,
      y: point.y + (distance * (normalIn.y + normalOut.y)) / scale,
    };
  });
}
