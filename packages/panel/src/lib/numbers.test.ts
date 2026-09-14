import { describe, expect, it } from 'vitest';

import { formatNumber, normalizeNumberInput, parseSimpleExpression } from './formatNumber.js';
import { computeNextNumberValue, getStepFromEvent } from './numberStep.js';

/**
 * Characterization tests for the number handling ported from the previous
 * project. They are written after the code rather than before it on purpose:
 * the behaviour is not being designed here, it is being carried over, and these
 * pin down what "carried over unchanged" means.
 *
 * This is the layer every property editor sits on, and all of it is pure — so
 * unlike the components above it, it can be held still.
 */

describe('formatNumber', () => {
  it('drops the fraction when there is none', () => {
    expect(formatNumber(2)).toBe('2');
  });

  it('drops trailing zeros', () => {
    expect(formatNumber(1.23)).toBe('1.23');
  });

  /**
   * The zeros are the number's own, not a fraction's: asking for no decimals
   * leaves no point for the trailing-zero rule to start from, and a hundred
   * came back as "1".
   */
  it('keeps a whole number whole when no fraction is asked for', () => {
    expect(formatNumber(100, 0)).toBe('100');
    expect(formatNumber(50, 0)).toBe('50');
    expect(formatNumber(99.6, 0)).toBe('100');
  });

  it('rounds to three places by default', () => {
    expect(formatNumber(0.30000000000000004)).toBe('0.3');
  });

  it('honours a wider fraction when asked', () => {
    expect(formatNumber(1.23456, 5)).toBe('1.23456');
  });

  it('renders a value that is not a number as empty', () => {
    expect(formatNumber(Number.NaN)).toBe('');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('keeps the sign', () => {
    expect(formatNumber(-1.5)).toBe('-1.5');
  });
});

describe('normalizeNumberInput', () => {
  it('accepts a decimal comma', () => {
    expect(normalizeNumberInput('1,5')).toBe('1.5');
  });

  it('keeps a leading minus and drops the rest', () => {
    expect(normalizeNumberInput('-1-2')).toBe('-12');
  });

  it('drops anything that is not part of a number', () => {
    expect(normalizeNumberInput('12px')).toBe('12');
  });
});

/**
 * A number field accepts `120 + 40`. Deliberately not a general evaluator —
 * two operands and one operator is the whole grammar.
 */
describe('parseSimpleExpression', () => {
  it('adds', () => {
    expect(parseSimpleExpression('120 + 40')).toBe(160);
  });

  it('subtracts', () => {
    expect(parseSimpleExpression('120-40')).toBe(80);
  });

  it('multiplies', () => {
    expect(parseSimpleExpression('1.5 * 4')).toBe(6);
  });

  it('divides', () => {
    expect(parseSimpleExpression('10 / 4')).toBe(2.5);
  });

  it('accepts a decimal comma on either side', () => {
    expect(parseSimpleExpression('1,5 + 1,5')).toBe(3);
  });

  it('refuses to divide by zero rather than returning Infinity', () => {
    expect(parseSimpleExpression('1 / 0')).toBeNull();
  });

  it('rejects a plain number — that is the caller’s other path', () => {
    expect(parseSimpleExpression('42')).toBeNull();
  });

  it('rejects anything longer than one operation', () => {
    expect(parseSimpleExpression('1 + 2 + 3')).toBeNull();
  });

  it('rejects text', () => {
    expect(parseSimpleExpression('alert(1)')).toBeNull();
  });
});

describe('getStepFromEvent', () => {
  const keys = { shiftKey: false, ctrlKey: false, metaKey: false };

  it('uses the base step with no modifier', () => {
    expect(getStepFromEvent(keys, { baseStep: 2 })).toBe(2);
  });

  it('makes Shift coarse', () => {
    expect(getStepFromEvent({ ...keys, shiftKey: true }, { baseStep: 2 })).toBe(20);
  });

  it('makes Ctrl fine', () => {
    expect(getStepFromEvent({ ...keys, ctrlKey: true }, { baseStep: 2 })).toBeCloseTo(0.2);
  });

  it('treats Cmd like Ctrl', () => {
    expect(getStepFromEvent({ ...keys, metaKey: true }, { baseStep: 1 })).toBeCloseTo(0.1);
  });

  it('lets Shift win when both are held', () => {
    expect(getStepFromEvent({ ...keys, shiftKey: true, ctrlKey: true }, { baseStep: 1 })).toBe(10);
  });
});

describe('computeNextNumberValue', () => {
  it('steps up and down', () => {
    expect(computeNextNumberValue(5, 1, 2)).toBe(7);
    expect(computeNextNumberValue(5, -1, 2)).toBe(3);
  });

  it('clamps to the minimum', () => {
    expect(computeNextNumberValue(0.05, -1, 0.1, { min: 0 })).toBe(0);
  });

  it('clamps to the maximum', () => {
    expect(computeNextNumberValue(0.95, 1, 0.1, { max: 1 })).toBe(1);
  });

  /** Alpha steps by 0.1 and must not land on 0.30000000000000004. */
  it('rounds away floating point noise when told the precision', () => {
    expect(computeNextNumberValue(0.2, 1, 0.1, { precision: 3 })).toBe(0.3);
  });

  it('leaves the value alone when no precision is given', () => {
    expect(computeNextNumberValue(0.2, 1, 0.1)).toBeCloseTo(0.3);
  });
});
