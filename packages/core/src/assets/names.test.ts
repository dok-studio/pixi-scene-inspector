import type { Revisioned } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { Node, PixiAdapter } from '../adapters/types.js';
import { readTextureNames } from './names.js';

/**
 * The two sources joined, and the one node kind that must not contribute.
 *
 * A fake adapter rather than a fake page: what the caches look like on each
 * line is settled in `adapters/textureNames.test.ts`, and what is left here is
 * the part that is the same everywhere — walk the scene, join, answer once.
 */

interface FakeNode {
  type?: string;
  names?: string[];
  children?: FakeNode[];
}

function adapterWith(cached: string[], stage: FakeNode | null): PixiAdapter {
  return {
    stage: () => stage as Node | null,
    children: (node: Node) => ((node as FakeNode).children ?? []) as Node[],
    typeOf: (node: Node) => (node as FakeNode).type ?? 'Container',
    pickableTextureNames: () => cached,
    nodeTextureNames: (node: Node) => (node as FakeNode).names ?? [],
  } as unknown as PixiAdapter;
}

function dataOf(result: Revisioned<string[]>): string[] {
  if ('unchanged' in result) throw new Error('expected data, got unchanged');
  return result.data;
}

describe('readTextureNames', () => {
  it('joins what is cached with what the scene is drawing', () => {
    const stage: FakeNode = { children: [{ names: ['hero_idle_07'] }] };

    expect(dataOf(readTextureNames(adapterWith(['logo.png'], stage)))).toEqual([
      'logo.png',
      'hero_idle_07',
    ]);
  });

  it('offers a name once, however many sprites draw it', () => {
    const stage: FakeNode = {
      children: [{ names: ['hero_idle_01'] }, { names: ['hero_idle_01'] }],
    };

    expect(dataOf(readTextureNames(adapterWith(['hero_idle_01'], stage)))).toEqual(['hero_idle_01']);
  });

  it('reaches nodes at any depth', () => {
    const stage: FakeNode = { children: [{ children: [{ children: [{ names: ['deep.png'] }] }] }] };

    expect(dataOf(readTextureNames(adapterWith([], stage)))).toEqual(['deep.png']);
  });

  /** A Spine node draws its atlas pages — the one thing this list must not offer. */
  it('leaves out the pages a Spine node itself draws', () => {
    const stage: FakeNode = { children: [{ type: 'Spine', names: ['circle.png'] }] };

    expect(dataOf(readTextureNames(adapterWith([], stage)))).toEqual([]);
  });

  /**
   * What is under a Spine node is not the skeleton. `Spine` is an ordinary
   * container, and a game parents whole screens to one — a slot attachment, or
   * simply the subtree that should follow the animation's transform. Skipping
   * those along with the skeleton emptied the list on a real page where a
   * single Spine held 698 of the scene's 731 nodes.
   */
  it('still reaches ordinary nodes parented to a Spine', () => {
    const stage: FakeNode = {
      children: [{ type: 'Spine', names: ['circle.png'], children: [{ names: ['button.png'] }] }],
    };

    expect(dataOf(readTextureNames(adapterWith([], stage)))).toEqual(['button.png']);
  });

  it('says unchanged when nothing has moved since the panel last asked', () => {
    const adapter = adapterWith(['logo.png'], { children: [] });
    const first = readTextureNames(adapter);

    expect(readTextureNames(adapter, first.rev)).toEqual({ rev: first.rev, unchanged: true });
  });

  it('answers again once a name has appeared', () => {
    const before = readTextureNames(adapterWith(['logo.png'], { children: [] }));
    const after = readTextureNames(adapterWith(['logo.png', 'hero.png'], { children: [] }), before.rev);

    expect(after.rev).not.toBe(before.rev);
    expect(dataOf(after)).toEqual(['logo.png', 'hero.png']);
  });

  it('has nothing to say about a destroyed application', () => {
    expect(dataOf(readTextureNames(adapterWith([], null)))).toEqual([]);
  });
});
