import type { StatsTextures } from '@scene-inspector/protocol';

import type { PixiAdapter } from '../adapters/types.js';

/**
 * What the renderer is holding in texture memory.
 *
 * Version-free by construction: `textures()` and `textureInfo()` already
 * flatten the difference between a v8 `TextureSource` and a v6/v7
 * `BaseTexture`, including the format tables that turn a format into bytes
 * (`adapters/texture.ts`). Nothing here needs a new adapter method.
 *
 * A texture whose format is not in the tables contributes nothing to the total
 * rather than a guess — `gpuSize` is null for it, and a made-up number in a
 * memory figure is worse than a number that is honestly a little low.
 */
export function readTextureStats(adapter: PixiAdapter): StatsTextures {
  let count = 0;
  let onGpu = 0;
  let gpuBytes = 0;

  for (const texture of adapter.textures()) {
    const info = adapter.textureInfo(texture);

    count += 1;
    if (info.isLoaded) onGpu += 1;
    if (info.gpuSize !== null) gpuBytes += info.gpuSize;
  }

  return { count, onGpu, gpuBytes };
}
