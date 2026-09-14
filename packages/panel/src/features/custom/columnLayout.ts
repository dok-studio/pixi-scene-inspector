/**
 * Keeping a row of columns inside its limits.
 *
 * The same job `splitLayout.ts` does, and for the same reason: the library
 * applies `minSize` while a handle is being dragged and **not** when the group
 * itself changes size, so narrowing the panel merely rescales the stored
 * percentages and a column that was wide enough a moment ago is not any more.
 *
 * A separate module rather than a generalisation of that one, because the two
 * are not the same shape. A split has a list and an editor and knows which
 * gives way; a row of columns has no such asymmetry — every one of them is a
 * whole tab, and none is more entitled to the room than another.
 */

/** Below this two layouts are the same layout, and writing back is churn. */
const EPSILON = 0.01;

/** Everything summed to a hundred, or nothing if there is nothing to sum. */
function shareOut(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return weights.map(() => 100 / weights.length);

  return weights.map((weight) => (weight / total) * 100);
}

/**
 * @param layout the columns' widths in per cent, as the library reports them.
 * @param minima the same, one floor per column, in the same order.
 * @returns the same number of widths, each at or above its floor, summing to a
 *   hundred.
 *
 * When the floors cannot all be met — a panel narrower than the sum of them —
 * the columns are left **in proportion to their floors**. There is nothing else
 * to do with a width that small, and it is what the split already does.
 */
export function clampColumns(layout: readonly number[], minima: readonly number[]): number[] {
  if (minima.length === 0) return [];

  const needed = minima.reduce((sum, minimum) => sum + minimum, 0);
  if (needed >= 100) return shareOut(minima);

  let sizes = shareOut(layout.length === minima.length ? layout : minima);
  const pinned = minima.map(() => false);

  /*
   * One column is pinned to its floor per pass, and what is left over is
   * divided among the rest in the proportion they already had. Pinning them
   * all at once would not do: giving one column its floor takes room from the
   * others, which can push a second below its own.
   *
   * It terminates because each pass pins one more, and `needed < 100` means the
   * last unpinned column always has room left to take.
   */
  for (let pass = 0; pass < minima.length; pass += 1) {
    const short = sizes.findIndex(
      (size, index) => !pinned[index] && size < (minima[index] ?? 0) - EPSILON,
    );
    if (short === -1) break;

    pinned[short] = true;

    const spoken = minima.reduce(
      (sum, minimum, index) => (pinned[index] ? sum + minimum : sum),
      0,
    );
    const budget = 100 - spoken;
    const free = sizes.map((_, index) => index).filter((index) => !pinned[index]);
    const divided = shareOut(free.map((index) => sizes[index] ?? 0)).map(
      (share) => (share / 100) * budget,
    );

    sizes = sizes.map((size, index) =>
      pinned[index] ? (minima[index] ?? 0) : (divided[free.indexOf(index)] ?? 0),
    );
  }

  return sizes;
}

/** Whether two layouts differ enough to be worth writing back. */
export function differs(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return true;

  return a.some((size, index) => Math.abs(size - (b[index] ?? 0)) > EPSILON);
}
