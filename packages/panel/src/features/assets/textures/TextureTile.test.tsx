// @vitest-environment happy-dom
import type { TextureInfo } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BASE_IMAGE_HEIGHT, BASE_TILE_WIDTH } from './columns.js';
import { sampleTexture } from './fixtures.js';
import { TextureTile } from './TextureTile.js';

/**
 * What one tile says, and the three answers it has to tell apart: an image, a
 * source with no image, and an image that has not arrived yet.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const TEXTURE = sampleTexture({
  id: 7,
  label: 'sprites/hero.png',
  width: 64,
  height: 32,
  pixelWidth: 128,
  pixelHeight: 64,
  gpuSize: 1024 * 1024,
});

describe('TextureTile', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const show = (
    preview: string | null | undefined,
    overrides: Partial<TextureInfo> = {},
    selected = false,
    onSelect: (id: number | null) => void = () => undefined,
  ): void => {
    act(() => {
      root.render(
        <TextureTile
          texture={{ ...TEXTURE, ...overrides }}
          preview={preview}
          selected={selected}
          onSelect={onSelect}
          tileRef={() => undefined}
          width={BASE_TILE_WIDTH}
          height={185}
          imageHeight={BASE_IMAGE_HEIGHT}
        />,
      );
    });
  };

  const cell = (): HTMLElement => {
    const found = container.querySelector<HTMLElement>('[role="gridcell"]');
    if (found === null) throw new Error('no tile');
    return found;
  };

  it('captions the texture with its numbers', () => {
    show('data:image/webp;base64,AA');

    expect(container.textContent).toContain('hero.png');
    expect(container.textContent).toContain('Size: 128 x 64');
    expect(container.textContent).toContain('GPU: 1 MB');
  });

  /**
   * A format is a bare GL constant on v6/v7, and the case worth noticing on v8
   * — a compressed texture — reads as a GPU size of "unknown" anyway. It is a
   * row in the pane on the right, and not a line on every tile.
   */
  it('leaves the format to the pane on the right', () => {
    show(null);

    expect(container.textContent).not.toContain('Format');
  });

  /**
   * The old tile said `h-42`, which is not a class at all. The size is a number
   * now, and it comes from the grid — which divides its width between however
   * many tiles fit — rather than from anything the tile decides for itself.
   */
  it('is drawn at the size the grid hands it', () => {
    show(undefined);

    expect(cell().style.width).toBe(`${String(BASE_TILE_WIDTH)}px`);
    expect(cell().style.height).toBe('185px');
  });

  it('tells a thumbnail that has not arrived from one that does not exist', () => {
    show(undefined);
    expect(container.textContent).toContain('Loading…');

    show(null);
    expect(container.textContent).toContain('No preview');
    expect(container.querySelector('img')).toBeNull();
  });

  it('draws the image once it is there', () => {
    show('data:image/webp;base64,AA');

    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,AA');
  });

  it('says whether it is unnamed rather than showing nothing', () => {
    show(null, { label: '' });

    expect(container.textContent).toContain('Unnamed');
  });

  it('says an unmeasurable size is unknown rather than zero', () => {
    show(null, { gpuSize: null });

    expect(container.textContent).toContain('GPU: unknown');
  });

  it('reports its selected state to the grid around it', () => {
    show(null, {}, true);

    expect(cell().getAttribute('aria-selected')).toBe('true');
  });

  it('selects on a click, and lets a second click let go', () => {
    const onSelect = vi.fn();

    show(null, {}, false, onSelect);
    act(() => {
      cell().click();
    });
    expect(onSelect).toHaveBeenCalledWith(7);

    show(null, {}, true, onSelect);
    act(() => {
      cell().click();
    });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
