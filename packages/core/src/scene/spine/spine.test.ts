import { describe, expect, it } from 'vitest';

import { asSpine, readInfo, readLive, readTracks, refresh } from './spine.js';
import type { SpineLike } from './spine.js';

/**
 * Spine, which is not PixiJS.
 *
 * The runtime is installed separately — `pixi-spine` for v6/v7,
 * `spine-pixi-v8` for v8 — and may be absent entirely, so this is a module with
 * its own detection rather than a branch in `PixiAdapter` (§3.5). A skeleton
 * can sit under any Pixi version, or under none the inspector recognises.
 *
 * The shape is the same in both runtimes, which is not a hope: the previous
 * project already read `state.tracks` and `skeleton.data.animations` duck-typed
 * with no version branch at all. Where they genuinely differ — the argument
 * `updateWorldTransform` grew in 4.2, the update the v8 wrapper does for
 * itself — the difference is asked about by name, and that is what the tests
 * below pin down.
 */

type Fake = Record<string, unknown>;

export function trackEntry(overrides: Fake = {}): Fake {
  return {
    animation: { name: 'walk', duration: 1.5 },
    loop: true,
    trackTime: 0.25,
    timeScale: 1,
    alpha: 1,
    mixDuration: 0.2,
    mixTime: 0,
    animationStart: 0,
    animationEnd: 1.5,
    ...overrides,
  };
}

function skeletonNode(overrides: Fake = {}): Fake {
  const applied: unknown[] = [];

  return {
    __applied: applied,
    skeleton: {
      data: {
        name: 'hero',
        animations: [
          { name: 'walk', duration: 1.5 },
          { name: 'jump', duration: 0.8 },
        ],
        skins: [{ name: 'default' }, { name: 'goblin' }],
        events: [{ name: 'footstep' }],
      },
      skin: { name: 'default' },
      updateWorldTransform(physics: unknown) {
        applied.push(['updateWorldTransform', physics]);
      },
    },
    state: {
      tracks: [trackEntry()],
      timeScale: 1.5,
      apply() {
        applied.push('apply');
      },
    },
    ...overrides,
  };
}

describe('detecting a skeleton', () => {
  it('recognises a node carrying a skeleton and a state', () => {
    expect(asSpine(skeletonNode())).not.toBeNull();
  });

  it('refuses a plain container', () => {
    expect(asSpine({ children: [], visible: true })).toBeNull();
  });

  /** A game object may well have a field called `state` that is not Spine's. */
  it('refuses a node whose state is not an animation state', () => {
    expect(asSpine({ skeleton: {}, state: { paused: true } })).toBeNull();
  });

  it('refuses a node with a state but no skeleton', () => {
    expect(asSpine({ state: { tracks: [] } })).toBeNull();
  });
});

/**
 * The defect this pins down: `updateWorldTransform()` with no argument throws
 * on Spine 4.2, which is the runtime behind PixiJS 8. The older runtimes take
 * no argument at all and ignore an extra one, so passing it always is both the
 * fix and a no-op — and needs no version branch.
 */
describe('refresh', () => {
  it('applies the pose and passes Physics.update to the transform', () => {
    const node = skeletonNode();

    refresh(asSpine(node) as SpineLike);

    expect(node['__applied']).toEqual(['apply', ['updateWorldTransform', 2]]);
  });

  /**
   * The v8 wrapper does more than apply the pose: it marks its render pipe so
   * the attachments are transformed again. Going round it leaves a paused scene
   * drawing the frame it already had.
   */
  it('lets the wrapper update itself where there is one', () => {
    const applied: unknown[] = [];
    const node = skeletonNode({
      _updateAndApplyState(delta: number) {
        applied.push(['wrapper', delta]);
      },
    });
    (node['__applied'] as unknown[]).length = 0;

    refresh(asSpine(node) as SpineLike);

    expect(applied).toEqual([['wrapper', 0]]);
    // And nothing behind its back.
    expect(node['__applied']).toEqual([]);
  });
});

describe('readInfo', () => {
  it('reports the skins and the animations', () => {
    expect(readInfo(skeletonNode())).toEqual({
      skins: ['default', 'goblin'],
      animations: [
        { name: 'walk', duration: 1.5 },
        { name: 'jump', duration: 0.8 },
      ],
      events: ['footstep'],
      pending: false,
      skeletons: [],
      canChangeSkeleton: false,
    });
  });

  /**
   * The names come from the adapter, not from here: the cache is PixiJS's, and
   * reaching it is the one part of this that differs by version.
   */
  it('passes the loaded skeleton names through', () => {
    const sources = [
      { name: 'hero', data: null },
      { name: 'boss', data: null },
    ];

    expect(readInfo(skeletonNode(), { skeletons: sources, atlases: [] })?.skeletons).toEqual([
      'hero',
      'boss',
    ]);
  });

  /** No runtime offers a way to change skeleton; only the application does. */
  it('says whether the node can be moved to another skeleton at all', () => {
    expect(readInfo(skeletonNode())?.canChangeSkeleton).toBe(false);
    expect(readInfo(skeletonNode({ changeSkeleton: () => true }))?.canChangeSkeleton).toBe(true);
  });

  it('reports nothing for a node that is not a skeleton', () => {
    expect(readInfo({ children: [] })).toBeNull();
  });

  it('survives a skeleton with no data at all', () => {
    expect(readInfo(skeletonNode({ skeleton: { data: null } }))).toBeNull();
  });
});

describe('readTracks', () => {
  it('reports a running track', () => {
    expect(readTracks(skeletonNode())[0]).toEqual({
      index: 0,
      animation: 'walk',
      loop: true,
      time: 0.25,
      duration: 1.5,
      timeScale: 1,
      alpha: 1,
      mixDuration: 0.2,
      mixTime: 0,
      mixingFrom: null,
      complete: false,
      queue: [],
    });
  });

  /**
   * `trackTime` counts from when the animation was set and keeps going, so an
   * idle loop left running reads as minutes against a duration of a second and
   * a half. The scrub bar shows a position inside the animation.
   */
  it('wraps the playhead of a looping track into the animation', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: Fake[] }).tracks = [trackEntry({ trackTime: 202.75 })];

    expect(readTracks(node)[0]?.time).toBeCloseTo(1.75 % 1.5, 5);
  });

  /**
   * One that has run past its end stays there rather than starting over — at
   * its end, not at whatever `trackTime` has counted up to. The runtime holds
   * the animation on its last frame; turning looping off on a track that had
   * been running for three minutes otherwise read as 171 against a duration of
   * 1.5, which is the nonsense wrapping exists to stop.
   */
  it('holds a finished one-shot track at the end of its animation', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: Fake[] }).tracks = [trackEntry({ loop: false, trackTime: 4 })];

    expect(readTracks(node)[0]?.time).toBe(1.5);
  });

  it('leaves a one-shot that is still running where it is', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: Fake[] }).tracks = [trackEntry({ loop: false, trackTime: 0.4 })];

    expect(readTracks(node)[0]?.time).toBe(0.4);
  });

  /** Which is also what tells Play apart from Resume on such a track. */
  it('calls a one-shot track that has run past its end complete', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: Fake[] }).tracks = [trackEntry({ loop: false, trackTime: 4 })];

    expect(readTracks(node)[0]?.complete).toBe(true);
  });

  it('asks the runtime whether a track is complete when it can answer', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: Fake[] }).tracks = [
      trackEntry({ loop: false, trackTime: 0, isComplete: () => true }),
    ];

    expect(readTracks(node)[0]?.complete).toBe(true);
  });

  it('flattens the queue behind a track in the order it will play', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: Fake[] }).tracks = [
      trackEntry({
        next: {
          animation: { name: 'jump', duration: 0.8 },
          loop: false,
          delay: 0.5,
          next: { animation: { name: 'walk', duration: 1.5 }, loop: true, delay: 0 },
        },
      }),
    ];

    expect(readTracks(node)[0]?.queue).toEqual([
      { animation: 'jump', loop: false, delay: 0.5 },
      { animation: 'walk', loop: true, delay: 0 },
    ]);
  });

  /** A cycle should report a strange skeleton, not hang the poll. */
  it('stops walking a queue that points back at itself', () => {
    const node = skeletonNode();
    const looped: Fake = { animation: { name: 'jump', duration: 0.8 }, loop: false, delay: 0 };
    looped['next'] = looped;
    (node['state'] as { tracks: Fake[] }).tracks = [trackEntry({ next: looped })];

    expect(readTracks(node)[0]?.queue).toHaveLength(32);
  });

  it('names what a track is mixing out of', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: Fake[] }).tracks = [
      trackEntry({ mixingFrom: { animation: { name: 'jump', duration: 0.8 } }, mixTime: 0.1 }),
    ];

    const track = readTracks(node)[0];
    expect(track?.mixingFrom).toBe('jump');
    expect(track?.mixTime).toBe(0.1);
  });

  /**
   * Spine leaves holes in the array when a track is cleared, and the index is
   * what every command addresses — so the position has to be preserved rather
   * than the list compacted.
   */
  it('keeps the index of a track that sits after an empty one', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: unknown[] }).tracks = [null, trackEntry()];

    expect(readTracks(node).map((track) => track.index)).toEqual([1]);
  });

  it('reports nothing when every track is empty', () => {
    const node = skeletonNode();
    (node['state'] as { tracks: unknown[] }).tracks = [null, null];

    expect(readTracks(node)).toEqual([]);
  });

  it('reports nothing for a node that is not a skeleton', () => {
    expect(readTracks({ children: [] })).toEqual([]);
  });
});

describe('readLive', () => {
  it('carries the state and the skin along with the tracks', () => {
    const live = readLive(skeletonNode());

    expect(live?.timeScale).toBe(1.5);
    expect(live?.skin).toBe('default');
    expect(live?.tracks).toHaveLength(1);
  });

  /**
   * The application's own answer first, because it is the one that matches the
   * names `changeSkeleton` takes. `SkeletonData.name` is almost always empty —
   * the JSON reader never fills it in — so it is only the fallback.
   */
  it('names the skeleton the way the application does', () => {
    expect(readLive(skeletonNode({ currentSkeletonName: 'boss' }))?.skeleton).toBe('boss');
  });

  it('falls back to the name on the data, and to nothing at all', () => {
    expect(readLive(skeletonNode())?.skeleton).toBe('hero');

    const nameless = skeletonNode();
    delete ((nameless['skeleton'] as Fake)['data'] as Fake)['name'];
    expect(readLive(nameless)?.skeleton).toBe('');
  });

  /**
   * A skeleton nobody has dressed has no skin at all: the runtime leaves `skin`
   * null and looks attachments up in `data.defaultSkin`. Reporting nothing
   * there showed a blank beside a skeleton that was plainly wearing something,
   * which is how it read on the stand before this.
   */
  it('reports the default skin of a skeleton that was never dressed', () => {
    const node = skeletonNode();
    const skeleton = node['skeleton'] as Fake;
    const data = skeleton['data'] as Fake;
    skeleton['skin'] = null;
    data['defaultSkin'] = (data['skins'] as Fake[])[0];

    expect(readLive(node)?.skin).toBe('default');
  });

  it('reports nothing for a node that is not a skeleton', () => {
    expect(readLive({ children: [] })).toBeNull();
  });
});
