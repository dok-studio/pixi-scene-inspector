import type {
  AxesMode,
  AxesPin,
  HighlightMode,
  NodeId,
  OverlayStyle,
} from '@scene-inspector/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocalStorage } from '../../../lib/localStorage.js';
import { usePickDepth } from '../../settings/pickDepth.js';
import type { Client } from '../../../transport/client.js';
import { scaleInterval, usePollRate } from '../../../transport/pollRate.js';

/**
 * The overlay, from the panel's side.
 *
 * One command carries the whole conversation: out goes what should be shown,
 * back comes whatever the picker landed on. There is no push channel for a
 * pick — push is only ever a hint in this design — so the answer rides on the
 * poll that was happening anyway.
 *
 * The interval is short because the highlight follows the pointer across the
 * tree, and because a pick should feel immediate rather than eventual. It costs
 * nothing while both switches are off: the page tears the overlay down and
 * unhooks the renderer, and the call is a no-op either way.
 */

/**
 * Fast enough that a pick lands without a visible wait — at the panel's
 * `Normal` poll rate, which the setting scales the same way it scales every
 * `useResource` (see `transport/pollRate.ts`). This loop is hand-rolled
 * because of what rides back on it, so it has to ask for itself.
 */
const INTERVAL_MS = 100;

export interface OverlayControls {
  /** How much of the frame is drawn — see `HighlightMode`. */
  highlight: HighlightMode;
  picker: boolean;
  /**
   * The wrap box of the selected caption, and how much of the origin gizmo is
   * drawn. Each stands on its own: a switch here draws what it names and
   * nothing else — see `overlay.ts` in core.
   */
  wrapBox: boolean;
  axes: AxesMode;
  /**
   * Whether the selected node carries a frame that can be dragged, scaled and
   * turned in the page — the one switch here that lets the panel **change** the
   * scene by pointing at it instead of by typing a number.
   */
  transform: boolean;
  setHighlight: (value: HighlightMode) => void;
  setPicker: (value: boolean) => void;
  setWrapBox: (value: boolean) => void;
  setAxes: (value: AxesMode) => void;
  setTransform: (value: boolean) => void;
  /** Call as the pointer moves over the tree. */
  setHovered: (id: NodeId | null) => void;
}

export function useOverlay(
  client: Client,
  selected: NodeId | null,
  /**
   * What the last click landed on, topmost first. The whole stack rather than
   * the node on top: overlapping nodes are exactly what the picker is bad at,
   * and the panel offers the rest as a list beside the tree.
   */
  onPicked: (ids: readonly NodeId[]) => void,
  /**
   * How the page should paint the overlay. Owned by the shell, because the gear
   * that edits it is in the bar up there — this hook only carries it across.
   */
  style: OverlayStyle,
  /**
   * Nodes the tree has pinned a gizmo to, with the caption each carries. Held
   * by `ScenePanel`, which is where both the rows and this poll can see it.
   */
  pinned: AxesPin[],
): OverlayControls {
  // Neither switch is remembered. Both change what the inspected page draws,
  // and a panel that reopens with the picker armed steals the next click on the
  // application; the highlight is the state to come back to instead.
  const [highlight, setHighlight] = useState<HighlightMode>('fill');
  const [picker, setPicker] = useState(false);
  const [transform, setTransform] = useState(false);
  /*
   * These two are stored, unlike the two above, and the difference is what each
   * one costs to come back to. A remembered picker steals the next click on the
   * application, and a remembered highlight is a keystroke either way. But how
   * much of the overlay someone wants drawn over their scene is a preference
   * arrived at once — and a DevTools panel is torn down and rebuilt constantly,
   * so without this it would be re-entered on every reopen.
   */
  const [wrapBox, setWrapBox] = useLocalStorage('scene.overlay.wrapBox', true);
  const [axes, setAxes] = useLocalStorage<AxesMode>('scene.overlay.axes', 'arrows');
  const [hovered, setHovered] = useState<NodeId | null>(null);

  /*
   * The picker and the frame are one tool between them: both take the pointer
   * over the application, and a press on the canvas cannot mean "select this"
   * and "drag this" at the same time. So arming either disarms the other — done
   * here rather than in the toolbar, because it is a fact about the two
   * switches and not about the buttons that happen to press them.
   */
  const armPicker = useCallback((value: boolean) => {
    setPicker(value);
    if (value) setTransform(false);
  }, []);

  const armTransform = useCallback((value: boolean) => {
    setTransform(value);
    if (value) setPicker(false);
  }, []);

  const interval = scaleInterval(INTERVAL_MS, usePollRate());
  // Read here rather than passed in, the same as the poll rate above it: it is
  // a setting of the panel, and the gear that edits it is nowhere near this.
  const depth = usePickDepth();

  // Read inside the loop rather than captured, so the loop never restarts and
  // a hover change takes effect on the next tick instead of resetting the timer.
  const state = useRef({
    highlight,
    picker,
    wrapBox,
    axes,
    transform,
    style,
    pinned,
    interval,
    hovered,
    selected,
    onPicked,
    depth,
  });
  state.current = {
    highlight,
    picker,
    wrapBox,
    axes,
    transform,
    style,
    pinned,
    interval,
    hovered,
    selected,
    onPicked,
    depth,
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async (): Promise<void> => {
      if (cancelled) return;

      // Skipped rather than stopped while the tab is in the background, the
      // same as `useResource` does: nothing is watching the overlay, and the
      // loop picks itself back up without anything having to restart it.
      if (document.hidden) {
        timer = setTimeout(() => void tick(), state.current.interval);
        return;
      }

      const {
        highlight: h,
        picker: p,
        wrapBox: wrap,
        axes: gizmo,
        transform: frame,
        style: paint,
        pinned: pins,
        hovered: over,
        selected: sel,
        onPicked: pick,
        depth: dig,
      } = state.current;

      try {
        const result = await client.call('overlay.config', {
          highlight: h,
          picker: p,
          selected: sel,
          hovered: over,
          wrapBox: wrap,
          axes: gizmo,
          transform: frame,
          style: paint,
          pinned: pins,
          pickDepth: dig,
        });

        // The picker stays on until it is switched off: picking a node selects
        // it and nothing more, so several nodes can be picked in a row.
        if (!cancelled && result.picked.length > 0) pick(result.picked);
      } catch {
        // No host on the page yet, or it went away. The next tick finds out.
      }

      if (!cancelled) timer = setTimeout(() => void tick(), state.current.interval);
    };

    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Leaving the tab must not leave a div over the application's canvas.
      // Every switch, spelled out: each draws on its own now, and the two that
      // are on when nothing is said would keep the overlay installed.
      client.send('overlay.config', {
        highlight: 'off',
        picker: false,
        transform: false,
        wrapBox: false,
        axes: 'off',
      });
    };
  }, [client]);

  return {
    highlight,
    picker,
    wrapBox,
    axes,
    transform,
    setHighlight,
    setPicker: armPicker,
    setWrapBox,
    setAxes,
    setTransform: armTransform,
    setHovered: useCallback((id: NodeId | null) => {
      setHovered(id);
    }, []),
  };
}
