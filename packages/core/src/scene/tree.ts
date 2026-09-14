import type { NodeId, Revisioned, SceneNode, SceneTreePayload } from '@scene-inspector/protocol';
import { NODE_FILTERED, NODE_LOCKED, NODE_MASKED, NODE_VISIBLE } from '@scene-inspector/protocol';

import type { Node, PixiAdapter } from '../adapters/types.js';
import { FNV_OFFSET, hashNumber, hashString } from './fingerprint.js';
import type { Locks } from './mutate.js';
import type { Registry } from './registry.js';

/**
 * The scene graph as a flat array, plus the revision that decides whether it
 * needs sending at all (docs/architecture.md §3.2).
 *
 * **Two walks, on purpose.** The first computes only the fingerprint and
 * allocates nothing; the second builds the payload and runs only when the
 * fingerprint says something actually changed. Since the payload covers
 * structure and naming — not transforms — an animating scene comes out
 * `unchanged`, which is the common case and now costs a single allocation-free
 * traversal.
 *
 * The alternative, building the payload first and throwing it away when it
 * turns out to match, would allocate an object per node several times a second
 * to answer "nothing happened".
 */

function flagsOf(adapter: PixiAdapter, locks: Locks, node: Node): number {
  return (
    (adapter.visible(node) ? NODE_VISIBLE : 0) |
    (locks.isLocked(node) ? NODE_LOCKED : 0) |
    // Read on the same visit as everything else, and folded into the same
    // fingerprint: a filter appearing moves the revision without a word of code
    // about it anywhere else.
    (adapter.hasFilter(node) ? NODE_FILTERED : 0) |
    (adapter.hasMask(node) ? NODE_MASKED : 0)
  );
}

/**
 * Walk one: fingerprint only.
 *
 * Ids are minted here, which is what makes the fingerprint notice a swapped
 * application: a fresh stage gets fresh ids and therefore a different hash,
 * even if it is built exactly like the one it replaced.
 */
function hashSubtree(
  adapter: PixiAdapter,
  registry: Registry,
  locks: Locks,
  node: Node,
  parent: NodeId,
  hash: number,
  counted: { nodes: number },
): number {
  const id = registry.idOf(node);

  let next = hashNumber(hash, id);
  next = hashNumber(next, parent);
  next = hashString(next, adapter.label(node));
  next = hashString(next, adapter.typeOf(node));
  next = hashNumber(next, flagsOf(adapter, locks, node));
  counted.nodes += 1;

  for (const child of adapter.children(node)) {
    next = hashSubtree(adapter, registry, locks, child, id, next, counted);
  }

  return next;
}

/** Walk two: the payload, in the same depth-first order. */
function collectSubtree(
  adapter: PixiAdapter,
  registry: Registry,
  locks: Locks,
  node: Node,
  parent: NodeId,
  into: SceneNode[],
): void {
  const id = registry.idOf(node);

  into.push({
    id,
    parent,
    name: adapter.label(node),
    type: adapter.typeOf(node),
    flags: flagsOf(adapter, locks, node),
  });

  for (const child of adapter.children(node)) {
    collectSubtree(adapter, registry, locks, child, id, into);
  }
}

/**
 * How lopsided the registry has to get before it is worth walking. Dead entries
 * are a few bytes each, so sweeping eagerly would cost more than it reclaims.
 */
const SWEEP_RATIO = 2;

/**
 * @param knownRev the revision the panel already holds, if any.
 * @returns the tree, or `unchanged` when it matches `knownRev`.
 */
export function readTree(
  adapter: PixiAdapter,
  registry: Registry,
  locks: Locks,
  knownRev?: number,
): Revisioned<SceneTreePayload> {
  const stage = adapter.stage();
  if (stage === null) return { rev: FNV_OFFSET, data: { nodes: [] } };

  const counted = { nodes: 0 };
  const rev = hashSubtree(adapter, registry, locks, stage, 0, FNV_OFFSET, counted);

  if (registry.size > counted.nodes * SWEEP_RATIO) registry.sweep();

  if (rev === knownRev) return { rev, unchanged: true };

  const nodes: SceneNode[] = [];
  collectSubtree(adapter, registry, locks, stage, 0, nodes);

  return { rev, data: { nodes } };
}
