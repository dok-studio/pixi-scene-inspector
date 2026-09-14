import { describe, expect, it } from 'vitest';

import { chipFor } from './chips.js';

/** A panel with room to spare, which is the ordinary case. */
const roomy = (): boolean => true;

/** A panel with room for the scene and one panel beside it, and no more. */
const forTwo = (columns: readonly string[]): boolean => columns.length <= 2;

describe('chipFor', () => {
  it('says the scene is the anchor, whatever else is on screen', () => {
    expect(chipFor(['Scene', 'Assets'], 'Scene', roomy).action).toEqual({ kind: 'anchor' });
    expect(chipFor(['Scene', 'Assets', 'Stats'], 'Scene', roomy).action).toEqual({
      kind: 'anchor',
    });
  });

  it('offers to show a panel that is off', () => {
    const chip = chipFor(['Scene', 'Assets'], 'Stats', roomy);

    expect(chip.held).toBe(false);
    expect(chip.action).toEqual({ kind: 'show' });
    expect(chip.next).toEqual(['Scene', 'Assets', 'Stats']);
  });

  /* This is the one that was wrong: removing a column gives up itself, and the
     chip read that as putting the column in its own place. */
  it('offers to hide a panel that is on, and calls it hiding', () => {
    const chip = chipFor(['Scene', 'Assets', 'Stats'], 'Assets', roomy);

    expect(chip.held).toBe(true);
    expect(chip.action).toEqual({ kind: 'hide' });
    expect(chip.next).toEqual(['Scene', 'Stats']);
  });

  it('names what a panel would take the place of, where there is no room beside', () => {
    const chip = chipFor(['Scene', 'Assets'], 'Stats', forTwo);

    expect(chip.action).toEqual({ kind: 'swap', other: 'Assets' });
    expect(chip.next).toEqual(['Scene', 'Stats']);
  });

  it('says the last panel beside the scene is the only one, not that it will hide', () => {
    const shown = ['Scene', 'Assets'] as const;
    const chip = chipFor(shown, 'Assets', roomy);

    expect(chip.held).toBe(true);
    expect(chip.action).toEqual({ kind: 'only' });
    expect(chip.next).toBe(shown);
  });
});
