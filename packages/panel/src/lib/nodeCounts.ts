import type { NodeId, SceneNode } from '@scene-inspector/protocol';
import { NODE_FILTERED, NODE_MASKED } from '@scene-inspector/protocol';

/**
 * How many nodes of each type the scene holds.
 *
 * In `lib` rather than in either feature because both want it: the strip under
 * the Scene tab and the per-type charts in Stats are the same numbers asked in
 * two ways, and two implementations of a count is two answers to one question.
 *
 * Derived from the tree payload rather than counted in the page, which is the
 * one decision here worth stating. `scene.tree` already carries the type of
 * every node and is already polled, so a page-side counter would be a second
 * walk producing numbers that could disagree with the tree on screen — and
 * disagreeing with what the user is looking at is the one thing a counter must
 * never do. The cost is that the Stats tab polls the tree; it does so half as
 * often as the Scene tab already does, and an unchanged scene answers
 * `unchanged`.
 */

export interface TypeCount {
  type: string;
  count: number;
}

export interface NodeCounts {
  /** Every type present, most numerous first. */
  types: TypeCount[];
  total: number;
  /**
   * Nodes carrying a filter, and nodes carrying a mask.
   *
   * Counted on the same pass because they are in the same payload — the page
   * flags them as it walks (`NODE_FILTERED`, `NODE_MASKED`). They are not a
   * type, so nothing above would show them: a filtered `Container` is a
   * `Container`, and a scene can be slow for a reason the type counts never
   * mention.
   */
  filtered: number;
  masked: number;
}

export function countTypes(nodes: readonly SceneNode[]): NodeCounts {
  const counts = new Map<string, number>();
  let filtered = 0;
  let masked = 0;

  for (const node of nodes) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    if ((node.flags & NODE_FILTERED) !== 0) filtered += 1;
    if ((node.flags & NODE_MASKED) !== 0) masked += 1;
  }

  const types = [...counts]
    .map(([type, count]) => ({ type, count }))
    // By count, and by name where counts tie: the list is read to find what
    // there is most of, and a stable order under that keeps a row from swapping
    // places with its neighbour every time one node is added.
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));

  return { types, total: nodes.length, filtered, masked };
}

/**
 * The selected node and everything under it, in the payload's own order.
 *
 * **The node itself is included**, and that is the choice worth naming. It gives
 * the reading a property that makes it trustworthy: selecting the stage answers
 * exactly what the whole scene answers, so the two modes of the counts strip
 * agree wherever they should. It also means a selected leaf reads `Sprite 1`
 * rather than an empty panel, which says something true instead of nothing.
 *
 * One forward pass, no map of children: the payload guarantees that a node's
 * parent comes earlier in the array (see `SceneTreePayload`), so a parent is
 * always already decided by the time its child is looked at.
 */
export function subtreeOf(nodes: readonly SceneNode[], rootId: NodeId | null): SceneNode[] {
  if (rootId === null) return [...nodes];

  const inside = new Set<NodeId>([rootId]);
  const found: SceneNode[] = [];

  for (const node of nodes) {
    if (node.id !== rootId && !inside.has(node.parent)) continue;

    inside.add(node.id);
    found.push(node);
  }

  return found;
}
