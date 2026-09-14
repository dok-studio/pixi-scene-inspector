import { describe, expect, it } from 'vitest';

import { createAdapter } from '../adapters/index.js';
import type { PixiAdapter } from '../adapters/types.js';
import { applyMutation, createLocks } from './mutate.js';
import type { Locks } from './mutate.js';
import { createRegistry } from './registry.js';
import type { Registry } from './registry.js';

/**
 * Changes to the shape of the scene: rename, move, delete, lock.
 *
 * Every one of them shares the same guards, which is why they are one command.
 * The guards are the interesting part — a mutation arrives from another process
 * naming a node by id, and the scene it names may have moved on since.
 */

type Fake = Record<string, unknown>;

/**
 * The fakes carry `removeChild`/`addChildAt` rather than a bare array, because
 * that is what the adapter is required to call. Splicing `children` directly
 * would work here and quietly break on a real scene: Pixi keeps render-group
 * bookkeeping behind those methods, and v8 leans on it heavily.
 */
function container(label: string, children: Fake[] = []): Fake {
  const node: Fake = {
    includeInBuild: true,
    measurable: true,
    _didLocalTransformChangeId: 0,
    label,
    children,
    visible: true,
    destroyed: false,
    removeChild(child: Fake) {
      const list = node['children'] as Fake[];
      const at = list.indexOf(child);
      if (at >= 0) list.splice(at, 1);
      child['parent'] = undefined;
    },
    addChildAt(child: Fake, index: number) {
      const list = node['children'] as Fake[];

      // The bounds check is the real one's, not decoration: PixiJS throws on an
      // index past the end, on every version. A fake that spliced regardless
      // would accept an index the scene refuses, and a move that loses a whole
      // subtree would pass here.
      if (index < 0 || index > list.length) {
        throw new Error(
          `addChildAt: The index ${String(index)} supplied is out of bounds ${String(list.length)}`,
        );
      }

      list.splice(index, 0, child);
      child['parent'] = node;
    },
  };

  for (const child of children) child['parent'] = node;
  return node;
}

interface World {
  adapter: PixiAdapter;
  registry: Registry;
  locks: Locks;
  stage: Fake;
  world: Fake;
  hero: Fake;
  hud: Fake;
  id: (node: Fake) => number;
}

function build(): World {
  const hero = container('hero');
  const world = container('world', [hero]);
  const hud = container('hud');
  const stage = container('', [world, hud]);

  const adapter = createAdapter({ stage, renderer: { renderPipes: {} } });
  if (adapter === null) throw new Error('expected an adapter');

  const registry = createRegistry();
  const locks = createLocks();

  return { adapter, registry, locks, stage, world, hero, hud, id: (node) => registry.idOf(node) };
}

describe('applyMutation', () => {
  describe('rename', () => {
    it('writes the name through the adapter, so the version decides the field', () => {
      const w = build();

      expect(
        applyMutation(w.adapter, w.registry, w.locks, {
          kind: 'rename',
          id: w.id(w.hero),
          name: 'villain',
        }),
      ).toBe(true);
      expect(w.hero['label']).toBe('villain');
    });

    it('refuses to rename a locked node', () => {
      const w = build();
      applyMutation(w.adapter, w.registry, w.locks, {
        kind: 'setLocked',
        id: w.id(w.hero),
        locked: true,
      });

      expect(
        applyMutation(w.adapter, w.registry, w.locks, {
          kind: 'rename',
          id: w.id(w.hero),
          name: 'villain',
        }),
      ).toBe(false);
      expect(w.hero['label']).toBe('hero');
    });
  });

  describe('delete', () => {
    it('takes the node out of its parent', () => {
      const w = build();

      applyMutation(w.adapter, w.registry, w.locks, { kind: 'delete', id: w.id(w.hero) });

      expect(w.world['children']).toEqual([]);
    });

    /** There is nothing to remove it from, and the panel would be left blank. */
    it('refuses to delete the stage', () => {
      const w = build();

      expect(
        applyMutation(w.adapter, w.registry, w.locks, { kind: 'delete', id: w.id(w.stage) }),
      ).toBe(false);
    });

    it('refuses to delete a locked node', () => {
      const w = build();
      applyMutation(w.adapter, w.registry, w.locks, {
        kind: 'setLocked',
        id: w.id(w.hero),
        locked: true,
      });

      applyMutation(w.adapter, w.registry, w.locks, { kind: 'delete', id: w.id(w.hero) });

      expect(w.world['children']).toEqual([w.hero]);
    });
  });

  describe('move', () => {
    it('reparents a node at the index it was dropped', () => {
      const w = build();

      applyMutation(w.adapter, w.registry, w.locks, {
        kind: 'move',
        id: w.id(w.hero),
        parent: w.id(w.hud),
        index: 0,
      });

      expect(w.world['children']).toEqual([]);
      expect(w.hud['children']).toEqual([w.hero]);
    });

    /**
     * The index the panel sends counts slots with the dragged node still in
     * place — `react-arborist` says so itself, and ships `adjustMoveIndex` for
     * handlers that remove before inserting. Moving down is where that bites:
     * the slot past the last sibling does not exist any more once the node has
     * left its own, and PixiJS answers an out-of-bounds index by throwing,
     * after the node has already been detached.
     */
    it('moves a node down among its siblings without losing it', () => {
      const w = build();

      expect(
        applyMutation(w.adapter, w.registry, w.locks, {
          kind: 'move',
          id: w.id(w.world),
          parent: w.id(w.stage),
          index: 2,
        }),
      ).toBe(true);

      expect(w.stage['children']).toEqual([w.hud, w.world]);
    });

    it('reorders inside the same parent', () => {
      const w = build();

      applyMutation(w.adapter, w.registry, w.locks, {
        kind: 'move',
        id: w.id(w.hud),
        parent: w.id(w.stage),
        index: 0,
      });

      expect(w.stage['children']).toEqual([w.hud, w.world]);
    });

    /**
     * Locking a layer says "put everything in it out of the way". A node
     * dropped into one would sit inside it while reporting itself unlocked,
     * and could then be renamed and deleted from in there.
     */
    it('refuses to move a node into a locked container', () => {
      const w = build();

      applyMutation(w.adapter, w.registry, w.locks, {
        kind: 'setLocked',
        id: w.id(w.hud),
        locked: true,
      });

      expect(
        applyMutation(w.adapter, w.registry, w.locks, {
          kind: 'move',
          id: w.id(w.hero),
          parent: w.id(w.hud),
          index: 0,
        }),
      ).toBe(false);

      expect(w.hud['children']).toEqual([]);
      expect(w.world['children']).toEqual([w.hero]);
    });

    /**
     * Dropping a node inside its own subtree would detach that whole branch
     * from the scene, and the tree would simply lose it.
     */
    it('refuses to move a node into its own descendant', () => {
      const w = build();

      expect(
        applyMutation(w.adapter, w.registry, w.locks, {
          kind: 'move',
          id: w.id(w.world),
          parent: w.id(w.hero),
          index: 0,
        }),
      ).toBe(false);
      expect(w.stage['children']).toEqual([w.world, w.hud]);
    });

    it('refuses to move a node into itself', () => {
      const w = build();

      expect(
        applyMutation(w.adapter, w.registry, w.locks, {
          kind: 'move',
          id: w.id(w.world),
          parent: w.id(w.world),
          index: 0,
        }),
      ).toBe(false);
    });

    it('refuses to move the stage', () => {
      const w = build();

      expect(
        applyMutation(w.adapter, w.registry, w.locks, {
          kind: 'move',
          id: w.id(w.stage),
          parent: w.id(w.world),
          index: 0,
        }),
      ).toBe(false);
    });
  });

  describe('locking', () => {
    it('reports a node as locked once it is', () => {
      const w = build();

      applyMutation(w.adapter, w.registry, w.locks, {
        kind: 'setLocked',
        id: w.id(w.hero),
        locked: true,
      });

      expect(w.locks.isLocked(w.hero)).toBe(true);
    });

    it('unlocks again', () => {
      const w = build();
      const id = w.id(w.hero);
      applyMutation(w.adapter, w.registry, w.locks, { kind: 'setLocked', id, locked: true });

      applyMutation(w.adapter, w.registry, w.locks, { kind: 'setLocked', id, locked: false });

      expect(w.locks.isLocked(w.hero)).toBe(false);
    });

    /** Locking is what makes a locked node lockable again — it must not self-block. */
    it('can always be changed, even on a locked node', () => {
      const w = build();
      const id = w.id(w.hero);
      applyMutation(w.adapter, w.registry, w.locks, { kind: 'setLocked', id, locked: true });

      expect(
        applyMutation(w.adapter, w.registry, w.locks, { kind: 'setLocked', id, locked: false }),
      ).toBe(true);
    });

    it('locks the whole subtree, as the row button implies', () => {
      const w = build();

      applyMutation(w.adapter, w.registry, w.locks, {
        kind: 'setLocked',
        id: w.id(w.world),
        locked: true,
      });

      expect(w.locks.isLocked(w.hero)).toBe(true);
    });
  });

  it('does nothing for an id that is not in the scene', () => {
    const w = build();

    expect(
      applyMutation(w.adapter, w.registry, w.locks, { kind: 'rename', id: 9999, name: 'x' }),
    ).toBe(false);
  });
});
