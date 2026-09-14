import { describe, expect, it } from 'vitest';

import { createSeries } from './series.js';

describe('createSeries', () => {
  it('keeps what it is given, oldest first', () => {
    const series = createSeries(4);
    series.push(1);
    series.push(2);

    expect(series.values()).toEqual([1, 2]);
    expect(series.length).toBe(2);
  });

  it('rotates once full, so an afternoon costs what the first minute did', () => {
    const series = createSeries(3);
    for (const value of [1, 2, 3, 4, 5]) series.push(value);

    expect(series.values()).toEqual([3, 4, 5]);
    expect(series.length).toBe(3);
  });

  it('hands back a copy, so drawing from it is not a race with filling it', () => {
    const series = createSeries(3);
    series.push(1);

    const taken = series.values();
    series.push(2);

    expect(taken).toEqual([1]);
  });

  it('empties on clear', () => {
    const series = createSeries(3);
    series.push(1);
    series.clear();

    expect(series.values()).toEqual([]);
    expect(series.length).toBe(0);
  });
});
