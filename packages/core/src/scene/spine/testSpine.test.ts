import type { Json } from '@scene-inspector/protocol';
import { describe, expect, it, vi } from 'vitest';

import type { Node, PixiAdapter } from '../../adapters/types.js';
import { createTest } from './testSpine.js';

/**
 * A second Spine, beside the one the game made.
 *
 * What these hold in place is the order and the placement. A test that landed
 * at the origin, or in front of the wrong node, or without an animation
 * running, would look like a broken skeleton rather than a working one — and
 * the node has to be in the scene **before** anything asks for its id, because
 * the registry holds nodes weakly.
 */

type Fake = Record<string, unknown>;

const skeletonData = (animations: string[]): Fake => ({
  animations: animations.map((name) => ({ name })),
  skins: [{ name: 'default' }],
});

/**
 * A `Spine`, of a class whose constructor takes a `SkeletonData` — which is
 * what both lines' constructors do.
 */
function spineNode(animations = ['idle', 'walk']): Fake {
  class SpineLike {
    skeleton: Fake;
    state: Fake = {
      tracks: [],
      setAnimation: vi.fn((index: number, name: string, loop: boolean) => {
        const entry = { animation: { name, duration: 1 }, loop, trackTime: 0 };
        (this.state['tracks'] as unknown[])[index] = entry;
        return entry;
      }),
      apply: () => {},
    };

    constructor(data: Fake) {
      this.skeleton = { data, updateWorldTransform: () => {} };
    }
  }

  return new SpineLike(skeletonData(animations)) as unknown as Fake;
}

/** Enough of an adapter to place a node and read a placement off one. */
function fakeAdapter(
  parent: Fake,
  props: Record<string, Json> = {},
  sources: Array<{ name: string; data: unknown }> = [],
) {
  const written: Array<{ node: Node; path: string; value: Json }> = [];

  const adapter = {
    parentOf: (node: Node) => ((parent['children'] as Node[]).includes(node) ? parent : null),
    children: () => [...(parent['children'] as Node[])],
    addChildAt: vi.fn((_parent: Node, child: Node, index: number) => {
      (parent['children'] as Node[]).splice(index, 0, child);
    }),
    label: (node: Node) => ((node as Fake)['label'] as string | undefined) ?? '',
    setLabel: (node: Node, value: string) => {
      (node as Fake)['label'] = value;
    },
    spineStore: () => ({ skeletons: sources, atlases: [] }),
    getProp: (_node: Node, path: string) => props[path],
    setProp: (node: Node, path: string, value: Json) => {
      written.push({ node, path, value });
    },
  } as unknown as PixiAdapter;

  return { adapter, written };
}

describe('createTest', () => {
  it('puts the new Spine straight after the original, in the same parent', () => {
    const original = spineNode();
    original['label'] = 'circle';
    const other = { label: 'after' } as Fake;
    const parent: Fake = { children: [{ label: 'before' }, original, other] };
    const { adapter } = fakeAdapter(parent);

    const made = createTest(adapter, original, null);

    expect((parent['children'] as Node[]).indexOf(made as Node)).toBe(2);
  });

  /**
   * A Spine draws where its node is, so a test that did not take the original's
   * placement would be a test of nothing — sitting at the origin, off screen.
   */
  it('stands where the original stands', () => {
    const original = spineNode();
    const parent: Fake = { children: [original] };
    const { adapter, written } = fakeAdapter(parent, {
      position: { x: 12, y: -4 },
      scale: { x: 2, y: 2 },
      rotation: 0.5,
      alpha: 0.8,
    });

    createTest(adapter, original, null);

    expect(written.map((one) => one.path)).toEqual(['position', 'scale', 'rotation', 'alpha']);
    expect(written[0]?.value).toEqual({ x: 12, y: -4 });
  });

  it('leaves a placement the original does not report alone', () => {
    const original = spineNode();
    const parent: Fake = { children: [original] };
    const { adapter, written } = fakeAdapter(parent, { alpha: 1 });

    createTest(adapter, original, null);

    expect(written.map((one) => one.path)).toEqual(['alpha']);
  });

  /** The tree has to say plainly which node is the inspector's. */
  it('labels it as a test, and numbers the next one', () => {
    const original = spineNode();
    original['label'] = 'circle';
    const parent: Fake = { children: [original] };
    const { adapter } = fakeAdapter(parent);

    const first = createTest(adapter, original, null);
    const second = createTest(adapter, original, null);

    expect((first as Fake)['label']).toBe('circle (test 1)');
    expect((second as Fake)['label']).toBe('circle (test 2)');
  });

  /**
   * A skeleton standing in its setup pose says nothing about whether it is the
   * one you wanted. The first animation is the one guess available.
   */
  it('starts the first animation', () => {
    const original = spineNode(['idle', 'walk']);
    const parent: Fake = { children: [original] };
    const { adapter } = fakeAdapter(parent);

    const made = createTest(adapter, original, null) as Fake;

    expect((made['state'] as Fake)['setAnimation']).toHaveBeenCalledWith(0, 'idle', true);
  });

  it('is content with a skeleton that has no animations at all', () => {
    const original = spineNode([]);
    const parent: Fake = { children: [original] };
    const { adapter } = fakeAdapter(parent);

    const made = createTest(adapter, original, null) as Fake;

    expect(made).not.toBeNull();
    expect((made['state'] as Fake)['setAnimation']).not.toHaveBeenCalled();
  });

  /**
   * The route that carries a game whose asset store is readable: the skeleton
   * is parsed in there already, so it needs no factory — which matters most on
   * v6/v7, where there is no factory to need.
   */
  it('builds another skeleton the asset store is already holding', () => {
    const original = spineNode();
    const parent: Fake = { children: [original] };
    const { adapter } = fakeAdapter(parent, {}, [
      { name: 'boss', data: skeletonData(['roar']) },
    ]);

    const made = createTest(adapter, original, 'boss') as Fake;

    expect(made).not.toBeNull();
    expect((made['state'] as Fake)['setAnimation']).toHaveBeenCalledWith(0, 'roar', true);
  });

  /**
   * On v6/v7 every skeleton the store does not hold is out of reach: `Spine`
   * takes a `SkeletonData` and offers nothing that makes one. Refusing leaves
   * the scene as it was rather than adding half a node.
   */
  it('refuses a skeleton this runtime cannot build, and adds nothing', () => {
    const original = spineNode();
    const parent: Fake = { children: [original] };
    const { adapter } = fakeAdapter(parent);

    expect(createTest(adapter, original, 'boss')).toBeNull();
    expect(parent['children']).toHaveLength(1);
  });

  it('refuses a node that is not a skeleton', () => {
    const plain = { children: [] } as Fake;
    const parent: Fake = { children: [plain] };
    const { adapter } = fakeAdapter(parent);

    expect(createTest(adapter, plain, null)).toBeNull();
  });

  it('refuses a node with no parent to be put beside', () => {
    const original = spineNode();
    const { adapter } = fakeAdapter({ children: [] });

    expect(createTest(adapter, original, null)).toBeNull();
  });
});
