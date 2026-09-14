import { describe, expect, it } from 'vitest';

import { nextCeiling, niceCeiling, peakOf } from './chartScale.js';

describe('niceCeiling', () => {
  it('rounds up the 1-2-5 ladder', () => {
    expect(niceCeiling(0.4)).toBe(0.5);
    expect(niceCeiling(3)).toBe(5);
    expect(niceCeiling(58.3)).toBe(100);
    expect(niceCeiling(142)).toBe(200);
    expect(niceCeiling(1_400)).toBe(2_000);
  });

  it('keeps a floor, so a chart is drawn against what it is meant to reach', () => {
    // A game managing 12 fps is worth seeing against 60: the question is how
    // far short it falls, not what shape the shortfall has.
    expect(niceCeiling(12, 60)).toBe(60);
    expect(niceCeiling(90, 60)).toBe(100);
  });

  it('answers something drawable for nothing, or for nonsense', () => {
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(-5)).toBe(1);
    expect(niceCeiling(Number.NaN)).toBe(1);
    expect(niceCeiling(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('nextCeiling', () => {
  it('rises at once, so a value is never drawn outside the box', () => {
    expect(nextCeiling(200, 640)).toBe(1_000);
  });

  it('does not fall while the data is still near the top', () => {
    expect(nextCeiling(200, 180)).toBe(200);
    expect(nextCeiling(200, 120)).toBe(200);
  });

  it('falls once the peak is well clear, so one spike does not flatten the chart', () => {
    // The previous project never came down: a single stutter to 900 left a
    // steady 140 drawn along the floor for the rest of the session.
    expect(nextCeiling(1_000, 140)).toBe(200);
  });

  it('does not rewrite the axis over a value wobbling around a step', () => {
    let ceiling = 200;
    for (const peak of [101, 99, 102, 98, 100]) ceiling = nextCeiling(ceiling, peak);

    expect(ceiling).toBe(200);
  });
});

describe('peakOf', () => {
  it('finds the largest value', () => {
    expect(peakOf([1, 9, 3])).toBe(9);
  });

  it('answers zero for nothing, and steps over what is not a number', () => {
    expect(peakOf([])).toBe(0);
    expect(peakOf([Number.NaN, Number.POSITIVE_INFINITY, 4])).toBe(4);
  });
});
