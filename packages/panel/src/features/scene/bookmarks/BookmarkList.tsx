import type { NodeId } from '@scene-inspector/protocol';
// The row's own glyph with a cross on it, for the button that takes them all
// off — the same argument the tree's "unpin every gizmo" button is drawn by:
// what it clears has to be visible in what it is drawn as.
import { LuBookmarkX as ClearIcon, LuX as RemoveIcon } from 'react-icons/lu';

import { CollapsibleSection } from '../../../components/collapsible/collapsible-section.js';
import { Button } from '../../../components/ui/button.js';
import { Hint } from '../../../components/ui/tooltip.js';
import { useT } from '../../../i18n/index.js';
import { useLocalStorage } from '../../../lib/localStorage.js';
import { cn } from '../../../lib/utils.js';
import { DEFAULT_LIST_PX, HEADER_PX } from '../strip/stripHeight.js';
import { useStripHeight } from '../strip/useStripHeight.js';
import type { NodePath } from './path.js';

/**
 * The bookmarked nodes, under the tree.
 *
 * It exists because the tree is not always a way of reaching a node: a node
 * deep in the graph takes a dozen branches to open, and the picker only reaches
 * what is on screen right now. So a node is written down once and reached from
 * here afterwards — including after the page has reloaded, which is the case
 * the whole feature is for.
 *
 * What it shows is the entries whose walk leads somewhere in the scene on
 * screen. The store is one list across every game (`store.ts`), and this is
 * where that stops mattering: the rows are the ones this game has.
 *
 * A strip with a divider of its own rather than a second resizable split — see
 * `strip/useStripHeight.ts`, which the list of picked nodes shares. The
 * arithmetic at the ends of the drag lives in `strip/stripHeight.ts`.
 */

const HEIGHT_KEY = 'scene.bookmarks.height';
const COLLAPSED_KEY = 'scene.bookmarks.collapsed';

export interface BookmarkRow {
  /** The stored walk. The row's identity, and what removing it names. */
  path: NodePath;
  /**
   * The node it leads to.
   *
   * Never null: an entry whose walk leads nowhere in this scene gets no row at
   * all. The list is one list across every game, so "leads nowhere here" is
   * both "belongs to another game" and "this game has not built that screen
   * yet" — and neither is worth a row that cannot be clicked. It appears by
   * itself once the node does, because the rows are rebuilt on every poll.
   */
  id: NodeId;
  /** As the tree would read it: the name, then the type beside it. */
  name: string;
  suffix: string;
}

/** Enough to tell two rows apart, and stable while the walk is. */
function keyOf(path: NodePath): string {
  return path.map((step) => `${String(step.index)}:${step.name}:${step.type}`).join('/');
}

/** The walk spelled out, for the row's tooltip: two nodes may read alike. */
function walkOf(path: NodePath): string {
  return path.map((step) => (step.name === '' ? step.type : step.name)).join(' / ');
}

export function BookmarkList({
  rows,
  selected,
  onSelect,
  onRemove,
  onClear,
}: {
  rows: readonly BookmarkRow[];
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
  onRemove: (path: NodePath) => void;
  onClear: () => void;
}) {
  /*
   * Both outlive the panel being closed, and neither is a note about a node:
   * how tall this list is and whether it is open are how someone likes to work,
   * the way a folded section or the poll rate is.
   */
  const [collapsed, setCollapsed] = useLocalStorage(COLLAPSED_KEY, false);
  const strip = useStripHeight(HEIGHT_KEY, DEFAULT_LIST_PX, collapsed);
  const t = useT();

  if (rows.length === 0) return null;

  return (
    /*
     * Deliberately not `shrink-0`: the tree above carries the floor instead
     * (`min-h-16` on the frame's body), so when the drawer is pulled down past
     * what the two of them need, flexbox takes it out of this strip. That is
     * the same order of preference `clampListHeight` applies to the drag, and
     * without it a list left tall from a taller window would squeeze the tree
     * to nothing.
     */
    <div
      ref={strip.ref}
      className="flex min-h-0 flex-col overflow-hidden"
      style={collapsed ? undefined : { height: HEADER_PX + strip.height }}
    >
      {/* The divider **is** the border: the header's own top rule is turned off
          below, so there is one line here rather than two stacked. It stays
          while the list is folded away, where it is the seam between the tree
          and the header — and only there it is not draggable, because there is
          nothing on the far side of the drag to make bigger. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        className={cn('bg-border h-[3px] shrink-0', !collapsed && 'cursor-row-resize')}
        onPointerDown={strip.onPointerDown}
      />

      <CollapsibleSection
        title={t('scene.bookmarks.title')}
        /* `overflow-hidden` because the pane goes down to six characters, and
           the header has four things in it. The title is the one that gives
           way — it has `truncate` of its own — and the controls beside it keep
           their size, the way a property row shrinks its field and leaves the
           arrows alone. Without this the fold arrow itself was pushed clean
           off the edge at that width. */
        className="border-t-0 overflow-hidden px-2 font-medium"
        defaultCollapsed={collapsed}
        onCollapse={setCollapsed}
        aside={
          <>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {rows.length}
            </span>
            {/* Inside the header, and the header is itself the control that
                folds the section — so this click has to stop here, the way the
                copy icon beside a section title does.

                A glyph rather than the word "Clear": at the pane's minimum
                width those five characters were the difference between the
                fold arrow being on screen and being past the edge. */}
            <Hint text={t('scene.bookmarks.clearAll')}>
              <Button
                variant="ghost"
                size="xs"
                className="h-4 w-4 shrink-0 px-0"
                onClick={(event) => {
                  onClear();
                  event.stopPropagation();
                }}
              >
                <ClearIcon />
              </Button>
            </Hint>
          </>
        }
      >
        <ul className="min-h-0 flex-1 overflow-y-auto pb-1">
          {rows.map((row) => (
            <li
              key={keyOf(row.path)}
              className={cn(
                'flex h-5 items-center gap-1 pl-2 pr-1',
                row.id === selected && 'bg-primary/20',
              )}
            >
              <Hint text={walkOf(row.path)}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(row.id);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                >
                  {row.name}
                  {row.suffix === '' ? null : (
                    <span className="text-muted-foreground"> {row.suffix}</span>
                  )}
                </button>
              </Hint>

              <Hint text={t('scene.bookmarks.remove')}>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-4 w-4 shrink-0 px-0"
                  onClick={() => {
                    onRemove(row.path);
                  }}
                >
                  <RemoveIcon />
                </Button>
              </Hint>
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </div>
  );
}
