import { useLayoutEffect, useRef, useState } from 'react';

/**
 * How wide something actually is, watched.
 *
 * An element rather than the window, everywhere this is used. The panel does
 * not always **be** the window: in the playground it is a pane beside the
 * canvas, and in DevTools it is a drawer that can be docked to the side. What
 * the floors in `paneWidth.ts` have to be compared against is the room the
 * layout really has.
 *
 * Extracted from `collapsible-split.tsx`, which asked first; the Custom tab
 * asks the same question of the whole panel.
 */
export function useElementWidth<T extends HTMLElement>(): {
  ref: React.RefObject<T>;
  /** Pixels, or zero before the first measurement. */
  width: number;
} {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const measure = (): void => {
      setWidth(element.getBoundingClientRect().width);
    };

    // Read it outright rather than only waiting to be told. A `ResizeObserver`
    // reports through the frame loop, and a window that is not being painted —
    // occluded, or behind another — delivers nothing at all, which would leave
    // the limits unknown and the panes unbounded. The window's own `resize` is
    // an ordinary event and arrives regardless, and resizing the drawer is
    // exactly what it reports.
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return { ref, width };
}
