import type { NodeId, SpineLive, SpineTrack } from '@scene-inspector/protocol';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPendingTrack,
  draftFor,
  forgetOriginalVisible,
  forgetSetups,
  moveDraft,
  NEW_TRACK,
  originalWasVisible,
  rememberOriginalVisible,
  setDraft,
  shownSetup,
  syncShown,
} from './setups.js';

/**
 * What a setup holds, and what it lets the scene tell it.
 *
 * The line between those two is the whole of this file. A setup that followed
 * the scene in everything could hold no choice long enough to apply it; one that
 * followed it in nothing would go stale the moment the game moved a track of its
 * own accord — which is what happened, and what most of these cases are about.
 */

const ID = 1 as NodeId;

function track(overrides: Partial<SpineTrack> = {}): SpineTrack {
  return {
    index: 0,
    animation: 'idle',
    loop: true,
    time: 0,
    duration: 1,
    timeScale: 1,
    alpha: 1,
    mixDuration: 0,
    mixTime: 0,
    mixingFrom: null,
    complete: false,
    queue: [],
    ...overrides,
  };
}

const liveWith = (tracks: SpineTrack[]): SpineLive => ({
  tracks,
  timeScale: 1,
  skin: 'default',
  skeleton: 'hero',
});

const shownAnimation = (index: number, live: SpineLive): string | null =>
  draftFor(ID, index, live.tracks.find((one) => one.index === index)).animation;

describe('a setup and the scene', () => {
  beforeEach(() => {
    forgetSetups();
  });

  /**
   * The bug this exists to stop. A game switches tracks for its own reasons —
   * an orientation change swapping `landscape` for `portrait` — and the panel
   * went on showing what was playing when the section was first opened.
   */
  it('follows a track the game changed underneath it', () => {
    const before = liveWith([track({ index: 0 }), track({ index: 1, animation: 'landscape' })]);
    syncShown(ID, before);

    const after = liveWith([track({ index: 0 }), track({ index: 1, animation: 'portrait' })]);
    syncShown(ID, after);

    expect(shownAnimation(1, after)).toBe('portrait');
  });

  it('follows the loop flag the game changed too', () => {
    syncShown(ID, liveWith([track({ loop: true })]));
    const after = liveWith([track({ loop: false })]);
    syncShown(ID, after);

    expect(draftFor(ID, 0, after.tracks[0]).loop).toBe(false);
  });

  /**
   * The one thing the scene must not overwrite: an animation picked here and
   * not yet started exists nowhere else, and Play is what turns it into a call.
   */
  it('holds an animation chosen here against a scene that has not caught up', () => {
    const live = liveWith([track({ animation: 'idle' })]);
    syncShown(ID, live);

    setDraft(ID, 0, { ...draftFor(ID, 0, live.tracks[0]), animation: 'walk' });
    syncShown(ID, live);

    expect(shownAnimation(0, live)).toBe('walk');
  });

  /** And it stops holding out the moment the scene agrees. */
  it('goes back to following once the choice has landed', () => {
    const live = liveWith([track({ animation: 'idle' })]);
    syncShown(ID, live);
    setDraft(ID, 0, { ...draftFor(ID, 0, live.tracks[0]), animation: 'walk' });

    const started = liveWith([track({ animation: 'walk' })]);
    syncShown(ID, started);

    const moved = liveWith([track({ animation: 'run' })]);
    syncShown(ID, moved);

    expect(shownAnimation(0, moved)).toBe('run');
  });

  /** A speed is written straight through, so it needs no defending. */
  it('does not treat a change of speed as a choice to hold', () => {
    const live = liveWith([track({ animation: 'idle' })]);
    syncShown(ID, live);

    setDraft(ID, 0, { ...draftFor(ID, 0, live.tracks[0]), timeScale: 0.5 });

    const moved = liveWith([track({ animation: 'walk' })]);
    syncShown(ID, moved);

    expect(shownAnimation(0, moved)).toBe('walk');
  });

  it('takes on a track the game started, and drops one it cleared', () => {
    syncShown(ID, liveWith([track({ index: 0 })]));

    const two = liveWith([track({ index: 0 }), track({ index: 1, animation: 'shoot' })]);
    syncShown(ID, two);
    expect(shownAnimation(1, two)).toBe('shoot');

    const one = liveWith([track({ index: 0 })]);
    syncShown(ID, one);
    expect(shownSetup(ID).tracks.has(1)).toBe(false);
  });

  /** A row added here has no scene behind it, so nothing may sweep it away. */
  it('keeps a row that was added but never started', () => {
    const live = liveWith([track({ index: 0 })]);
    syncShown(ID, live);

    addPendingTrack(ID, 1);
    syncShown(ID, live);

    expect(shownSetup(ID).tracks.has(1)).toBe(true);
  });

  /**
   * What the panel took away it has to give back — and only for as long as it
   * is taking it. A remembered `true` that outlived the giving back is how a
   * node the game hid afterwards was switched on by the inspector.
   */
  it('forgets the original visibility once the node has it back', () => {
    rememberOriginalVisible(ID, true);
    forgetOriginalVisible(ID);

    rememberOriginalVisible(ID, false);

    expect(originalWasVisible(ID)).toBe(false);
  });

  /** While it stands, it is not overwritten: the scene now reports our doing. */
  it('does not take the visibility it caused for the one it found', () => {
    rememberOriginalVisible(ID, false);
    rememberOriginalVisible(ID, true);

    expect(originalWasVisible(ID)).toBe(false);
  });

  /**
   * A setup preparing another skeleton describes something the node is not
   * carrying: the tracks running down there belong to the old one, and
   * following them would overwrite the preparation.
   */
  it('stops following once it has chosen another skeleton', () => {
    const live = liveWith([track({ animation: 'idle' })]);
    syncShown(ID, live);
    shownSetup(ID).skeleton = 'boss';

    const moved = liveWith([track({ animation: 'walk' })]);
    syncShown(ID, moved);

    expect(shownSetup(ID).tracks.get(0)?.animation).toBe('idle');
  });
});

/**
 * The index is a control, so it is also an input — and it reaches the runtime,
 * which does what it is told with it.
 */
describe('moveDraft', () => {
  beforeEach(() => {
    forgetSetups();
  });

  it('moves the draft, and its marks with it', () => {
    addPendingTrack(ID, 0);
    setDraft(ID, 0, { ...NEW_TRACK, animation: 'walk' });

    expect(moveDraft(ID, 0, 2, { ...NEW_TRACK, animation: 'walk' })).toBe(true);

    const setup = shownSetup(ID);
    expect(setup.tracks.get(2)?.animation).toBe('walk');
    expect(setup.tracks.has(0)).toBe(false);
    expect(setup.pending.has(2)).toBe(true);
    expect(setup.chosen.has(2)).toBe(true);
  });

  /** Refusing beats merging two rows into one and losing the quieter of them. */
  it('refuses an index another row is on', () => {
    addPendingTrack(ID, 0);
    addPendingTrack(ID, 1);

    expect(moveDraft(ID, 0, 1, { ...NEW_TRACK })).toBe(false);
    expect(shownSetup(ID).tracks.has(0)).toBe(true);
  });

  /**
   * The one that could take the inspected page down with it.
   *
   * `AnimationState.setAnimation` grows its track array to whatever index it is
   * handed, and both it and this panel's poll then walk the whole thing every
   * frame. A mistyped number must not be able to do that, and there is no way
   * back from it: the row would be at an index nothing can scroll to.
   */
  it('refuses an index past what a skeleton could use', () => {
    addPendingTrack(ID, 0);

    expect(moveDraft(ID, 0, 99_999_999, { ...NEW_TRACK })).toBe(false);
    expect(moveDraft(ID, 0, 33, { ...NEW_TRACK })).toBe(false);
    expect(moveDraft(ID, 0, 32, { ...NEW_TRACK })).toBe(true);
  });

  it('refuses an index that is not one', () => {
    addPendingTrack(ID, 0);

    expect(moveDraft(ID, 0, -1, { ...NEW_TRACK })).toBe(false);
    expect(moveDraft(ID, 0, 1.5, { ...NEW_TRACK })).toBe(false);
    expect(moveDraft(ID, 0, 0, { ...NEW_TRACK })).toBe(false);
  });
});
