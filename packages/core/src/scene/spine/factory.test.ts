import { describe, expect, it, vi } from 'vitest';

import type { SpineStore } from '../../adapters/types.js';
import { buildSpine } from './factory.js';

/**
 * Building a Spine with the runtime the page already has.
 *
 * Three routes, and the order between them is the design: the asset store's
 * copy is parsed already and costs nothing; the runtime's own factory reads a
 * binary `.skel`, which is the point of it; and the application's own
 * `changeSkeleton` needs nothing readable at all, which is the point of that —
 * a bundled game that keys its assets by something the panel cannot guess is
 * still a game that knows how to load its own skeletons.
 *
 * Asking the application runs the application's code, so it goes last. These
 * cases are mostly about that: it is tried only when the others fail, and its
 * answer is checked rather than believed.
 */

type Fake = Record<string, unknown>;

const parsed = (animations: string[]): Fake => ({
  animations: animations.map((name) => ({ name })),
  skins: [{ name: 'default' }],
});

const NOTHING: SpineStore = { skeletons: [], atlases: [] };

/** A page that fetched an export and its atlas, as the browser records it. */
const page = (name: string): typeof globalThis =>
  ({
    performance: {
      getEntriesByType: () => [
        { name: `https://game.example/assets/${name}.skel` },
        { name: `https://game.example/assets/${name}.atlas` },
      ],
    },
  }) as unknown as typeof globalThis;

/**
 * A node whose class takes a `SkeletonData` — which is what both lines' `Spine`
 * constructors do, and what makes a clone possible everywhere.
 */
function spineNode(options: {
  from?: (options: { skeleton: string; atlas: string }) => unknown;
  changeSkeleton?: (this: Fake, name: string) => boolean | undefined;
} = {}): Fake {
  class SpineLike {
    static from = options.from === undefined ? undefined : vi.fn(options.from);

    skeleton: Fake;
    state: Fake = { tracks: [] };

    constructor(data: Fake = parsed(['idle'])) {
      this.skeleton = { data };
    }
  }

  const node = new SpineLike() as unknown as Fake;
  if (options.changeSkeleton !== undefined) {
    // On the prototype, as a game that patches its own Spine class would have
    // it — an instance-only method is the case a clone cannot inherit.
    (SpineLike.prototype as unknown as Fake)['changeSkeleton'] = options.changeSkeleton;
  }

  return node;
}

const dataOf = (made: object | null): unknown => (made as { skeleton?: Fake } | null)?.['skeleton'];

describe('buildSpine', () => {
  it('clones the skeleton the node already carries', () => {
    const node = spineNode();

    const made = buildSpine(node, null);

    expect(made).not.toBeNull();
    expect((dataOf(made) as Fake)['data']).toBe((node['skeleton'] as Fake)['data']);
  });

  /** The store's copy is parsed already: nothing to read, and it works on v6. */
  it('takes a named skeleton straight out of the asset store', () => {
    const node = spineNode();
    const boss = parsed(['roar']);

    const made = buildSpine(node, 'boss', { skeletons: [{ name: 'boss', data: boss }], atlases: [] });

    expect((dataOf(made) as Fake)['data']).toBe(boss);
  });

  /** `pixi-spine`'s loader files a wrapper, and the constructor wants the data. */
  it('unwraps what pixi-spine filed', () => {
    const node = spineNode();
    const boss = parsed(['roar']);

    const made = buildSpine(node, 'boss', {
      skeletons: [{ name: 'boss', data: { spineData: boss, spineAtlas: {} } }],
      atlases: [],
    });

    expect((dataOf(made) as Fake)['data']).toBe(boss);
  });

  /**
   * The store keys skeletons and atlases separately and says nothing about
   * which goes with which, so the pairing is tried. A wrong atlas is not
   * silent — the reader throws on the first region it cannot find.
   */
  it('pairs a named skeleton with the atlases the store holds', () => {
    const built = { skeleton: { data: parsed(['roar']) } };
    const node = spineNode({
      from: ({ atlas }) => {
        if (atlas !== 'right') throw new Error('Region not found in atlas');
        return built;
      },
    });

    const made = buildSpine(node, 'boss', { skeletons: [], atlases: ['wrong', 'right'] });

    expect(made).toBe(built);
  });

  /**
   * The keys `Assets` holds cannot be read back on a bundled game, so the
   * factory tries every spelling the application plausibly used. This is the
   * one that was missing and the one that a real game turned out to use: the
   * file's own name, extension and all.
   */
  it('tries the file name with its extension as a key', () => {
    const built = { skeleton: { data: parsed(['roar']) } };
    const seen: string[] = [];
    const node = spineNode({
      from: ({ skeleton, atlas }) => {
        seen.push(skeleton);
        if (skeleton !== 'boss.skel' || atlas !== 'boss.atlas') throw new Error('no such asset');
        return built;
      },
    });

    const made = buildSpine(node, 'boss', NOTHING, page('boss'));

    expect(made).toBe(built);
    // The plain name first: an alias is still the commonest key of the lot.
    expect(seen[0]).toBe('boss');
  });

  it('tries the path a relative src resolves from', () => {
    const built = { skeleton: { data: parsed(['roar']) } };
    const node = spineNode({
      from: ({ skeleton }) => {
        if (skeleton !== 'assets/boss.skel') throw new Error('no such asset');
        return built;
      },
    });

    expect(buildSpine(node, 'boss', NOTHING, page('boss'))).toBe(built);
  });

  /**
   * The one that sent this back: a bundled game keys its assets by something
   * the panel cannot guess, so the factory route is shut — but the game's own
   * method is the very thing the first tab already uses successfully.
   */
  it('asks the application when nothing else can build it', () => {
    const boss = parsed(['roar']);
    const node = spineNode({
      changeSkeleton(name: string) {
        if (name !== 'boss') return false;
        (this['skeleton'] as Fake)['data'] = boss;
        return true;
      },
    });

    const made = buildSpine(node, 'boss');

    expect((dataOf(made) as Fake)['data']).toBe(boss);
    // And the original is untouched: the method ran on the copy.
    expect((node['skeleton'] as Fake)['data']).not.toBe(boss);
  });

  it('refuses a name the application refuses', () => {
    const node = spineNode({ changeSkeleton: () => false });

    expect(buildSpine(node, 'nonesuch', NOTHING)).toBeNull();
  });

  /**
   * An implementation that loads asynchronously answers before it has done
   * anything. Handing back a copy still wearing the original's skeleton, under
   * the name of another, would be worse than refusing.
   */
  it('refuses when the application says yes and changes nothing', () => {
    const node = spineNode({ changeSkeleton: () => true });

    expect(buildSpine(node, 'boss')).toBeNull();
  });

  it('refuses when the application throws at the name', () => {
    const node = spineNode({
      changeSkeleton: () => {
        throw new Error('unknown skeleton');
      },
    });

    expect(buildSpine(node, 'boss')).toBeNull();
  });

  /** Running the application's code is a cost; the cheap routes come first. */
  it('does not ask the application for what the store already has', () => {
    const changeSkeleton = vi.fn(() => true);
    const node = spineNode({ changeSkeleton });

    buildSpine(node, 'boss', { skeletons: [{ name: 'boss', data: parsed(['roar']) }], atlases: [] });

    expect(changeSkeleton).not.toHaveBeenCalled();
  });

  it('refuses when there is no route at all', () => {
    expect(buildSpine(spineNode(), 'boss', NOTHING)).toBeNull();
  });
});
