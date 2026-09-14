/**
 * How tall the bookmark list may be, given the column it shares with the tree.
 *
 * Its own module for the same reason `splitLayout.ts` is one: the interesting
 * part of a draggable divider is not the dragging, it is what happens at the
 * ends — and what gives way when the pane is too short to honour both floors.
 * That is arithmetic, and arithmetic is worth pinning down in tests rather than
 * discovering by dragging a panel about.
 */

/** The section header, `h-6`. It is there whether the list is open or not. */
export const HEADER_PX = 24;

/** Two rows and the padding under them: less than this is not a list. */
export const MIN_LIST_PX = 44;

/** What the tree keeps no matter what — about three rows of it. */
export const MIN_TREE_PX = 64;

/** Four or five rows: enough to be worth opening, small enough to not take over. */
export const DEFAULT_LIST_PX = 108;

/**
 * `wanted` put inside what `column` can hold.
 *
 * When there is not room for both floors it is the **list** that gives way,
 * down to nothing if it must. The pane is the tree's; the list is a way of
 * getting back into it, and a way in that has crowded out what it leads to has
 * stopped being one. The same order of preference the split above it uses,
 * where the list yields to the editors.
 */
export function clampListHeight(wanted: number, column: number): number {
  // Rounded because the column is measured, and a measured height is
  // fractional: without this the ceiling would be stored as 630.4000244140625
  // and written back into a style attribute at that precision.
  const room = Math.round(column - HEADER_PX - MIN_TREE_PX);
  if (room < MIN_LIST_PX) return Math.max(0, Math.min(Math.round(wanted), room));

  return Math.min(Math.max(Math.round(wanted), MIN_LIST_PX), room);
}
