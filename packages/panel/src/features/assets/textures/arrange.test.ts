import type { TextureInfo } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { arrangeTextures, textureName } from './arrange.js';
import { sampleTexture } from './fixtures.js';

/** The toolbar's rules, away from the grid that draws them. */

const texture = (label: string, overrides: Partial<TextureInfo> = {}): TextureInfo =>
  sampleTexture({ label, ...overrides });

const names = (list: TextureInfo[]): string[] => list.map(textureName);

describe('textureName', () => {
  it('shows the last segment of a path', () => {
    expect(textureName(texture('assets/atlas/hero.png'))).toBe('hero.png');
  });

  it('names a texture that carries no label at all', () => {
    expect(textureName(texture(''))).toBe('Unnamed');
  });
});

describe('arrangeTextures', () => {
  /** Ascending `latest` is the renderer's own order — the list as it arrived. */
  const base = {
    search: '',
    channel: 'both',
    naming: 'all',
    sort: { key: 'latest', direction: 'asc' },
  } as const;

  it('narrows to what the search matches, by name or by folder', () => {
    const list = [texture('ui/button.png'), texture('sprites/hero.png')];

    expect(names(arrangeTextures(list, { ...base, search: 'hero' }))).toEqual(['hero.png']);
    expect(names(arrangeTextures(list, { ...base, search: 'ui/' }))).toEqual(['button.png']);
  });

  it('filters by whether the texture is on the GPU', () => {
    const list = [texture('a.png'), texture('b.png', { isLoaded: false })];

    expect(names(arrangeTextures(list, { ...base, channel: 'loaded' }))).toEqual(['a.png']);
    expect(names(arrangeTextures(list, { ...base, channel: 'unloaded' }))).toEqual(['b.png']);
  });

  it('sorts by name in both directions', () => {
    const list = [texture('b.png'), texture('a.png'), texture('c.png')];

    expect(names(arrangeTextures(list, { ...base, sort: { key: 'name', direction: 'asc' } }))).toEqual([
      'a.png',
      'b.png',
      'c.png',
    ]);
    expect(names(arrangeTextures(list, { ...base, sort: { key: 'name', direction: 'desc' } }))).toEqual([
      'c.png',
      'b.png',
      'a.png',
    ]);
  });

  it('sorts by size, largest first when descending', () => {
    const list = [texture('small.png', { gpuSize: 100 }), texture('big.png', { gpuSize: 900 })];

    expect(names(arrangeTextures(list, { ...base, sort: { key: 'size', direction: 'desc' } }))).toEqual([
      'big.png',
      'small.png',
    ]);
  });

  /** Otherwise the textures nothing is known about would head the list. */
  it('sorts an unknown size below every known one', () => {
    const list = [texture('known.png', { gpuSize: 1 }), texture('unknown.png', { gpuSize: null })];

    expect(names(arrangeTextures(list, { ...base, sort: { key: 'size', direction: 'desc' } }))).toEqual([
      'known.png',
      'unknown.png',
    ]);
  });

  it('reads latest as the renderer order reversed', () => {
    const list = [texture('first.png'), texture('second.png')];

    expect(names(arrangeTextures(list, { ...base, sort: { key: 'latest', direction: 'desc' } }))).toEqual([
      'second.png',
      'first.png',
    ]);
    expect(names(arrangeTextures(list, { ...base, sort: { key: 'latest', direction: 'asc' } }))).toEqual([
      'first.png',
      'second.png',
    ]);
  });

  it('asks every word of the search separately', () => {
    const list = [texture('sprites/atlas/hero.png'), texture('sprites/ui/button.png')];

    expect(names(arrangeTextures(list, { ...base, search: 'atlas png' }))).toEqual(['hero.png']);
    // Order is not part of the query: the words of a path arrive in whatever
    // order the path puts them.
    expect(names(arrangeTextures(list, { ...base, search: 'png atlas' }))).toEqual(['hero.png']);
    expect(names(arrangeTextures(list, { ...base, search: 'atlas missing' }))).toEqual([]);
  });

  /** Both halves of the same question, and both are worth asking. */
  it('narrows to the named textures, or to the ones nobody named', () => {
    const list = [texture('a.png'), texture('')];

    expect(names(arrangeTextures(list, { ...base, naming: 'unnamed' }))).toEqual(['Unnamed']);
    expect(names(arrangeTextures(list, { ...base, naming: 'named' }))).toEqual(['a.png']);
    expect(names(arrangeTextures(list, { ...base, naming: 'all' }))).toEqual(['a.png', 'Unnamed']);
  });

  /**
   * The list is rebuilt by every poll, and the renderer may hand its textures
   * over in another order; without a tie-break a page of same-sized tiles was
   * arranged afresh every second.
   */
  it('settles an equal size by name and then by id', () => {
    const list = [
      texture('b.png', { id: 2, gpuSize: 100 }),
      texture('a.png', { id: 3, gpuSize: 100 }),
      texture('a.png', { id: 1, gpuSize: 100 }),
    ];

    const sorted = arrangeTextures(list, { ...base, sort: { key: 'size', direction: 'desc' } });
    expect(sorted.map((entry) => entry.id)).toEqual([1, 3, 2]);
  });

  /** The tie is the absence of an order, so reversing the column must not reverse it. */
  it('keeps the tie-break ascending in both directions', () => {
    const list = [texture('b.png', { id: 2 }), texture('a.png', { id: 1 })];

    const asc = arrangeTextures(list, { ...base, sort: { key: 'size', direction: 'asc' } });
    const desc = arrangeTextures(list, { ...base, sort: { key: 'size', direction: 'desc' } });
    expect(names(asc)).toEqual(['a.png', 'b.png']);
    expect(names(desc)).toEqual(['a.png', 'b.png']);
  });

  /** The list is polled data the grid still holds; arranging must not touch it. */
  it('leaves the list it was given alone', () => {
    const list = [texture('b.png'), texture('a.png')];

    arrangeTextures(list, { ...base, sort: { key: 'name', direction: 'desc' } });
    expect(names(list)).toEqual(['b.png', 'a.png']);
  });
});
