// @vitest-environment happy-dom
import type { TextureInfo } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Client } from '../../../transport/client.js';
import { BASE_TILE_WIDTH, GRID_PADDING, TILE_GAP } from './columns.js';
import { sampleTexture } from './fixtures.js';
import { TextureGrid } from './TextureGrid.js';

/**
 * The grid as it is drawn: what the toolbar narrows, what the strip underneath
 * counts, which rows exist at all, and where the arrow keys go.
 *
 * Nothing has a size in a headless document, so the box is given one — three
 * tiles across and two rows deep. Without it the column count would be one and
 * the window would be a row tall, which is a different grid from the one the
 * panel draws.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const WIDTH = GRID_PADDING * 2 + BASE_TILE_WIDTH * 3 + TILE_GAP * 2;
const HEIGHT = 300;

const texture = (id: number, label: string, overrides: Partial<TextureInfo> = {}): TextureInfo =>
  sampleTexture({ id, label, gpuSize: 1024 * 1024, ...overrides });

const client = { call: () => new Promise(() => undefined) } as unknown as Client;

describe('TextureGrid', () => {
  let container: HTMLElement;
  let root: Root;
  const onSelect = vi.fn();
  const onRefresh = vi.fn();

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    // The observer never fires in a document with no layout, so a thumbnail is
    // never asked for here. That is the grid's business, not `usePreviews`'s.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {
          /* nothing to intersect with */
        }
        unobserve() {
          /* as above */
        }
        disconnect() {
          /* as above */
        }
      },
    );

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => WIDTH,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => HEIGHT,
    });

    onSelect.mockClear();
    onRefresh.mockClear();
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

  const show = (textures: TextureInfo[], selected: number | null = null): void => {
    act(() => {
      root.render(
        <TextureGrid
          client={client}
          textures={textures}
          selected={selected}
          onSelect={onSelect}
          onRefresh={onRefresh}
        />,
      );
    });
  };

  const tiles = (): HTMLElement[] => [
    ...container.querySelectorAll<HTMLElement>('[role="gridcell"]'),
  ];

  /** The tile's name line, which is the one caption that is centred. */
  const captions = (): string[] =>
    tiles().map((tile) => tile.querySelector('[class*="text-center"]')?.textContent ?? '');

  const grid = (): HTMLElement => {
    const found = container.querySelector<HTMLElement>('[role="grid"]');
    if (found === null) throw new Error('no grid');
    return found;
  };

  const type = (value: string): void => {
    const input = container.querySelector('input[type="text"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no search');

    // React tracks the value it last wrote and skips an event whose value it
    // believes it already knows, so the assignment has to go through the
    // prototype's own setter rather than through the tracked property.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter === undefined) throw new Error('no value setter');

    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const press = (key: string): void => {
    act(() => {
      grid().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  };

  const list = [texture(1, 'a.png'), texture(2, 'b.png'), texture(3, 'c.png')];

  it('draws a tile for every texture the toolbar lets through', () => {
    show(list);

    expect(captions()).toEqual(['c.png', 'b.png', 'a.png']);
  });

  it('narrows to what the search matches', () => {
    show(list);
    type('b');

    expect(captions()).toEqual(['b.png']);
  });

  /** Two different reasons for an empty grid, and two different things to say. */
  it('tells an empty page from an empty result', () => {
    show([]);
    expect(container.textContent).toContain('The renderer holds no textures.');

    show(list);
    type('nothing here');
    expect(container.textContent).toContain('Nothing matches.');
  });

  it('counts the whole list under the grid, however much is shown', () => {
    show(list);

    expect(container.textContent).toContain('3 textures');
    expect(container.textContent).toContain('3 on GPU');
    expect(container.textContent).toContain('3 MB');

    type('b');
    expect(container.textContent).toContain('3 textures');
    expect(container.textContent).toContain('showing 1');
  });

  /** A guess would make the figure quietly wrong; the plus says it is short. */
  it('marks a total that a format kept out of it', () => {
    show([texture(1, 'a.png'), texture(2, 'b.png', { gpuSize: null })]);

    expect(container.textContent).toContain('1 MB+');
  });

  /** Neither the list nor `updates` can report a canvas a game repaints quietly. */
  it('asks the page again when told to', () => {
    show(list);

    const button = [...container.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Refresh the textures',
    );
    if (button === undefined) throw new Error('no refresh button');

    act(() => {
      button.click();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  describe('the order', () => {
    const segment = (label: string): HTMLElement => {
      const found = [...container.querySelectorAll('button')].find(
        (button) => button.textContent === label,
      );
      if (found === undefined) throw new Error(`no ${label} segment`);
      return found;
    };

    /** The button whose label *is* the current order, in words. */
    const order = (): HTMLButtonElement => {
      const found = [...container.querySelectorAll('button')].find((button) =>
        /first|A to Z|Z to A/.test(button.textContent ?? ''),
      );
      if (found === undefined) throw new Error('no order button');
      return found;
    };

    const press = (element: HTMLElement): void => {
      act(() => {
        element.click();
      });
    };

    /** Which column is chosen has to be readable off the strip, not inferred. */
    it('marks the column it is ordered by', () => {
      show(list);

      expect(segment('Latest').getAttribute('aria-checked')).toBe('true');
      expect(segment('Name').getAttribute('aria-checked')).toBe('false');
    });

    /** The whole point: the direction is a sentence, not an arrow. */
    it('says which way round it is, in the terms of that column', () => {
      show(list);
      expect(order().textContent).toBe('Newest first');

      press(segment('Name'));
      expect(order().textContent).toBe('A to Z');

      press(segment('Size'));
      expect(order().textContent).toBe('Largest first');
    });

    it('lands on the useful end of a column when it is picked', () => {
      show(list);

      press(segment('Name'));
      expect(captions()).toEqual(['a.png', 'b.png', 'c.png']);
    });

    it('reverses on the button beside it', () => {
      show(list);
      press(segment('Name'));

      press(order());
      expect(order().textContent).toBe('Z to A');
      expect(captions()).toEqual(['c.png', 'b.png', 'a.png']);
    });

    /** Ascending `latest` is the renderer's own order — what "off" used to be. */
    it('reaches the renderer’s own order without a third state', () => {
      show(list);

      press(order());
      expect(order().textContent).toBe('Oldest first');
      expect(captions()).toEqual(['a.png', 'b.png', 'c.png']);
    });
  });

  describe('the keyboard', () => {
    it('starts at the first tile when nothing is selected', () => {
      show(list);
      press('ArrowRight');

      expect(onSelect).toHaveBeenCalledWith(3);
    });

    it('walks the row and the column', () => {
      // Four across the screen would be two rows of three here.
      const four = [...list, texture(4, 'd.png')];

      show(four, 4);
      press('ArrowRight');
      expect(onSelect).toHaveBeenLastCalledWith(3);

      show(four, 4);
      press('ArrowDown');
      expect(onSelect).toHaveBeenLastCalledWith(1);
    });

    it('goes to the ends', () => {
      show(list, 2);

      press('Home');
      expect(onSelect).toHaveBeenLastCalledWith(3);

      press('End');
      expect(onSelect).toHaveBeenLastCalledWith(1);
    });

    it('lets go on Escape, and stays quiet when there is nothing to let go of', () => {
      show(list, 2);
      press('Escape');
      expect(onSelect).toHaveBeenLastCalledWith(null);

      onSelect.mockClear();
      show(list, null);
      press('Escape');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('points at the selected tile for a reader that cannot see it', () => {
      show(list, 2);

      expect(grid().getAttribute('aria-activedescendant')).toBe('texture-tile-2');
    });
  });

  /**
   * The reason the geometry exists: a page holding hundreds of textures used to
   * put every one of them in the document.
   */
  it('draws only the rows the box can reach', () => {
    const many = Array.from({ length: 300 }, (_, index) =>
      texture(index + 1, `t${String(index)}.png`),
    );

    show(many);

    // 100 rows of three, of which the box shows two and keeps two either side.
    expect(tiles().length).toBeLessThan(30);
    expect(tiles().length).toBeGreaterThan(0);
  });
});
