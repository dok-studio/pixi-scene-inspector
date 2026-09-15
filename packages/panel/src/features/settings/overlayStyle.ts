import type { Json, OverlayStyle } from '@scene-inspector/protocol';
import { OVERLAY_STYLE_DEFAULTS } from '@scene-inspector/protocol';
import { useCallback } from 'react';

import { useLocalStorage } from '../../lib/localStorage.js';

/**
 * How the overlay is painted, as the panel remembers it.
 *
 * Stored, because a colour someone chose against their own game is a choice
 * they make once — and a DevTools panel is torn down and rebuilt constantly, so
 * without this it would be made again on every reopen. The same argument the
 * wrap box and the gizmo mode are stored under, and the same reason the
 * highlight and the picker are not.
 *
 * The defaults come from the protocol rather than from here: the page draws
 * with them when the panel says nothing, and Reset goes back to them, and two
 * copies of a colour drift.
 */

const KEY = 'scene.overlay.style';

/**
 * What was stored, filled in from the defaults.
 *
 * A stored object is as old as the day it was written, and settings are the
 * kind of thing that gains a field. Spreading rather than trusting it means a
 * new setting appears at its default instead of as `undefined` in a style
 * property — which is not an error anywhere, just a frame that stops being
 * drawn.
 */
function merge(saved: OverlayStyle): OverlayStyle {
  return {
    selected: { ...OVERLAY_STYLE_DEFAULTS.selected, ...saved.selected },
    hover: { ...OVERLAY_STYLE_DEFAULTS.hover, ...saved.hover },
    bareSelected: { ...OVERLAY_STYLE_DEFAULTS.bareSelected, ...saved.bareSelected },
    bareHover: { ...OVERLAY_STYLE_DEFAULTS.bareHover, ...saved.bareHover },
    wrapBox: { ...OVERLAY_STYLE_DEFAULTS.wrapBox, ...saved.wrapBox },
  };
}

/** The five frames the settings paint, which are the keys of `OverlayStyle`. */
const GROUPS = ['selected', 'hover', 'bareSelected', 'bareHover', 'wrapBox'] as const;

function isGroup(name: string): name is keyof OverlayStyle {
  return (GROUPS as readonly string[]).includes(name);
}

export interface OverlayStyleControls {
  style: OverlayStyle;
  /**
   * One field, by the path the settings grid names it: `'selected.fill'`,
   * `'wrapBox.strokeWidth'`. A path rather than a setter per field, because the
   * grid is a list of descriptors and a list is what it can hand back.
   */
  set: (path: string, value: Json) => void;
  reset: () => void;
}

/** The two steps of a settings key, where both name something that exists. */
function split(path: string): { group: keyof OverlayStyle; field: string } | null {
  const [group, field] = path.split('.');
  if (field === undefined || group === undefined) return null;
  if (!isGroup(group)) return null;
  if (!(field in OVERLAY_STYLE_DEFAULTS[group])) return null;

  return { group, field };
}

export function useOverlayStyle(): OverlayStyleControls {
  const [stored, setStored] = useLocalStorage<OverlayStyle>(KEY, OVERLAY_STYLE_DEFAULTS);
  const style = merge(stored);

  const set = useCallback(
    (path: string, value: Json) => {
      const target = split(path);
      // A key the grid does not draw, or a value of the wrong shape: dropped
      // rather than written, so nothing can put a string where a width goes and
      // leave the overlay undrawable until the storage is cleared by hand.
      if (target === null) return;
      if (typeof value !== 'string' && typeof value !== 'number') return;

      setStored((previous) => {
        const merged = merge(previous);
        return { ...merged, [target.group]: { ...merged[target.group], [target.field]: value } };
      });
    },
    [setStored],
  );

  const reset = useCallback(() => {
    setStored(OVERLAY_STYLE_DEFAULTS);
  }, [setStored]);

  return { style, set, reset };
}
