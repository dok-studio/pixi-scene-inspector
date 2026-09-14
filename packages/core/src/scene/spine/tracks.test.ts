import { describe, expect, it, vi } from 'vitest';

import {
  clearQueue,
  clearTrack,
  clearTracks,
  setLoop,
  setTimeScale,
  setTrack,
  setTrackParam,
  setTrackTime,
} from './tracks.js';

/**
 * Writing to an animation state.
 *
 * The rule these tests hold in place: **`setAnimation` is called from exactly
 * one place.** It builds a new `TrackEntry` every time, which drops the
 * playhead back to zero — so a panel that reached for it to change `loop`
 * restarted the animation, which is what the previous version of the section
 * did. Everything that can be written onto the entry already there is.
 */

type Fake = Record<string, unknown>;

function entry(overrides: Fake = {}): Fake {
  return {
    animation: { name: 'walk', duration: 1.5 },
    loop: true,
    trackTime: 0.25,
    timeScale: 1,
    alpha: 1,
    mixDuration: 0.2,
    ...overrides,
  };
}

function skeletonNode(): Fake {
  const applied: unknown[] = [];
  const node: Fake = {
    __applied: applied,
    skeleton: {
      data: {
        name: 'hero',
        animations: [
          { name: 'walk', duration: 1.5 },
          { name: 'jump', duration: 0.8 },
        ],
        skins: [],
      },
      updateWorldTransform() {
        applied.push('updateWorldTransform');
      },
    },
    state: {
      tracks: [entry()],
      timeScale: 1,
      apply() {
        applied.push('apply');
      },
      setAnimation: vi.fn((index: number, name: string, loop: boolean) => {
        const made = entry({ animation: { name, duration: 1 }, loop, trackTime: 0 });
        (node['state'] as { tracks: unknown[] }).tracks[index] = made;
        return made;
      }),
      setEmptyAnimation: vi.fn((index: number) => {
        const made = entry({ animation: null, loop: false, trackTime: 0 });
        (node['state'] as { tracks: unknown[] }).tracks[index] = made;
        return made;
      }),
      clearTrack: vi.fn((index: number) => {
        (node['state'] as { tracks: unknown[] }).tracks[index] = null;
      }),
      clearTracks: vi.fn(() => {
        (node['state'] as { tracks: unknown[] }).tracks = [];
      }),
      clearNext: vi.fn(),
    },
  };

  return node;
}

const state = (node: Fake): Fake => node['state'] as Fake;
const tracksOf = (node: Fake): Fake[] => state(node)['tracks'] as Fake[];

describe('setTrack', () => {
  it('starts an animation on a track', () => {
    const node = skeletonNode();

    setTrack(node, 1, 'jump', false);

    expect(state(node)['setAnimation']).toHaveBeenCalledWith(1, 'jump', false);
  });

  /**
   * The whole reason the parameters travel with the command: a track being
   * started for the first time has no entry to write onto until `setAnimation`
   * has made one, and a round trip later is a round trip the animation already
   * spent running at the wrong speed.
   */
  it('writes the chosen parameters onto the entry it just made', () => {
    const node = skeletonNode();

    setTrack(node, 0, 'walk', true, { timeScale: 0.5, alpha: 0.25, mixDuration: 0.3 });

    expect(tracksOf(node)[0]).toMatchObject({ timeScale: 0.5, alpha: 0.25, mixDuration: 0.3 });
  });

  it('ignores a parameter that is not a finite number', () => {
    const node = skeletonNode();

    setTrack(node, 0, 'walk', true, { timeScale: Number.NaN });

    expect(tracksOf(node)[0]?.['timeScale']).toBe(1);
  });

  /**
   * Mixing out and dropping the track look quite different on screen: one fades
   * back to the setup pose, the other snaps.
   */
  it('mixes the track out through an empty animation when the choice is dropped', () => {
    const node = skeletonNode();

    setTrack(node, 0, null, false, { mixDuration: 0.4 });

    expect(state(node)['setEmptyAnimation']).toHaveBeenCalledWith(0, 0.4);
    expect(state(node)['clearTrack']).not.toHaveBeenCalled();
  });

  it('applies the pose, so a paused scene shows the new animation', () => {
    const node = skeletonNode();

    setTrack(node, 0, 'walk', true);

    expect(node['__applied']).toEqual(['apply', 'updateWorldTransform']);
  });

  /**
   * `setAnimation` throws `Animation not found` rather than returning null, and
   * the caller that hits it is not a typo: it is a setup built for one skeleton
   * being applied to another, which is an ordinary thing to do.
   */
  it('refuses an animation the skeleton does not have, rather than throwing', () => {
    const node = skeletonNode();

    expect(setTrack(node, 0, 'fly', true)).toBe(false);
    expect(state(node)['setAnimation']).not.toHaveBeenCalled();
  });

  it('does nothing to a node that is not a skeleton', () => {
    expect(setTrack({ children: [] }, 0, 'walk', true)).toBe(false);
  });
});

describe('clearQueue', () => {
  it('drops everything queued behind the current animation', () => {
    const node = skeletonNode();

    clearQueue(node, 0);

    expect(state(node)['clearNext']).toHaveBeenCalledWith(tracksOf(node)[0]);
  });

  /** Not every runtime has it, and there is no safe way to do it by hand. */
  it('reports that it could not, on a runtime without clearNext', () => {
    const node = skeletonNode();
    delete state(node)['clearNext'];

    expect(clearQueue(node, 0)).toBe(false);
  });

  it('leaves an empty track alone', () => {
    const node = skeletonNode();
    state(node)['tracks'] = [null];

    expect(clearQueue(node, 0)).toBe(false);
  });
});

describe('clearing tracks', () => {
  it('drops one track where it stands', () => {
    const node = skeletonNode();

    clearTrack(node, 0);

    expect(state(node)['clearTrack']).toHaveBeenCalledWith(0);
  });

  it('drops all of them', () => {
    const node = skeletonNode();

    clearTracks(node);

    expect(state(node)['clearTracks']).toHaveBeenCalled();
  });

  it('applies the pose afterwards, so a paused scene loses the animation too', () => {
    const node = skeletonNode();

    clearTrack(node, 0);

    expect(node['__applied']).toEqual(['apply', 'updateWorldTransform']);
  });
});

/**
 * The whole point of scrubbing: a paused scene has to move. Setting the time
 * alone changes a number nobody redraws.
 */
describe('setTrackTime', () => {
  it('moves the playhead', () => {
    const node = skeletonNode();

    setTrackTime(node, 0, 0.9);

    expect(tracksOf(node)[0]?.['trackTime']).toBe(0.9);
  });

  it('applies the pose and updates the transforms, in that order', () => {
    const node = skeletonNode();

    setTrackTime(node, 0, 0.9);

    expect(node['__applied']).toEqual(['apply', 'updateWorldTransform']);
  });

  /**
   * Dragging is a way of looking at a pose, not a way of starting an animation
   * — but stopping the track is the **panel's**, not this function's.
   *
   * This used to zero `timeScale` for a one-shot that had run out, and it took
   * three things with it: the entry's real speed, which nothing here could give
   * back; a track paused half way through a drag, because the runtime finished
   * it between two of the slider's events; and the entry's queue, which Spine
   * advances off `trackTime` and so never hands over at a speed of zero. The
   * panel pauses for the length of the gesture instead, where the speed to
   * resume at can be kept.
   */
  it('leaves the speed of a finished one-shot alone', () => {
    const node = skeletonNode();
    // `animationStart`/`animationEnd` are the span a `TrackEntry` carries; the
    // runtime holds an entry past its end on its last frame.
    state(node)['tracks'] = [
      entry({ loop: false, trackTime: 1.5, timeScale: 0.25, animationStart: 0, animationEnd: 1.5 }),
    ];

    setTrackTime(node, 0, 0.4);

    expect(tracksOf(node)[0]?.['trackTime']).toBe(0.4);
    expect(tracksOf(node)[0]?.['timeScale']).toBe(0.25);
  });

  it('lets a track that is still running carry on', () => {
    const node = skeletonNode();
    state(node)['tracks'] = [
      entry({ loop: false, trackTime: 0.2, animationStart: 0, animationEnd: 1.5 }),
    ];

    setTrackTime(node, 0, 0.9);

    expect(tracksOf(node)[0]?.['timeScale']).toBe(1);
  });

  /** A loop never finishes, however long it has been counting. */
  it('lets a looping track carry on', () => {
    const node = skeletonNode();
    state(node)['tracks'] = [
      entry({ loop: true, trackTime: 171, animationStart: 0, animationEnd: 1.5 }),
    ];

    setTrackTime(node, 0, 0.4);

    expect(tracksOf(node)[0]?.['timeScale']).toBe(1);
  });

  it('reports whether anything moved, so the caller knows to ask for a frame', () => {
    const node = skeletonNode();

    expect(setTrackTime(node, 0, 0.9)).toBe(true);
    expect(setTrackTime(node, 5, 0.9)).toBe(false);
  });

  it('leaves an empty track alone', () => {
    const node = skeletonNode();
    state(node)['tracks'] = [null];

    expect(setTrackTime(node, 0, 0.9)).toBe(false);
  });
});

describe('setTrackParam', () => {
  it('sets the speed', () => {
    const node = skeletonNode();

    setTrackParam(node, 0, 'timeScale', 2);

    expect(tracksOf(node)[0]?.['timeScale']).toBe(2);
  });

  /** Alpha changed on a scene that is not rendering has to show. */
  it('applies the pose, so the change is visible on a frozen scene', () => {
    const node = skeletonNode();

    setTrackParam(node, 0, 'alpha', 0.5);

    expect(node['__applied']).toEqual(['apply', 'updateWorldTransform']);
  });

  it('leaves an empty track alone', () => {
    const node = skeletonNode();

    expect(setTrackParam(node, 7, 'timeScale', 2)).toBe(false);
  });
});

describe('setTrackParam, refusing what is not a number', () => {
  it('leaves the entry as it was', () => {
    const node = skeletonNode();

    expect(setTrackParam(node, 0, 'timeScale', Number.NaN)).toBe(false);
    expect(setTrackParam(node, 0, 'alpha', Number.NEGATIVE_INFINITY)).toBe(false);

    expect(tracksOf(node)[0]?.['timeScale']).toBe(1);
    expect(tracksOf(node)[0]?.['alpha']).toBe(1);
  });
});

describe('setLoop', () => {
  /**
   * The defect: going through `setAnimation` to change `loop` builds a new
   * entry and drops the playhead to zero, so turning looping on looked like the
   * inspector restarting the animation for no reason.
   */
  it('turns looping on without disturbing the playhead', () => {
    const node = skeletonNode();
    tracksOf(node)[0]!['loop'] = false;

    setLoop(node, 0, true);

    expect(tracksOf(node)[0]?.['loop']).toBe(true);
    expect(tracksOf(node)[0]?.['trackTime']).toBe(0.25);
    expect(state(node)['setAnimation']).not.toHaveBeenCalled();
  });

  it('leaves an empty track alone', () => {
    const node = skeletonNode();

    expect(setLoop(node, 7, true)).toBe(false);
  });
});

describe('setTimeScale', () => {
  it('sets the speed of every track at once', () => {
    const node = skeletonNode();

    setTimeScale(node, 0.25);

    expect(state(node)['timeScale']).toBe(0.25);
  });

  it('does nothing to a node that is not a skeleton', () => {
    expect(setTimeScale({ children: [] }, 0.25)).toBe(false);
  });

  /**
   * A number that is not one does not fail loudly: it spreads through the pose
   * on the next update and the skeleton vanishes, with nothing on screen to say
   * why. `setTrack` already refused these; the two single-value writes did not.
   */
  it('refuses a value that is not a finite number', () => {
    const node = skeletonNode();

    expect(setTimeScale(node, Number.NaN)).toBe(false);
    expect(setTimeScale(node, Number.POSITIVE_INFINITY)).toBe(false);
    expect(state(node)['timeScale']).toBe(1);
  });
});
