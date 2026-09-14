import { describe, expect, it } from 'vitest';

import { COLUMNS } from './columns.js';
import { fits, floorFor, floorForCount, HANDLE_PX, narrowToFit } from './columnFloor.js';

/** About what a character comes to in the face the panel is usually set in. */
const DIGIT = 7;

describe('floorFor', () => {
  it('gives every column a floor', () => {
    for (const column of COLUMNS) expect(floorFor(column, DIGIT)).toBeGreaterThan(0);
  });

  /* Both are a list beside the same properties pane, and the grid's tile is
     wider than the six characters a name survives at. */
  it('asks more of Assets than of Scene, because a tile is wider than a name', () => {
    expect(floorFor('Assets', DIGIT)).toBeGreaterThan(floorFor('Scene', DIGIT));
  });

  it('grows with the face it is measured in', () => {
    expect(floorFor('Scene', 9)).toBeGreaterThan(floorFor('Scene', 7));
  });
});

describe('floorForCount', () => {
  it('charges a pair for the dearest companion, not the one being shown', () => {
    const dearest = Math.max(floorFor('Assets', DIGIT), floorFor('Stats', DIGIT));
    expect(floorForCount(2, DIGIT)).toBe(floorFor('Scene', DIGIT) + dearest + HANDLE_PX);
  });

  it('counts the rules between columns, not just the columns', () => {
    const panes = COLUMNS.reduce((total, column) => total + floorFor(column, DIGIT), 0);
    expect(floorForCount(3, DIGIT)).toBe(panes + 2 * HANDLE_PX);
  });

  it('charges no rule for a single column', () => {
    expect(floorForCount(1, DIGIT)).toBe(floorFor('Scene', DIGIT));
  });

  it('is nothing at all for nothing at all', () => {
    expect(floorForCount(0, DIGIT)).toBe(0);
  });

  it('grows with the number of columns', () => {
    expect(floorForCount(3, DIGIT)).toBeGreaterThan(floorForCount(2, DIGIT));
  });
});

describe('fits', () => {
  it('lets a set through at exactly the price of its size', () => {
    const floor = floorForCount(2, DIGIT);
    expect(fits(['Scene', 'Assets'], floor, DIGIT)).toBe(true);
    expect(fits(['Scene', 'Assets'], floor - 1, DIGIT)).toBe(false);
  });

  /* The whole point of pricing by size: the cheaper pair is not let through
     any earlier than the dearer one, so a chip is never a dead end. */
  it('asks the same of both pairs, though one of them needs less', () => {
    const floor = floorForCount(2, DIGIT);
    expect(fits(['Scene', 'Stats'], floor - 1, DIGIT)).toBe(false);
    expect(fits(['Scene', 'Stats'], floor, DIGIT)).toBe(true);
    expect(fits(['Scene', 'Assets'], floor, DIGIT)).toBe(true);
  });

  /* Not measured yet is not the same as nothing fits, and the tab is better
     off appearing a frame late than appearing and being taken away. */
  it('says no before anything has been measured', () => {
    expect(fits(['Scene', 'Assets'], 0, DIGIT)).toBe(false);
    expect(fits(['Scene', 'Assets'], 4000, 0)).toBe(false);
  });
});

describe('narrowToFit', () => {
  it('leaves a set that fits exactly as it was', () => {
    const chosen = [...COLUMNS];
    expect(narrowToFit(chosen, 4000, DIGIT)).toBe(chosen);
  });

  it('drops from the right, where the least-wanted column is', () => {
    expect(narrowToFit([...COLUMNS], floorForCount(2, DIGIT), DIGIT)).toEqual(['Scene', 'Assets']);
  });

  /* A panel too narrow even for the anchor and one companion has no answer,
     and pretending otherwise would mean a Custom tab of one column. Whether
     the tab is worth offering at that width is `fits`' question. */
  it('never goes below the anchor and one companion', () => {
    expect(narrowToFit([...COLUMNS], 10, DIGIT)).toEqual(['Scene', 'Assets']);
  });

  it('does nothing before anything has been measured', () => {
    const chosen = [...COLUMNS];
    expect(narrowToFit(chosen, 0, DIGIT)).toBe(chosen);
    expect(narrowToFit(chosen, 800, 0)).toBe(chosen);
  });
});
