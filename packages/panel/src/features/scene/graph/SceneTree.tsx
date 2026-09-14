import type { NodeId, SceneNode } from '@scene-inspector/protocol';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TreeApi } from 'react-arborist';
import { Tree } from 'react-arborist';
import { FaWandMagicSparkles as PickIcon } from 'react-icons/fa6';
// Stroked, like the switches beside it, rather than the filled set the picker
// comes from: this one is not a control, it is the field saying what it is.
import { LuSearch as SearchIcon, LuSigma as CountsIcon } from 'react-icons/lu';
import AutoSizer from 'react-virtualized-auto-sizer';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog.js';
import { Button } from '../../../components/ui/button.js';
import { Separator } from '../../../components/ui/separator.js';
import { Toggle } from '../../../components/ui/toggle.js';
import { Hint, TooltipWrapper } from '../../../components/ui/tooltip.js';
import { useT } from '../../../i18n/index.js';
import type { Client } from '../../../transport/client.js';
import type { BookmarkRow } from '../bookmarks/BookmarkList.js';
import { BookmarkList } from '../bookmarks/BookmarkList.js';
import type { NodePath } from '../bookmarks/path.js';
import type { PickedRow } from '../picked/PickedList.js';
import { PickedList } from '../picked/PickedList.js';
import { formatBinding, useHotkeys } from '../../settings/hotkeys.js';
import { OverlaySwitches } from './OverlaySwitches.js';
import { Cursor } from './tree/cursor.js';
import type { NodeActions } from './tree/node.js';
import { makeNodeRenderer } from './tree/node.js';
import type { TreeNodeData } from './tree/nested.js';
import { toNested } from './tree/nested.js';
import { Row } from './tree/row.js';
import { useEqualRowWidths } from './tree/rowWidth.js';
import type { OverlayControls } from './useOverlay.js';
import { CountsStrip } from '../counts/CountsStrip.js';
import { useOverlayHotkeys } from './useOverlayHotkeys.js';

/**
 * The scene graph, ported from the previous project: the same toolbar, the same
 * search box, and react-arborist doing the rows.
 *
 * What changed underneath is where the data comes from. There the component
 * pulled a nested graph out of a global store and pushed edits back as
 * hand-built JavaScript strings; here it takes a flat payload and calls typed
 * commands.
 */

/**
 * The gizmo's own glyph, with a cross beside it.
 *
 * Drawn here rather than taken from the set, because the set has no "axes off",
 * and the two things near enough to borrow both said the wrong thing: a circle
 * and slash reads as *no entry*, a bare cross as *close*. What this button does
 * is take the sign in the rows above off the scene, so it has to **be** that
 * sign — the same two strokes `LuAxis3D` is, which the row buttons and the
 * switch in the row above are drawn with — and then say what is being done to it.
 *
 * A line **through** it was tried first and is the reason this is hand-drawn
 * rather than two glyphs stacked: `LuAxis3D` is an L opening up and to the
 * right, and a slash across it closes that L into a triangle. It read as a set
 * square. So the cross sits beside the axes instead, in the corner their own L
 * leaves empty, where nothing has to be drawn over anything.
 */
function ClearPinsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* `LuAxis3D`, pulled in and down to leave that corner free. */}
      <path d="M4 8v12h12" />
      <path d="m4 20 5-5" />
      <path d="m15 3 6 6" />
      <path d="m21 3-6 6" />
    </svg>
  );
}

const Panel: React.FC<{
  children: React.ReactNode;
  /**
   * Held by the tree above rather than here.
   *
   * It was in both, set twice per keystroke, and the copy here existed only
   * to feed the field's `value` — while the copy above was the one the rows
   * were actually filtered by.
   */
  search: string;
  onSearch: (term: string) => void;
  /**
   * The first row: the ways of looking at the scene rather than at the list —
   * the picker and the overlay's switches.
   */
  toolbar?: React.ReactNode;
  /** After the field rather than before it — see `SceneTree`'s use of this. */
  trailing?: React.ReactNode;
  /**
   * Under the tree, inside the same column, so the rows above give way to it
   * rather than the pane growing a scrollbar of its own.
   */
  footer?: React.ReactNode;
}> = ({ children, search, onSearch, toolbar, trailing, footer }) => {
  const t = useT();

  return (
    <div className="relative left-0 top-0 w-full overflow-hidden">
      <div className="flex h-full flex-col">
        {/* Two rows, not one.
            The buttons are ways of looking at the **scene**; the field is a way
            of looking at the **list**. Sharing a row made the field's width the
            leftovers of however many buttons there were, and this pane goes
            down to six characters — a search box a few characters wide is not
            one. Given a row of its own it always has the whole width. */}
        {/* The buttons are rounded, and rounded buttons run together read as
            one strip that has been cut up rather than as separate controls.
            Two pixels between them and four at the ends of the row is enough
            to tell them apart — the same spacing the navbar gives its own
            three. The gap falls around the separators too, which is what they
            were for and could not do while everything was flush. */}
        <div className="border-border flex h-8 max-h-8 shrink-0 items-center gap-0.5 border-b px-1">
          {toolbar}
        </div>
        <div className="border-border flex h-8 max-h-8 shrink-0 items-center border-b">
          {/* A `label` rather than a `div` so that the glyph is part of the
              field and not a button beside it: clicking it puts the caret in
              the input, which is what a lens over a search box promises. It
              never shrinks — the pane goes down to six characters, and the one
              thing that must survive that is the field, not its sign. */}
          <label className="flex h-8 min-w-0 flex-1 cursor-text items-center pl-2">
            <SearchIcon className="text-muted-foreground h-3 w-3 shrink-0" aria-hidden="true" />
            <input
              type="text"
              placeholder={t('scene.search')}
              className="h-8 w-full min-w-0 border-none bg-transparent px-2 outline-none"
              value={search}
              onChange={(event) => {
                onSearch(event.target.value);
              }}
            />
          </label>
          {/* The field takes the slack, so a rule before whatever comes after it
              is the one thing that stops the two reading as one control. */}
          {trailing !== undefined && <Separator orientation="vertical" className="h-4" />}
          {trailing}
        </div>
        {/* `min-h-16` is the tree's floor, and it is what makes the strip below
            resizable without either of them measuring the other: the footer is
            free to shrink, this is not, so a drawer pulled down past what the
            two of them want takes the room out of the footer. */}
        <div className="min-h-16 flex-1 overflow-auto p-2">
          <div className="h-full min-w-max text-sm">{children}</div>
        </div>
        {footer}
      </div>
    </div>
  );
};

export function SceneTree({
  client,
  nodes,
  selected,
  overlay,
  pinned,
  bookmarked,
  bookmarks,
  picked,
  onSelect,
  onPin,
  onClearPins,
  onBookmark,
  onRemoveBookmark,
  onClearBookmarks,
  onClosePicked,
  counts,
  onCounts,
}: {
  client: Client;
  nodes: readonly SceneNode[];
  selected: NodeId | null;
  overlay: OverlayControls;
  /** Which nodes carry a gizmo of their own. Held above — see `ScenePanel`. */
  pinned: ReadonlySet<NodeId>;
  /** Which nodes are bookmarked — the ones of the list that are here now. */
  bookmarked: ReadonlySet<NodeId>;
  /** The whole list, including what this scene has nothing to match. */
  bookmarks: readonly BookmarkRow[];
  /**
   * The nodes the last pick found and is worth offering, topmost first. The
   * list is shown from two of them up — one node under the click is the
   * ordinary case, and a list of it offers nothing the selection has not
   * already said.
   */
  picked: readonly PickedRow[];
  onSelect: (id: NodeId | null) => void;
  onPin: (id: NodeId, pinned: boolean) => void;
  onClearPins: () => void;
  onBookmark: (id: NodeId, bookmarked: boolean) => void;
  /**
   * By path rather than by id, because the list holds rows the scene has
   * nothing to match — and taking one of those off is most of why the button
   * is there.
   */
  onRemoveBookmark: (path: NodePath) => void;
  onClearBookmarks: () => void;
  onClosePicked: () => void;
  /** Whether the counts strip is open. It is the tab's, not the tree's — the
   *  strip spans the whole width — but the button that opens it lives here. */
  counts: boolean;
  onCounts: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const data = useMemo(() => toNested(nodes, pinned, bookmarked), [nodes, pinned, bookmarked]);
  const tree = useRef<TreeApi<TreeNodeData> | null>(null);
  const pane = useEqualRowWidths();
  const hotkeys = useHotkeys();
  const t = useT();
  useOverlayHotkeys(overlay, () => {
    onCounts(!counts);
  });

  /**
   * The node Delete was pressed on, held until the question is answered.
   *
   * The name is kept alongside the id rather than looked up again when the
   * dialog renders: by then the poll may have moved on, and a dialog that
   * suddenly asks about a different node — or about nothing — is worse than
   * one asking about a node that has already gone, which the mutation itself
   * refuses harmlessly.
   *
   * `nextFocus` is where the tree should land afterwards, so that holding
   * Delete down a row at a time works without reaching for the mouse.
   */
  const [pendingDelete, setPendingDelete] = useState<{
    id: NodeId;
    name: string;
    nextFocus: string | null;
  } | null>(null);

  // A node picked in the scene is usually inside branches that were never
  // opened. react-arborist applies its `selection` prop by looking the row up
  // among the *visible* ones and only then scrolls to it — and scrolling is
  // what opens the ancestors — so that first attempt finds no row and drops the
  // highlight silently. The branch is open by the next pick, which is why the
  // highlight used to appear only after picking a second or third time.
  //
  // Open the ancestors first, rebuild the row list from that, and select then.
  //
  // On `data` as well as on the selection, because a selection can arrive
  // before the tree it names does: following a texture to one of the nodes
  // drawing it opens this tab on a node already chosen, and the first poll of
  // `scene.tree` has not answered yet. Without the second dependency the reveal
  // ran once against an empty tree and never again, leaving the node selected —
  // the properties and the overlay both showed it — inside branches that stayed
  // shut. The guard above keeps the repeat free once the row is on screen.
  useEffect(() => {
    const api = tree.current;
    if (api === null || selected === null) return;

    const id = String(selected);
    // Already a row on screen: arborist's own effect has selected it.
    if (api.get(id) !== null) return;

    api.openParents(id);
    // `openParents` only records which branches are open; the rows are rebuilt
    // on the render that follows, and the selection cannot wait for it.
    api.update(api.props);
    api.select(id, { focus: false });
  }, [selected, data]);

  const actions = useMemo<NodeActions>(
    () => ({
      // Visibility is a declared property, so it travels the same way every
      // other property does rather than needing a mutation of its own.
      setVisible: (node, visible) => {
        client.send('scene.setProp', { id: node.nodeId, key: 'visible', value: visible });
      },
      // A pin never reaches the scene: it is the panel's note about a node, and
      // the page only ever hears about it as part of the overlay's own poll.
      setPinned: (node, value) => {
        onPin(node.nodeId, value);
      },
      // Neither does a bookmark: it is a note about where the node was, and
      // the page is never told that one was made.
      setBookmarked: (node, value) => {
        onBookmark(node.nodeId, value);
      },
      setHovered: overlay.setHovered,
    }),
    [client, overlay.setHovered, onPin, onBookmark],
  );

  const renderNode = useMemo(() => makeNodeRenderer(actions), [actions]);

  /**
   * Delete on the focused row, asked about first.
   *
   * On the capture phase, and stopping there: react-arborist deletes on
   * Backspace of its own accord, without asking, and its handler sits on the
   * container below this one. Catching both keys here is what makes the
   * confirmation the only way through — the tree's own `onDelete` is not
   * wired at all, so there is no second path to keep honest.
   *
   * Only the focused row, never a multi-selection: the panel carries one
   * selected node, and the dialog names the node it is about.
   */
  const onKeyDownCapture = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;

    const api = tree.current;
    // A rename in progress owns the keyboard; Backspace there is a character.
    if (api === null || api.isEditing) return;

    event.preventDefault();
    event.stopPropagation();

    const node = api.focusedNode;
    // The stage is the one row the scene refuses to remove — it has nothing to
    // be removed from, and losing it would leave the panel with nothing to
    // show. Asking a question whose only honest answer is "no" is worse than
    // not asking, so the top-level row does not raise one.
    if (node === null || node.level === 0) return;

    setPendingDelete({
      id: node.data.nodeId,
      name: node.data.name,
      nextFocus: (node.nextSibling ?? node.parent)?.id ?? null,
    });
  };

  const confirmDelete = (): void => {
    if (pendingDelete === null) return;

    client.send('scene.mutate', { kind: 'delete', id: pendingDelete.id });

    if (pendingDelete.nextFocus !== null) {
      tree.current?.focus(pendingDelete.nextFocus, { scroll: false });
    }
    setPendingDelete(null);
  };

  return (
    <>
      <Panel
        search={search}
        onSearch={setSearch}
        toolbar={
          // The picker first, then what it points at gets drawn on. All four
          // reach through the page rather than through the list, which is why
          // the overlay's switches came down here from a bar of their own —
          // see `OverlaySwitches.tsx`.
          <>
            <TooltipWrapper
              trigger={
                <Toggle
                  asChild
                  variant="ghost"
                  size="icon"
                  pressed={overlay.picker}
                  onPressedChange={overlay.setPicker}
                >
                  {/* A bare div: `asChild` merges these two class strings by
                      concatenation, not by `tailwind-merge`, so any size named
                      here would fight the variant's rather than override it —
                      and the ring only closes around a button that fits its
                      row. The glyph is sized by the variant. */}
                  <div>
                    <PickIcon className="dark:fill-white" />
                  </div>
                </Toggle>
              }
              tip={t.fill('scene.picker.tip', { key: formatBinding(hotkeys.picker) })}
            />
            <Separator orientation="vertical" className="h-4" />
            <OverlaySwitches overlay={overlay} />
            {/* Against the far edge, away from the switches: those four are ways
                of drawing on the scene, and this one opens a panel under the
                tab. `ml-auto` rather than a spacer element, and `shrink-0`
                because this pane goes down to about six characters wide. */}
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <Separator orientation="vertical" className="h-4" />
              <TooltipWrapper
                trigger={
                  <Toggle
                    asChild
                    variant="ghost"
                    size="icon"
                    pressed={counts}
                    onPressedChange={onCounts}
                  >
                    <div>
                      <CountsIcon className="dark:stroke-white" />
                    </div>
                  </Toggle>
                }
                tip={t.fill('scene.counts.tip', { key: formatBinding(hotkeys.counts) })}
              />
            </div>
          </>
        }
        trailing={
          // At the far end of the row rather than beside the picker: it is not a
          // way of working the tree but a way of undoing what several of its rows
          // have done, and the count is the only reason to look for it.
          pinned.size === 0 ? undefined : (
            // `Hint` rather than the `TooltipWrapper` the switches beside it
            // use: that one renders a button of its own around what it is
            // given, and gets away with it there because each of those hands
            // it a `div`. A button inside a button is not markup, and the
            // outer one swallows the click.
            <Hint text={t('scene.unpinAll')}>
              <Button
                variant="ghost"
                size="sm"
                className="mr-1 h-6 shrink-0 gap-1 rounded-sm px-2 text-xs hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]"
                onClick={onClearPins}
              >
                {/* Shrunk along with the button, keeping the share of it the
                    glyph had: it stays the largest mark in this strip, which
                    is what it was drawn large for. */}
                <ClearPinsIcon className="h-4 w-4" />
                {pinned.size}
              </Button>
            </Hint>
          )
        }
        footer={
          <>
            {/* One list strip, and the transient one covers: a pick is answered
                right now, a bookmark keeps. Closing it puts the bookmarks back,
                and so does the next single-node pick. */}
            {picked.length > 1 ? (
              <PickedList
                rows={picked}
                selected={selected}
                onSelect={onSelect}
                onHover={overlay.setHovered}
                onClose={onClosePicked}
              />
            ) : (
              <BookmarkList
                rows={bookmarks}
                selected={selected}
                onSelect={onSelect}
                onRemove={onRemoveBookmark}
                onClear={onClearBookmarks}
              />
            )}
            {/* Below the list rather than above it: the list is a way back into
                the tree and belongs next to it, while this is a summary, and a
                summary along the bottom is where one is looked for. */}
            {counts && (
              <CountsStrip
                nodes={nodes}
                selected={selected}
                onClose={() => {
                  onCounts(false);
                }}
              />
            )}
          </>
        }
      >
        {/* The wrapper sits above the tree's own container so that it sees a
            keystroke before arborist does, and so that one listener hears every
            row's scrolling — see `rowWidth.ts`, which also hangs the rows'
            shared width on it. */}
        <div ref={pane} className="h-full" onKeyDownCapture={onKeyDownCapture}>
          <AutoSizer style={{ width: '100%', height: '100%' }}>
            {({ height }) => (
              <Tree<TreeNodeData>
                ref={(api) => {
                  tree.current = api ?? null;
                }}
                data={data}
                width="100%"
                height={height}
                renderCursor={Cursor}
                renderRow={Row}
                searchTerm={search}
                selection={selected === null ? undefined : String(selected)}
                openByDefault={false}
                onSelect={(selectedNodes) => {
                  onSelect(selectedNodes[0]?.data.nodeId ?? null);
                }}
                onRename={({ id, name }) => {
                  client.send('scene.mutate', { kind: 'rename', id: Number(id), name });
                }}
                onMove={({ dragIds, parentId, index }) => {
                  const id = dragIds[0];
                  // A drop on empty space has no parent; the stage is not a valid
                  // target for reparenting through the tree either.
                  if (id === undefined || parentId === null) return;

                  client.send('scene.mutate', {
                    kind: 'move',
                    id: Number(id),
                    parent: Number(parentId),
                    index,
                  });
                }}
              >
                {renderNode}
              </Tree>
            )}
          </AutoSizer>
        </div>
      </Panel>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t.fill('scene.delete.title', { name: pendingDelete?.name ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('scene.delete.body')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction onClick={confirmDelete}>{t('scene.delete.confirm')}</AlertDialogAction>
            <AlertDialogCancel>{t('scene.delete.cancel')}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
