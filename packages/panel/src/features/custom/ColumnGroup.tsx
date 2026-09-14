import { Fragment, useEffect, useRef } from 'react';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

import { useT } from '../../i18n/index.js';
import type { Column } from './columns.js';
import { floorFor } from './columnFloor.js';
import { clampColumns, differs } from './columnLayout.js';

/**
 * The columns of the Custom tab, side by side, with a rule between each pair.
 *
 * The same handle the split inside each tab draws, on purpose: a panel with two
 * kinds of divider is a panel where one of them has to be learned twice.
 *
 * The layout is remembered by the library, under an id made of the set itself.
 * Per set rather than one id for all of them, because the width that suited two
 * columns says nothing about three — dropping Stats and putting it back would
 * otherwise leave Scene and Assets wherever the three-column drag had left
 * them.
 */
export function ColumnGroup({
  columns,
  panelFor,
  width,
  digitPx,
}: {
  columns: readonly Column[];
  /** The tab's own element. Built by the shell — this component lays out
   *  whatever it is handed and knows nothing about what is inside. */
  panelFor: (column: Column) => React.ReactNode;
  /** What there is to divide, measured by the tab above. */
  width: number;
  /** One character in the face the panel is set in — the floors are stated in
   *  characters, not pixels. See `columnFloor.ts`. */
  digitPx: number;
}) {
  const t = useT();
  const group = useRef<ImperativePanelGroupHandle>(null);

  /*
   * The floors as per cent of what there is, which is what the library speaks.
   * Nothing before the panel has been measured: limits worked out from a width
   * of zero would be limits of a hundred per cent each.
   */
  const minima =
    width <= 0 || digitPx <= 0
      ? null
      : columns.map((column) => (floorFor(column, digitPx) / width) * 100);

  /*
   * The library holds `minSize` while a handle is being dragged and not when
   * the group itself resizes — narrow the panel and the stored percentages are
   * merely rescaled — so the layout is put back inside its limits here. Same
   * arrangement as `collapsible-split.tsx`, and the arithmetic is a pure
   * function for the same reason.
   */
  useEffect(() => {
    const handle = group.current;
    if (handle === null || minima === null) return;

    const current = handle.getLayout();
    if (current.length !== columns.length) return;

    const clamped = clampColumns(current, minima);
    if (differs(current, clamped)) handle.setLayout(clamped);
  });

  return (
    <PanelGroup
      direction="horizontal"
      ref={group}
      autoSaveId={`custom:${columns.join(',')}`}
      className="min-h-0 flex-1"
    >
      {columns.map((column, index) => (
        <Fragment key={column}>
          {index > 0 && (
            /*
             * A gutter, and deliberately **not** the hairline the split inside
             * each tab draws.
             *
             * That rule is thin on purpose: it divides two halves of one panel,
             * and has nothing else to say. This divides two whole tabs, and at
             * two pixels of `--border` on a run of `--background` it said the
             * same thing — three panels read as one long panel with faint
             * creases in it.
             *
             * So it is a **bar of the colour this panel draws edges in**,
             * several pixels of it. `--muted` was tried first, on the argument
             * that it is the panel's "between things" colour — and measured, it
             * is barely a step at all in the dark theme: 15.9% lightness
             * against the background's 13%, so the whole separation would have
             * rested on a hairline at each side. `--border` is 24% there, and
             * 83% against a 95% background in the light one: a step the eye
             * takes without being asked, in both.
             *
             * Wide enough to be caught by the pointer, too, so the handle needs
             * no target reaching past it — which the hairline inside each tab
             * does need, and is the other half of why the two do not look alike.
             */
            <PanelResizeHandle
              className="bg-border data-[resize-handle-state=drag]:bg-primary data-[resize-handle-state=hover]:bg-primary w-1.5 shrink-0 cursor-col-resize outline-none transition-colors"
              title={t('ui.split.drag')}
            />
          )}
          <Panel
            className="flex h-full min-w-0 flex-col overflow-hidden"
            {...(minima === null ? {} : { minSize: minima[index] })}
          >
            {panelFor(column)}
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
  );
}
