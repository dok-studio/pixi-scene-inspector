import type { SceneTreePayload } from '@scene-inspector/protocol';
import { NODE_FILTERED, NODE_MASKED, NODE_VISIBLE } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { createAdapter } from '../adapters/index.js';
import type { PixiAdapter } from '../adapters/types.js';
import { createLocks } from './mutate.js';
import { createRegistry } from './registry.js';
import { readTree } from './tree.js';

/**
 * The tree walk, and the revision that decides whether it is worth sending.
 *
 * The revision is the whole reason this milestone is cheap: a scene that is
 * animating but not restructuring — the normal case — answers `unchanged` and
 * serializes nothing at all. In the previous project the same situation
 * serialized the entire graph twice per poll, once over the bridge and once
 * more inside the panel's deep comparison.
 */

type Fake = Record<string, unknown>;

function node(label: string, type: Fake, children: Fake[] = []): Fake {
  return { label, children, visible: true, destroyed: false, ...type };
}

const CONTAINER: Fake = {
  includeInBuild: true,
  measurable: true,
  _didLocalTransformChangeId: 0,
};
const SPRITE: Fake = { renderPipeId: 'sprite' };

/** stage → world → [hero, prop]; plus hud on the stage. */
function scene() {
  const hero = node('hero', SPRITE);
  const prop = node('prop', SPRITE);
  const world = node('world', CONTAINER, [hero, prop]);
  const hud = node('hud', CONTAINER);
  const stage = node('', CONTAINER, [world, hud]);

  return { stage, world, hero, prop, hud };
}

function adapterFor(stage: Fake): PixiAdapter {
  const adapter = createAdapter({ stage, renderer: { renderPipes: {} } });
  if (adapter === null) throw new Error('expected a v8 adapter');
  return adapter;
}

function payloadOf(result: { data: SceneTreePayload } | { unchanged: true }): SceneTreePayload {
  if ('unchanged' in result) throw new Error('expected data, got unchanged');
  return result.data;
}

describe('readTree', () => {
  it('returns the whole graph flat, in depth-first order', () => {
    const world = scene();
    const nodes = payloadOf(readTree(adapterFor(world.stage), createRegistry(), createLocks())).nodes;

    expect(nodes.map((n) => n.name)).toEqual(['', 'world', 'hero', 'prop', 'hud']);
  });

  /**
   * The flat array carries the shape only because a parent always precedes its
   * children — that is what lets the panel compute depth in one pass.
   */
  it('places every node after its parent', () => {
    const world = scene();
    const nodes = payloadOf(readTree(adapterFor(world.stage), createRegistry(), createLocks())).nodes;
    const seen = new Set<number>([0]);

    for (const entry of nodes) {
      expect(seen.has(entry.parent)).toBe(true);
      seen.add(entry.id);
    }
  });

  it('reports the stage as having no parent', () => {
    const world = scene();
    const [stage] = payloadOf(readTree(adapterFor(world.stage), createRegistry(), createLocks())).nodes;

    expect(stage?.parent).toBe(0);
  });

  it('links children to their parent', () => {
    const world = scene();
    const nodes = payloadOf(readTree(adapterFor(world.stage), createRegistry(), createLocks())).nodes;
    const byName = new Map(nodes.map((n) => [n.name, n]));

    expect(byName.get('hero')?.parent).toBe(byName.get('world')?.id);
  });

  it('reports the node type', () => {
    const world = scene();
    const nodes = payloadOf(readTree(adapterFor(world.stage), createRegistry(), createLocks())).nodes;

    expect(nodes.map((n) => n.type)).toEqual(['Container', 'Container', 'Sprite', 'Sprite', 'Container']);
  });

  it('flags a hidden node', () => {
    const world = scene();
    world.hero['visible'] = false;
    const nodes = payloadOf(readTree(adapterFor(world.stage), createRegistry(), createLocks())).nodes;
    const byName = new Map(nodes.map((n) => [n.name, n]));

    expect((byName.get('hero')?.flags ?? 0) & NODE_VISIBLE).toBe(0);
    expect((byName.get('prop')?.flags ?? 0) & NODE_VISIBLE).toBe(NODE_VISIBLE);
  });

  it('flags a filtered and a masked node', () => {
    const world = scene();
    world.hero['filters'] = [{ blur: 4 }];
    world.prop['mask'] = world.hud;

    const nodes = payloadOf(readTree(adapterFor(world.stage), createRegistry(), createLocks())).nodes;
    const byName = new Map(nodes.map((n) => [n.name, n]));

    expect((byName.get('hero')?.flags ?? 0) & NODE_FILTERED).toBe(NODE_FILTERED);
    expect((byName.get('prop')?.flags ?? 0) & NODE_MASKED).toBe(NODE_MASKED);
    // And neither is claimed of the node that carries the other.
    expect((byName.get('hero')?.flags ?? 0) & NODE_MASKED).toBe(0);
    expect((byName.get('prop')?.flags ?? 0) & NODE_FILTERED).toBe(0);
  });

  it('reads an empty filter list as no filter', () => {
    const world = scene();
    world.hero['filters'] = [];

    const nodes = payloadOf(readTree(adapterFor(world.stage), createRegistry(), createLocks())).nodes;
    const hero = nodes.find((n) => n.name === 'hero');

    expect((hero?.flags ?? 0) & NODE_FILTERED).toBe(0);
  });

  /**
   * The whole reason these are flags rather than a command: they ride the walk
   * that was happening anyway, and the fingerprint folds them in, so a filter
   * appearing reaches the panel by the road everything else already uses.
   */
  it('moves the revision when a filter appears', () => {
    const world = scene();
    const registry = createRegistry();
    const locks = createLocks();

    const before = readTree(adapterFor(world.stage), registry, locks).rev;
    world.hero['filters'] = [{ blur: 4 }];
    const after = readTree(adapterFor(world.stage), registry, locks).rev;

    expect(after).not.toBe(before);
  });

  it('reports an empty tree when there is no stage', () => {
    const adapter = adapterFor({ destroyed: true, children: [] });

    expect(payloadOf(readTree(adapter, createRegistry(), createLocks())).nodes).toEqual([]);
  });

  it('keeps ids stable across reads', () => {
    const world = scene();
    const adapter = adapterFor(world.stage);
    const registry = createRegistry();

    const first = payloadOf(readTree(adapter, registry, createLocks())).nodes;
    const second = payloadOf(readTree(adapter, registry, createLocks())).nodes;

    expect(second.map((n) => n.id)).toEqual(first.map((n) => n.id));
  });

  describe('revisions', () => {
    it('answers unchanged when nothing moved', () => {
      const world = scene();
      const adapter = adapterFor(world.stage);
      const registry = createRegistry();

      const first = readTree(adapter, registry, createLocks());
      const second = readTree(adapter, registry, createLocks(), first.rev);

      expect(second).toEqual({ rev: first.rev, unchanged: true });
    });

    it('sends data when the panel holds no revision at all', () => {
      const world = scene();

      expect(readTree(adapterFor(world.stage), createRegistry(), createLocks())).toHaveProperty('data');
    });

    it('sends data again when a node is added', () => {
      const world = scene();
      const adapter = adapterFor(world.stage);
      const registry = createRegistry();
      const first = readTree(adapter, registry, createLocks());

      (world.world['children'] as Fake[]).push(node('newcomer', SPRITE));

      const second = readTree(adapter, registry, createLocks(), first.rev);
      expect(second).toHaveProperty('data');
      expect(second.rev).not.toBe(first.rev);
    });

    it('sends data again when a node is removed', () => {
      const world = scene();
      const adapter = adapterFor(world.stage);
      const registry = createRegistry();
      const first = readTree(adapter, registry, createLocks());

      (world.world['children'] as Fake[]).pop();

      expect(readTree(adapter, registry, createLocks(), first.rev)).toHaveProperty('data');
    });

    it('sends data again when a node is renamed', () => {
      const world = scene();
      const adapter = adapterFor(world.stage);
      const registry = createRegistry();
      const first = readTree(adapter, registry, createLocks());

      world.hero['label'] = 'villain';

      expect(readTree(adapter, registry, createLocks(), first.rev)).toHaveProperty('data');
    });

    it('sends data again when a node is hidden', () => {
      const world = scene();
      const adapter = adapterFor(world.stage);
      const registry = createRegistry();
      const first = readTree(adapter, registry, createLocks());

      world.hero['visible'] = false;

      expect(readTree(adapter, registry, createLocks(), first.rev)).toHaveProperty('data');
    });

    /**
     * Reordering keeps every node, every name and every parent — only the
     * sequence changes. A fingerprint that folded the nodes commutatively
     * would call this unchanged and leave the panel showing the old order.
     */
    it('sends data again when children are merely reordered', () => {
      const world = scene();
      const adapter = adapterFor(world.stage);
      const registry = createRegistry();
      const first = readTree(adapter, registry, createLocks());

      (world.world['children'] as Fake[]).reverse();

      expect(readTree(adapter, registry, createLocks(), first.rev)).toHaveProperty('data');
    });

    /**
     * The common case this whole mechanism exists for: an animating scene
     * moves its nodes every frame without restructuring.
     */
    it('stays unchanged while the scene only animates', () => {
      const world = scene();
      const adapter = adapterFor(world.stage);
      const registry = createRegistry();
      const first = readTree(adapter, registry, createLocks());

      world.hero['x'] = 42;
      world.hero['rotation'] = 1.5;

      expect(readTree(adapter, registry, createLocks(), first.rev)).toEqual({ rev: first.rev, unchanged: true });
    });

    it('changes revision when the application is swapped for another', () => {
      const registry = createRegistry();
      const first = readTree(adapterFor(scene().stage), registry, createLocks());
      const second = readTree(adapterFor(scene().stage), registry, createLocks(), first.rev);

      expect(second).toHaveProperty('data');
    });
  });

  /**
   * The registry hands out an id per node ever seen, and holds it weakly. On a
   * page that churns nodes the dead entries would otherwise pile up for the
   * lifetime of the session.
   */
  it('sweeps the registry once it is mostly dead entries', () => {
    // Collection cannot be forced, so the weak reference is injected — see
    // registry.test.ts for the same seam.
    const release: Array<() => void> = [];
    const registry = createRegistry((node) => {
      let held: object | undefined = node;
      release.push(() => {
        held = undefined;
      });
      return { deref: () => held };
    });

    for (let i = 0; i < 100; i += 1) registry.idOf({});
    release.forEach((releaseOne) => releaseOne());

    const world = scene();
    readTree(adapterFor(world.stage), registry, createLocks());

    expect(registry.size).toBe(5);
  });

  it('leaves the registry alone when almost everything in it is alive', () => {
    const world = scene();
    const registry = createRegistry();

    readTree(adapterFor(world.stage), registry, createLocks());
    readTree(adapterFor(world.stage), registry, createLocks());

    expect(registry.size).toBe(5);
  });
});
