import type { StatsRecord } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { appendSamples, emptyDecoded, trimOlderThan } from './decode.js';

const FIELDS = ['fps', 'frameMs', 'drawCalls'];

/** A drained slice, with the page-side extremes every one of them carries. */
function record(
  fields: string[],
  samples: number[][],
  over: Partial<StatsRecord> = {},
): StatsRecord {
  return {
    fields,
    samples,
    min: fields.map(() => 0),
    max: fields.map(() => 0),
    dropped: 0,
    cursor: samples.length,
    startedAt: 0,
    recording: true,
    ...over,
  };
}

/** Long enough that nothing here ages out unless the case is about ageing. */
const FOREVER = 10 ** 9;

describe('appendSamples', () => {
  it('spreads a full row across the fields, in the order they were declared', () => {
    const decoded = appendSamples(
      emptyDecoded(),
      record(FIELDS, [[0, 0b111, 60, 16, 142]]),
      FOREVER,
    );

    expect(decoded.times).toEqual([0]);
    expect(decoded.series.get('fps')).toEqual([60]);
    expect(decoded.series.get('frameMs')).toEqual([16]);
    expect(decoded.series.get('drawCalls')).toEqual([142]);
  });

  it('repeats the last value for a field whose bit is clear', () => {
    const decoded = appendSamples(
      emptyDecoded(),
      record(FIELDS, [
        [0, 0b111, 60, 16, 142],
        [100, 0b100, 150],
        [200, 0b000],
      ]),
      FOREVER,
    );

    expect(decoded.series.get('drawCalls')).toEqual([142, 150, 150]);
    // Neither of these moved after the first row, and every row still has one.
    expect(decoded.series.get('fps')).toEqual([60, 60, 60]);
    expect(decoded.series.get('frameMs')).toEqual([16, 16, 16]);
  });

  it('reads carried values in field order, not in bit order from the end', () => {
    // The trap this guards: a cursor that advanced for every field rather than
    // only for the carried ones puts each series' numbers into its neighbour's,
    // and the charts still look like plausible graphs.
    const decoded = appendSamples(
      emptyDecoded(),
      record(FIELDS, [
        [0, 0b111, 1, 2, 3],
        [100, 0b101, 9, 7],
      ]),
      FOREVER,
    );

    expect(decoded.series.get('fps')).toEqual([1, 9]);
    expect(decoded.series.get('frameMs')).toEqual([2, 2]);
    expect(decoded.series.get('drawCalls')).toEqual([3, 7]);
  });

  it('keeps every series the same length as the times, however sparse the rows', () => {
    const decoded = appendSamples(
      emptyDecoded(),
      record(FIELDS, [
        [0, 0b111, 1, 2, 3],
        [100, 0b001, 4],
        [200, 0b010, 5],
        [300, 0b000],
      ]),
      FOREVER,
    );

    for (const field of FIELDS) {
      expect(decoded.series.get(field)).toHaveLength(decoded.times.length);
    }
  });

  it('carries on where the last drain stopped', () => {
    const decoded = appendSamples(
      emptyDecoded(),
      record(FIELDS, [[0, 0b111, 60, 16, 142]]),
      FOREVER,
    );
    appendSamples(decoded, record(FIELDS, [[100, 0b001, 59]]), FOREVER);

    expect(decoded.times).toEqual([0, 100]);
    expect(decoded.series.get('fps')).toEqual([60, 59]);
    expect(decoded.series.get('drawCalls')).toEqual([142, 142]);
  });

  it('takes a field list of its own length, so a heapless browser is not a hole', () => {
    // The page leaves `heapMB` out of `fields` entirely where the browser has
    // no `performance.memory`, rather than sending a sentinel for it.
    const decoded = appendSamples(
      emptyDecoded(),
      record(['fps', 'heapMB'], [[0, 0b11, 60, 512]]),
      FOREVER,
    );

    expect([...decoded.series.keys()]).toEqual(['fps', 'heapMB']);
  });

  it('changes nothing when a drain brought nothing', () => {
    const decoded = appendSamples(emptyDecoded(), record(FIELDS, []), FOREVER);

    expect(decoded.times).toEqual([]);
    expect(decoded.series.size).toBe(0);
  });
});

describe('appendSamples, the extremes', () => {
  it('takes the low and high from the page rather than from the samples', () => {
    const decoded = appendSamples(
      emptyDecoded(),
      record(FIELDS, [[0, 0b111, 60, 16, 142]], { min: [12, 16, 100], max: [60, 80, 900] }),
      FOREVER,
    );

    expect(decoded.extremes.get('fps')).toEqual({ min: 12, max: 60 });
    expect(decoded.extremes.get('drawCalls')).toEqual({ min: 100, max: 900 });
  });

  /**
   * The whole reason they travel: the peak that caused a stutter has usually
   * scrolled out of everything the panel is holding by the time anyone looks
   * for it, so a figure worked out from the samples would lose exactly the case
   * it is wanted for.
   */
  it('reports a peak the samples no longer contain', () => {
    const decoded = appendSamples(
      emptyDecoded(),
      record(FIELDS, [[0, 0b111, 60, 16, 140]], { max: [60, 16, 900] }),
      FOREVER,
    );

    expect(decoded.series.get('drawCalls')).toEqual([140]);
    expect(decoded.extremes.get('drawCalls')?.max).toBe(900);
  });
});

describe('appendSamples, kept to a window', () => {
  it('drops the ticks older than the window', () => {
    const decoded = emptyDecoded();
    for (let at = 0; at < 6; at += 1) {
      appendSamples(decoded, record(['fps'], [[at * 100, 0b1, at]]), 300);
    }

    expect(decoded.times).toEqual([200, 300, 400, 500]);
    expect(decoded.series.get('fps')).toEqual([2, 3, 4, 5]);
  });

  it('trims every column by the same amount, so a tick keeps its index', () => {
    const decoded = appendSamples(
      emptyDecoded(),
      record(
        ['fps', 'drawCalls'],
        [
          [0, 0b11, 60, 10],
          [100, 0b11, 59, 20],
          [200, 0b11, 58, 30],
        ],
      ),
      100,
    );

    expect(decoded.times).toHaveLength(2);
    for (const field of ['fps', 'drawCalls']) {
      expect(decoded.series.get(field)).toHaveLength(decoded.times.length);
    }
    expect(decoded.series.get('fps')).toEqual([59, 58]);
    expect(decoded.series.get('drawCalls')).toEqual([20, 30]);
  });

  it('leaves a recording that fits alone', () => {
    const decoded = appendSamples(emptyDecoded(), record(['fps'], [[0, 0b1, 60]]), 300);

    expect(decoded.times).toEqual([0]);
  });
});

describe('trimOlderThan', () => {
  it('shortens what is already held, so a narrowed window takes effect at once', () => {
    const decoded = appendSamples(
      emptyDecoded(),
      record(
        ['fps', 'drawCalls'],
        [
          [0, 0b11, 60, 10],
          [100, 0b11, 59, 20],
          [200, 0b11, 58, 30],
        ],
      ),
      1_000,
    );

    expect(decoded.times).toHaveLength(3);

    trimOlderThan(decoded, 100);

    expect(decoded.times).toEqual([100, 200]);
    expect(decoded.series.get('fps')).toEqual([59, 58]);
    expect(decoded.series.get('drawCalls')).toEqual([20, 30]);
  });

  it('leaves an empty recording alone', () => {
    expect(trimOlderThan(emptyDecoded(), 0).times).toEqual([]);
  });
});
