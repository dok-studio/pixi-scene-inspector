import type { NodeId } from '@scene-inspector/protocol';

import type { Node } from '../adapters/types.js';

/**
 * Node identity: id ↔ node, for the length of a session.
 *
 * The two directions are stored differently, and that asymmetry is the whole
 * design (docs/architecture.md §3.8):
 *
 *  - node → id in a `WeakMap`, so a node the page drops takes its entry with it;
 *  - id → node through a **weak** reference, so the panel holding an id in its
 *    selection does not keep a destroyed sprite and its textures alive.
 *
 * In the previous project this was a `Map<string, Container>` of **strong**
 * references, rebuilt in full on every poll — an inspector left open on a page
 * that churns nodes retained every one of them. Ids there were also
 * `12_k3j9x`, and the overlay reached into the map through a private field by
 * name. Here `resolve` is the public method, and there is no second path in.
 */

export interface NodeRef {
  deref(): Node | undefined;
}

/**
 * How a weak reference is made. A parameter rather than a hard-wired `WeakRef`
 * so that "what the registry does once a node is collected" can be tested —
 * collection cannot be triggered on demand.
 */
export type RefFactory = (node: Node) => NodeRef;

export interface Registry {
  /** The node's id, minting one on first sight. Stable while the node lives. */
  idOf(node: Node): NodeId;
  /** @returns null for an unknown id, or one whose node has been collected. */
  resolve(id: NodeId): Node | null;
  /** Drops entries whose node is gone. See `size` for when this is worth doing. */
  sweep(): void;
  /** Entries held, live and dead alike. */
  readonly size: number;
}

const defaultRefFactory: RefFactory = (node) => new WeakRef(node);

export function createRegistry(ref: RefFactory = defaultRefFactory): Registry {
  const ids = new WeakMap<Node, NodeId>();
  const nodes = new Map<NodeId, NodeRef>();

  // Starts at 1: id 0 is reserved for "no node" and is what the stage reports
  // as its parent.
  let nextId: NodeId = 1;

  return {
    idOf(node) {
      const existing = ids.get(node);
      if (existing !== undefined) return existing;

      const id = nextId++;
      ids.set(node, id);
      nodes.set(id, ref(node));

      return id;
    },

    resolve(id) {
      const node = nodes.get(id)?.deref();
      if (node !== undefined) return node;

      // Collected: drop the entry on the way out rather than waiting for a
      // sweep. A resolve that fails is the cheapest moment to learn this.
      nodes.delete(id);
      return null;
    },

    sweep() {
      for (const [id, held] of nodes) {
        if (held.deref() === undefined) nodes.delete(id);
      }
    },

    get size() {
      return nodes.size;
    },
  };
}
