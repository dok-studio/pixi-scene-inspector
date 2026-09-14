import { describe, expect, it, vi } from 'vitest';

import { setSkin } from './skeleton.js';
import { readLive } from './spine.js';

/**
 * The skeleton itself — what it wears.
 *
 * The thing worth the test more than the rest: a skin change that does not
 * reset the slots leaves attachments from the old one hanging on the skeleton,
 * which reads as a bug in the game rather than in the inspector.
 */

type Fake = Record<string, unknown>;

/** Stands in for Spine's `Skin`. */
class FakeSkin {
  constructor(public name: string) {}
}

function skeletonNode(): Fake {
  const applied: unknown[] = [];
  const skins = [new FakeSkin('default'), new FakeSkin('goblin'), new FakeSkin('hat')];

  const skeleton: Fake = {
    data: {
      name: 'hero',
      animations: [
        { name: 'walk', duration: 1.5 },
        { name: 'jump', duration: 0.8 },
      ],
      skins,
      findSkin: (name: string) => skins.find((skin) => skin.name === name) ?? null,
    },
    skin: skins[0],
    setSkin: vi.fn((skin: unknown) => {
      skeleton['skin'] = skin;
    }),
    setSlotsToSetupPose: vi.fn(() => applied.push('slots')),
    updateWorldTransform: () => applied.push('updateWorldTransform'),
  };

  return {
    __applied: applied,
    __skins: skins,
    skeleton,
    state: {
      tracks: [],
      timeScale: 1,
      apply: () => applied.push('apply'),
    },
  };
}

const skeletonOf = (node: Fake): Fake => node['skeleton'] as Fake;

describe('setSkin', () => {
  /**
   * A skin change without resetting the slots leaves attachments from the old
   * one still hanging on the skeleton.
   */
  it('wears a skin by name and resets the slots', () => {
    const node = skeletonNode();

    setSkin(node, 'goblin');

    expect((skeletonOf(node)['skin'] as FakeSkin).name).toBe('goblin');
    expect(node['__applied']).toEqual(['slots', 'apply', 'updateWorldTransform']);
  });

  it('reads back what it put on', () => {
    const node = skeletonNode();

    setSkin(node, 'goblin');

    expect(readLive(node)?.skin).toBe('goblin');
  });

  it('undresses the skeleton when given nothing', () => {
    const node = skeletonNode();

    setSkin(node, null);

    expect(skeletonOf(node)['setSkin']).toHaveBeenCalledWith(null);
  });

  /**
   * `setSkinByName` throws `Skin not found`, and the caller that hits it is a
   * setup built for one skeleton being applied to another — not a typo. Left
   * dressed as it was: stripping a skeleton because a setup named a skin it
   * does not have would be a change nobody asked for.
   */
  it('leaves the skeleton alone when it has no such skin', () => {
    const node = skeletonNode();

    expect(setSkin(node, 'nonesuch')).toBe(false);
    expect((skeletonOf(node)['skin'] as FakeSkin).name).toBe('default');
    expect(skeletonOf(node)['setSkin']).not.toHaveBeenCalled();
  });

  it('does nothing to a node that is not a skeleton', () => {
    expect(setSkin({ children: [] }, 'goblin')).toBe(false);
  });
});
