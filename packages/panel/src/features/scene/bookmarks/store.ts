import type { NodePath } from './path.js';
import { samePath } from './path.js';

/**
 * What the panel remembers about bookmarked nodes, and the arithmetic on it.
 *
 * Pure on purpose — the eviction rule is the part with corners (whose entry
 * goes when the ceiling is reached, what a lowered ceiling does to what is
 * already stored), and those are settled here in tests rather than through a
 * running game and a browser's storage.
 *
 * **One list, not one per page.** It was keyed by the page's address at first,
 * and that was wrong about what a page is: the same game arrives under an
 * address that carries a build number, a session token, a locale — the query
 * string is never the same twice, and a key built from it makes a fresh, empty
 * list on every visit. So there is one list, and which of it belongs to the
 * game in front of you is answered by the scene itself: a walk that resolves is
 * this game's, and one that resolves nowhere is not shown. Nothing has to know
 * which game it came from, because the tree already says.
 */

export interface Bookmark {
  path: NodePath;
  /**
   * The order bookmarks were put on, and nothing else.
   *
   * A counter rather than a clock: eviction asks which is oldest, never when,
   * and two bookmarks within one millisecond are ordinary. The core numbers its
   * generations the same way and for the same reason — see the comment on
   * `generation` in `runtime/session.ts`.
   */
  seq: number;
}

export type Bookmarks = readonly Bookmark[];

export const EMPTY: Bookmarks = [];

/** Anything that came out of storage, made safe to work with. */
export function parse(value: unknown): Bookmarks {
  if (!Array.isArray(value)) return EMPTY;

  return value.filter(
    (entry: unknown): entry is Bookmark =>
      typeof entry === 'object' &&
      entry !== null &&
      Array.isArray((entry as Bookmark).path) &&
      typeof (entry as Bookmark).seq === 'number',
  );
}

export function has(list: Bookmarks, path: NodePath): boolean {
  return list.some((entry) => samePath(entry.path, path));
}

/**
 * The list cut down to the ceiling, oldest first.
 *
 * By `seq` rather than by position, because a list read back out of storage is
 * only in order if nothing has edited it, and storage is editable.
 */
export function trim(list: Bookmarks, limit: number): Bookmarks {
  const room = Math.max(0, limit);
  if (list.length <= room) return list;

  const doomed = new Set(
    [...list].sort((a, b) => a.seq - b.seq).slice(0, list.length - room),
  );

  return list.filter((entry) => !doomed.has(entry));
}

function nextSeq(list: Bookmarks): number {
  return list.reduce((highest, entry) => Math.max(highest, entry.seq), 0) + 1;
}

/** A bookmark on that walk, put at the end and then cut to the ceiling. */
export function add(list: Bookmarks, path: NodePath, limit: number): Bookmarks {
  if (has(list, path)) return list;

  return trim([...list, { path, seq: nextSeq(list) }], limit);
}

export function remove(list: Bookmarks, path: NodePath): Bookmarks {
  if (!has(list, path)) return list;

  return list.filter((entry) => !samePath(entry.path, path));
}

/**
 * One stored path replaced by the one the tree has now, keeping its number.
 *
 * What keeps a bookmark on a node that has been renamed or dragged elsewhere
 * while the panel was watching: the walk is rewritten while it still resolves,
 * so it is already right the next time the page is loaded and there is nothing
 * but the walk to go on. The number is deliberately kept — rewriting a path is
 * not bookmarking a node again, and it must not push someone else's off the
 * end.
 */
export function rewrite(list: Bookmarks, from: NodePath, to: NodePath): Bookmarks {
  if (!has(list, from)) return list;

  return list.map((entry) => (samePath(entry.path, from) ? { ...entry, path: to } : entry));
}
