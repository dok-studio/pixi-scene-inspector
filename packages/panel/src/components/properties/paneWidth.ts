/**
 * How wide the properties pane has to be, said in characters.
 *
 * The requirement is not a number of pixels but a number of digits: a
 * coordinate has to be readable, and `-88.8` is five characters. Pixels cannot
 * express that on their own, because the row's own label is set in `ch` — the
 * same panel is wider in Cascadia Code than in whatever mono the machine falls
 * back to, and so is what fits in the field beside it.
 *
 * The widest row in the panel is a vector, and it is the one this measures:
 *
 *     [ 11ch label ][8px] [8px] x[1ch][4px][ field ][14px] [8px gap] y…  [2px]
 *
 * Everything in it that is **not** the two fields comes to thirteen characters
 * (the label and the two axis letters) plus a fixed part: the label's margin,
 * the wrapper's padding, twice the field's own padding and border and its step
 * arrows, the gap between the axes, the section's padding and border, and the
 * pane's scrollbar.
 *
 * Both figures are measured against the running panel rather than derived from
 * the stylesheet, and a change to `propertyEntry.tsx` or `vector2.tsx` is a
 * reason to measure them again.
 */

/** The label and the two axis letters. */
const VECTOR_ROW_CH = 13;

/**
 * Everything else in the row that is not a field: margins, arrows, scrollbar —
 * and a few pixels over, because the two axes never divide what is left evenly
 * and a field that is a fraction of a character short shows one character less.
 *
 * The scrollbar is counted **whether or not it is showing**, which is worth ten
 * pixels of pane on its own. It was left out at first because it was measured on
 * a Properties tab short enough to fit, and that is exactly the wrong case to
 * measure: the tab with the most rows is the tab that scrolls, so the guarantee
 * would hold everywhere except where it is needed.
 */
const VECTOR_ROW_PX = 126;

/** A coordinate with a sign and a decimal — `-88.8`. */
export const MIN_DIGITS = 5;

/**
 * Past this the pane stops earning its width: eight digits is more than a
 * coordinate ever needs, and what is left over is worth more to the tree.
 */
export const MAX_DIGITS = 8;

/**
 * @param digits how many characters each of `x` and `y` must hold.
 * @param digitPx the width of one character in the panel's own face.
 */
export function paneWidthForDigits(digits: number, digitPx: number): number {
  return Math.ceil((VECTOR_ROW_CH + 2 * digits) * digitPx + VECTOR_ROW_PX);
}

/**
 * The other half's floor, which is not measured in characters at all.
 *
 * A name is still a name at six characters and the rest of it scrolls, so the
 * list is the side that gives way when both minima cannot be had. It lives here
 * rather than beside the split that first needed it because the Custom tab asks
 * the same question of a whole column, and a floor stated in two places is a
 * floor that drifts.
 */
export const MIN_LIST_PX = 6 * 16;
