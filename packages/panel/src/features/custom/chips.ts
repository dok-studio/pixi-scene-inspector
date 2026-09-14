import type { Column } from './columns.js';
import { ANCHOR, chooseColumn } from './columns.js';

/**
 * What one chip does, and therefore what it may say about itself.
 *
 * Out of the component because this expression has now been wrong twice — once
 * marking nothing at all as pressed, once offering to put a column in its own
 * place — and both times it was wrong in the tip rather than in the click,
 * which is the half nothing was watching. The two are one answer here, so they
 * cannot drift apart: whatever the chip says is read off the very set the click
 * would produce.
 */

export type ChipAction =
  /** The scene, which is in every set and cannot be taken out of one. */
  | { kind: 'anchor' }
  /** The one panel beside the scene: not removed, only replaced. */
  | { kind: 'only' }
  | { kind: 'show' }
  | { kind: 'hide' }
  /** No room to stand beside the others, so it takes this one's place. */
  | { kind: 'swap'; other: Column };

export interface Chip {
  column: Column;
  /** Whether a column of this panel is on screen. */
  held: boolean;
  action: ChipAction;
  /** The set the click would leave behind, the same array when it does nothing. */
  next: readonly Column[];
}

export function chipFor(
  shown: readonly Column[],
  column: Column,
  fits: (columns: readonly Column[]) => boolean,
): Chip {
  const held = shown.includes(column);
  const next = chooseColumn(shown, column, fits);

  const action = ((): ChipAction => {
    if (column === ANCHOR) return { kind: 'anchor' };
    if (next === shown) return { kind: 'only' };
    if (held) return { kind: 'hide' };

    // What had to be given up to make room. Asked only of a column being added:
    // removing one gives up itself, which is a hide and not a swap.
    const other = shown.find((standing) => !next.includes(standing));

    return other === undefined ? { kind: 'show' } : { kind: 'swap', other };
  })();

  return { column, held, action, next };
}
