import type { TextureInfo } from '@scene-inspector/protocol';

/**
 * A texture to hand the Assets tab's tests, shared because there are five of
 * them and `TextureInfo` has seventeen fields — four copies of the same
 * seventeen defaults would mean four places to remember whenever one is added.
 *
 * Not a test file itself, so it is not collected as one; it is the fixture the
 * tests are written against, and what each of them says is only the handful of
 * fields it is actually about.
 */
export function sampleTexture(overrides: Partial<TextureInfo> = {}): TextureInfo {
  return {
    id: 1,
    label: 'a.png',
    width: 64,
    height: 64,
    pixelWidth: 64,
    pixelHeight: 64,
    format: 'rgba8unorm',
    gpuSize: 64 * 64 * 4,
    isLoaded: true,
    resolution: 1,
    mipmap: false,
    alphaMode: 'premultiply-alpha-on-upload',
    dimension: '2d',
    antialias: false,
    isPowerOfTwo: true,
    autoGarbageCollect: true,
    destroyed: false,
    sourceKind: 'image',
    url: 'https://example.test/a.png',
    fileBytes: 2048,
    updates: 0,
    ...overrides,
  };
}
