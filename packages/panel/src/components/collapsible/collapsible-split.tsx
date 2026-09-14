import { useEffect, useRef } from 'react';
import { useT } from '../../i18n/index.js';
import type { ImperativePanelGroupHandle, PanelProps } from 'react-resizable-panels';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { useElementWidth } from '../../lib/useElementWidth.js';
import { MAX_DIGITS, MIN_DIGITS, MIN_LIST_PX, paneWidthForDigits } from '../properties/paneWidth.js';
import { useDigitWidth } from '../properties/useDigitWidth.js';
import { clampSplit, differs } from './splitLayout.js';

/**
 * A resizable split, ported from the previous project.
 *
 * Without the foldable header it had there. A section called Scene inside a tab
 * called Scene says the word twice, and "Textures" inside a tab called Assets
 * was not much better: the tab holds nothing else, so the header named the
 * whole of it and offered to fold away everything the tab was opened for.
 * A line and a control, spent on saying where you already are.
 *
 * What was added is that **the two sides have limits of their own**, and they
 * are not symmetrical. The right-hand side is where the editors are, and its
 * width is worth a number of characters rather than a number of pixels — see
 * `properties/paneWidth.ts`. The left-hand side is a list, and a list survives
 * being narrow: a name is still a name at six characters and the rest scrolls,
 * so this is the side that gives way when both cannot be had.
 *
 * Pixels have to be turned into per cent because that is what the library
 * speaks, and per cent of what depends on how the drawer is docked: thirty per
 * cent is a comfortable pane along the bottom of the window and a useless strip
 * at the side of it.
 *
 * Both measurements it needs — the width it divides and the width of one
 * character in the face it is set in — are hooks of their own now, because the
 * Custom tab divides a panel between whole columns by exactly the same
 * arithmetic.
 */

export const CollapsibleSplit: React.FC<{
  left: React.ReactNode;
  right: React.ReactNode;
  /**
   * Whether the right-hand side is a fixed width rather than a share of one.
   *
   * The Scene tab's editors are worth more room on a wide drawer and less on a
   * narrow one, so its split is dragged. The Assets pane is a 256px preview and
   * a column of read-only rows: it has one right width, and every other width
   * is either wasted on it or taken from the grid that could use it. So Assets
   * fixes it at the floor the editors are guaranteed, and the grid — which
   * divides its own width between its tiles — takes everything else.
   *
   * There is no handle at all in that mode. A handle that can only be put back
   * where it was is a control that costs a misclick to find out about.
   */
  fixedRight?: boolean;
}> = ({ left, right, fixedRight = false }) => {
  const t = useT();
  const { ref: splitRef, width } = useElementWidth<HTMLDivElement>();
  const { digit, face } = useDigitWidth();
  const group = useRef<ImperativePanelGroupHandle>(null);

  /**
   * The limits as per cent of what there is.
   *
   * When the drawer is too narrow to hold both minima they shrink **in
   * proportion** rather than one of them winning outright — there is nothing
   * else to be done with a width that small. What this avoids is the panel that
   * made it necessary, where a flat cap meant the editors lost room long before
   * the list had given up any.
   *
   * These are the resizable side's limits, and the only tab left on it is Scene
   * — where the editors are a column of vector fields and eight digits is more
   * than a coordinate is ever read to. Assets does not come through here at all:
   * its pane has one right width and takes it (`fixedRight`).
   */
  const limits =
    width === 0 || digit === 0
      ? null
      : {
          minList: (MIN_LIST_PX / width) * 100,
          minEditor: (paneWidthForDigits(MIN_DIGITS, digit) / width) * 100,
          maxEditor: (paneWidthForDigits(MAX_DIGITS, digit) / width) * 100,
        };

  /**
   * The library applies these while a handle is dragged and not when the group
   * itself resizes: narrow the drawer and the stored percentages are merely
   * rescaled. So the layout is put back inside its limits here.
   */
  useEffect(() => {
    const handle = group.current;
    if (handle === null || limits === null) return;

    const layout = handle.getLayout();
    if (layout.length !== 2) return;

    const current: [number, number] = [layout[0] ?? 0, layout[1] ?? 0];
    const clamped = clampSplit(current, limits);

    if (differs(current, clamped)) handle.setLayout(clamped);
  });

  /** The limits, as the library wants them, or nothing before it has measured. */
  const options = (min: number | undefined, max?: number): PanelProps => ({
    ...(min === undefined ? {} : { minSize: min }),
    ...(max === undefined ? {} : { maxSize: max }),
  });

  /*
   * The fixed layout, which needs none of the machinery above it: no
   * percentages to hold inside limits when the drawer resizes, and no handle.
   * The width is still a number of characters rather than of pixels — the same
   * one the resizable side is floored at — so the two tabs put their rows in
   * the same place in whatever face the panel is set in.
   */
  if (fixedRight) {
    return (
      <div className="flex h-full flex-1 overflow-hidden">
        <div ref={splitRef} className="relative flex h-full w-full">
          {face}
          <div className="flex h-full min-w-0 flex-1 overflow-auto">{left}</div>
          <div
            className="border-border flex h-full shrink-0 overflow-auto border-l"
            style={{ width: digit === 0 ? undefined : paneWidthForDigits(MIN_DIGITS, digit) }}
          >
            {right}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <div ref={splitRef} className="relative bottom-0 right-0 w-full">
        {face}

        <PanelGroup direction="horizontal" ref={group}>
          {/* Left is the list and right is the editors, in both tabs that use
              this split — which is what makes the limits placeable here. */}
          <Panel className="flex h-full overflow-auto" {...options(limits?.minList)}>
            {left}
          </Panel>
          {/*
            A two-pixel rule, and a target several times wider than it.

            The line is as thin as it was on purpose — it divides two panes and
            has nothing else to say — but two pixels is not something a pointer
            catches, so the handle reads as decoration rather than as a control.
            The child reaches past it on both sides without taking any width from
            either pane, since it is out of the flow; the line itself lights up
            on hover and while it is being dragged, which is the only way anyone
            finds out it can be moved at all.
          */}
          <PanelResizeHandle
            className="bg-border data-[resize-handle-state=drag]:bg-primary data-[resize-handle-state=hover]:bg-primary relative w-0.5 shrink-0 cursor-col-resize outline-none transition-colors"
            title={t('ui.split.drag')}
          >
            <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
          </PanelResizeHandle>
          <Panel
            className="flex h-full overflow-auto"
            {...options(limits?.minEditor, limits?.maxEditor)}
          >
            {right}
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
};
