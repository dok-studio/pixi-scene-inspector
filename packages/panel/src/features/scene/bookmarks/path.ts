import type { NodeId, SceneNode } from '@scene-inspector/protocol';

/**
 * A node named by where it sits rather than by what it is called this run.
 *
 * A `NodeId` is a counter the page starts over on every load
 * (docs/architecture.md §3.8), so a note kept under one comes back naming a
 * different object — which is why the gizmo pins are thrown away with the
 * generation. A bookmark has to outlive exactly that, so it stores the walk from
 * the root instead and the panel finds the node again on the next poll.
 *
 * Nothing here touches React or the protocol beyond the payload's own shape,
 * and every decision below is a pure function, so the awkward cases — a
 * renamed node, a sibling inserted in front of it, two children with the same
 * name — are settled in tests rather than on a running game.
 */

/** One step of the walk: what the node is called, what it is, and where it sat. */
export interface PathStep {
  name: string;
  type: string;
  /** Its place among **all** of its siblings, not only the ones like it. */
  index: number;
  /**
   * How many siblings there were, counting itself.
   *
   * The one thing that tells a **renamed** node apart from a **deleted** one,
   * which otherwise look identical from a payload alone: in both cases the
   * stored name is nowhere among the siblings. A rename leaves the count
   * where it was; a deletion does not. See `step` below, which is the only
   * reader of this.
   */
  siblings: number;
}

export type NodePath = readonly PathStep[];

/**
 * The payload arranged for lookup, in one pass.
 *
 * Possible only because the payload is depth-first: a parent is always listed
 * before its children, so by the time a node is read its parent is either
 * already known or is not in the payload at all — which is what makes it a
 * root. `tree/nested.ts` reads it the same way, for the same reason.
 */
interface Layout {
  byId: Map<NodeId, SceneNode>;
  roots: SceneNode[];
  children: Map<NodeId, SceneNode[]>;
  /** `null` for a root, so "has no parent" and "not here" stay different. */
  parents: Map<NodeId, NodeId | null>;
}

function layout(nodes: readonly SceneNode[]): Layout {
  const byId = new Map<NodeId, SceneNode>();
  const roots: SceneNode[] = [];
  const children = new Map<NodeId, SceneNode[]>();
  const parents = new Map<NodeId, NodeId | null>();

  for (const node of nodes) {
    const hasParent = byId.has(node.parent);

    byId.set(node.id, node);
    parents.set(node.id, hasParent ? node.parent : null);

    if (!hasParent) {
      roots.push(node);
      continue;
    }

    const siblings = children.get(node.parent);
    if (siblings === undefined) children.set(node.parent, [node]);
    else siblings.push(node);
  }

  return { byId, roots, children, parents };
}

function siblingsOf(tree: Layout, parent: NodeId | null): SceneNode[] {
  if (parent === null) return tree.roots;
  return tree.children.get(parent) ?? [];
}

/**
 * Which of these siblings the step means, in order of how much it is trusted.
 *
 * The name comes first because it is what the person bookmarking the node was
 * looking at; the place is what settles it when the name cannot — several
 * children called the same thing, or none called anything at all, which is
 * ordinary enough that `rowLabel` has a rule for it.
 *
 * The last rule is the one that survives a rename the panel never saw — a game
 * that numbers its nodes builds them under a different name every run — and it
 * is fenced twice. The stored name must be gone from the row entirely, and the
 * row must be the same length as when the bookmark was made. Without the second
 * fence a bookmark on a node that had simply been **deleted** would land on
 * whatever else stood in its place, and point confidently at the wrong object,
 * which is worse than a row that admits it cannot find anything.
 *
 * Several siblings sharing the wanted name and none at the wanted index is the
 * one case with no honest answer, so it gets none.
 */
function step(siblings: readonly SceneNode[], wanted: PathStep): SceneNode | null {
  const atIndex = siblings[wanted.index];

  if (atIndex !== undefined && atIndex.name === wanted.name && atIndex.type === wanted.type)
    return atIndex;

  const named = siblings.filter((node) => node.name === wanted.name && node.type === wanted.type);
  if (named.length === 1) return named[0] ?? null;
  if (named.length > 1) return null;

  const stillNamed = siblings.some((node) => node.name === wanted.name);
  const sameRow = siblings.length === wanted.siblings;

  if (!stillNamed && sameRow && atIndex !== undefined && atIndex.type === wanted.type)
    return atIndex;

  return null;
}

function walkUp(tree: Layout, id: NodeId): NodePath | null {
  const steps: PathStep[] = [];

  let current: NodeId | null = id;
  while (current !== null) {
    const node = tree.byId.get(current);
    if (node === undefined) return null;

    const parent: NodeId | null = tree.parents.get(current) ?? null;
    const siblings = siblingsOf(tree, parent);

    steps.push({
      name: node.name,
      type: node.type,
      index: siblings.indexOf(node),
      siblings: siblings.length,
    });

    current = parent;
  }

  return steps.reverse();
}

function walkDown(tree: Layout, path: NodePath): SceneNode | null {
  // An empty path names nothing. It cannot be built by `pathOf`, but it can
  // arrive from storage someone has edited.
  if (path.length === 0) return null;

  let parent: NodeId | null = null;
  let found: SceneNode | null = null;

  for (const wanted of path) {
    const node = step(siblingsOf(tree, parent), wanted);
    if (node === null) return null;

    found = node;
    parent = node.id;
  }

  return found;
}

/** The walk from the root down to `id`, or `null` if the payload has no such node. */
export function pathOf(nodes: readonly SceneNode[], id: NodeId): NodePath | null {
  return walkUp(layout(nodes), id);
}

/** The node a stored path names right now, or `null` while nothing matches it. */
export function resolvePath(nodes: readonly SceneNode[], path: NodePath): NodeId | null {
  return walkDown(layout(nodes), path)?.id ?? null;
}

/**
 * Whether two paths name the same node — and only that.
 *
 * The sibling count is left out on purpose, although it is part of a step. It
 * decides nothing about which node is meant; it is a fence, and a stale one
 * only ever makes `step` refuse an answer it was not sure of. Comparing it
 * here would instead rewrite storage every time anything was added anywhere in
 * a row the bookmarked node happens to sit in — a container that gains and loses
 * children each frame would have the panel writing to `localStorage` twice a
 * second. It is refreshed whenever the path is rewritten for a real reason.
 */
export function samePath(a: NodePath, b: NodePath): boolean {
  return (
    a.length === b.length &&
    a.every((step, at) => {
      const other = b[at];
      return (
        other !== undefined &&
        step.name === other.name &&
        step.type === other.type &&
        step.index === other.index
      );
    })
  );
}

/** What the panel learned about one stored path from the tree it is holding. */
export interface Resolved {
  /** The node the path names right now. */
  id: NodeId | null;
  /**
   * That node's path as the tree has it **now**.
   *
   * It differs from the stored one when the node has been renamed or moved
   * since — which the panel can do itself, through `scene.mutate` — and the
   * caller writes it back so the bookmark still finds it after the next load.
   * `null` when nothing was found, because there is nothing to learn from a
   * node that is not there.
   */
  livePath: NodePath | null;
}

/** Every stored path against one tree, arranging the payload only once. */
export function resolveAll(
  nodes: readonly SceneNode[],
  paths: readonly NodePath[],
): Resolved[] {
  const tree = layout(nodes);

  return paths.map((path) => {
    const node = walkDown(tree, path);
    if (node === null) return { id: null, livePath: null };

    return { id: node.id, livePath: walkUp(tree, node.id) };
  });
}
