/**
 * Keeping a two-panel layout inside its limits.
 *
 * `react-resizable-panels` applies `minSize` and `maxSize` while a handle is
 * being dragged, and **not** when the group itself changes size: narrow the
 * drawer and the stored percentages are simply rescaled, so a pane that was
 * wide enough a moment ago is not any more. This is what the split calls to put
 * the layout back inside its limits after a resize.
 *
 * Percentages rather than pixels, because that is what the library speaks. Two
 * panels rather than any number, because that is what the split has.
 */

export interface SplitLimits {
  /** Per cent. The list gives way first, so its minimum is the smaller one. */
  minList: number;
  minEditor: number;
  /** Past this the editors stop earning their width — see `paneWidth.ts`. */
  maxEditor: number;
}

/**
 * @param layout `[list, editor]` in per cent, as the library reports it.
 * @returns the same pair, inside the limits, summing to a hundred.
 *
 * The editor's minimum is honoured first and the list's second, which is the
 * order that decides who gives way when both cannot be met. When even that is
 * impossible the two are left in proportion to their minima — there is nothing
 * else to do with a width that small.
 */
export function clampSplit(
  layout: readonly [number, number],
  { minList, minEditor, maxEditor }: SplitLimits,
): [number, number] {
  if (minList + minEditor >= 100) {
    const total = minList + minEditor;
    return [(minList / total) * 100, (minEditor / total) * 100];
  }

  let editor = layout[1];

  editor = Math.min(editor, maxEditor);
  editor = Math.max(editor, minEditor);
  editor = Math.min(editor, 100 - minList);

  return [100 - editor, editor];
}

/** Whether two layouts differ enough to be worth writing back. */
export function differs(a: readonly [number, number], b: readonly [number, number]): boolean {
  return Math.abs(a[0] - b[0]) > 0.01 || Math.abs(a[1] - b[1]) > 0.01;
}
