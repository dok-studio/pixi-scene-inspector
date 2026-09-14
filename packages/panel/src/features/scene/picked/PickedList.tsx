import type { NodeId } from '@scene-inspector/protocol';
import { useEffect, useRef, useState } from 'react';
import { LuFilter as FilterIcon, LuX as CloseIcon } from 'react-icons/lu';

import { CollapsibleSection } from '../../../components/collapsible/collapsible-section.js';
import { Button } from '../../../components/ui/button.js';
import { Toggle } from '../../../components/ui/toggle.js';
import { Hint } from '../../../components/ui/tooltip.js';
import { useT } from '../../../i18n/index.js';
import { cn } from '../../../lib/utils.js';
import { DEFAULT_LIST_PX, HEADER_PX } from '../strip/stripHeight.js';
import { useStripHeight } from '../strip/useStripHeight.js';
import { TYPE_FILTERS, shownBy, toggled, toneOf } from './filters.js';

/**
 * What the last pick landed on, under the tree.
 *
 * The picker asks the page what is under the click and the page answers with
 * the node on top — which, in a scene where anything is drawn over anything,
 * is regularly not the node being looked for. A button behind a banner, a
 * sprite under a full-screen tint: the pick lands on the cover every time and
 * there is no click that reaches what is beneath it.
 *
 * So the page answers with the whole stack (`adapters/picking.ts`), the topmost
 * one is selected as it always was, and the rest is offered here. Hovering a
 * row highlights that node on the canvas through the same channel the tree's
 * rows use — which is the part that actually settles it, because four sprites
 * with the same name are told apart by which one lights up, not by reading.
 *
 * It stands where the bookmarks stand and takes their place while it is up:
 * both are lists of nodes under the tree, and two strips stacked would leave
 * the tree itself the smallest thing in the pane. It is the transient one, so
 * it is the one that covers, and closing it puts the bookmarks back.
 */

/** Its own key: how tall this list is chosen at is not how tall bookmarks are. */
const HEIGHT_KEY = 'scene.picked.height';

export interface PickedRow {
  id: NodeId;
  /** As the tree would read it: the name, then the type beside it. */
  name: string;
  suffix: string;
  /** The canonical Pixi type, which is what the filters in the head are on. */
  type: string;
}

export function PickedList({
  rows,
  selected,
  onSelect,
  onHover,
  onClose,
}: {
  /** Topmost first, as the scene stacks them. */
  rows: readonly PickedRow[];
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
  /** The pointer entered or left a row: what the overlay highlights on hover. */
  onHover: (id: NodeId | null) => void;
  onClose: () => void;
}) {
  /*
   * Not stored, unlike the bookmarks' fold state. This list is up until the
   * next click and then gone, so "how I like to leave it" does not apply — and
   * a list that came back folded would be a list nobody sees appear.
   */
  const [collapsed, setCollapsed] = useState(false);
  /*
   * Which kinds the list is narrowed to, for as long as this window is up.
   *
   * Plain state, so it lives exactly as long as the window does: it survives
   * click after click while the window stays open — "I am looking for the
   * sprite" is a hunt, not one pick — and is gone the moment the window is,
   * whether that is the close button, a pick that found one node, or the picker
   * being switched off. A filter that outlived the window it belongs to would
   * be a list narrowed by something nobody could see they had asked for.
   */
  const [filters, setFilters] = useState<string[]>([]);
  const strip = useStripHeight(HEIGHT_KEY, DEFAULT_LIST_PX, collapsed);
  const t = useT();

  const shown = rows.filter((row) => shownBy(filters, row.type));

  /*
   * The highlight is left on the node the pointer is over, and this list goes
   * away on the next pick — without its own mouse-leave, because the rows are
   * gone by then. Same case as a tree row removed under the pointer, and the
   * same answer (`tree/node.tsx`): clear the hover on the way out.
   */
  const clear = useRef(onHover);
  clear.current = onHover;

  useEffect(
    () => () => {
      clear.current(null);
    },
    [],
  );

  return (
    // Not `shrink-0`, for the reason the bookmarks' strip is not: the tree
    // above carries the floor, so a pane too short for both takes it out of
    // here rather than out of the tree.
    <div
      ref={strip.ref}
      className="flex min-h-0 flex-col overflow-hidden"
      style={collapsed ? undefined : { height: HEADER_PX + strip.height }}
    >
      {/* The divider **is** the border, as in the strip this one replaces: the
          header's own top rule is turned off below, so there is one line here
          rather than two stacked. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        className={cn('bg-border h-[3px] shrink-0', !collapsed && 'cursor-row-resize')}
        onPointerDown={strip.onPointerDown}
      />

      <CollapsibleSection
        title={t('scene.picked.title')}
        className="border-t-0 overflow-hidden px-2 font-medium"
        onCollapse={setCollapsed}
        aside={
          <>
            {/* What is on screen, and what a filter is keeping off it. The
                second half appears only while something is pressed: a bare
                count is the ordinary case and reads better without a slash. */}
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {shown.length === rows.length
                ? rows.length
                : `${String(shown.length)}/${String(rows.length)}`}
            </span>
            {/* Inside the header, and the header is itself the control that
                folds the section — so this click has to stop here, the way the
                bookmarks' clear button does. */}
            <Hint text={t('scene.picked.close')}>
              <Button
                variant="ghost"
                size="xs"
                className="h-4 w-4 shrink-0 px-0"
                onClick={(event) => {
                  onClose();
                  event.stopPropagation();
                }}
              >
                <CloseIcon />
              </Button>
            </Hint>
          </>
        }
      >
        {/* A row of its own rather than more things in the header. The header
            already carries a title that truncates, a count, a close button and
            the fold arrow, and this pane goes down to a few characters wide —
            four more buttons in there push the arrow off the edge, which is the
            failure the bookmark header's own `overflow-hidden` was written for.
            Here they wrap instead, and nothing can be pushed anywhere. */}
        <div className="border-border flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1">
          {/* What the row is, said in one glyph. Without it a line of five
              coloured words reads as a legend — something to be understood
              rather than pressed — and the first thing anyone needs to know
              about it is that it is a control. */}
          <FilterIcon
            className="text-muted-foreground mr-0.5 h-3 w-3 shrink-0"
            aria-hidden="true"
          />
          {TYPE_FILTERS.map((filter) => (
            <Hint key={filter.key} text={t.fill('scene.picked.filter', { type: filter.label })}>
              <Toggle
                variant="outline"
                size="xs"
                // The kind's own colour, in the ink while it is off and in the
                // fill while it is on — the same colour the type wears in the
                // rows below, which is what makes this row a legend as well as
                // a control. `cn` lets these win over the variant's own primary.
                className={cn('h-4', filter.chip)}
                pressed={filters.includes(filter.key)}
                onPressedChange={() => {
                  // From what is stored at the moment it runs, not from what
                  // this render closed over: two of these pressed inside one
                  // batch — a fast pair of clicks — would otherwise have the
                  // second undo the first, because both would start from the
                  // same list.
                  setFilters((current) => toggled(current, filter.key));
                }}
              >
                {filter.label}
              </Toggle>
            </Hint>
          ))}
        </div>

        {shown.length === 0 && (
          // The list is never empty by itself — the window is only up when a
          // click found more than one node — so this says what is holding the
          // rows back, with the buttons that let them go right above it.
          <p className="text-muted-foreground px-2 py-1 text-xs">
            {t('scene.picked.empty')}
          </p>
        )}

        <ul className="min-h-0 flex-1 overflow-y-auto pb-1">
          {shown.map((row) => (
            <li
              key={row.id}
              className={cn(
                'flex h-5 items-center gap-1 pl-2 pr-1',
                row.id === selected && 'bg-primary/20',
              )}
              onMouseEnter={() => {
                onHover(row.id);
              }}
              onMouseLeave={() => {
                onHover(null);
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onSelect(row.id);
                }}
                className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
              >
                {row.name}
                {row.suffix === '' ? null : (
                  // A kind with a button of its own is spelled in that button's
                  // colour; everything else stays the grey it has always been,
                  // which says there is no button to look for.
                  <span className={cn('text-muted-foreground', toneOf(row.type))}>
                    {' '}
                    {row.suffix}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </div>
  );
}
