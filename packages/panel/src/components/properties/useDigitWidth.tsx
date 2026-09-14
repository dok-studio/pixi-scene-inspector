import { useLayoutEffect, useRef, useState } from 'react';

/**
 * How wide one character is in the face the panel is actually set in.
 *
 * The floors in `paneWidth.ts` are stated in characters rather than pixels, and
 * a character is a different number of pixels in Cascadia Code than in whatever
 * mono the machine falls back to. So the width is not derived from the
 * stylesheet — it is **measured in the running panel** with a hidden sample.
 *
 * Extracted from the split, which asked the question first, because the Custom
 * tab now asks the same one of a whole column. Two samples in the document
 * would be two measurements of one thing.
 */

/** How many characters the sample holds, so one of them can be divided out. */
const PROBE = '0000000000';

export function useDigitWidth(): {
  /** Pixels per character, or zero before the sample has been laid out. */
  digit: number;
  /**
   * The sample itself. Render it inside a positioned ancestor — it is taken out
   * of the flow so that measuring costs no layout, and hidden so that it costs
   * nothing to look at.
   */
  face: React.ReactNode;
} {
  const probe = useRef<HTMLSpanElement>(null);
  const [digit, setDigit] = useState(0);

  // Once is enough: the panel loads no webfont, so the face it is measured in
  // is the face it keeps.
  useLayoutEffect(() => {
    const element = probe.current;
    if (element !== null) setDigit(element.getBoundingClientRect().width / PROBE.length);
  }, []);

  return {
    digit,
    face: (
      <span ref={probe} aria-hidden="true" className="invisible absolute text-xs">
        {PROBE}
      </span>
    ),
  };
}
