import type { NodeCounts } from '../../../lib/nodeCounts.js';

/**
 * What the counts strip draws, for each of the three ways of looking at it.
 *
 * Out here rather than inside the component because two of the three have a
 * decision in them rather than a display: see `both` and the total below.
 */

export type CountsMode = 'scene' | 'node' | 'both';

export interface CountRow {
  /** A node type, or `Total` for the row that counts all of them. */
  type: string;
  count: number;
  /** How many of them are inside the selection. Null unless the mode shows it. */
  share: number | null;
}

/**
 * The label of the row that sums the rest.
 *
 * A row rather than a figure in the header, and the first one, because it is the
 * same kind of reading as every row under it — a name and a count — and putting
 * it in the header meant spelling that pair a second way, in a second place.
 * Nothing in PixiJS is called this, so it cannot be mistaken for a type.
 */
export const TOTAL_ROW = 'Total';

export function countRows(
  mode: CountsMode,
  scene: NodeCounts,
  /** Null when nothing is selected. */
  node: NodeCounts | null,
): CountRow[] {
  if (mode === 'node') {
    if (node === null) return [];

    return [
      { type: TOTAL_ROW, count: node.total, share: null },
      ...node.types.map((entry) => ({ ...entry, share: null })),
    ];
  }

  if (mode === 'scene') {
    return [
      { type: TOTAL_ROW, count: scene.total, share: null },
      ...scene.types.map((entry) => ({ ...entry, share: null })),
    ];
  }

  /*
   * The rows are the **scene's**, not the selection's, and the zeros are the
   * point.
   *
   * The question this mode answers is what share of the whole a branch accounts
   * for, and "none of these are in here" is one of its answers. Building the
   * rows from the selection would drop exactly those lines — the panel would
   * silently stop mentioning a type instead of showing it at nought, and a
   * missing row reads as "no such thing anywhere", which is the opposite of
   * what is true.
   *
   * Nothing selected is the same answer taken to its limit, which is why this
   * mode never asks for a selection before it will say anything: the scene is
   * known either way, and a column of zeros beside it is true — nothing is
   * selected, so nothing is in the selection. Refusing to draw would withhold
   * the half that does not depend on a selection at all.
   */
  const inside = new Map((node?.types ?? []).map((entry) => [entry.type, entry.count]));

  return [
    { type: TOTAL_ROW, count: scene.total, share: node?.total ?? 0 },
    ...scene.types.map((entry) => ({ ...entry, share: inside.get(entry.type) ?? 0 })),
  ];
}
