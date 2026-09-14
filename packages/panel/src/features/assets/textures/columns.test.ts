import { describe, expect, it } from 'vitest';

import type { GridLayout } from './columns.js';
import {
  BASE_TILE_WIDTH,
  CAPTION_HEIGHT,
  contentHeight,
  GRID_PADDING,
  layoutFor,
  MIN_TILE_WIDTH,
  moveIndex,
  rowTop,
  scrollToRow,
  TILE_GAP,
  windowFor,
} from './columns.js';

/** The grid's arithmetic, away from the box it measures. */

/** The width a box needs to hold exactly this many tiles of this width. */
const boxFor = (columns: number, tileWidth: number): number =>
  GRID_PADDING * 2 + columns * tileWidth + (columns - 1) * TILE_GAP;

describe('layoutFor', () => {
  it('fits as many tiles across as the floor allows', () => {
    expect(layoutFor(boxFor(2, BASE_TILE_WIDTH)).columns).toBe(2);
    expect(layoutFor(boxFor(3, BASE_TILE_WIDTH)).columns).toBe(3);
  });

  /**
   * The point of the whole exercise: a row of fixed tiles left a ragged strip
   * of nothing down the right-hand side, at its widest when the pane was
   * narrowest.
   */
  it('spends what is left over on the tiles rather than leaving it', () => {
    const width = boxFor(2, BASE_TILE_WIDTH) + 60;
    const { columns, tileWidth } = layoutFor(width);

    expect(columns).toBe(2);
    expect(boxFor(columns, tileWidth)).toBeCloseTo(width, 0);
  });

  it('takes another column as soon as one fits at the floor', () => {
    const justShort = layoutFor(boxFor(3, MIN_TILE_WIDTH) - 1);
    const justEnough = layoutFor(boxFor(3, MIN_TILE_WIDTH));

    expect(justShort.columns).toBe(2);
    expect(justEnough.columns).toBe(3);
    expect(justEnough.tileWidth).toBe(MIN_TILE_WIDTH);
  });

  /** Which is what bounds the tile from above, without a second constant. */
  it('never grows a tile past the point where another column would fit', () => {
    for (let width = 200; width < 2000; width += 7) {
      const { columns, tileWidth } = layoutFor(width);
      if (columns === 1) continue;

      expect(tileWidth).toBeGreaterThanOrEqual(MIN_TILE_WIDTH);
      expect(boxFor(columns + 1, MIN_TILE_WIDTH)).toBeGreaterThan(width);
    }
  });

  it('keeps the tile in shape as it grows', () => {
    const wide = layoutFor(boxFor(1, BASE_TILE_WIDTH * 1.5));

    expect(wide.imageHeight / wide.tileWidth).toBeCloseTo(128 / 160, 2);
    expect(wide.tileHeight).toBe(wide.imageHeight + CAPTION_HEIGHT + 2);
  });

  /** Filling what there is beats overflowing it. */
  it('gives a box too narrow for one whole tile the width it has', () => {
    const { columns, tileWidth } = layoutFor(GRID_PADDING * 2 + 60);

    expect(columns).toBe(1);
    expect(tileWidth).toBe(60);
  });

  it('answers for a box that has not been measured yet', () => {
    const { columns, tileWidth } = layoutFor(0);

    expect(columns).toBe(1);
    expect(tileWidth).toBeGreaterThan(0);
  });
});

/** A layout with round numbers, so the tests below read as arithmetic. */
const LAYOUT: GridLayout = {
  columns: 3,
  tileWidth: 160,
  imageHeight: 128,
  tileHeight: 200,
  rowPitch: 204,
};

describe('contentHeight', () => {
  it('reserves the padding and every row but the last row’s gap', () => {
    expect(contentHeight(LAYOUT, 1)).toBe(GRID_PADDING * 2 + 200);
    expect(contentHeight(LAYOUT, 3)).toBe(GRID_PADDING * 2 + 3 * 204 - TILE_GAP);
  });

  it('reserves nothing for an empty grid', () => {
    expect(contentHeight(LAYOUT, 0)).toBe(0);
  });
});

describe('windowFor', () => {
  it('covers the rows that overlap the box, and no more', () => {
    // Two pitches of viewport reach into row 1 but stop short of row 2's top.
    const { first, last } = windowFor(LAYOUT, 0, LAYOUT.rowPitch * 2, 10, 0);

    expect(first).toBe(0);
    expect(last).toBe(1);
  });

  /** A row half out of the box at either edge is still a row that is drawn. */
  it('counts a partly visible row as visible', () => {
    expect(windowFor(LAYOUT, rowTop(LAYOUT, 1) + 10, LAYOUT.tileHeight, 10, 0)).toEqual({
      first: 1,
      last: 2,
    });
  });

  it('adds the overscan on both sides', () => {
    const { first, last } = windowFor(LAYOUT, LAYOUT.rowPitch * 4, LAYOUT.rowPitch, 10, 1);

    expect(first).toBe(2);
    expect(last).toBe(5);
  });

  it('stops at the ends rather than past them', () => {
    expect(windowFor(LAYOUT, 0, LAYOUT.rowPitch * 100, 3, 2)).toEqual({ first: 0, last: 2 });
  });

  it('draws nothing when there are no rows', () => {
    expect(windowFor(LAYOUT, 0, 500, 0, 2)).toEqual({ first: 0, last: -1 });
  });
});

describe('scrollToRow', () => {
  it('leaves a row that is already whole where it is', () => {
    expect(scrollToRow(LAYOUT, 0, 0, 500)).toBeNull();
  });

  it('brings a row above the fold down to the top', () => {
    expect(scrollToRow(LAYOUT, 0, 300, 500)).toBe(0);
    expect(scrollToRow(LAYOUT, 2, rowTop(LAYOUT, 4), 500)).toBe(
      rowTop(LAYOUT, 2) - GRID_PADDING,
    );
  });

  it('brings a row below the fold up to the bottom', () => {
    const viewport = LAYOUT.tileHeight;

    expect(scrollToRow(LAYOUT, 1, 0, viewport)).toBe(
      rowTop(LAYOUT, 1) + LAYOUT.tileHeight - viewport + GRID_PADDING,
    );
  });
});

describe('moveIndex', () => {
  it('walks the row and the column', () => {
    expect(moveIndex(4, 10, 3, 'left')).toBe(3);
    expect(moveIndex(4, 10, 3, 'right')).toBe(5);
    expect(moveIndex(4, 10, 3, 'up')).toBe(1);
    expect(moveIndex(4, 10, 3, 'down')).toBe(7);
  });

  it('clamps at the edges rather than wrapping round', () => {
    expect(moveIndex(0, 10, 3, 'left')).toBe(0);
    expect(moveIndex(9, 10, 3, 'right')).toBe(9);
    expect(moveIndex(1, 10, 3, 'up')).toBe(1);
  });

  /** The last row is usually short; down from a full row lands on its last tile. */
  it('lands on the last tile when the row below is short', () => {
    expect(moveIndex(3, 5, 3, 'down')).toBe(4);
  });

  it('goes to the ends', () => {
    expect(moveIndex(4, 10, 3, 'home')).toBe(0);
    expect(moveIndex(4, 10, 3, 'end')).toBe(9);
  });

  it('has nowhere to go in an empty grid', () => {
    expect(moveIndex(0, 0, 3, 'down')).toBe(-1);
  });
});
