import type { TextureId, TextureInfo } from '@scene-inspector/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Client } from '../../../transport/client.js';

/**
 * Thumbnails, fetched for what is on screen and kept once fetched
 * (docs/architecture.md §3.6).
 *
 * Three rules make this the cheap half of the tab:
 *
 *  - **only the visible** — a tile asks for its image when it scrolls into
 *    view, through one `IntersectionObserver` shared by the whole grid;
 *  - **only once** — the answer is cached by texture id, including the `null`
 *    that means "this source has no image";
 *  - **one at a time** — requests are queued rather than fired together, so a
 *    grid that fills the viewport does not hand the inspected page fifty
 *    canvas encodes in the same tick.
 */

/** The tile is 160px wide; 128 covers it and leaves room for a HiDPI screen. */
export const THUMBNAIL_MAX = 128;

/** Enough ahead of the scroll that a thumbnail is usually there on arrival. */
const ROOT_MARGIN = '200px';

/** How long to wait before trying a failed request again, doubling each time. */
const RETRY_MS = 300;

/** After this many, the queue is left for the next thing that touches it. */
const MAX_RETRIES = 3;

export interface PreviewStore {
  /** `undefined` while it has not been asked for, `null` when there is no image. */
  get(id: TextureId): string | null | undefined;
  /** A ref callback for a tile's element — stable per id, so it is attached once. */
  observe(id: TextureId): (element: HTMLElement | null) => void;
  /**
   * Forget every picture and ask again for the tiles in the document.
   *
   * For what the page cannot report. `updates` catches a texture PixiJS was
   * told about — a `Text` redrawn, a canvas that had `update()` called on it —
   * but a game is free to paint into a canvas and never say so, and then the
   * thumbnail is of something that is no longer there and nothing knows.
   */
  refresh(): void;
}

export function usePreviews(client: Client, textures: readonly TextureInfo[]): PreviewStore {
  /** The picture, and the state of the texture it was a picture *of*. */
  const cache = useRef(new Map<TextureId, { updates: number; dataUrl: string | null }>());
  /** What the last list said, so a request can stamp what it is answering. */
  const updates = useRef(new Map<TextureId, number>());
  const queue = useRef<TextureId[]>([]);
  const draining = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const observed = useRef(new Map<Element, TextureId>());
  const attached = useRef(new Map<TextureId, HTMLElement>());
  const callbacks = useRef(new Map<TextureId, (element: HTMLElement | null) => void>());

  // What re-renders the grid when an image lands. The previews themselves live
  // in a ref: they are a cache, and putting them in state would mean rebuilding
  // a Map on every arrival.
  const [, bump] = useState(0);

  const clientRef = useRef(client);
  clientRef.current = client;

  const drain = useCallback(async (): Promise<void> => {
    if (draining.current) return;
    draining.current = true;

    let retries = 0;

    try {
      for (let id = queue.current.shift(); id !== undefined; id = queue.current.shift()) {
        if (cache.current.has(id)) continue;

        // Read before the request, not after: if the texture changes while it
        // is in flight, the answer is of the older picture and has to be
        // stamped as such — the next list will invalidate it again.
        const stamp = updates.current.get(id) ?? 0;

        try {
          const { dataUrl } = await clientRef.current.call('assets.preview', {
            id,
            max: THUMBNAIL_MAX,
          });
          cache.current.set(id, { updates: stamp, dataUrl });
          bump((version) => version + 1);
        } catch {
          // A failed request is not cached: the page may have been reloading,
          // and a `null` kept forever would leave a permanent blank tile.
          queue.current.unshift(id);

          // Waiting for "the next thing that drains it" was waiting for
          // nothing: `enqueue` returns early for an id already queued, and the
          // observer does not re-notify a tile that is already on screen. One
          // failed request left every remaining tile on "Loading…" until the
          // user scrolled to one that had never been seen. So the retry is
          // here, backing off the way `useResource` does, and after a few
          // tries the queue is left intact for the next list to restart it.
          retries += 1;
          if (retries > MAX_RETRIES) return;

          await new Promise((resume) => setTimeout(resume, RETRY_MS * 2 ** (retries - 1)));
          continue;
        }

        retries = 0;
      }
    } finally {
      draining.current = false;
    }
  }, []);

  const enqueue = useCallback(
    (id: TextureId): void => {
      if (cache.current.has(id) || queue.current.includes(id)) return;

      queue.current.push(id);
      void drain();
    },
    [drain],
  );

  useEffect(() => {
    const elements = observed.current;
    const instance = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const id = elements.get(entry.target);
          if (id !== undefined) enqueue(id);
        }
      },
      { rootMargin: ROOT_MARGIN },
    );

    observer.current = instance;
    // Tiles are attached during the render that precedes this effect, so the
    // first screenful is already waiting here rather than arriving later.
    for (const element of elements.keys()) instance.observe(element);

    return () => {
      instance.disconnect();
      observer.current = null;
      elements.clear();
    };
  }, [enqueue]);

  /**
   * What the list arriving means for what is already held.
   *
   * Two things. A texture that has left the renderer takes its preview with it,
   * or the cache would grow for the life of the session on a page that streams
   * textures in and out. And a texture whose **pixels** have been replaced —
   * a `Text` redrawn, a canvas repainted — is holding a picture of something
   * that is no longer there.
   *
   * The second one has to re-ask rather than merely forget, and that is why it
   * is not enough to drop the entry: the observer does not notify a tile that
   * is already on screen, so nothing would fetch it again until it had been
   * scrolled away from and back. `attached` is exactly the set of tiles in the
   * document, which is the set worth spending a request on.
   */
  useEffect(() => {
    const live = new Map(textures.map((texture) => [texture.id, texture.updates]));
    updates.current = live;

    const stale: TextureId[] = [];

    for (const [id, held] of cache.current) {
      const now = live.get(id);
      if (now === undefined) cache.current.delete(id);
      else if (now !== held.updates) {
        cache.current.delete(id);
        if (attached.current.has(id)) stale.push(id);
      }
    }

    queue.current = queue.current.filter((id) => live.has(id));

    // The ref callbacks go the same way as the cache they belong to. They are
    // held per id so that a tile attaches once rather than on every render, and
    // that Map is the one thing here nothing was ever taking out of — on a page
    // that streams textures in and out it kept a closure per id that had ever
    // been drawn, for the life of the panel. A tile still in the document keeps
    // its own even if the list has stopped mentioning it, because React will
    // hand that very callback the `null` its unmount owes it.
    for (const id of callbacks.current.keys()) {
      if (!live.has(id) && !attached.current.has(id)) callbacks.current.delete(id);
    }

    for (const id of stale) enqueue(id);

    // The list arriving is also the moment to pick a stalled queue back up:
    // it is the one event that happens on its own while the grid sits still.
    if (queue.current.length > 0) void drain();
  }, [textures, drain, enqueue]);

  return {
    get: (id) => cache.current.get(id)?.dataUrl,
    refresh: () => {
      cache.current.clear();
      // Only the tiles that are in the document — with the grid virtualised
      // that is the window and its overscan. The rest will ask for themselves
      // when they are scrolled to, which is the whole bargain.
      for (const id of attached.current.keys()) enqueue(id);
      bump((version) => version + 1);
    },
    observe: (id) => {
      const existing = callbacks.current.get(id);
      if (existing !== undefined) return existing;

      const callback = (element: HTMLElement | null): void => {
        // React hands over `null` when the tile unmounts, and a new element
        // when the same id is drawn again after a sort. Both mean the previous
        // element is no longer this texture's.
        const previous = attached.current.get(id);
        if (previous !== undefined) {
          observer.current?.unobserve(previous);
          observed.current.delete(previous);
          attached.current.delete(id);
        }

        if (element === null) return;

        attached.current.set(id, element);
        observed.current.set(element, id);
        observer.current?.observe(element);
      };

      callbacks.current.set(id, callback);
      return callback;
    },
  };
}
