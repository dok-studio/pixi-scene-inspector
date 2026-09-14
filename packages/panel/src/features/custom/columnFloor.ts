import { MIN_DIGITS, MIN_LIST_PX, paneWidthForDigits } from '../../components/properties/paneWidth.js';
import { GRID_PADDING, MIN_TILE_WIDTH } from '../assets/textures/columns.js';
import type { Column } from './columns.js';
import { ANCHOR, COLUMNS } from './columns.js';

/**
 * How narrow a column may get before it stops being worth drawing.
 *
 * These are **not** new numbers. Each tab already knows what it needs, and had
 * to work it out for the split inside it; this module only adds them up. The
 * one figure invented here is Stats', and it is measured rather than guessed —
 * the same bargain `paneWidth.ts` makes, and the same warning applies: a change
 * to the Stats toolbar is a reason to measure it again.
 *
 * Everything is in pixels but derived from characters wherever a character is
 * what the requirement is really about, which is why `digitPx` is threaded
 * through: the same panel is wider in Cascadia Code than in whatever mono the
 * machine falls back to.
 */

/**
 * The width of the Stats toolbar, which is the narrowest the tab reads at.
 *
 * `Keep`, five segments (`Off` through `20m`), and the chart picker at the far
 * end, plus the row's own padding. Below this the row wraps and the tab gains a
 * line of chrome exactly where it has least to spare. Measured in the running
 * panel at the default face — see `StatsPanel.tsx`.
 *
 * The charts themselves have no floor to speak of: a chart is one pixel per
 * sample, so a narrower column shows **less history** rather than a squeezed
 * version of the same minute. That degrades honestly, so it is the toolbar that
 * sets the number.
 */
const STATS_TOOLBAR_PX = 320;

/**
 * The gutter between two columns, which is what a set of N of them spends on
 * looking like N of them — see `ColumnGroup`. Four pixels of chrome and a
 * hairline on each side.
 */
export const HANDLE_PX = 6;

/**
 * What one column cannot go below.
 *
 * Scene and Assets are both a list beside the properties of whatever is picked
 * in it, so both are the list's floor plus the pane's — the difference is that
 * Assets' list is a grid of pictures and stops being one below a tile, while
 * Scene's is names and survives at six characters.
 */
export function floorFor(column: Column, digitPx: number): number {
  const pane = paneWidthForDigits(MIN_DIGITS, digitPx);

  switch (column) {
    case 'Scene':
      return MIN_LIST_PX + pane;
    case 'Assets':
      return MIN_TILE_WIDTH + 2 * GRID_PADDING + pane;
    case 'Stats':
      return STATS_TOOLBAR_PX;
  }
}

/** What these very columns need, handles included. */
function floorForAll(columns: readonly Column[], digitPx: number): number {
  if (columns.length === 0) return 0;

  const panes = columns.reduce((total, column) => total + floorFor(column, digitPx), 0);
  return panes + (columns.length - 1) * HANDLE_PX;
}

/**
 * What **any** set of this many columns is asked for: the price of the dearest
 * one of that size.
 *
 * The columns do not cost the same — Assets holds a grid of pictures and asks
 * more than Stats does — and charging each set its own price made panels where
 * one pair could be had and another could not. That is a bad kind of narrow:
 * the row of chips is the same row at the same width, and one of them being
 * impossible while its neighbour is not reads as a fault rather than as a
 * measurement.
 *
 * So the price of a pair is the price of the dearest pair, and every pair is
 * had or none is. It costs Scene and Stats some room they would not have
 * needed — that pair fits in less — but what it buys is that a chip is never
 * a dead end, and the tab appears at one width rather than at three.
 *
 * The anchor is in every set by definition, so the dearest set of `count` is
 * the anchor plus the `count - 1` dearest companions.
 */
export function floorForCount(count: number, digitPx: number): number {
  if (count <= 0) return 0;

  const dearest = COLUMNS.filter((column) => column !== ANCHOR).sort(
    (a, b) => floorFor(b, digitPx) - floorFor(a, digitPx),
  );

  return floorForAll([ANCHOR, ...dearest.slice(0, count - 1)], digitPx);
}

/**
 * Whether a set of this size fits in this width.
 *
 * **Of this size**, not this set — see `floorForCount`.
 *
 * A width of zero is "not measured yet" rather than "nothing fits", and the
 * answer then is no: the tab is better off appearing one frame late than
 * appearing and being taken away again.
 */
export function fits(columns: readonly Column[], width: number, digitPx: number): boolean {
  if (width <= 0 || digitPx <= 0) return false;

  return width >= floorForCount(columns.length, digitPx);
}

/**
 * The set, narrowed until it fits — companions dropped from the right.
 *
 * The right-hand end is where the least-wanted column is: the anchor is first
 * by definition, and a companion added later sits further right than one that
 * was there before it. Returns the set **unchanged by identity** when nothing
 * had to go, so an ordinary resize does not re-render the tab.
 *
 * The result can still be a set that does not fit — a panel too narrow for the
 * anchor and one companion has no answer. Whether that means the tab is worth
 * offering at all is `fits`' question, asked one level up.
 */
export function narrowToFit(
  columns: readonly Column[],
  width: number,
  digitPx: number,
): readonly Column[] {
  if (digitPx <= 0 || width <= 0) return columns;

  let kept = columns;
  while (kept.length > 2 && !fits(kept, width, digitPx)) kept = kept.slice(0, -1);

  return kept.length === columns.length ? columns : kept;
}
