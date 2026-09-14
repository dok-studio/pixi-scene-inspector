import { describe, expect, it } from 'vitest';

import { readEvents, setEventCapture } from './events.js';
import type { StateListenerLike, TrackEntryLike } from './spine.js';

/**
 * The event log.
 *
 * Spine reports what happens to a track by pushing through a listener; the
 * panel works by pull (rule 3). So the push stops here, in a ring buffer, and
 * the panel reads out of it — which means the two things worth testing are that
 * the listener goes on only while somebody is reading, and that a panel which
 * fell behind is told how much it missed rather than quietly shown a gap.
 */

type Fake = Record<string, unknown>;

function skeletonNode(): Fake {
  const listeners: StateListenerLike[] = [];

  return {
    __listeners: listeners,
    skeleton: { data: { name: 'hero', animations: [], skins: [] } },
    state: {
      tracks: [
        { animation: { name: 'walk', duration: 1.5 }, loop: true, trackTime: 0.5, trackIndex: 0 },
      ],
      addListener: (listener: StateListenerLike) => listeners.push(listener),
      removeListener: (listener: StateListenerLike) => {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      },
    },
  };
}

const listenersOf = (node: Fake): StateListenerLike[] => node['__listeners'] as StateListenerLike[];
const entryOf = (node: Fake): TrackEntryLike =>
  ((node['state'] as Fake)['tracks'] as TrackEntryLike[])[0] as TrackEntryLike;

const fire = (node: Fake, run: (listener: StateListenerLike) => void): void => {
  for (const listener of listenersOf(node)) run(listener);
};

describe('setEventCapture', () => {
  it('puts a listener on only when asked', () => {
    const node = skeletonNode();
    expect(listenersOf(node)).toHaveLength(0);

    setEventCapture(node, true);

    expect(listenersOf(node)).toHaveLength(1);
  });

  it('takes it back off again', () => {
    const node = skeletonNode();

    setEventCapture(node, true);
    setEventCapture(node, false);

    expect(listenersOf(node)).toHaveLength(0);
  });

  /** Which is what a panel that re-mounts does, and would double every line. */
  it('does not install a second listener when asked twice', () => {
    const node = skeletonNode();

    setEventCapture(node, true);
    setEventCapture(node, true);

    expect(listenersOf(node)).toHaveLength(1);
  });

  /**
   * The panel shows one node's log at a time. Turning capture on for the next
   * skeleton takes it off the last, which is what keeps a listener from
   * outliving the section that asked for it.
   */
  it('takes the listener off the skeleton it was watching before', () => {
    const first = skeletonNode();
    const second = skeletonNode();

    setEventCapture(first, true);
    setEventCapture(second, true);

    expect(listenersOf(first)).toHaveLength(0);
    expect(listenersOf(second)).toHaveLength(1);

    setEventCapture(second, false);
  });

  it('does nothing to a node that is not a skeleton', () => {
    expect(setEventCapture({ children: [] }, true)).toBe(false);
  });
});

describe('readEvents', () => {
  it('reports nothing at all while nothing is capturing', () => {
    const node = skeletonNode();

    expect(readEvents(node, 0)).toEqual({ entries: [], dropped: 0, cursor: 0 });
  });

  it('records what happened to a track, with the track and the time', () => {
    const node = skeletonNode();
    setEventCapture(node, true);

    fire(node, (listener) => listener.start?.(entryOf(node)));
    fire(node, (listener) => listener.complete?.(entryOf(node)));

    const { entries } = readEvents(node, 0);
    expect(entries).toEqual([
      { seq: 1, kind: 'start', track: 0, animation: 'walk', time: 0.5 },
      { seq: 2, kind: 'complete', track: 0, animation: 'walk', time: 0.5 },
    ]);

    setEventCapture(node, false);
  });

  it("records the skeleton's own named events with their values", () => {
    const node = skeletonNode();
    setEventCapture(node, true);

    fire(node, (listener) =>
      listener.event?.(entryOf(node), {
        data: { name: 'footstep' },
        intValue: 2,
        floatValue: 0.5,
        stringValue: 'left',
      }),
    );

    expect(readEvents(node, 0).entries[0]).toEqual({
      seq: 1,
      kind: 'event',
      track: 0,
      animation: 'walk',
      time: 0.5,
      name: 'footstep',
      intValue: 2,
      floatValue: 0.5,
      stringValue: 'left',
    });

    setEventCapture(node, false);
  });

  /**
   * Where the playhead was **inside the animation**, the same reading the scrub
   * bar shows. `trackTime` on a looping track counts on for ever, so a footstep
   * keyed at 0.25 would be logged at 43.26 seconds — true of the track and
   * useless about the animation. `seq` is what orders the log.
   */
  it('logs the time inside the animation, not the track clock', () => {
    const node = skeletonNode();
    const entry = entryOf(node) as { trackTime?: number };
    entry.trackTime = 43.25;
    setEventCapture(node, true);

    fire(node, (listener) => listener.start?.(entryOf(node)));

    expect(readEvents(node, 0).entries[0]?.time).toBeCloseTo(43.25 % 1.5, 5);

    setEventCapture(node, false);
  });

  it('gives back only what the reader has not seen', () => {
    const node = skeletonNode();
    setEventCapture(node, true);

    fire(node, (listener) => listener.start?.(entryOf(node)));
    const first = readEvents(node, 0);

    fire(node, (listener) => listener.complete?.(entryOf(node)));
    const second = readEvents(node, first.cursor);

    expect(second.entries.map((event) => event.kind)).toEqual(['complete']);

    setEventCapture(node, false);
  });

  /**
   * A log that says "12 lines missing here" is worth reading. Silently showing
   * a gap is not, and neither is a running total the panel has to remember.
   */
  it('says how many lines the reader missed', () => {
    const node = skeletonNode();
    setEventCapture(node, true);

    for (let index = 0; index < 260; index += 1) {
      fire(node, (listener) => listener.start?.(entryOf(node)));
    }

    const { entries, dropped, cursor } = readEvents(node, 0);
    expect(entries).toHaveLength(200);
    expect(dropped).toBe(60);
    expect(cursor).toBe(260);

    setEventCapture(node, false);
  });

  it('says nothing was missed when the reader is keeping up', () => {
    const node = skeletonNode();
    setEventCapture(node, true);

    fire(node, (listener) => listener.start?.(entryOf(node)));

    expect(readEvents(node, 0).dropped).toBe(0);

    setEventCapture(node, false);
  });
});
