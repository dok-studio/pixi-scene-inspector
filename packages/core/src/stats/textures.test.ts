import { describe, expect, it } from 'vitest';

import type { PixiAdapter, TextureHandle, TextureMeta } from '../adapters/types.js';
import { readTextureStats } from './textures.js';

function adapterOf(infos: TextureMeta[]): PixiAdapter {
  const handles = infos.map((info) => ({ info }) as unknown as TextureHandle);

  return {
    textures: () => handles,
    textureInfo: (handle: TextureHandle) => (handle as unknown as { info: TextureMeta }).info,
  } as unknown as PixiAdapter;
}

/**
 * The aggregate reads three fields; the rest are here because the adapter
 * promises a whole `TextureMeta` and a partial one would not typecheck.
 */
function texture(over: Partial<TextureMeta>): TextureMeta {
  return {
    id: 1,
    label: '',
    width: 0,
    height: 0,
    pixelWidth: 0,
    pixelHeight: 0,
    format: '',
    gpuSize: 0,
    isLoaded: true,
    resolution: 1,
    mipmap: false,
    alphaMode: '',
    dimension: '2d',
    antialias: null,
    isPowerOfTwo: false,
    autoGarbageCollect: null,
    destroyed: false,
    sourceKind: 'none',
    url: null,
    updates: 0,
    ...over,
  };
}

describe('readTextureStats', () => {
  it('sums what the renderer holds', () => {
    const stats = readTextureStats(
      adapterOf([
        texture({ id: 1, gpuSize: 1024, isLoaded: true }),
        texture({ id: 2, gpuSize: 2048, isLoaded: true }),
        texture({ id: 3, gpuSize: 512, isLoaded: false }),
      ]),
    );

    expect(stats).toEqual({ count: 3, onGpu: 2, gpuBytes: 3584 });
  });

  it('leaves an unknown format out of the total rather than guessing', () => {
    const stats = readTextureStats(
      adapterOf([texture({ id: 1, gpuSize: null }), texture({ id: 2, gpuSize: 100 })]),
    );

    expect(stats).toEqual({ count: 2, onGpu: 2, gpuBytes: 100 });
  });

  it('answers zeros for a renderer holding nothing', () => {
    expect(readTextureStats(adapterOf([]))).toEqual({ count: 0, onGpu: 0, gpuBytes: 0 });
  });
});
