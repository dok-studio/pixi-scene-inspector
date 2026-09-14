// @vitest-environment happy-dom
import type { TextureInfo } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Client } from '../../../transport/client.js';
import { sampleTexture } from './fixtures.js';
import { TextureProperties } from './TextureProperties.js';

/**
 * The pane on the right: what it says about a texture, what it says when there
 * is none, and the two controls in the strip that used to be empty.
 *
 * The row heights it exists to keep even are not observable here — a headless
 * document lays nothing out — so what is checked is the shape that makes them
 * even: rows that neither grow nor shrink.
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
  gpuSize: 2 * 1024 * 1024,
});

const DATA_URL = 'data:image/webp;base64,AA';

describe('TextureProperties', () => {
  let container: HTMLElement;
  let root: Root;
  const call = vi.fn(() => Promise.resolve({ dataUrl: DATA_URL }));
  const client = { call } as unknown as Client;
  const open = vi.fn();

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    call.mockClear();
    open.mockClear();
    localStorage.clear();

    vi.stubGlobal('open', open);
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

  const show = async (texture: TextureInfo | null): Promise<void> => {
    await act(async () => {
      root.render(
        <TextureProperties client={client} texture={texture} onReveal={() => undefined} />,
      );
      await Promise.resolve();
    });
  };

  const rows = (): HTMLElement[] => [
    ...container.querySelectorAll<HTMLElement>('div[class*="w-full"][class*="h-auto"]'),
  ];

  /** The values are in disabled fields, as the previous project drew them. */
  const values = (): string[] =>
    [...container.querySelectorAll<HTMLInputElement>('input')].map((input) => input.value);

  const buttonLabelled = (label: string): HTMLButtonElement | undefined =>
    [...container.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === label,
    );

  it('says what to do when nothing is selected', async () => {
    await show(null);

    expect(container.textContent).toContain('Select a texture to view its properties');
    expect(call).not.toHaveBeenCalled();
  });

  it('reports the texture the grid handed it', async () => {
    await show(TEXTURE);

    expect(values()).toEqual([
      'hero.png',
      'sprites/hero.png',
      '64 x 32',
      '128 x 64',
      '1',
      'rgba8unorm',
      '2 MB',
      'yes',
      'no',
      'premultiply-alpha-on-upload',
      '2d',
      'no',
      'yes',
      'yes',
      'no',
      'image',
      '2 KB',
      'https://example.test/a.png',
    ]);
  });

  /**
   * The fault this pane was rebuilt for: rows that were flex items asking for
   * the whole pane's height shared it out between themselves, so the spacing
   * between them changed with the height of the pane.
   */
  it('draws rows that can neither grow nor shrink', async () => {
    await show(TEXTURE);

    expect(rows()).toHaveLength(18);
    for (const row of rows()) {
      expect(row.className).toContain('shrink-0');
      expect(row.className).not.toContain('h-full');
    }
  });

  /**
   * v6/v7 have no per-texture antialias and no garbage collector to tell about
   * one, and a texture drawn into a canvas has no file to weigh. A blank row
   * would read as a panel that failed to fill it in.
   */
  it('says unknown where a line has no answer rather than leaving a blank', async () => {
    await show(
      sampleTexture({
        id: 7,
        antialias: null,
        autoGarbageCollect: null,
        fileBytes: null,
        url: null,
        alphaMode: '',
      }),
    );

    expect(values().filter((value) => value === 'unknown')).toHaveLength(5);
  });

  it('names the texture in the strip that used to be empty', async () => {
    await show(TEXTURE);

    const header = container.querySelector('div > div > div');
    expect(header?.textContent).toContain('hero.png');
  });

  it('asks for a preview at the size it is about to draw', async () => {
    await show(TEXTURE);

    // The texture is 128 across, and the page does not upscale, so asking for
    // the fitted 512 would be asking it to do nothing slowly.
    expect(call).toHaveBeenCalledWith('assets.preview', { id: 7, max: 128 });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(DATA_URL);
  });

  /** One size, and the pane is the size the picture is drawn at. */
  it('offers no zoom to choose between', async () => {
    await show(TEXTURE);

    for (const label of ['Fit', '1×', '2×']) {
      expect(buttonLabelled(label)).toBeUndefined();
    }
  });

  describe('double-clicking the preview', () => {
    /** The box only offers the gesture where there is a file behind it. */
    const offered = (): HTMLElement | null =>
      container.querySelector<HTMLElement>('[aria-label*="Double-click"]');

    const doubleClick = (): void => {
      const box = container.querySelector('div[class*="h-64"]');
      if (box === null) throw new Error('no preview box');

      act(() => {
        box.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
    };

    /** The file itself, at its real size and its real bytes. */
    it('opens the address the texture was loaded from', async () => {
      await show(TEXTURE);

      expect(offered()).not.toBeNull();
      doubleClick();
      expect(open).toHaveBeenCalledWith('https://example.test/a.png', '_blank', 'noopener');
    });

    /** A texture drawn into a canvas was never loaded from anywhere. */
    it('does nothing, and offers nothing, for a texture with no address', async () => {
      await show(sampleTexture({ id: 7, url: null }));

      expect(offered()).toBeNull();
      doubleClick();
      expect(open).not.toHaveBeenCalled();
    });

    /** The list reports one of those as its media type alone — a description. */
    it('does not treat a media type as somewhere to go', async () => {
      await show(sampleTexture({ id: 7, url: 'data:image/png' }));

      expect(offered()).toBeNull();
      doubleClick();
      expect(open).not.toHaveBeenCalled();
    });
  });

  it('offers a background to judge transparency against', async () => {
    await show(TEXTURE);

    for (const label of ['Chequerboard', 'Black', 'White']) {
      expect(buttonLabelled(label)).toBeDefined();
    }
  });

  it('remembers the background across a remount', async () => {
    await show(TEXTURE);

    const white = buttonLabelled('White');
    if (white === undefined) throw new Error('no white background');

    await act(async () => {
      white.click();
      await Promise.resolve();
    });

    expect(localStorage.getItem('assets.preview.background')).toBe('"light"');
  });
});
