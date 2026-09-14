import type { TextureInfo } from '@scene-inspector/protocol';

/**
 * What the renderer is holding, counted off the list the grid already has.
 *
 * No command of its own, deliberately. `stats.textures` answers the same
 * question in the page, but asking it here would mean two walks over the same
 * textures a second and two answers that could disagree by a poll — the strip
 * under the tree does the same sum over the tree payload for the same reason
 * (`features/scene/counts/`).
 *
 * `shown` is the other half of what the strip is for: a filter that hides
 * three quarters of the grid is otherwise invisible, and an empty grid reads as
 * an empty page rather than as a filter nobody remembers switching on.
 */

export interface Summary {
  /** Everything the renderer holds. */
  total: number;
  /** How many of those the toolbar is letting through. */
  shown: number;
  onGpu: number;
  /** Bytes, over the textures whose format is in the tables. */
  gpuBytes: number;
  /** Whether any texture was left out of `gpuBytes` for want of a format. */
  gpuBytesPartial: boolean;
}

export function summarise(
  textures: readonly TextureInfo[],
  visible: readonly TextureInfo[],
): Summary {
  let onGpu = 0;
  let gpuBytes = 0;
  let gpuBytesPartial = false;

  for (const texture of textures) {
    if (texture.isLoaded) onGpu += 1;

    // A null size is a format the tables do not know, and adding a guess for it
    // would make the total quietly wrong. It is left out and said out loud
    // instead — the same choice `gpuSizeOf` makes in the page.
    if (texture.gpuSize === null) gpuBytesPartial = true;
    else gpuBytes += texture.gpuSize;
  }

  return { total: textures.length, shown: visible.length, onGpu, gpuBytes, gpuBytesPartial };
}
