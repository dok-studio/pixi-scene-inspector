import type { StatsRecord } from '@scene-inspector/protocol';

/**
 * Unpacking what a recording sends.
 *
 * A sample is `[msSinceStart, mask, ...values]`, and only the values whose bit
 * is set travel — see `StatsRecord`. Undoing that is three lines of arithmetic
 * and exactly the kind of three lines that go wrong quietly: an off-by-one in
 * the read cursor puts every field's numbers into its neighbour's chart, and
 * the result still looks like a plausible graph.
 *
 * So it lives out here as a function over plain arrays rather than inside the
 * hook that drains the buffer, which is the same split the panel makes wherever
 * a component turned out to be holding real logic.
 *
 * Appended to what is already there rather than returned fresh: a recording is
 * drained a piece at a time and can run to tens of thousands of samples, so
 * rebuilding every series twice a second would be work proportional to the
 * whole recording in order to add ten points to it.
 */

export interface Extremes {
  min: number;
  max: number;
}

export interface Decoded {
  /**
   * `Date.now()` when the page started this recording.
   *
   * With it every tick has a wall clock: `startedAt + times[i]`. Without it the
   * axis could only say how long ago something was, and "two minutes ago" is not
   * a moment anybody can line up against anything else.
   */
  startedAt: number;
  /** Field name to its values, oldest first. The arrays passed in, extended. */
  series: Map<string, number[]>;
  /** The page's own running low and high, which outlive what the buffer holds. */
  extremes: Map<string, Extremes>;
  times: number[];
}

export function appendSamples(into: Decoded, record: StatsRecord, keepMs: number): Decoded {
  const { fields, samples } = record;

  into.startedAt = record.startedAt;

  for (const sample of samples) {
    into.times.push(sample[0] ?? 0);
    const mask = sample[1] ?? 0;

    let read = 2;
    for (const [index, field] of fields.entries()) {
      let values = into.series.get(field);
      if (values === undefined) {
        values = [];
        into.series.set(field, values);
      }

      if ((mask & (1 << index)) === 0) {
        // A bit that is not set means "unchanged", so the row repeats what came
        // before — which is the whole point of the encoding, and why the first
        // sample of a recording always carries a full mask.
        values.push(values[values.length - 1] ?? 0);
        continue;
      }

      values.push(sample[read] ?? 0);
      read += 1;
    }
  }

  /*
   * The lowest and highest are taken from the page, not worked out here.
   *
   * The page keeps them from the moment it started and never lets eviction
   * touch them, which is the only way the figure survives the thing it is
   * wanted for: after a stutter, the peak that caused it has usually already
   * scrolled out of everything the panel is holding.
   */
  for (const [index, field] of fields.entries()) {
    const min = record.min[index];
    const max = record.max[index];
    if (min === undefined || max === undefined) continue;

    into.extremes.set(field, { min, max });
  }

  return trimOlderThan(into, keepMs);
}

/**
 * Drops whatever is older than `keepMs` before the newest sample held.
 *
 * Trimmed by age rather than by count, and by the page's own timestamps.
 *
 * The panel had no limit at all before: the page evicts, but this side kept
 * everything it had ever drained, so a panel left open all afternoon grew a
 * column per chart without any ceiling. Using the same duration the page was
 * asked for makes it one number to reason about rather than two — and reading
 * it off the timestamps means the panel never has to know the page's sample
 * rate.
 *
 * Besides a drain, this is what a **shortened** window runs: the page is
 * retuned rather than restarted, so everything already collected stays, and
 * some of it is now older than the user has just asked to be shown.
 */
export function trimOlderThan(into: Decoded, keepMs: number): Decoded {
  const newest = into.times[into.times.length - 1];
  if (newest === undefined) return into;

  let over = 0;
  while (over < into.times.length && newest - (into.times[over] ?? 0) > keepMs) over += 1;

  if (over > 0) {
    into.times.splice(0, over);
    // Every column by the same amount, so a tick keeps meaning one index in all
    // of them.
    for (const values of into.series.values()) values.splice(0, over);
  }

  return into;
}

export function emptyDecoded(): Decoded {
  return {
    startedAt: 0,
    series: new Map<string, number[]>(),
    extremes: new Map<string, Extremes>(),
    times: [],
  };
}
