import { describe, expect, it } from 'vitest';

import type { NodeCounts } from '../../../lib/nodeCounts.js';
import { countRows, TOTAL_ROW } from './rows.js';

const SCENE: NodeCounts = {
  types: [
    { type: 'Container', count: 541 },
    { type: 'Spine', count: 46 },
    { type: 'Text', count: 45 },
  ],
  total: 632,
  filtered: 0,
  masked: 0,
};

const NODE: NodeCounts = {
  types: [
    { type: 'Container', count: 12 },
    { type: 'Text', count: 3 },
  ],
  total: 15,
  filtered: 0,
  masked: 0,
};

describe('countRows', () => {
  it('puts the total first, among the types rather than above them', () => {
    expect(countRows('scene', SCENE, NODE)[0]).toEqual({
      type: TOTAL_ROW,
      count: 632,
      share: null,
    });
  });

  it('shows the scene alone, with nothing to compare against', () => {
    expect(countRows('scene', SCENE, NODE)).toEqual([
      { type: 'Total', count: 632, share: null },
      { type: 'Container', count: 541, share: null },
      { type: 'Spine', count: 46, share: null },
      { type: 'Text', count: 45, share: null },
    ]);
  });

  it('totals the selection, not the scene, when the selection is what is shown', () => {
    const rows = countRows('node', SCENE, NODE);

    expect(rows[0]).toEqual({ type: TOTAL_ROW, count: 15, share: null });
    expect(rows.map((row) => row.type)).toEqual([TOTAL_ROW, 'Container', 'Text']);
  });

  it('pairs each scene count with the selection’s share of it', () => {
    expect(countRows('both', SCENE, NODE)).toEqual([
      { type: 'Total', count: 632, share: 15 },
      { type: 'Container', count: 541, share: 12 },
      { type: 'Spine', count: 46, share: 0 },
      { type: 'Text', count: 45, share: 3 },
    ]);
  });

  /**
   * The reason `both` takes its rows from the scene: a type the branch has none
   * of still answers the question. Dropping the row would read as "no such
   * thing anywhere", which is the opposite of what is true.
   */
  it('keeps a row the selection holds none of, at nought', () => {
    const rows = countRows('both', SCENE, NODE);

    expect(rows.find((row) => row.type === 'Spine')?.share).toBe(0);
  });

  /**
   * With nothing selected the scene half is still known, and a column of zeros
   * beside it is true rather than missing. Refusing to draw would withhold the
   * half that never depended on a selection.
   */
  it('still answers with nothing selected, at nought', () => {
    expect(countRows('both', SCENE, null)).toEqual([
      { type: 'Total', count: 632, share: 0 },
      { type: 'Container', count: 541, share: 0 },
      { type: 'Spine', count: 46, share: 0 },
      { type: 'Text', count: 45, share: 0 },
    ]);
  });

  it('has nothing to show for a selection that is gone — not even a total', () => {
    expect(countRows('node', SCENE, null)).toEqual([]);
  });
});
