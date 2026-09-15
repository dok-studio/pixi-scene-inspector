import type { IconType } from 'react-icons';
import { FaEye, FaWandMagicSparkles } from 'react-icons/fa6';
import { LuAxis3D, LuBookmark, LuScaling, LuSigma, LuSquare, LuWrapText } from 'react-icons/lu';

/**
 * The panel's own glyph for a control named in prose, keyed by the name a
 * `{{...}}` token in a content file carries.
 *
 * The same components the panel itself renders the button with — so the icon in
 * the sentence is the icon on the row, and stays so when one of them is
 * swapped.
 *
 * A module of its own rather than a const inside `HelpPage`, so that
 * `content/coverage.test.ts` can hold the document to it: a token naming no
 * glyph here is a typo, and the page draws it as written rather than hiding it.
 */
export const INLINE_ICONS: Record<string, IconType> = {
  eye: FaEye,
  bookmark: LuBookmark,
  pin: LuAxis3D,
  picker: FaWandMagicSparkles,
  highlight: LuSquare,
  wrapBox: LuWrapText,
  axes: LuAxis3D,
  transform: LuScaling,
  nodeCounts: LuSigma,
};
