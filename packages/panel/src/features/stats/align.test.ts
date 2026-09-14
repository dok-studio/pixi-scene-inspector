import { describe, expect, it } from 'vitest';

import { carryForward, peaks, windowOf } from './align.js';

describe('carryForward', () => {
  it('leaves a series that already fits alone', () => {
    expect(carryForward([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it('repeats the last reading for the ticks it has none for', () => {
    expect(carryForward([1, 2], 5)).toEqual([1, 2, 2, 2, 2]);
  });

  /**
   * What a hidden tab looks like: the recording ran on, the panel took no
   * readings, and on its return the gap is filled with what was true when it
   * left rather than with a hole or a zero.
   */
  it('fills a long gap with the reading that stood before it', () => {
    expect(carryForward([7], 4)).toEqual([7, 7, 7, 7]);
  });

  it('keeps the newest readings when there are more than the timeline holds', () => {
    expect(carryForward([1, 2, 3, 4, 5], 2)).toEqual([4, 5]);
  });

  /**
   * Nothing measured is not a measurement of nought, and padding with zeros
   * would draw a confident line along the floor for a chart that has no data.
   */
  it('stays empty rather than inventing a floor', () => {
    expect(carryForward([], 5)).toEqual([]);
  });

  it('has nothing to draw against an empty timeline', () => {
    expect(carryForward([1, 2, 3], 0)).toEqual([]);
    expect(carryForward([1, 2, 3], -1)).toEqual([]);
  });

  it('hands back a copy, so drawing from it is not a race with filling it', () => {
    const values = [1, 2, 3];
    const aligned = carryForward(values, 3);
    values.push(4);

    expect(aligned).toEqual([1, 2, 3]);
  });
});

describe('windowOf', () => {
  const VALUES = [10, 20, 30, 40, 50, 60];

  it('takes the ticks the window covers', () => {
    expect(windowOf(VALUES, 6, 1, 3)).toEqual([20, 30, 40]);
  });

  it('keeps the step when the window runs past the end of the timeline', () => {
    expect(windowOf(VALUES, 6, 4, 4)).toEqual([50, 60]);
  });

  it('carries the last reading forward past what the series measured', () => {
    // The timeline is longer than this series: the panel was not on screen for
    // the last four ticks, so the reading that stood is what they show.
    expect(windowOf([10, 20], 6, 0, 6)).toEqual([10, 20, 20, 20, 20, 20]);
  });

  it('draws a window that sits entirely inside the carried-forward tail', () => {
    expect(windowOf([10, 20], 6, 3, 2)).toEqual([20, 20]);
  });

  it('clamps a start beyond the timeline rather than answering nothing', () => {
    expect(windowOf(VALUES, 6, 99, 3)).toEqual([60]);
    expect(windowOf(VALUES, 6, -5, 2)).toEqual([10, 20]);
  });

  it('has nothing to draw without readings, a size or a timeline', () => {
    expect(windowOf([], 6, 0, 3)).toEqual([]);
    expect(windowOf(VALUES, 6, 0, 0)).toEqual([]);
    expect(windowOf(VALUES, 0, 0, 3)).toEqual([]);
  });
});

describe('peaks', () => {
  it('answers each bucket with the worst thing that happened in it', () => {
    expect(peaks([1, 9, 2, 3, 8, 4], 3)).toEqual([9, 3, 8]);
  });

  /**
   * The strip is scanned for spikes, and averaging is precisely the operation
   * that removes them.
   */
  it('keeps a lone spike that an average would have swallowed', () => {
    const flat = Array<number>(100).fill(10);
    flat[42] = 900;

    expect(peaks(flat, 10)).toContain(900);
  });

  it('leaves a series that already fits alone', () => {
    expect(peaks([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('has nothing to draw without readings or buckets', () => {
    expect(peaks([], 10)).toEqual([]);
    expect(peaks([1, 2, 3], 0)).toEqual([]);
  });
});
