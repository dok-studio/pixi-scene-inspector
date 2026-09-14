import { describe, expect, it, vi } from 'vitest';

import { probeSkeleton } from './probe.js';

/**
 * What a skeleton can do, when the node is not carrying it.
 *
 * Three routes, and the order between them is the whole design: each covers
 * what the one before it cannot. The store's copy needs no reading at all; the
 * runtime's own builder reads a binary `.skel`, which is the point of it; and
 * plain JSON needs no runtime, which is the point of that.
 *
 * Every case uses a name of its own, because the answers are remembered: asking
 * twice must not build twice, and a test that reused a name would be reading the
 * one before it.
 */

type Fake = Record<string, unknown>;

/** A parsed `SkeletonData`: its lists are lists. */
const parsed = (animations: string[], skins: string[] = ['default']): Fake => ({
  animations: animations.map((name) => ({ name })),
  skins: skins.map((name) => ({ name })),
});

/**
 * A node of a class with a static `from`, as the v8 `Spine` is.
 *
 * The class is reached through the node's own `constructor`, which is what lets
 * the probe use a runtime it cannot import — and a bundled game's runtime is
 * exactly that.
 */
function nodeWithBuilder(build?: (options: { skeleton: string; atlas: string }) => unknown): Fake {
  class SpineLike {
    static from = build === undefined ? undefined : vi.fn(build);

    skeleton = { data: parsed(['walk']) };
    state = { tracks: [] };
  }

  return new SpineLike() as unknown as Fake;
}

const builderOf = (node: Fake): ReturnType<typeof vi.fn> =>
  (node.constructor as unknown as { from: ReturnType<typeof vi.fn> }).from;

/** A page that fetched an export and its atlas, as the browser would record it. */
const pageWith = (name: string, ext = 'skel'): typeof globalThis =>
  ({
    performance: {
      getEntriesByType: () => [
        { name: `https://game.example/a/${name}.${ext}` },
        { name: `https://game.example/a/${name}.atlas` },
      ],
    },
  }) as unknown as typeof globalThis;

const never = (): null => null;

/** What a page that publishes no module has to offer. */
const nothing = { skeletons: [], atlases: [] };

describe('probeSkeleton', () => {
  /** Nothing to read: the store already parsed it. */
  it('reads a skeleton the asset store is already holding', () => {
    const data = parsed(['run', 'jump'], ['default', 'armour']);

    expect(probeSkeleton(nodeWithBuilder(), 'boss', { skeletons: [{ name: 'boss', data }], atlases: [] }, never)).toEqual({
      animations: [
        { name: 'run', duration: 0 },
        { name: 'jump', duration: 0 },
      ],
      skins: ['default', 'armour'],
      events: [],
      pending: false,
    });
  });

  /**
   * The route that reads a binary export. `Spine.from` picks its own reader by
   * what it finds, so `.skel` and `.json` go the same way — and the static
   * closes over the bundle's own `Assets`, so a game that publishes no PixiJS
   * module is no obstacle.
   */
  it("builds one with the runtime's own class, off the scene", () => {
    const node = nodeWithBuilder(() => ({ skeleton: { data: parsed(['idle']) } }));

    const probed = probeSkeleton(node, 'ogre', nothing, never, pageWith('ogre'));

    expect(probed).toEqual({
      animations: [{ name: 'idle', duration: 0 }],
      skins: ['default'],
      events: [],
      pending: false,
    });
  });

  /**
   * `Assets` keys by what the application handed it, and the browser's record
   * hands back an absolute url — so the alias and the path are tried too. This
   * is not hypothetical: the first spelling threw on the stand.
   */
  it('tries the spellings a page may have filed the asset under', () => {
    const node = nodeWithBuilder(({ skeleton }) => {
      if (skeleton !== '/a/imp.skel') throw new Error('asset is undefined');
      return { skeleton: { data: parsed(['idle']) } };
    });

    const probed = probeSkeleton(node, 'imp', nothing, never, pageWith('imp'));

    expect(probed?.animations).toEqual([{ name: 'idle', duration: 0 }]);

    // The alias first, because it is the commonest key of the three, and the
    // path after it — which is the spelling this page turned out to want.
    const tried = builderOf(node).mock.calls.map((call) => (call[0] as { skeleton: string }).skeleton);
    expect(tried[0]).toBe('imp');
    expect(tried).toContain('/a/imp.skel');
  });

  /** It is built and dropped: nothing is added to anything. */
  it('leaves the node it was asked about alone', () => {
    const node = nodeWithBuilder(() => ({ skeleton: { data: parsed(['idle']) } }));
    const before = node['skeleton'];

    probeSkeleton(node, 'troll', nothing, never, pageWith('troll'));

    expect(node['skeleton']).toBe(before);
  });

  /**
   * `spine.info` is asked again on every poll, so a skeleton that builds must
   * not be built afresh each time — a whole `Skeleton` and `AnimationState`
   * thrown away twice a second.
   */
  it('builds a skeleton once, however often it is asked for', () => {
    const node = nodeWithBuilder(() => ({ skeleton: { data: parsed(['idle']) } }));

    probeSkeleton(node, 'wisp', nothing, never, pageWith('wisp'));
    probeSkeleton(node, 'wisp', nothing, never, pageWith('wisp'));

    expect(builderOf(node)).toHaveBeenCalledTimes(1);
  });

  /** A game that loaded its assets some other way. The next route does not care. */
  it('falls through when the runtime refuses to build it', () => {
    const node = nodeWithBuilder(() => {
      throw new Error('Cannot read properties of undefined');
    });
    const readExport = vi.fn(() => ({
      animations: [{ name: 'fallback', duration: 0 }],
      skins: [],
      events: [],
      pending: false,
    }));

    const probed = probeSkeleton(node, 'ghoul', nothing, readExport, pageWith('ghoul'));

    expect(probed?.animations).toEqual([{ name: 'fallback', duration: 0 }]);
  });

  /** v6/v7: `pixi-spine`'s `Spine` takes a `SkeletonData` and builds nothing. */
  it('falls through on a runtime whose class builds nothing', () => {
    const readExport = vi.fn(() => ({
      animations: [{ name: 'fallback', duration: 0 }],
      skins: [],
      events: [],
      pending: false,
    }));

    const probed = probeSkeleton(nodeWithBuilder(), 'kobold', nothing, readExport);

    expect(probed?.animations).toEqual([{ name: 'fallback', duration: 0 }]);
    expect(readExport).toHaveBeenCalledWith('kobold');
  });

  it('says nothing about a node that is not a skeleton', () => {
    expect(probeSkeleton({ children: [] }, 'lich', nothing, never)).toBeNull();
  });
});
