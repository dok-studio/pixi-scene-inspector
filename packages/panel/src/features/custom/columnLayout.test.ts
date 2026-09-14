import { describe, expect, it } from 'vitest';

import { clampColumns, differs } from './columnLayout.js';

const sum = (sizes: readonly number[]): number => sizes.reduce((total, size) => total + size, 0);

describe('clampColumns', () => {
  it('leaves a layout that is already inside its limits', () => {
    expect(clampColumns([40, 30, 30], [20, 20, 20])).toEqual([40, 30, 30]);
  });

  it('always hands back a hundred', () => {
    for (const layout of [
      [10, 80, 10],
      [1, 1, 98],
      [33, 33, 34],
    ]) {
      expect(sum(clampColumns(layout, [25, 25, 25]))).toBeCloseTo(100);
    }
  });

  it('lifts a column that has been squeezed below its floor', () => {
    const [first, second] = clampColumns([95, 5], [20, 30]);
    expect(second).toBeCloseTo(30);
    expect(first).toBeCloseTo(70);
  });

  /* Giving one column its floor takes room from the others, which can push a
     second below its own — so the floors are honoured one pass at a time. */
  it('honours a second floor that the first one broke', () => {
    const sizes = clampColumns([90, 5, 5], [20, 30, 30]);
    expect(sizes[1]).toBeGreaterThanOrEqual(30 - 0.01);
    expect(sizes[2]).toBeGreaterThanOrEqual(30 - 0.01);
    expect(sum(sizes)).toBeCloseTo(100);
  });

  it('spends what is over on the column that had the most', () => {
    const sizes = clampColumns([80, 10, 10], [10, 30, 30]);
    expect(sizes[0]).toBeGreaterThan(sizes[1] ?? 0);
    expect(sum(sizes)).toBeCloseTo(100);
  });

  /* There is nothing else to do with a width that small, and it is what the
     two-panel split already does. */
  it('leaves the columns in proportion when the floors cannot all be met', () => {
    const sizes = clampColumns([33, 33, 34], [30, 30, 60]);
    expect(sizes).toEqual([25, 25, 50]);
  });

  it('divides evenly when the layout says nothing at all', () => {
    expect(clampColumns([0, 0], [10, 10])).toEqual([50, 50]);
  });

  it('falls back to the floors when the layout is the wrong length', () => {
    expect(sum(clampColumns([50, 50], [20, 20, 20]))).toBeCloseTo(100);
    expect(clampColumns([50, 50], [20, 20, 20])).toHaveLength(3);
  });

  it('has nothing to say about no columns', () => {
    expect(clampColumns([], [])).toEqual([]);
  });
});

describe('differs', () => {
  it('ignores a difference too small to see', () => {
    expect(differs([50, 50], [50.005, 49.995])).toBe(false);
  });

  it('notices a real move', () => {
    expect(differs([50, 50], [60, 40])).toBe(true);
  });

  it('counts a changed number of columns as a difference', () => {
    expect(differs([50, 50], [33, 33, 34])).toBe(true);
  });
});
