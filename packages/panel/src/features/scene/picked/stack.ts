import type { NodeId, SceneNode } from '@scene-inspector/protocol';

/**
 * What a pick is worth offering, out of everything the page found under it.
 *
 * The page answers with what its own hit test reports, one node at a time
 * (`adapters/picking.ts`), and the two PixiJS lines answer differently. On v8
 * switching off what was found uncovers what is drawn beneath it. On v6 the
 * interaction plugin hands back the **ancestors** of that node first — a
 * container absorbs the pixel its child was switched off for — and only then
 * moves on to what is actually underneath:
 *
 *     orb.png (Sprite) | props | platforms | world | stage | platform-2 (Graphics)
 *
 * Those ancestors are the one thing the list cannot help anyone with. The point
 * of it is reaching a node that has something drawn over it — a node the tree
 * cannot offer, because the pick lands on the cover every time. An ancestor of
 * a node already on the list is the opposite: it is the row directly above the
 * selected one in the tree, already open, one click away. Worse, on v6 every
 * pick would carry its whole chain up to the stage, so the list would never be
 * shorter than two and would sit over the bookmarks permanently.
 *
 * **A skeleton is the exception, and it is the reason this file is not two
 * lines.** On v6 and v7 a Spine node is a container of meshes and sprites the
 * runtime builds; a click on a character lands on one of those, and the node
 * anyone means — the one with the animations, the skins and the tracks — is its
 * parent. Dropping it as "an ancestor" answered a click on a character with the
 * name of a mesh. So a Spine ancestor is kept, and offered even where the page
 * never reported it: on v8 the skeleton is the node that gets hit and there is
 * nothing to add, which is why this reads as a v6 rule.
 */

/** As the tree spells it — `adapters/nodeType.ts`, on every version. */
const SPINE = 'Spine';

export function offered(nodes: readonly SceneNode[], picked: readonly NodeId[]): NodeId[] {
  if (picked.length === 0) return [];

  const parentOf = new Map(nodes.map((node) => [node.id, node.parent]));
  const isSpine = new Set(nodes.filter((node) => node.type === SPINE).map((node) => node.id));

  /** The chain above a node, nearest first, as far as the tree goes. */
  const ancestorsOf = (id: NodeId): NodeId[] => {
    const chain: NodeId[] = [];
    // An id the tree has not caught up with has no parent to look up, and the
    // walk stops before it starts rather than guessing.
    let parent = parentOf.get(id);

    while (parent !== undefined && !chain.includes(parent)) {
      chain.push(parent);
      parent = parentOf.get(parent);
    }

    return chain;
  };

  // What something else on the list is inside. Skeletons are not covered by
  // their own children — see above.
  const covered = new Set<NodeId>();
  for (const id of picked) {
    for (const ancestor of ancestorsOf(id)) {
      if (!isSpine.has(ancestor)) covered.add(ancestor);
    }
  }

  const result: NodeId[] = [];
  const taken = new Set<NodeId>();

  const add = (id: NodeId): void => {
    if (taken.has(id)) return;
    taken.add(id);
    result.push(id);
  };

  for (const id of picked) {
    if (covered.has(id)) continue;

    add(id);
    // Right after the node it belongs to, nearest skeleton first: that is where
    // it sits in the scene, and the row above is what was actually clicked.
    for (const ancestor of ancestorsOf(id)) {
      if (isSpine.has(ancestor)) add(ancestor);
    }
  }

  return result;
}
