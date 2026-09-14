// @vitest-environment happy-dom
import type { TextureId, TextureInfo } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Client } from '../../../transport/client.js';
import { sampleTexture } from './fixtures.js';
import type { PreviewStore } from './usePreviews.js';
import { usePreviews } from './usePreviews.js';

/**
 * The three rules that make the grid the cheap half of the tab: only what is on
 * screen is asked for, only once, and only one request at a time.
 *
 * A headless document has no layout, so nothing ever intersects with anything.
 * The observer is replaced with one that can be told what came into view, which
 * is the event the store is actually built around.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/** Every element handed to the fake observer, so a test can bring one into view. */
const watching = new Set<Element>();

class FakeObserver {
  private readonly notify: (entries: { target: Element; isIntersecting: boolean }[]) => void;

  constructor(callback: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
    this.notify = callback;
    observers.add(this);
  }

  observe(element: Element): void {
    watching.add(element);
  }

  unobserve(element: Element): void {
    watching.delete(element);
  }

  disconnect(): void {
    observers.delete(this);
  }

  reveal(elements: Iterable<Element>): void {
    this.notify([...elements].map((target) => ({ target, isIntersecting: true })));
  }
}

const observers = new Set<FakeObserver>();

describe('usePreviews', () => {
  let container: HTMLElement;
  let root: Root;
  let store: PreviewStore;

  const call = vi.fn();
  const client = { call } as unknown as Client;

  /** A probe that attaches an element per texture, the way the tiles do. */
  function Probe({ list }: { list: TextureInfo[] }) {
    store = usePreviews(client, list);

    return (
      <>
        {list.map((texture) => (
          <div key={texture.id} ref={store.observe(texture.id)} data-id={texture.id} />
        ))}
      </>
    );
  }

  /** The list as the grid would hand it over. */
  const listOf = (ids: TextureId[], updates = 0): TextureInfo[] =>
    ids.map((id) => sampleTexture({ id, updates }));

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    observers.clear();
    watching.clear();
    call.mockReset();
    call.mockImplementation((_command: string, params: { id: number }) =>
      Promise.resolve({ dataUrl: `data:${String(params.id)}` }),
    );

    vi.stubGlobal('IntersectionObserver', FakeObserver);

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  const show = async (ids: TextureId[], updates = 0): Promise<void> => {
    await act(async () => {
      root.render(<Probe list={listOf(ids, updates)} />);
      await Promise.resolve();
    });
  };

  const reveal = async (ids: TextureId[]): Promise<void> => {
    const elements = ids.map((id) => {
      const element = container.querySelector(`[data-id="${String(id)}"]`);
      if (element === null) throw new Error(`no tile for ${String(id)}`);
      return element;
    });

    await act(async () => {
      for (const observer of observers) observer.reveal(elements);
      // The queue drains one request at a time, so the microtasks have to be
      // let through as many times as there are requests in it.
      for (let index = 0; index <= ids.length; index += 1) await Promise.resolve();
    });
  };

  it('asks for nothing until a tile comes into view', async () => {
    await show([1, 2, 3]);

    expect(call).not.toHaveBeenCalled();
    expect(store.get(1)).toBeUndefined();
  });

  it('fetches what came into view, and keeps it', async () => {
    await show([1, 2]);
    await reveal([1]);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('assets.preview', { id: 1, max: 128 });
    expect(store.get(1)).toBe('data:1');
    expect(store.get(2)).toBeUndefined();
  });

  it('asks once per texture, however often the tile is revealed', async () => {
    await show([1]);
    await reveal([1]);
    await reveal([1]);

    expect(call).toHaveBeenCalledTimes(1);
  });

  /** "This source has no image" is an answer, and it is cached like any other. */
  it('remembers that a texture has no image at all', async () => {
    call.mockResolvedValue({ dataUrl: null });

    await show([1]);
    await reveal([1]);
    await reveal([1]);

    expect(store.get(1)).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('lets a texture that has left the renderer take its preview with it', async () => {
    await show([1, 2]);
    await reveal([1]);
    expect(store.get(1)).toBe('data:1');

    await show([2]);
    expect(store.get(1)).toBeUndefined();
  });

  /**
   * The one change nothing else about a texture shows: a `Text` redrawn, a
   * canvas repainted. The id, the size and the format all stay as they were, so
   * without the counter the grid would go on showing the first picture it ever
   * fetched.
   */
  it('fetches again when the texture has had its pixels replaced', async () => {
    await show([1]);
    await reveal([1]);
    expect(store.get(1)).toBe('data:1');

    call.mockImplementation(() => Promise.resolve({ dataUrl: 'data:redrawn' }));
    await show([1], 1);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.get(1)).toBe('data:redrawn');
    expect(call).toHaveBeenCalledTimes(2);
  });

  /**
   * Dropping the entry is not enough on its own: the observer does not notify a
   * tile that is already on screen, so nothing would ask again until it had
   * been scrolled away from and back.
   */
  it('does not spend a request on a changed texture nobody is looking at', async () => {
    await show([1, 2]);
    await reveal([1]);
    expect(call).toHaveBeenCalledTimes(1);

    // Texture 2 changes, but its tile was never revealed, so nothing is held
    // for it and nothing is worth fetching.
    await act(async () => {
      root.render(
        <Probe
          list={[sampleTexture({ id: 1 }), sampleTexture({ id: 2, updates: 5 })]}
        />,
      );
      await Promise.resolve();
    });

    expect(call).toHaveBeenCalledTimes(1);
  });

  /**
   * For what nothing can report: a game painting into a canvas without telling
   * PixiJS. `updates` never moves, so only a person can say the picture is
   * wrong.
   */
  it('forgets every picture and asks again for the tiles in the document', async () => {
    await show([1, 2]);
    await reveal([1]);
    expect(store.get(1)).toBe('data:1');

    call.mockImplementation(() => Promise.resolve({ dataUrl: 'data:fresh' }));

    await act(async () => {
      store.refresh();
      for (let index = 0; index < 4; index += 1) await Promise.resolve();
    });

    // Both tiles are attached — with the grid virtualised that is the window
    // and its overscan, which is the set worth spending requests on.
    expect(store.get(1)).toBe('data:fresh');
    expect(store.get(2)).toBe('data:fresh');
  });

  /**
   * A failed request is not cached: the page may have been reloading, and a
   * `null` kept for ever would leave a permanently blank tile.
   */
  it('tries a failed request again rather than remembering the failure', async () => {
    vi.useFakeTimers();

    try {
      call.mockRejectedValueOnce(new Error('page reloading'));

      await show([1]);

      const element = container.querySelector('[data-id="1"]');
      if (element === null) throw new Error('no tile');

      await act(async () => {
        for (const observer of observers) observer.reveal([element]);
        await Promise.resolve();
      });

      expect(store.get(1)).toBeUndefined();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(store.get(1)).toBe('data:1');
      expect(call).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The ref callbacks are held per id so a tile attaches once rather than on
   * every render, and that Map was the one thing here nothing took anything out
   * of — a closure per id that had ever been drawn, for the life of the panel.
   */
  it('forgets the ref callback of a texture that has left the list', async () => {
    await show([1, 2]);

    const held = store.observe(1);
    // Stable while the texture is there: a new function on every render would
    // detach and reattach the tile each time the grid drew.
    expect(store.observe(1)).toBe(held);

    await show([2]);

    expect(store.observe(1)).not.toBe(held);
  });
});
