import type { SpineEvent } from '@scene-inspector/protocol';

import type { Node } from '../../adapters/types.js';
import {
  asSpine,
  playhead,
  str,
  type StateLike,
  type StateListenerLike,
  type TrackEntryLike,
} from './spine.js';

/**
 * The event log.
 *
 * Spine reports what happens to a track — started, interrupted, ended, looped
 * round, and the skeleton's own named events — through a listener, which is a
 * push. The panel does not work that way (rule 3), so the push stops here: the
 * listener writes into a ring buffer in the page, and the panel pulls out of it
 * whenever it looks. Nothing is lost by not asking, only skipped, and the panel
 * is told how much it skipped.
 *
 * The listener goes on **only while the log is open**, and comes off when it
 * closes. That is the same discipline as the render hook (rule 5): a cost that
 * exists only while something is consuming it.
 *
 * A line's time is where the playhead was **inside the animation**, the same
 * reading the scrub bar shows. The raw `trackTime` would say a footstep keyed
 * at 0.25 happened at 43.26 seconds, which is true of the track and useless
 * about the animation; `seq` is what orders the log.
 */

/** Enough to cover a burst without ever being worth thinking about. */
const CAPACITY = 200;

/**
 * How long a capture goes unread before it takes itself off.
 *
 * The panel turns capture off when the log closes, but it cannot promise to:
 * DevTools can be shut, the tab can be closed, the panel can be reloaded — and
 * any of those leaves a listener on somebody else's `AnimationState` with
 * nothing left that could ever remove it. The panel polls this log while it is
 * open, so "nobody has read it in half a minute" means nobody is listening, and
 * the capture is in a position to notice that itself. No timer is needed: it is
 * checked on the events it would otherwise be recording.
 */
const IDLE_MS = 30_000;

interface Capture {
  listener: StateListenerLike;
  entries: SpineEvent[];
  /** Runs across the whole capture, not just what is still in the buffer. */
  seq: number;
  /** How many have been pushed out of the far end. */
  dropped: number;
  /** When the panel last looked, so an abandoned capture can tell. */
  lastRead: number;
}

/**
 * Held strongly, and deliberately.
 *
 * A capture is a listener installed on somebody else's animation state, and
 * this map is the only way to take it off again. It holds one entry at most:
 * the panel shows one node's log at a time, and turning capture on for a
 * skeleton takes it off every other — which is what keeps a listener from
 * outliving the section that asked for it even if the panel goes away without
 * saying so.
 */
const captures = new Map<StateLike, Capture>();

function stopAllExcept(keep: StateLike | null): void {
  for (const [state, capture] of captures) {
    if (state === keep) continue;

    state.removeListener?.(capture.listener);
    captures.delete(state);
  }
}

interface EventLike {
  data?: { name?: unknown } | null;
  intValue?: unknown;
  floatValue?: unknown;
  stringValue?: unknown;
}

function trackIndexOf(entry: TrackEntryLike, state: StateLike): number {
  const index = (entry as { trackIndex?: unknown }).trackIndex;
  if (typeof index === 'number') return index;

  // `trackIndex` is on every runtime this module serves, but the fallback costs
  // one scan of a list that is never long and removes a way to be wrong.
  return (state.tracks ?? []).indexOf(entry);
}

function push(capture: Capture, event: Omit<SpineEvent, 'seq'>): void {
  capture.seq += 1;
  capture.entries.push({ seq: capture.seq, ...event });

  if (capture.entries.length > CAPACITY) {
    capture.entries.shift();
    capture.dropped += 1;
  }
}

function makeListener(state: StateLike, capture: Capture): StateListenerLike {
  /** @returns whether the capture has just taken itself off — see `IDLE_MS`. */
  const abandoned = (): boolean => {
    if (Date.now() - capture.lastRead < IDLE_MS) return false;

    state.removeListener?.(capture.listener);
    captures.delete(state);
    return true;
  };

  const record =
    (kind: SpineEvent['kind']) =>
    (entry: TrackEntryLike): void => {
      if (abandoned()) return;

      push(capture, {
        kind,
        track: trackIndexOf(entry, state),
        animation: typeof entry.animation?.name === 'string' ? entry.animation.name : null,
        time: playhead(entry),
      });
    };

  return {
    start: record('start'),
    interrupt: record('interrupt'),
    end: record('end'),
    dispose: record('dispose'),
    complete: record('complete'),
    event: (entry: TrackEntryLike, raw: unknown) => {
      if (abandoned()) return;

      const event = (raw ?? {}) as EventLike;

      push(capture, {
        kind: 'event',
        track: trackIndexOf(entry, state),
        animation: typeof entry.animation?.name === 'string' ? entry.animation.name : null,
        time: playhead(entry),
        name: str(event.data?.name, ''),
        ...(typeof event.intValue === 'number' ? { intValue: event.intValue } : {}),
        ...(typeof event.floatValue === 'number' ? { floatValue: event.floatValue } : {}),
        ...(typeof event.stringValue === 'string' ? { stringValue: event.stringValue } : {}),
      });
    },
  };
}

/** @returns whether the state now has a listener, so the caller can say so. */
export function setEventCapture(node: Node, on: boolean): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  const state = spine.state;
  const existing = captures.get(state);

  if (!on) {
    if (existing === undefined) return false;

    state.removeListener?.(existing.listener);
    captures.delete(state);
    return false;
  }

  stopAllExcept(state);

  // Turning it on twice is what a panel that re-mounts does, and installing a
  // second listener would double every line of the log.
  if (existing !== undefined) return true;
  if (typeof state.addListener !== 'function') return false;

  const capture: Capture = {
    listener: {},
    entries: [],
    seq: 0,
    dropped: 0,
    lastRead: Date.now(),
  };
  capture.listener = makeListener(state, capture);

  state.addListener(capture.listener);
  captures.set(state, capture);

  return true;
}

/**
 * What happened since the panel last looked.
 *
 * `dropped` counts only what it *missed* — entries newer than `since` that had
 * already been pushed out of the buffer — rather than everything ever evicted.
 * A log that says "12 lines missing here" is worth reading; a running total
 * against a number the panel would have to remember is not.
 */
export function readEvents(
  node: Node,
  since: number,
): { entries: SpineEvent[]; dropped: number; cursor: number } {
  const spine = asSpine(node);
  const capture = spine === null ? undefined : captures.get(spine.state);
  if (capture === undefined) return { entries: [], dropped: 0, cursor: since };

  capture.lastRead = Date.now();

  const entries = capture.entries.filter((entry) => entry.seq > since);
  const oldest = capture.entries[0]?.seq;
  const dropped = oldest === undefined ? 0 : Math.max(0, oldest - since - 1);

  return { entries, dropped, cursor: capture.seq };
}
