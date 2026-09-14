import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** What `Row` reads its `min-width` from. Set on the element the hook is given. */
const ROW_WIDTH = '--tree-row-width';

/**
 * Holds every row of the tree to the width of the widest one on screen.
 *
 * That is what keeps the buttons in a column: they are `sticky right-0`, and
 * sticky stops at the edge of the box it is in, so rows of different widths put
 * their right edges — and their buttons — in different places as soon as the
 * pane is scrolled. See `row.tsx` for the half of this that applies the width.
 *
 * The measurement releases the rows to `max-content` first. A row still holding
 * the width the previous pass gave it would measure as that width, and the
 * column could then only ever grow: closing a deep branch, or narrowing the
 * pane, would leave a stretch of empty row that nothing shrinks again.
 *
 * @returns the ref to put on the element the tree is rendered inside.
 */
export function useEqualRowWidths(): React.MutableRefObject<HTMLDivElement | null> {
  const pane = useRef<HTMLDivElement | null>(null);

  const measure = useCallback((): void => {
    const el = pane.current;
    if (el === null) return;

    el.style.setProperty(ROW_WIDTH, 'max-content');

    let widest = 0;
    for (const row of el.querySelectorAll<HTMLElement>('[role="treeitem"]')) {
      widest = Math.max(widest, row.getBoundingClientRect().width);
    }

    // No rows yet — leave the property off so the rows keep arborist's own
    // `max-content` until there is something to measure.
    if (widest === 0) el.style.removeProperty(ROW_WIDTH);
    // Rounded up: a fractional width truncated is a row a hair too narrow, and
    // a hair is enough for the last button to sit outside the column.
    else el.style.setProperty(ROW_WIDTH, `${Math.ceil(widest)}px`);
  }, []);

  // The rows this render produced: a poll that renamed a node, a branch opened,
  // a different node selected.
  useLayoutEffect(measure);

  useEffect(() => {
    const el = pane.current;
    if (el === null) return;

    let frame: number | undefined;
    const remeasure = (): void => {
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        measure();
      });
    };

    /*
     * Two things change the rows without re-rendering this component, so the
     * effect above never hears about either.
     *
     * Scrolling down mounts rows the last pass never saw — the list is
     * virtualized, and react-window renders those from state of its own. A
     * `scroll` event does not bubble, so the listener is a capturing one: that
     * is how a single listener up here hears the list's own scrolling.
     *
     * And the pane is measured by `AutoSizer`, which re-renders the tree from
     * its own state when the split moves. Widening it can only leave the column
     * short of the edge; narrowing it leaves rows wider than anything in them.
     */
    el.addEventListener('scroll', remeasure, true);

    const observer = new ResizeObserver(remeasure);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', remeasure, true);
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [measure]);

  return pane;
}
