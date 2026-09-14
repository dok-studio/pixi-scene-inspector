import { useCallback, useEffect, useMemo } from 'react';

import { useLocalStorage } from '../../../lib/localStorage.js';
import { useBookmarkLimit } from '../../settings/bookmarkLimit.js';
import type { NodePath } from './path.js';
import type { Bookmarks } from './store.js';
import { EMPTY, add, parse, remove, rewrite, trim } from './store.js';

/**
 * Every bookmarked node the panel remembers.
 *
 * Held above the tabs, in the shell, and **not** keyed on the generation the
 * way they are: a note about which node someone wants to find again is the
 * panel's own, and a page reloading is precisely the moment it is needed. It is
 * the same argument that keeps the overlay's colours out of that key.
 *
 * One list for every game rather than one per address — see `store.ts` for why
 * an address is not an identity. Which entries belong to the game in front of
 * you is decided by whether their walk resolves against the tree, which is the
 * `ScenePanel`'s business rather than this one's.
 */

const KEY = 'scene.bookmarks';

export interface BookmarkControls {
  /** Everything stored, oldest first — resolved or not. */
  list: Bookmarks;
  /** Bookmarks the node at this path, or takes the bookmark off again. */
  bookmark: (path: NodePath, on: boolean) => void;
  /** Replaces a stored walk with the one the tree has now — see `rewrite`. */
  restate: (from: NodePath, to: NodePath) => void;
  clear: () => void;
}

export function useBookmarks(): BookmarkControls {
  const [stored, setStored] = useLocalStorage<Bookmarks>(KEY, EMPTY);
  const limit = useBookmarkLimit();

  const list = useMemo(() => parse(stored), [stored]);

  /*
   * A ceiling lowered in the settings has to cut what is already stored, not
   * merely what is shown: leaving the rest in place would keep entries nobody
   * can see, in the store the ceiling exists to protect.
   *
   * Handing back the very same object when nothing was over the line is what
   * keeps this from writing on every mount — React bails out of the update, so
   * the effect that writes to storage never re-runs.
   */
  useEffect(() => {
    setStored((current) => {
      const parsed = parse(current);
      const cut = trim(parsed, limit);
      return cut === parsed ? current : cut;
    });
  }, [limit, setStored]);

  /*
   * `add`, `remove` and `rewrite` hand back the list they were given when there
   * is nothing to do, and `current` is handed back in its place so that React
   * bails out rather than writing an identical list to storage. `parse` builds
   * a new array every time, so comparing against it is the only way to tell.
   */
  const bookmark = useCallback(
    (path: NodePath, on: boolean) => {
      setStored((current) => {
        const parsed = parse(current);
        const next = on ? add(parsed, path, limit) : remove(parsed, path);
        return next === parsed ? current : next;
      });
    },
    [limit, setStored],
  );

  const restate = useCallback(
    (from: NodePath, to: NodePath) => {
      setStored((current) => {
        const parsed = parse(current);
        const next = rewrite(parsed, from, to);
        return next === parsed ? current : next;
      });
    },
    [setStored],
  );

  const clear = useCallback(() => {
    setStored(EMPTY);
  }, [setStored]);

  /*
   * Memoized, and it matters more than a returned object usually does.
   *
   * These go to the Scene tab, where the tree's row renderer is built from
   * callbacks made out of them — and a renderer rebuilt is a new **component
   * type**, which React answers by throwing every row away and mounting it
   * again. The shell re-renders on every status poll, so an object rebuilt per
   * render took the hover off a row's buttons and swallowed clicks already
   * begun, once or twice a second, for as long as the panel was open.
   */
  return useMemo(
    () => ({ list, bookmark, restate, clear }),
    [list, bookmark, restate, clear],
  );
}
