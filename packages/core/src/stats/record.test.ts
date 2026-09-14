import { describe, expect, it } from 'vitest';

import { createRecorder } from './record.js';

const FIELDS = ['fps', 'frameMs', 'drawCalls'] as const;

/** A minute of history, at whatever rate the caller pushes. */
const KEEP_MS = 60_000;

function recorder(keepMs = KEEP_MS) {
  return createRecorder([...FIELDS], 1_700_000_000_000, 0, keepMs);
}

describe('createRecorder', () => {
  it('gives the first sample a full mask, so a reader has a complete row', () => {
    const log = recorder();
    log.push(0, [60, 16, 142]);

    expect(log.read(0, 0).samples).toEqual([[0, 0b111, 60, 16, 142]]);
  });

  it('carries only the fields that moved', () => {
    const log = recorder();
    log.push(0, [60, 16, 142]);
    log.push(100, [60, 16, 150]);
    log.push(200, [59, 16, 150]);

    expect(log.read(0, 0).samples).toEqual([
      [0, 0b111, 60, 16, 142],
      [100, 0b100, 150],
      [200, 0b001, 59],
    ]);
  });

  it('writes a row even when nothing moved, so a gap is not mistaken for a stall', () => {
    const log = recorder();
    log.push(0, [60, 16, 142]);
    log.push(100, [60, 16, 142]);

    expect(log.read(0, 0).samples[1]).toEqual([100, 0]);
  });

  it('drains by cursor, handing back only what is new', () => {
    const log = recorder();
    log.push(0, [60, 16, 142]);
    log.push(100, [59, 16, 142]);

    const first = log.read(0, 0);
    expect(first.cursor).toBe(2);

    log.push(200, [58, 16, 142]);
    const second = log.read(first.cursor, 0);

    expect(second.samples).toEqual([[200, 0b001, 58]]);
    expect(second.dropped).toBe(0);
  });

  it('reports what a reader missed rather than closing over it', () => {
    // Half a second of history, pushed for a second and a half.
    const log = createRecorder([...FIELDS], 0, 0, 500);
    for (let i = 0; i < 16; i += 1) log.push(i * 100, [60, 16, i]);

    // Asked from the very beginning, but the oldest have aged out.
    expect(log.read(0, 0).dropped).toBeGreaterThan(0);
    // Asked from where the buffer now starts: nothing missed.
    expect(log.read(log.read(0, 0).cursor, 0).dropped).toBe(0);
  });

  it('keeps the oldest sample complete after eviction', () => {
    const log = createRecorder([...FIELDS], 0, 0, 500);
    log.push(0, [60, 16, 142]);
    for (let i = 1; i < 10; i += 1) log.push(i * 100, [60, 16, 142 + i]);

    const oldest = log.read(0, 0).samples[0];

    // `fps` and `frameMs` never changed after the first sample, so without
    // folding the evicted row into this one they would be missing entirely and
    // a panel starting here would have no value for them at all.
    expect(oldest?.[1]).toBe(0b111);
    expect(oldest?.slice(2)).toEqual([60, 16, 146]);
  });

  it('takes itself off once nobody has drained it for a minute', () => {
    const log = createRecorder([...FIELDS], 0, 0, KEEP_MS);

    expect(log.expired(59_000)).toBe(false);
    expect(log.expired(60_000)).toBe(true);

    log.read(0, 60_000);
    expect(log.expired(90_000)).toBe(false);
  });

  it('remembers the lowest and highest of each field', () => {
    const log = recorder();
    log.push(0, [60, 16, 100]);
    log.push(100, [12, 80, 300]);
    log.push(200, [59, 17, 200]);

    const read = log.read(0, 0);
    expect(read.min).toEqual([12, 16, 100]);
    expect(read.max).toEqual([60, 80, 300]);
  });

  /**
   * The one figure a person looks for after a stutter is the peak, and by the
   * time they look it has usually scrolled out of the buffer. Working it out
   * from the samples would lose exactly the case it is wanted for.
   */
  it('keeps them after the sample that set them has aged out', () => {
    const log = createRecorder([...FIELDS], 0, 0, 300);
    log.push(0, [60, 16, 900]);
    for (let at = 1; at <= 20; at += 1) log.push(at * 100, [60, 16, 140]);

    const read = log.read(0, 0);
    // The spike is long gone from the rows.
    expect(read.samples.some((sample) => sample.includes(900))).toBe(false);
    expect(read.max[2]).toBe(900);
  });

  /**
   * A zero is almost never a measurement for these: frames a second, frame
   * time and draw calls all read nought while the scene is not drawing, and a
   * low of nought is what the chart then reported for ever.
   */
  it('takes the smallest reading that is not nought as the low', () => {
    const log = recorder();
    log.push(0, [0, 0, 0]);
    log.push(100, [60, 16, 140]);
    log.push(200, [0, 0, 0]);
    log.push(300, [48, 21, 900]);

    expect(log.read(0, 0).min).toEqual([48, 16, 140]);
  });

  it('keeps a nought where nothing else ever arrives', () => {
    const log = recorder();
    log.push(0, [0, 16, 100]);
    log.push(100, [0, 17, 110]);

    expect(log.read(0, 0).min[0]).toBe(0);
  });

  it('retunes a running recording rather than restarting it', () => {
    const log = recorder();
    log.push(0, [60, 16, 100]);
    log.keep(60_000);

    expect(log.read(0, 0).samples).toHaveLength(1);
  });

  it('reports the fields, so the panel never hard-codes their order', () => {
    expect(recorder().read(0, 0).fields).toEqual(['fps', 'frameMs', 'drawCalls']);
  });
});
