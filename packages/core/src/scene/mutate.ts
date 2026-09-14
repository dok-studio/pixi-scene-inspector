import type { SceneMutation } from '@scene-inspector/protocol';

import type { Node, PixiAdapter } from '../adapters/types.js';
import type { Registry } from './registry.js';

/**
 * Changes to the shape of the scene, as opposed to values on one node.
 *
 * They are one function because they share every guard. A mutation arrives from
 * another process naming a node by id, and by the time it lands the scene may
 * have moved on: the node can be gone, it can be the stage, it can be locked,
 * or the drop target can be inside the very subtree being dragged.
 *
 * Every path returns a boolean rather than throwing. A refused mutation is a
 * normal outcome — the panel finds out the same way it finds out everything
 * else, by the next poll showing the tree unchanged.
 */

/**
 * Locked nodes, held **weakly and outside the scene**.
 *
 * The previous project wrote a `__devtoolLocked` property onto the container
 * itself, which put inspector state into the application's objects and left it
 * there after the inspector was closed. A `WeakSet` keeps the same behaviour
 * without touching the scene, and forgets a node when the page does.
 */
export interface Locks {
  isLocked(node: Node): boolean;
  set(node: Node, locked: boolean): void;
}

export function createLocks(): Locks {
  const locked = new WeakSet<Node>();

  return {
    isLocked: (node) => locked.has(node),
    set: (node, value) => {
      if (value) locked.add(node);
      else locked.delete(node);
    },
  };
}

function forEachInSubtree(adapter: PixiAdapter, root: Node, visit: (node: Node) => void): void {
  visit(root);
  for (const child of adapter.children(root)) forEachInSubtree(adapter, child, visit);
}

function isInSubtree(adapter: PixiAdapter, root: Node, candidate: Node): boolean {
  if (root === candidate) return true;
  return adapter.children(root).some((child) => isInSubtree(adapter, child, candidate));
}

/** @returns false when the mutation was refused; the scene is then untouched. */
export function applyMutation(
  adapter: PixiAdapter,
  registry: Registry,
  locks: Locks,
  mutation: SceneMutation,
): boolean {
  const node = registry.resolve(mutation.id);
  if (node === null) return false;

  // Locking is checked before the lock guard, deliberately: otherwise a locked
  // node could never be unlocked again.
  if (mutation.kind === 'setLocked') {
    // The whole subtree, which is what the row's lock button says it does —
    // locking a layer is meant to put everything in it out of the way.
    forEachInSubtree(adapter, node, (target) => {
      locks.set(target, mutation.locked);
    });
    return true;
  }

  if (locks.isLocked(node)) return false;

  const stage = adapter.stage();

  switch (mutation.kind) {
    case 'rename':
      // Through the adapter: this is `label` on v8 and `name` before it.
      adapter.setLabel(node, mutation.name);
      return true;

    case 'delete': {
      // The stage has nothing to be removed from, and losing it would leave the
      // panel with nothing to show and no way back.
      if (node === stage) return false;

      const parent = adapter.parentOf(node);
      if (parent === null) return false;

      adapter.removeChild(parent, node);
      return true;
    }

    case 'move': {
      if (node === stage) return false;

      const parent = registry.resolve(mutation.parent);
      if (parent === null) return false;

      // The destination is guarded as well as the node being moved. Locking a
      // layer says "put everything in it out of the way", and a node dropped
      // into one would sit inside it while reporting itself unlocked — free to
      // be renamed and deleted from in there.
      if (locks.isLocked(parent)) return false;

      // Dropping a node inside its own subtree would detach that whole branch
      // from the scene — it would still exist, and nothing would draw it.
      if (isInSubtree(adapter, node, parent)) return false;

      const current = adapter.parentOf(node);

      // The index counts slots with the node **still in place** — that is what
      // the tree the panel draws was showing when the drop happened, and
      // `react-arborist` documents it as such (it ships `adjustMoveIndex` for
      // exactly this). Removing first empties one of those slots, so every
      // position after it shifts one to the left. Without the correction a
      // move down lands one place too far, and a move to the very end asks for
      // a slot that no longer exists — which PixiJS answers by throwing, after
      // the node has already been detached and with nothing to put it back.
      const at = adapter.children(parent).indexOf(node);
      const shifted = at >= 0 && at < mutation.index ? mutation.index - 1 : mutation.index;

      if (current !== null) adapter.removeChild(current, node);

      // Clamped rather than trusted: the index arrives from another process,
      // and the scene may have lost children since the drag began.
      const room = adapter.children(parent).length;
      adapter.addChildAt(parent, node, Math.max(0, Math.min(shifted, room)));

      return true;
    }
  }
}
