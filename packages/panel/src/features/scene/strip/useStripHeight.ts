import { useRef } from 'react';

import { useLocalStorage } from '../../../lib/localStorage.js';
import { clampListHeight } from './stripHeight.js';

/**
 * A strip under the tree, and how tall it is.
 *
 * The panel has two of these — the bookmarks and the list of what a pick landed
 * on — and only ever one on screen at a time, so the arithmetic in
 * `stripHeight.ts` still divides one column between the tree and one strip.
 * What is shared is this: a stored height, and the pointer handling that drags
 * it. The two strips are otherwise separate components with their own rows and
 * their own header; it is the drag that is worth not writing twice, because a
 * copy of it is exactly the kind of thing that drifts.
 *
 * A strip with a divider of its own rather than a second resizable split. The
 * one `PanelGroup` in the panel already has to put its own layout back inside
 * its limits by hand after every resize (`collapsible-split.tsx`), because the
 * library keeps its sizes as percentages and only applies limits while a handle
 * is being dragged. That is the wrong shape for this: what a list wants is a
 * height in **pixels** — rows are a fixed height, and four of them are four of
 * them whatever the drawer is doing.
 */
export interface StripHeight {
  /** Goes on the strip's outermost element: the drag measures its parent. */
  ref: React.RefObject<HTMLDivElement>;
  height: number;
  /** Goes on the divider. Does nothing while the strip is folded away. */
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export function useStripHeight(
  storageKey: string,
  defaultPx: number,
  /** A folded strip has nothing on the far side of the drag to make bigger. */
  collapsed: boolean,
): StripHeight {
  const [height, setHeight] = useLocalStorage(storageKey, defaultPx);
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Dragging the divider.
   *
   * The listeners go on the window rather than on the handle, because a pointer
   * moved faster than React re-renders leaves the handle behind, and a drag
   * that stops when the cursor outruns the thing being dragged is a drag that
   * does not work. They come off on the first pointer-up, wherever it lands.
   *
   * The ceiling is measured **once, at the start**: the column this and the
   * tree share is the strip's own parent, and its height is what there is to
   * divide between them.
   */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const column = ref.current?.parentElement;
    if (collapsed || column === null || column === undefined) return;

    event.preventDefault();

    const available = column.getBoundingClientRect().height;
    const startY = event.clientY;
    const startHeight = height;

    const move = (moved: PointerEvent): void => {
      setHeight(clampListHeight(startHeight + (startY - moved.clientY), available));
    };

    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      // Put back what the drag borrowed: the cursor stays `row-resize` for the
      // whole gesture even where the pointer wanders off the handle, and text
      // under it must not be selected on the way past.
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    document.body.style.setProperty('cursor', 'row-resize');
    document.body.style.setProperty('user-select', 'none');
  };

  return { ref, height, onPointerDown };
}
