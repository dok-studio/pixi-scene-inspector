import { describe, expect, it } from 'vitest';

import { clampSplit, differs } from './splitLayout.js';

/**
 * The library enforces a panel's limits while its handle is dragged and not
 * when the group resizes, so this is what a narrowed drawer runs through.
 */

const LIMITS = { minList: 20, minEditor: 40, maxEditor: 60 };

describe('clampSplit', () => {
  it('leaves a layout that is already within its limits', () => {
    expect(clampSplit([50, 50], LIMITS)).toEqual([50, 50]);
  });

  it('gives the editor its minimum, out of the list', () => {
    expect(clampSplit([70, 30], LIMITS)).toEqual([60, 40]);
  });

  it('holds the editor to its maximum, and hands the rest to the list', () => {
    expect(clampSplit([20, 80], LIMITS)).toEqual([40, 60]);
  });

  /** The list gives way, but not past its own floor. */
  it('stops taking from the list at its minimum', () => {
    expect(clampSplit([10, 90], { minList: 20, minEditor: 40, maxEditor: 100 })).toEqual([20, 80]);
  });

  it('does not let the editor push the list below its minimum', () => {
    expect(clampSplit([5, 95], { minList: 30, minEditor: 40, maxEditor: 95 })).toEqual([30, 70]);
  });

  /**
   * Too narrow for both. Nothing can be honoured, so the two are left in
   * proportion to what they asked for rather than one of them winning.
   */
  it('splits in proportion when the minima do not fit', () => {
    const [list, editor] = clampSplit([50, 50], { minList: 40, minEditor: 80, maxEditor: 90 });

    expect(list + editor).toBeCloseTo(100);
    expect(editor / list).toBeCloseTo(2);
  });
});

describe('differs', () => {
  it('ignores what a round trip through per cent does to the last digit', () => {
    expect(differs([50, 50], [50.001, 49.999])).toBe(false);
    expect(differs([50, 50], [51, 49])).toBe(true);
  });
});
