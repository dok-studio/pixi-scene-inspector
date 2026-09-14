import type { StatsRecord } from '@scene-inspector/protocol';

/**
 * The recording buffer.
 *
 * A ring in the page, with a cursor the panel drains by — the same shape as the
 * Spine event log (`scene/spine/events.ts`), and for the same reason: the panel
 * pulls, so nothing may depend on it having asked. What it did not ask for in
 * time is reported as `dropped` rather than silently closed over.
 *
 * **A sample carries the time and only what moved.** Values are rounded before
 * they are compared, and that is not cosmetic: an unrounded frame time changes
 * in the twelfth decimal every single sample, so without rounding "only what
 * changed" would be every field every time and the encoding would save nothing.
 *
 * The invariant that makes a partial read safe: **the oldest sample in the
 * buffer always carries a full mask.** A reader starting from nothing has a
 * complete row to build on. Eviction preserves it by folding the departing
 * sample's values into the one behind it, which costs one pass over the fields
 * and removes the need for keyframes.
 */

/**
 * The lowest and highest each field has reached, and they outlive eviction.
 *
 * Kept beside the ring rather than worked out from it: the ring holds the last
 * few minutes, so a peak from before that is gone from the samples, and the one
 * number a person looks for after a stutter is exactly the peak that has since
 * scrolled off.
 */
interface Extremes {
  min: number[];
  max: number[];
}

/**
 * The low, taking **the smallest reading that is not nought**.
 *
 * A zero here is almost never a measurement. Frames a second, frame time and
 * draw calls all read nought while the scene is not drawing — at start-up, on a
 * paused game, between screens — and a low of nought is what every one of those
 * charts reported for ever after, which answers nothing. What is worth knowing
 * is how bad it got *while it was running*.
 *
 * A zero still stands where nothing else ever arrives, so a chart that is
 * honestly always nought says so.
 *
 * The panel keeps its own extremes by the same rule (`stats/history.ts`), and
 * has to: the two are merged, so a nought from either side would win. Four
 * lines said twice rather than a module shared across the bridge.
 */
function lower(current: number | undefined, value: number): number {
  if (current === undefined) return value;
  if (value === 0) return current;
  if (current === 0) return value;

  return Math.min(current, value);
}

/**
 * How long a recording goes undrained before it takes itself off.
 *
 * The panel stops recording when the switch goes off, but it cannot promise to:
 * DevTools can be shut and the panel reloaded, and either would leave the
 * render hook on with nothing left that could remove it. A minute is long
 * enough that looking at another tab never trips it — the drain lives in the
 * shell, not in the Stats tab — and short enough that a closed DevTools does.
 */
const IDLE_MS = 60_000;

interface Entry {
  seq: number;
  /** `[msSinceStart, mask, ...values]` — see `StatsRecord`. */
  sample: number[];
}

export interface Recorder {
  /** @param at milliseconds since the recording started. */
  push(at: number, values: readonly number[]): void;
  /** How far back to keep. Older samples are dropped on the next push. */
  keep(ms: number): void;
  read(since: number, now: number): StatsRecord;
  /** Whether it has taken itself off for want of a reader. */
  expired(now: number): boolean;
  readonly fields: readonly string[];
}

function maskOf(values: readonly number[], previous: readonly number[] | null): number {
  if (previous === null) return (1 << values.length) - 1;

  let mask = 0;
  for (const [index, value] of values.entries()) {
    if (value !== previous[index]) mask |= 1 << index;
  }

  return mask;
}

function encode(at: number, values: readonly number[], mask: number): number[] {
  const sample = [at, mask];
  for (const [index, value] of values.entries()) {
    if ((mask & (1 << index)) !== 0) sample.push(value);
  }

  return sample;
}

/**
 * Folds `going`'s values into `staying`, for the fields `staying` does not
 * carry — so the buffer's new oldest sample is complete.
 */
function absorb(going: number[], staying: number[], count: number): void {
  const goingMask = going[1] ?? 0;
  const stayingMask = staying[1] ?? 0;
  const missing = goingMask & ~stayingMask;
  if (missing === 0) return;

  const merged = stayingMask | missing;
  const rebuilt = [staying[0] ?? 0, merged];

  let goingAt = 2;
  let stayingAt = 2;
  for (let index = 0; index < count; index += 1) {
    const bit = 1 << index;
    const inGoing = (goingMask & bit) !== 0;
    const inStaying = (stayingMask & bit) !== 0;

    if (inStaying) rebuilt.push(staying[stayingAt] ?? 0);
    else if (inGoing) rebuilt.push(going[goingAt] ?? 0);

    if (inGoing) goingAt += 1;
    if (inStaying) stayingAt += 1;
  }

  staying.length = 0;
  staying.push(...rebuilt);
}

export function createRecorder(
  fields: readonly string[],
  startedAt: number,
  now: number,
  keepMs: number,
): Recorder {
  const entries: Entry[] = [];
  const extremes: Extremes = { min: [], max: [] };
  let previous: number[] | null = null;
  let seq = 0;
  let lastRead = now;
  let window = keepMs;

  return {
    fields,

    keep(ms) {
      window = ms;
    },

    push(at, values) {
      for (const [index, value] of values.entries()) {
        const high = extremes.max[index];
        extremes.min[index] = lower(extremes.min[index], value);
        extremes.max[index] = high === undefined ? value : Math.max(high, value);
      }

      const mask = maskOf(values, previous);

      // A sample where nothing moved is still worth a row: the chart needs to
      // know the recording was running, and an empty mask costs two numbers.
      seq += 1;
      entries.push({ seq, sample: encode(at, values, mask) });
      previous = [...values];

      // Evicted by age rather than by count: the panel asks for a duration, so
      // that is the thing to hold to, and it bounds the memory by itself.
      while (entries.length > 1 && at - (entries[0]?.sample[0] ?? at) > window) {
        const going = entries.shift();
        const staying = entries[0];
        if (going !== undefined && staying !== undefined) {
          absorb(going.sample, staying.sample, fields.length);
        }
      }
    },

    read(since, at) {
      lastRead = at;

      const samples = entries.filter((entry) => entry.seq > since).map((entry) => entry.sample);
      const oldest = entries[0]?.seq;

      return {
        fields: [...fields],
        samples,
        // Only what this reader missed — entries newer than `since` that had
        // already been pushed out. A running total against a number the panel
        // would have to remember is not worth reading.
        dropped: oldest === undefined ? 0 : Math.max(0, oldest - since - 1),
        min: [...extremes.min],
        max: [...extremes.max],
        cursor: seq,
        startedAt,
        recording: true,
      };
    },

    expired(at) {
      return at - lastRead >= IDLE_MS;
    },
  };
}
