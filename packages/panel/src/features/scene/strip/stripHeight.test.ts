import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LIST_PX,
  HEADER_PX,
  MIN_LIST_PX,
  MIN_TREE_PX,
  clampListHeight,
} from './stripHeight.js';

/** A column with room to spare for both the tree and a list of any size. */
const ROOMY = 600;

describe('clampListHeight', () => {
  it('leaves a height that fits alone', () => {
    expect(clampListHeight(DEFAULT_LIST_PX, ROOMY)).toBe(DEFAULT_LIST_PX);
  });

  it('will not shrink the list below being a list', () => {
    expect(clampListHeight(4, ROOMY)).toBe(MIN_LIST_PX);
  });

  it('leaves the tree its floor however far the divider is dragged', () => {
    expect(clampListHeight(10_000, ROOMY)).toBe(ROOMY - HEADER_PX - MIN_TREE_PX);
  });

  /**
   * The drawer pulled down to almost nothing. Both floors cannot be had, and
   * the one that goes is the list's: the pane is the tree's, and a way back
   * into the tree that has crowded the tree out is not one.
   */
  it('gives the room to the tree when there is not enough for both', () => {
    const tight = HEADER_PX + MIN_TREE_PX + 10;

    expect(clampListHeight(DEFAULT_LIST_PX, tight)).toBe(10);
    expect(clampListHeight(4, tight)).toBe(4);
  });

  it('never asks for a negative height', () => {
    expect(clampListHeight(DEFAULT_LIST_PX, 0)).toBe(0);
    expect(clampListHeight(DEFAULT_LIST_PX, 10)).toBe(0);
  });

  /** A measured column is fractional, and a stored height should not be. */
  it('answers in whole pixels', () => {
    expect(clampListHeight(120.6, ROOMY)).toBe(121);
    expect(clampListHeight(10_000, 718.4000244140625)).toBe(630);
  });
});
