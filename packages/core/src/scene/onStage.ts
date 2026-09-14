import type { Node, PixiAdapter } from '../adapters/types.js';

/**
 * Whether the node is still part of the scene the application draws.
 *
 * The registry answers "is this id's node still in memory", which is not the
 * same question: a game that takes a node out of the scene usually keeps the
 * object — pooled for the next wave, or left hanging off a container that was
 * itself removed — and a live node answers every probe it ever did, out of the
 * transform it had when it was last drawn. Anything placed from that draws a
 * node that is no longer on screen.
 *
 * So the chain is walked to the stage rather than the node asked about itself.
 * `parentOf` returning null is not enough on its own: a node whose *ancestor*
 * was removed still has the parent it always had, and the whole subtree is off
 * the scene with every link in it intact.
 */
export function onStage(adapter: PixiAdapter, node: Node): boolean {
  const stage = adapter.stage();
  if (stage === null) return false;

  let current: Node | null = node;

  while (current !== null) {
    if (current === stage) return true;

    current = adapter.parentOf(current);
  }

  return false;
}
