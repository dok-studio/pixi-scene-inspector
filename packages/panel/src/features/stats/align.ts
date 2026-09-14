/**
 * Putting a series onto somebody else's timeline.
 *
 * Every chart in the tab is drawn against **one** clock, so that a stutter in
 * the frame time sits directly above the moment a texture was loaded. The
 * readings behind them do not arrive at one rate — frames are polled ten times
 * a second, textures and the scene tree once — and while a recording is running
 * the panel may not have been on screen to take some of them at all.
 *
 * The rule is the obvious one and it is only about drawing: where a series has
 * no reading for a tick, the last one it does have stands in. Nothing is stored
 * that way; the recording keeps only what was actually measured.
 */

/**
 * The slice of a series that one screenful shows.
 *
 * A recording is not squeezed into the width of the chart. The step stays what
 * it is live — one sample per fixed number of pixels — and a longer history is
 * looked at by moving along it. Squeezing was the alternative and it is worse
 * the moment it matters: ten minutes across six hundred pixels is a sample
 * every tenth of a pixel, so every stutter worth finding is averaged into the
 * line beside it, and the chart gets steadily less useful the longer you leave
 * it running.
 *
 * @param total how many ticks the timeline has, which is not the same as how
 * many readings this series has — see `carryForward`.
 * @param start the first tick to draw, in timeline coordinates.
 */
export function windowOf(
  values: readonly number[],
  total: number,
  start: number,
  size: number,
): number[] {
  if (values.length === 0 || size <= 0 || total <= 0) return [];

  const from = Math.max(0, Math.min(start, total - 1));
  const to = Math.min(total, from + size);
  const last = values.length - 1;

  const out: number[] = [];
  // Past the end of what this series has, its last reading stands — the same
  // rule as everywhere else here, applied one tick at a time so that a window
  // sitting entirely inside the measured part costs nothing extra.
  for (let at = from; at < to; at += 1) out.push(values[Math.min(at, last)] ?? 0);

  return out;
}

export function carryForward(values: readonly number[], length: number): number[] {
  if (length <= 0) return [];

  // Nothing measured is not the same as a measurement of nought, and a flat
  // line along the floor is what a chart draws for the second one. A series
  // with nothing in it stays empty and its chart stays blank.
  if (values.length === 0) return [];

  if (values.length === length) return [...values];

  // Longer than the timeline: the newest readings are the ones that fit, the
  // same end a chart draws from.
  if (values.length > length) return values.slice(values.length - length);

  const last = values[values.length - 1] ?? 0;

  return [...values, ...(Array<number>(length - values.length).fill(last) as number[])];
}

/**
 * A long series squeezed into a few hundred buckets, by **peak**.
 *
 * For the overview strip, where the whole recording has to fit whatever the
 * charts themselves refuse to squeeze. Averaging would be the obvious way and
 * the wrong one: the strip exists to be looked at for the spikes, and averaging
 * is exactly the operation that removes them. A bucket answers with the worst
 * thing that happened in it, which is what somebody scanning for trouble is
 * scanning for.
 */
export function peaks(values: readonly number[], buckets: number): number[] {
  if (values.length === 0 || buckets <= 0) return [];
  if (values.length <= buckets) return [...values];

  const out: number[] = [];
  for (let at = 0; at < buckets; at += 1) {
    const from = Math.floor((at * values.length) / buckets);
    const to = Math.max(from + 1, Math.floor(((at + 1) * values.length) / buckets));

    let peak = values[from] ?? 0;
    for (let index = from + 1; index < to; index += 1) peak = Math.max(peak, values[index] ?? 0);

    out.push(peak);
  }

  return out;
}
