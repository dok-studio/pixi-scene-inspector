import { describe, expect, it } from 'vitest';

import { MAX_DIGITS, MIN_DIGITS, paneWidthForDigits } from './paneWidth.js';

/**
 * The pane's width is a number of characters, not a number of pixels: the
 * row's own label is set in `ch`, so the same panel is wider in one mono face
 * than in another, and so is what fits in the field beside it.
 */

/** What a fallback mono measures at the panel's 12px, near enough. */
const NARROW = 6.47;

/** What Cascadia Code, which the panel asks for first, measures at the same. */
const WIDE = 7.2;

describe('paneWidthForDigits', () => {
  it('asks for more in a wider face, for the same number of digits', () => {
    expect(paneWidthForDigits(MIN_DIGITS, WIDE)).toBeGreaterThan(
      paneWidthForDigits(MIN_DIGITS, NARROW),
    );
  });

  it('asks for more digits with more room, two fields at a time', () => {
    const five = paneWidthForDigits(5, NARROW);
    const six = paneWidthForDigits(6, NARROW);

    // One digit in each of `x` and `y`.
    expect(six - five).toBeCloseTo(2 * NARROW, 0);
  });

  /**
   * The figures the constants were measured against: in a fallback mono the pane
   * held five digits in each axis at 275px and eight at 314px, a scrolling pane
   * included. What sent this to characters in the first place was that a fixed
   * 16rem showed five in the Text tab and four under Properties.
   */
  it('reproduces what was measured on the stand', () => {
    expect(paneWidthForDigits(MIN_DIGITS, NARROW)).toBe(275);
    expect(paneWidthForDigits(MAX_DIGITS, NARROW)).toBe(314);
  });

  it('leaves room to grow between the two ends', () => {
    expect(paneWidthForDigits(MAX_DIGITS, WIDE)).toBeGreaterThan(
      paneWidthForDigits(MIN_DIGITS, WIDE),
    );
  });
});
