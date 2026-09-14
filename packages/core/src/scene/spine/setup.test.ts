import { describe, expect, it, vi } from 'vitest';

import { applySetup } from './setup.js';
import { readLive } from './spine.js';

/**
 * Putting a whole setup on a node at once.
 *
 * The two things worth pinning here are the order and the sweeping-up: the
 * skeleton decides which skins and animations exist, so it has to go first, and
 * a setup with fewer tracks than the one before it must not leave the extras
 * running underneath.
 */

type Fake = Record<string, unknown>;

class FakeSkin {
  readonly added: unknown[] = [];

  constructor(public name: string) {}

  addSkin(skin: unknown): void {
    this.added.push(skin);
  }
}

function entry(name: string, loop: boolean): Fake {
  return {
    animation: { name, duration: 1 },
    loop,
    trackTime: 0,
    timeScale: 1,
    alpha: 1,
    mixDuration: 0,
  };
}

function skeletonNode(): Fake {
  const order: string[] = [];
  const skins = [new FakeSkin('default'), new FakeSkin('armour')];

  const node: Fake = {
    __order: order,
    skeleton: {
      data: {
        animations: [
          { name: 'walk', duration: 1 },
          { name: 'jump', duration: 1 },
        ],
        skins,
        findSkin: (name: string) => skins.find((skin) => skin.name === name) ?? null,
      },
      skin: skins[0],
      setSkin: vi.fn((skin: unknown) => {
        order.push('skin');
        (node['skeleton'] as Fake)['skin'] = skin;
      }),
      setSlotsToSetupPose: () => order.push('slots'),
      updateWorldTransform: () => {},
    },
    state: {
      tracks: [entry('walk', true)],
      timeScale: 1,
      apply: () => {},
      setAnimation: vi.fn((index: number, name: string, loop: boolean) => {
        order.push(`animation:${name}`);
        const made = entry(name, loop);
        (node['state'] as { tracks: unknown[] }).tracks[index] = made;
        return made;
      }),
      setEmptyAnimation: vi.fn(() => null),
      clearTrack: vi.fn(),
      clearTracks: vi.fn(() => {
        order.push('clearTracks');
        (node['state'] as { tracks: unknown[] }).tracks = [];
      }),
    },
    changeSkeleton: vi.fn((name: string) => {
      order.push(`skeleton:${name}`);
      return true;
    }),
    currentSkeletonName: 'hero',
  };

  return node;
}

const order = (node: Fake): string[] => node['__order'] as string[];
const tracksOf = (node: Fake): Fake[] => (node['state'] as Fake)['tracks'] as Fake[];

const SETUP = {
  skeleton: 'boss',
  skin: 'armour',
  timeScale: 0.5,
  tracks: [
    { index: 0, animation: 'jump', loop: false, timeScale: 2, alpha: 0.5, mixDuration: 0.3 },
  ],
};

describe('applySetup', () => {
  /** The skeleton decides which skins and animations exist, so it goes first. */
  it('changes the skeleton before anything that depends on it', () => {
    const node = skeletonNode();

    applySetup(node, SETUP);

    expect(order(node)[0]).toBe('skeleton:boss');
    expect(order(node).indexOf('skin')).toBeLessThan(order(node).indexOf('animation:jump'));
  });

  it('leaves the skeleton alone when the setup names none', () => {
    const node = skeletonNode();

    applySetup(node, { ...SETUP, skeleton: null });

    expect(node['changeSkeleton']).not.toHaveBeenCalled();
  });

  /** Otherwise a setup with fewer tracks leaves the extras running underneath. */
  it('sweeps the old tracks away before laying down the new ones', () => {
    const node = skeletonNode();

    applySetup(node, SETUP);

    expect(order(node).indexOf('clearTracks')).toBeLessThan(
      order(node).indexOf('animation:jump'),
    );
  });

  it('starts each track with the numbers the setup holds', () => {
    const node = skeletonNode();

    applySetup(node, SETUP);

    expect(tracksOf(node)[0]).toMatchObject({ timeScale: 2, alpha: 0.5, mixDuration: 0.3 });
  });

  it('wears the skin and sets the speed of the whole state', () => {
    const node = skeletonNode();

    applySetup(node, SETUP);

    expect(readLive(node)?.skin).toBe('armour');
    expect((node['state'] as Fake)['timeScale']).toBe(0.5);
  });

  /**
   * A setup built for one skeleton being tried on another is ordinary, and the
   * runtime throws on both counts — so the guards in `setTrack` and `setSkin`
   * are what makes this safe rather than a crash across the bridge.
   */
  it('survives a setup naming things the skeleton does not have', () => {
    const node = skeletonNode();

    expect(() =>
      applySetup(node, {
        skeleton: null,
        skin: 'nonesuch',
        timeScale: 1,
        tracks: [
          { index: 0, animation: 'fly', loop: true, timeScale: 1, alpha: 1, mixDuration: 0 },
        ],
      }),
    ).not.toThrow();

    expect((node['state'] as Fake)['setAnimation']).not.toHaveBeenCalled();
  });

  it('does nothing to a node that is not a skeleton', () => {
    expect(applySetup({ children: [] }, SETUP)).toBe(false);
  });
});
