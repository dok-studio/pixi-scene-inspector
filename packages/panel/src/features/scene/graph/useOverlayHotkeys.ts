import { useEffect, useRef } from 'react';

import { hotkeys, hotkeysEnabled, matchesBinding } from '../../settings/hotkeys.js';
import { cycleAxes, cycleHighlight } from './OverlaySwitches.js';
import type { OverlayControls } from './useOverlay.js';

/**
 * Presses the tree's own toolbar from the keyboard — see `settings/hotkeys.ts`
 * for what each binding is and why it defaults to Alt.
 *
 * A `window` listener rather than one on some element in the tree, the same
 * as `useGlobalAltState`: the switches are not the tree's own, they reach
 * through the page, so a binding should not need the tree to be focused
 * either.
 *
 * Read from a ref rather than closed over, so the listener is added once: the
 * tree polls its own poses several times a second, which hands this hook a
 * new `overlay` object on every one of those renders, and tearing a `window`
 * listener down and back up that often is work this hook has no reason to do
 * — the same reason `useOverlay`'s own poll reads a ref instead of the state
 * that changed it.
 */
export function useOverlayHotkeys(overlay: OverlayControls, toggleCounts: () => void): void {
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  // Not one of the overlay switches — the counts strip is the tab's, not the
  // page's — but it sits in the same toolbar row and every other button there
  // answers to a key, so it does too. Held in a ref for the same reason as the
  // overlay above: this listener is added once.
  const countsRef = useRef(toggleCounts);
  countsRef.current = toggleCounts;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!hotkeysEnabled()) return;

      // A field editing text owns its own letters — a bound plain key would
      // otherwise fire on every keystroke typed into the search box or a
      // rename in progress.
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }

      const current = overlayRef.current;
      const bindings = hotkeys();

      if (matchesBinding(event, bindings.picker)) {
        current.setPicker(!current.picker);
      } else if (matchesBinding(event, bindings.highlight)) {
        current.setHighlight(cycleHighlight(current.highlight));
      } else if (matchesBinding(event, bindings.wrapBox)) {
        current.setWrapBox(!current.wrapBox);
      } else if (matchesBinding(event, bindings.axes)) {
        current.setAxes(cycleAxes(current.axes));
      } else if (matchesBinding(event, bindings.transform)) {
        current.setTransform(!current.transform);
      } else if (matchesBinding(event, bindings.counts)) {
        countsRef.current();
      } else {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
