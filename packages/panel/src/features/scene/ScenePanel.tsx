import type { AxesPin, NodeId, OverlayStyle, SceneNode } from '@scene-inspector/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CollapsibleSplit } from '../../components/collapsible/collapsible-split.js';
import type { Client } from '../../transport/client.js';
import { useLocalStorage } from '../../lib/localStorage.js';
import { useRevisioned } from '../../transport/useRevisioned.js';
import { SceneTree } from './graph/SceneTree.js';
import { SceneProperties } from './graph/SceneProperties.js';
import { forgetSetups } from './graph/properties/spine/setups.js';
import { rowLabel } from './graph/tree/nested.js';
import { useOverlay } from './graph/useOverlay.js';
import type { BookmarkRow } from './bookmarks/BookmarkList.js';
import type { NodePath } from './bookmarks/path.js';
import { pathOf, resolveAll, samePath } from './bookmarks/path.js';
import type { BookmarkControls } from './bookmarks/useBookmarks.js';
import type { PickedRow } from './picked/PickedList.js';
import { offered } from './picked/stack.js';

/**
 * The Scene tab: the graph on the left, the properties of the selected node on
 * the right, in a resizable split — as it was in the previous project, minus
 * the section header that repeated the tab's own name.
 *
 * The tree is fetched here rather than inside the list so that the selection
 * can be resolved against **fresh** data on every poll. Holding the selected
 * node itself would leave the properties header showing a name that had since
 * been changed, or a node that had since been removed.
 */

/** Fast enough to feel live, slow enough to leave the inspected page alone. */
const TREE_INTERVAL_MS = 500;

export function ScenePanel({
  client,
  overlayStyle,
  bookmarks,
  selectedId,
  onSelect,
}: {
  client: Client;
  /** How the page should paint the overlay — the settings' business, not this
   *  tab's. It comes from the shell, which is where the gear that edits it is. */
  overlayStyle: OverlayStyle;
  /**
   * The nodes written down under the tree. From the shell, because this panel
   * is keyed on the generation and a bookmark is exactly the thing that has to
   * outlive one — see `bookmarks/useBookmarks.ts`.
   */
  bookmarks: BookmarkControls;
  /**
   * The selected node, held by the shell rather than here.
   *
   * The navbar mounts one tab at a time, so a selection kept in this component
   * would not survive a look at another tab — and the Assets tab now has a
   * reason to set one: following a texture to the nodes drawing it means
   * opening Scene on one of them. Same argument as the bookmarks above.
   */
  selectedId: NodeId | null;
  onSelect: (id: NodeId | null) => void;
}) {
  const { data } = useRevisioned(
    (rev) => client.call('scene.tree', rev === undefined ? {} : { rev }),
    { intervalMs: TREE_INTERVAL_MS },
  );



  /*
   * What the last pick landed on, topmost first — every node under the click,
   * not just the one that got selected.
   *
   * Held here for the same reason the selection is: it is a fact about ids,
   * and the rows are worked out against whatever tree the next poll brings —
   * including how many of them are worth offering, which is not the same as
   * how many the page found (`picked/stack.ts`).
   */
  const [under, setUnder] = useState<readonly NodeId[]>([]);

  /**
   * A pick: the topmost node is selected, as it always was, and the rest is
   * offered as a list under the tree.
   *
   * Selecting straight away rather than waiting for a choice keeps the common
   * case — one node, or the top one being the wanted one — a single click.
   */
  const onPicked = useCallback((ids: readonly NodeId[]) => {
    const top = ids[0];
    if (top === undefined) return;

    onSelect(top);
    // Replaced rather than added to: the list is always about the click that
    // just happened, so a pick that found one node clears the last one's.
    setUnder(ids);
  }, []);

  const clearUnder = useCallback(() => {
    setUnder([]);
  }, []);

  /*
   * Which nodes carry a gizmo of their own.
   *
   * State rather than storage, and here rather than in the tree: node ids are
   * the page registry's and are handed out again from scratch on every load, so
   * a set that outlived one would come back naming different objects. This
   * panel is keyed on the generation, which clears them with nothing having to
   * say so — and it is also the one component holding both the tree's rows and
   * the poll that sends the pins to the page.
   */
  const [pinned, setPinned] = useState<ReadonlySet<NodeId>>(() => new Set());

  const pin = useCallback((id: NodeId, on: boolean) => {
    setPinned((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearPins = useCallback(() => {
    setPinned(new Set());
  }, []);

  /*
   * This panel is keyed on the page's generation, so it is mounted once per
   * load — which makes it the right place to throw away what only made sense
   * during the last one. The Spine setups are held outside React on purpose
   * (they have to survive a change of selection), and they are keyed by node
   * id, which the next load hands out again to different objects.
   */
  useEffect(() => {
    forgetSetups();
  }, []);

  const nodes = data?.nodes ?? [];

  /*
   * The pins as the page needs them: an id, and the caption to draw beside it.
   *
   * Built from the tree rather than from the set alone, for two reasons. The
   * caption has to be the row's own name (`rowLabel`), so a node reads the same
   * on the canvas as it does in the list. And a pinned node that has since been
   * deleted from the scene is no longer in the tree — dropping it here is what
   * keeps the clear button's count honest about what is on screen.
   */
  const pins = useMemo<AxesPin[]>(() => {
    if (pinned.size === 0) return [];

    const present = new Set(nodes.map((node) => node.id));

    return nodes
      .filter((node) => pinned.has(node.id))
      .map((node) => ({ id: node.id, label: rowLabel(node, !present.has(node.parent)).name }));
  }, [nodes, pinned]);

  /*
   * The bookmarked walks against the tree the panel is holding right now.
   *
   * Redone on every payload rather than remembered, for the same reason the
   * selection is resolved here: a bookmark names a walk, and which node that
   * walk leads to is a fact about the current scene. A node that has not been
   * built yet resolves to nothing and starts resolving the moment it appears,
   * with nothing having to notice that it did.
   *
   * This is also what tells one game's bookmarks from another's. The list is
   * one list, because an address is not an identity (`bookmarks/store.ts`), so
   * what makes an entry *this* game's is that its walk leads somewhere here.
   */
  const resolved = useMemo(
    () =>
      resolveAll(
        nodes,
        bookmarks.list.map((node) => node.path),
      ),
    [nodes, bookmarks.list],
  );

  const bookmarkedIds = useMemo(
    () => new Set(resolved.map((found) => found.id).filter((id): id is NodeId => id !== null)),
    [resolved],
  );

  /*
   * The rows the list draws: the entries whose walk leads somewhere in this
   * scene, and only those.
   *
   * An entry that resolves nowhere is kept in storage and left off the list —
   * it is either another game's or a screen this one has not built yet, and
   * neither is worth a row. It comes back on its own the moment the node
   * appears, because this is redone against every payload.
   *
   * Each row reads exactly as its row in the tree does (`rowLabel`), so a node
   * is spelled the same in both places.
   */
  const bookmarkRows = useMemo<BookmarkRow[]>(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const present = new Set(byId.keys());

    return bookmarks.list.flatMap((entry, at) => {
      const id = resolved[at]?.id;
      const live = id === undefined || id === null ? undefined : byId.get(id);
      if (live === undefined) return [];

      return [{ path: entry.path, id: live.id, ...rowLabel(live, !present.has(live.parent)) }];
    });
  }, [nodes, resolved, bookmarks.list]);

  /*
   * A walk rewritten once the tree disagrees with it.
   *
   * Renaming and dragging are both things this panel can do, and either leaves
   * the stored walk describing a node that no longer answers to it. Kept
   * honest here, while the node still resolves, so that the walk is already
   * right the next time the page loads and there is nothing but the walk left.
   */
  useEffect(() => {
    for (const [at, found] of resolved.entries()) {
      const node = bookmarks.list[at];
      if (node === undefined || found.livePath === null) continue;
      if (samePath(node.path, found.livePath)) continue;

      bookmarks.restate(node.path, found.livePath);
    }
  }, [resolved, bookmarks]);

  /**
   * The tree as it stands, for the handler below to read at the moment it is
   * pressed rather than to be rebuilt from.
   *
   * The walk to a node can only be worked out from the payload, but taking the
   * payload as a dependency would give the row buttons a new `onBookmark` on
   * every poll that changed anything — and that identity travels: `SceneTree`
   * memoizes its `actions` on it, the row renderer is memoized on those, and a
   * new row renderer is a new **component type**, so React answers it by
   * throwing every row away and mounting it again. On a scene that is building
   * and dropping nodes that happened two or three times a second, which took
   * the hover off a button under the pointer and swallowed clicks already
   * begun.
   *
   * A ref instead: the handler is built once and reads the current tree when it
   * runs. Same shape as the hover ref in `tree/node.tsx`, and for the same kind
   * of reason.
   */
  const nodesNow = useRef(nodes);
  nodesNow.current = nodes;

  const bookmark = useCallback(
    (id: NodeId, on: boolean) => {
      const path = pathOf(nodesNow.current, id);
      if (path !== null) bookmarks.bookmark(path, on);
    },
    [bookmarks],
  );

  const removeBookmark = useCallback(
    (path: NodePath) => {
      bookmarks.bookmark(path, false);
    },
    [bookmarks],
  );

  // The picker reports back through the same poll that drives the overlay, so
  // clicking the scene lands in the tree without a channel of its own.
  const overlay = useOverlay(client, selectedId, onPicked, overlayStyle, pins);

  /*
   * The picked nodes as rows, resolved against the tree this render is holding.
   *
   * Redone every render rather than remembered, the same as the bookmarks
   * above: an id the tree has not caught up with yet (it polls at 500ms, the
   * overlay at 100ms) simply has no row, and gets one on the next payload. A
   * node deleted since the click loses its row and never comes back.
   */
  const underRows = useMemo<PickedRow[]>(() => {
    if (under.length === 0) return [];

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const present = new Set(byId.keys());

    // Ancestors are dropped and skeletons are added back — see `stack.ts`.
    return offered(nodes, under).flatMap((id) => {
      const live = byId.get(id);
      if (live === undefined) return [];

      return [{ id, type: live.type, ...rowLabel(live, !present.has(live.parent)) }];
    });
  }, [nodes, under]);

  // The picker stays armed between clicks, but a list of what a click found is
  // only worth having while there is a click to find something.
  useEffect(() => {
    if (!overlay.picker) setUnder([]);
  }, [overlay.picker]);

  /*
   * Whether the counts strip is open.
   *
   * Held here rather than in the tree, although the strip is drawn there: the
   * button that opens it is the tree toolbar's, and this is what ties the two
   * together without either owning the other.
   *
   * Stored, unlike the selection and the pins: it is a way of looking rather
   * than a fact about this scene, so it should still be open the next time the
   * panel is, the same as the drawer heights beside it.
   */
  const [counts, setCounts] = useLocalStorage('scene.counts.open', false);

  const selected = useMemo<SceneNode | null>(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  return (
    <div className="flex flex-grow flex-col overflow-hidden">
      <CollapsibleSplit
        left={
          <SceneTree
            client={client}
            nodes={nodes}
            selected={selectedId}
            overlay={overlay}
            pinned={pinned}
            bookmarked={bookmarkedIds}
            bookmarks={bookmarkRows}
            picked={underRows}
            onSelect={onSelect}
            onClosePicked={clearUnder}
            onPin={pin}
            onClearPins={clearPins}
            onBookmark={bookmark}
            onRemoveBookmark={removeBookmark}
            onClearBookmarks={bookmarks.clear}
            counts={counts}
            onCounts={setCounts}
          />
        }
        right={<SceneProperties client={client} node={selected} />}
      />
    </div>
  );
}
