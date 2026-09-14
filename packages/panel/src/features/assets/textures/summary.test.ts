import type { TextureInfo } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { sampleTexture } from './fixtures.js';
import { summarise } from './summary.js';

/** The strip under the grid, away from the markup that draws it. */

const texture = (overrides: Partial<TextureInfo> = {}): TextureInfo =>
  sampleTexture({ gpuSize: 100, ...overrides });

describe('summarise', () => {
  it('counts the whole list and what the filter left of it', () => {
    const all = [texture(), texture({ id: 2 }), texture({ id: 3 })];

    expect(summarise(all, all.slice(0, 1))).toMatchObject({ total: 3, shown: 1 });
  });

  it('counts what is on the GPU rather than what is shown', () => {
    const all = [texture(), texture({ id: 2, isLoaded: false })];

    expect(summarise(all, []).onGpu).toBe(1);
  });

  it('adds up the sizes it knows', () => {
    const all = [texture({ gpuSize: 100 }), texture({ id: 2, gpuSize: 250 })];

    expect(summarise(all, all)).toMatchObject({ gpuBytes: 350, gpuBytesPartial: false });
  });

  /** A guessed byte count in a memory figure is worse than one that is honest. */
  it('leaves an unknown size out of the total and says so', () => {
    const all = [texture({ gpuSize: 100 }), texture({ id: 2, gpuSize: null })];

    expect(summarise(all, all)).toMatchObject({ gpuBytes: 100, gpuBytesPartial: true });
  });

  it('answers for an empty page without pretending it is loading', () => {
    expect(summarise([], [])).toEqual({
      total: 0,
      shown: 0,
      onGpu: 0,
      gpuBytes: 0,
      gpuBytesPartial: false,
    });
  });
});
