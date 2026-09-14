import { describe, expect, it } from 'vitest';

import { ANCHOR, chooseColumn, COLUMNS, normalize } from './columns.js';

describe('normalize', () => {
  it('keeps a set that is already good, in the order of the strip', () => {
    expect(normalize(['Stats', 'Scene'])).toEqual(['Scene', 'Stats']);
  });

  it('drops names it does not know, rather than drawing an empty column', () => {
    expect(normalize(['Scene', 'Rendering', 'Assets'])).toEqual(['Scene', 'Assets']);
  });

  it('puts the anchor back when storage has lost it', () => {
    expect(normalize(['Stats'])).toEqual(['Scene', 'Stats']);
  });

  it('gives the anchor a companion, because one column is not a composed view', () => {
    expect(normalize(['Scene'])).toEqual(['Scene', 'Assets']);
  });

  it('treats anything that is not a list as nothing stored', () => {
    for (const stored of [null, undefined, 'Scene', 42, {}]) {
      expect(normalize(stored)).toEqual(['Scene', 'Assets']);
    }
  });

  it('does not repeat a name that storage holds twice', () => {
    expect(normalize(['Assets', 'Assets', 'Scene'])).toEqual(['Scene', 'Assets']);
  });
});

describe('chooseColumn', () => {
  /** A panel with room to spare, which is the ordinary case. */
  const roomy = () => true;

  it('adds a column in the order of the strip, not at the end', () => {
    expect(chooseColumn(['Scene', 'Stats'], 'Assets', roomy)).toEqual([
      'Scene',
      'Assets',
      'Stats',
    ]);
  });

  it('removes a companion while another one is left', () => {
    expect(chooseColumn(['Scene', 'Assets', 'Stats'], 'Assets', roomy)).toEqual(['Scene', 'Stats']);
  });

  it('refuses to remove the anchor', () => {
    const chosen = ['Scene', 'Assets'] as const;
    expect(chooseColumn(chosen, ANCHOR, roomy)).toBe(chosen);
  });

  /* A refusal that returned a fresh array would re-render the whole tab to
     arrive at the set it already had. */
  it('hands back the same array when it cannot do anything', () => {
    const chosen = [...COLUMNS];
    expect(chooseColumn(chosen, ANCHOR, roomy)).toBe(chosen);
  });

  describe('where there is room for two columns and no more', () => {
    const forTwo = (columns: readonly string[]): boolean => columns.length <= 2;

    /* The case this rule exists for. Without swapping, Assets cannot be
       switched off — it is the last companion — and Stats cannot be switched
       on, because there is nowhere to put it. */
    it('puts the wanted column in the place of the one that is there', () => {
      expect(chooseColumn(['Scene', 'Assets'], 'Stats', forTwo)).toEqual(['Scene', 'Stats']);
    });

    it('swaps the other way round just as well', () => {
      expect(chooseColumn(['Scene', 'Stats'], 'Assets', forTwo)).toEqual(['Scene', 'Assets']);
    });

    it('still refuses to leave the anchor without a companion', () => {
      const chosen = ['Scene', 'Assets'] as const;
      expect(chooseColumn(chosen, 'Assets', forTwo)).toBe(chosen);
    });
  });

  it('gives up only as much as it has to', () => {
    const forTwo = (columns: readonly string[]): boolean => columns.length <= 2;
    const forThree = (columns: readonly string[]): boolean => columns.length <= 3;

    expect(chooseColumn(['Scene', 'Assets'], 'Stats', forThree)).toEqual([
      'Scene',
      'Assets',
      'Stats',
    ]);
    expect(chooseColumn(['Scene', 'Assets'], 'Stats', forTwo)).toEqual(['Scene', 'Stats']);
  });

  /* Not every column costs the same — Assets holds a grid of pictures and asks
     for more than Stats does — so a width that fits one pair need not fit the
     other, and there is then nothing to be done. */
  it('refuses a column that does not fit even alone beside the anchor', () => {
    const chosen = ['Scene', 'Stats'] as const;
    const noAssets = (columns: readonly string[]): boolean => !columns.includes('Assets');

    expect(chooseColumn(chosen, 'Assets', noAssets)).toBe(chosen);
  });
});
