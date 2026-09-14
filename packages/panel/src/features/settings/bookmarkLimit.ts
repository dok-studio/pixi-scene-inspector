import { useSyncExternalStore } from 'react';

/**
 * How many bookmarked nodes the panel keeps, across every game it has been
 * opened on.
 *
 * One ceiling rather than one per page, because what it is protecting is one
 * thing: the panel's `localStorage`, which is a single store shared by the
 * theme, the poll rate, every folded section and every overlay colour. A limit
 * per page would be no limit at all — a browser that has visited forty games
 * would be holding forty lists.
 *
 * Thirty is enough to be a list of nodes worth coming back to and small enough
 * that nobody has to curate it. Someone who wants more can say so, up to
 * ninety-nine; past that a "list under the tree" is not what is being asked
 * for any more, and the store is not the place to find that out.
 *
 * **A module rather than a prop**, for the same reason as `pollRate.ts`: it is
 * read by the shell, which holds the list, and by the gear in the navbar, which
 * edits it, and neither is above the other in any useful sense.
 */

export const DEFAULT_BOOKMARK_LIMIT = 30;

/** As high as the setting goes — see above. */
export const MAX_BOOKMARK_LIMIT = 99;

const KEY = 'panel.bookmarkLimit';

export function clampLimit(value: number): number {
  return Math.min(MAX_BOOKMARK_LIMIT, Math.max(1, Math.round(value)));
}

function stored(): number {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return typeof saved === 'number' && Number.isFinite(saved)
      ? clampLimit(saved)
      : DEFAULT_BOOKMARK_LIMIT;
  } catch {
    // Unreadable, not JSON, or no storage at all: treated as unset rather than
    // as a reason to fail to render.
    return DEFAULT_BOOKMARK_LIMIT;
  }
}

let limit: number = stored();

const listeners = new Set<() => void>();

export function bookmarkLimit(): number {
  return limit;
}

export function setBookmarkLimit(next: number): void {
  const clamped = clampLimit(next);
  if (clamped === limit) return;

  limit = clamped;
  try {
    localStorage.setItem(KEY, JSON.stringify(clamped));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }

  for (const notify of [...listeners]) notify();
}

export function resetBookmarkLimit(): void {
  setBookmarkLimit(DEFAULT_BOOKMARK_LIMIT);
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

export function useBookmarkLimit(): number {
  return useSyncExternalStore(subscribe, bookmarkLimit, bookmarkLimit);
}
