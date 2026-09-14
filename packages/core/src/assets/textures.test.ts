import type { Revisioned, TextureInfo } from '@scene-inspector/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createAdapter } from '../adapters/index.js';
import type { PixiAdapter } from '../adapters/types.js';
import type { PreviewCanvas } from './textures.js';
import { fitPreview, readPreview, readTextureFrames, readTextures } from './textures.js';

/**
 * The Assets model: a revisioned list of metadata, and previews fetched one at
 * a time.
 *
 * What the tests are guarding is the separation itself (docs/architecture.md
 * §3.6). Listing must never touch an image, a preview must be drawn at the size
 * that was asked for and never upscaled, and every way a texture can fail to
 * produce one — gone, unreadable, cross-origin — has to come back as `null`
 * rather than as an error, because all three are ordinary states in a game.
 */

interface FakeSource {
  uid: number;
  label: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  format: string;
  resource?: { width: number; height: number } | ArrayBufferView;
}

function source(uid: number, overrides: Partial<FakeSource> = {}): FakeSource {
  return {
    uid,
    label: `texture-${String(uid)}`,
    width: 64,
    height: 32,
    pixelWidth: 64,
    pixelHeight: 32,
    format: 'rgba8unorm',
    resource: { width: 64, height: 32 },
    ...overrides,
  };
}

/** A v8 application whose renderer holds exactly these textures. */
function adapterWith(textures: FakeSource[], uploaded: number[] = []): PixiAdapter {
  const adapter = createAdapter({
    stage: { children: [] },
    renderer: {
      renderPipes: {},
      texture: {
        managedTextures: textures,
        _glTextures: Object.fromEntries(uploaded.map((uid) => [uid, {}])),
      },
    },
  });

  if (adapter === null) throw new Error('expected an adapter');
  return adapter;
}

function dataOf(result: Revisioned<TextureInfo[]>): TextureInfo[] {
  if ('unchanged' in result) throw new Error('expected data, got unchanged');
  return result.data;
}

interface Drawn {
  width: number;
  height: number;
  calls: { width: number; height: number }[];
}

/**
 * `painted` decides what the readback finds: a canvas nobody drew anything
 * onto is how a v8 `Text` texture behaves once Pixi has recycled its canvas.
 */
function fakeCanvas(
  drawn: Drawn,
  { dataUrl = 'data:image/webp;base64,AAAA', painted = true } = {},
): PreviewCanvas {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (_image, _dx, _dy, width, height) => {
        drawn.calls.push({ width, height });
      },
      getImageData: (_sx, _sy, width, height) => ({
        data: new Uint8ClampedArray(width * height * 4).fill(painted ? 255 : 0),
      }),
    }),
    toDataURL: () => dataUrl,
  };
}

describe('readTextures', () => {
  it('lists what the renderer holds, as metadata only', () => {
    const adapter = adapterWith([source(1), source(2)], [1]);

    // Matched rather than compared whole: the rest of `TextureInfo` is the
    // adapter's answer, and it is the adapters' own tests that pin down what
    // each line reports for it.
    expect(dataOf(readTextures(adapter))).toMatchObject([
      {
        id: 1,
        label: 'texture-1',
        width: 64,
        height: 32,
        pixelWidth: 64,
        pixelHeight: 32,
        format: 'rgba8unorm',
        gpuSize: 64 * 32 * 4,
        isLoaded: true,
      },
      {
        id: 2,
        label: 'texture-2',
        width: 64,
        height: 32,
        pixelWidth: 64,
        pixelHeight: 32,
        format: 'rgba8unorm',
        gpuSize: 64 * 32 * 4,
        isLoaded: false,
      },
    ]);
  });

  /**
   * The one field PixiJS does not know. It is looked up by the label as well as
   * by the resource's URL, because on v8 a texture loaded through `Assets`
   * carries an `ImageBitmap` — which has no `src` — and the address it came
   * from is what `Assets` wrote into the label.
   */
  it('weighs a texture by the name the page fetched it under', () => {
    const adapter = adapterWith([source(1, { label: 'https://example.test/hero.png' })]);

    const answer = readTextures(adapter, undefined, () => [
      { name: 'https://example.test/hero.png', encodedBodySize: 5120 },
    ]);

    expect(dataOf(answer)?.[0]?.fileBytes).toBe(5120);
  });

  /** A texture drawn into a canvas was never fetched, and has no file at all. */
  it('leaves the weight unknown for a texture the page never fetched', () => {
    const adapter = adapterWith([source(1, { label: 'generated' })]);

    const answer = readTextures(adapter, undefined, () => []);
    expect(dataOf(answer)?.[0]?.fileBytes).toBeNull();
  });

  /** The reason the list can be polled at all: an idle page sends nothing. */
  it('answers unchanged while the textures stay as they were', () => {
    const adapter = adapterWith([source(1), source(2)]);

    const first = readTextures(adapter);
    expect(readTextures(adapter, first.rev)).toEqual({ rev: first.rev, unchanged: true });
  });

  it('notices a texture arriving, leaving, or reaching the GPU', () => {
    const listed = adapterWith([source(1)]);
    const base = readTextures(listed).rev;

    expect(readTextures(adapterWith([source(1), source(2)])).rev).not.toBe(base);
    expect(readTextures(adapterWith([])).rev).not.toBe(base);
    expect(readTextures(adapterWith([source(1)], [1])).rev).not.toBe(base);
  });

  /** Order is the renderer's, and the panel sorts on top of it. */
  it('treats a reordered list as a change', () => {
    const forwards = readTextures(adapterWith([source(1), source(2)])).rev;
    const backwards = readTextures(adapterWith([source(2), source(1)])).rev;

    expect(backwards).not.toBe(forwards);
  });

  it('never reaches for an image', () => {
    const adapter = adapterWith([source(1)]);
    const drawable = vi.spyOn(adapter, 'drawable');

    readTextures(adapter);
    expect(drawable).not.toHaveBeenCalled();
  });
});

describe('fitPreview', () => {
  it('caps the longest side and keeps the aspect ratio', () => {
    expect(fitPreview(2048, 1024, 128)).toEqual({ width: 128, height: 64 });
    expect(fitPreview(1024, 2048, 128)).toEqual({ width: 64, height: 128 });
  });

  /** CSS can enlarge a thumbnail; sending more pixels than exist cannot. */
  it('does not upscale', () => {
    expect(fitPreview(16, 16, 128)).toEqual({ width: 16, height: 16 });
  });

  it('keeps a sliver of a texture visible rather than rounding it away', () => {
    expect(fitPreview(2048, 4, 128)).toEqual({ width: 128, height: 1 });
  });

  it('has nothing to draw for a texture with no size', () => {
    expect(fitPreview(0, 0, 128)).toEqual({ width: 0, height: 0 });
  });
});

describe('readPreview', () => {
  it('draws the texture at the requested size', () => {
    const adapter = adapterWith([source(1, { pixelWidth: 512, pixelHeight: 256 })]);
    const drawn: Drawn = { width: 0, height: 0, calls: [] };

    const result = readPreview(adapter, 1, 128, () => fakeCanvas(drawn));

    expect(result.dataUrl).toBe('data:image/webp;base64,AAAA');
    expect(drawn.calls).toEqual([{ width: 128, height: 64 }]);
  });

  /** A full-size request is still bounded: the page allocates this canvas. */
  it('refuses to draw larger than its own ceiling', () => {
    const adapter = adapterWith([source(1, { pixelWidth: 8192, pixelHeight: 8192 })]);
    const drawn: Drawn = { width: 0, height: 0, calls: [] };

    readPreview(adapter, 1, 8192, () => fakeCanvas(drawn));

    expect(drawn.calls).toEqual([{ width: 1024, height: 1024 }]);
  });

  it('has no preview for a texture that is not there', () => {
    const adapter = adapterWith([source(1)]);

    expect(readPreview(adapter, 99, 128, () => fakeCanvas({ width: 0, height: 0, calls: [] }))).toEqual({
      dataUrl: null,
    });
  });

  /** Buffer and compressed sources: a placeholder in the panel, not an error. */
  it('has no preview for a source with no image behind it', () => {
    const adapter = adapterWith([source(1, { resource: new Uint8Array(16) })]);

    expect(readPreview(adapter, 1, 128, () => fakeCanvas({ width: 0, height: 0, calls: [] }))).toEqual({
      dataUrl: null,
    });
  });

  it('has no preview where there is no canvas to draw on', () => {
    const adapter = adapterWith([source(1)]);

    expect(readPreview(adapter, 1, 128, () => null)).toEqual({ dataUrl: null });
  });

  /**
   * A v8 `Text` keeps a canvas that Pixi returns to its pool after upload, so
   * what is left to draw is blank — and then the renderer is asked instead.
   * Without an answer from it, a transparent image in the grid would be
   * indistinguishable from one that has not loaded yet.
   */
  it('has no preview when the source is blank and the renderer offers nothing', () => {
    const adapter = adapterWith([source(1)]);
    const drawn: Drawn = { width: 0, height: 0, calls: [] };

    expect(readPreview(adapter, 1, 128, () => fakeCanvas(drawn, { painted: false }))).toEqual({
      dataUrl: null,
    });
  });

  describe('when the pixels are only on the GPU', () => {
    /** An adapter whose sources draw as nothing but read back whole. */
    const withReadback = (readback: { width: number; height: number } | null): PixiAdapter => {
      const base = adapterWith([source(1, { resource: undefined })]);
      return {
        ...base,
        readback: () =>
          readback === null
            ? null
            : { image: { width: readback.width, height: readback.height }, ...readback },
      } as PixiAdapter;
    };

    /**
     * A `Text` and a render target: nothing on this side of the bus, and the
     * whole picture on the other. Between them they are most of what a v8 page
     * reports as unnamed.
     */
    it('reads them back and draws that', () => {
      const drawn: Drawn = { width: 0, height: 0, calls: [] };

      expect(readPreview(withReadback({ width: 100, height: 50 }), 1, 128, () => fakeCanvas(drawn))).toEqual({
        dataUrl: 'data:image/webp;base64,AAAA',
      });
      // The size that came back, not the source's: a text's letters are a frame
      // inside a larger sheet.
      expect(drawn.calls).toEqual([{ width: 100, height: 50 }]);
    });

    /** A build without the extract system, or a backend that answers with a promise. */
    it('says there is no preview when the renderer will not answer', () => {
      const drawn: Drawn = { width: 0, height: 0, calls: [] };

      expect(readPreview(withReadback(null), 1, 128, () => fakeCanvas(drawn))).toEqual({
        dataUrl: null,
      });
    });

    /** The expensive path stays shut for everything that has pixels of its own. */
    it('is not asked at all when the source draws something', () => {
      const base = adapterWith([source(1)]);
      let asked = 0;
      const adapter = { ...base, readback: () => { asked += 1; return null; } } as PixiAdapter;

      readPreview(adapter, 1, 128, () => fakeCanvas({ width: 0, height: 0, calls: [] }));
      expect(asked).toBe(0);
    });
  });

  /** A cross-origin texture taints the canvas, and reading it throws. */
  it('has no preview for a texture the page may not read back', () => {
    const adapter = adapterWith([source(1)]);
    const tainted: PreviewCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => undefined,
        // The readback is where a tainted canvas gives up first.
        getImageData: () => {
          throw new Error('SecurityError');
        },
      }),
      toDataURL: () => {
        throw new Error('SecurityError');
      },
    };

    expect(readPreview(adapter, 1, 128, () => tainted)).toEqual({ dataUrl: null });
  });
});

/**
 * A v8 source with the frames cut from it, expressed the way PixiJS leaves
 * them: a `Texture` subscribes to its source's `resize` with itself as the
 * listener's context, and `eventemitter3` files that context away. There is no
 * list of a source's frames anywhere else.
 */
function withFrames(
  uid: number,
  cuts: { label: string; x: number; y: number; width: number; height: number }[],
): FakeSource {
  const page = source(uid, { pixelWidth: 256, pixelHeight: 256, width: 256, height: 256 });

  const listeners = cuts.map((cut) => ({
    context: {
      isTexture: true,
      label: cut.label,
      source: page,
      frame: { x: cut.x, y: cut.y, width: cut.width, height: cut.height },
    },
  }));

  (page as unknown as { _events: unknown; width: number })._events = { resize: listeners };
  return page;
}

const framesOf = (answer: Revisioned<unknown>) =>
  'data' in answer ? (answer.data as { name: string }[]) : null;

describe('readTextureFrames', () => {
  it('reports the regions cut out of a sheet, in reading order', () => {
    const sheet = withFrames(1, [
      { label: 'c', x: 0, y: 64, width: 32, height: 32 },
      { label: 'b', x: 32, y: 0, width: 32, height: 32 },
      { label: 'a', x: 0, y: 0, width: 32, height: 32 },
    ]);

    const answer = readTextureFrames(adapterWith([sheet]), 1);
    expect(framesOf(answer)?.map((frame) => frame.name)).toEqual(['a', 'b', 'c']);
  });

  /** A standalone texture has one region, and it is the whole of the texture. */
  it('reports no frames for a texture nobody cut', () => {
    const plain = withFrames(1, [{ label: 'whole', x: 0, y: 0, width: 256, height: 256 }]);

    expect(framesOf(readTextureFrames(adapterWith([plain]), 1))).toEqual([]);
  });

  it('answers for a texture that is no longer there rather than failing', () => {
    expect(framesOf(readTextureFrames(adapterWith([source(1)]), 99))).toEqual([]);
  });

  it('answers unchanged while the regions stay as they were', () => {
    const adapter = adapterWith([withFrames(1, [{ label: 'a', x: 0, y: 0, width: 32, height: 32 }])]);

    const first = readTextureFrames(adapter, 1);
    expect(readTextureFrames(adapter, 1, first.rev)).toEqual({ rev: first.rev, unchanged: true });
  });

  it('moves the revision when a region is cut somewhere else', () => {
    const before = readTextureFrames(
      adapterWith([withFrames(1, [{ label: 'a', x: 0, y: 0, width: 32, height: 32 }])]),
      1,
    );
    const after = readTextureFrames(
      adapterWith([withFrames(1, [{ label: 'a', x: 8, y: 0, width: 32, height: 32 }])]),
      1,
    );

    expect(after.rev).not.toBe(before.rev);
  });
});
