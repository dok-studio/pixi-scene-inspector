import { describe, expect, it } from 'vitest';

import { animationsOf, loadedSkeletonNames } from './loaded.js';

/**
 * The skeletons a page has fetched, read off the browser's own record.
 *
 * This is the source that needs nothing from the application, and on a real
 * project it is the only one there is: `Assets` lives on the PixiJS module, and
 * a bundled game publishes none. What makes it work is `.atlas` — an extension
 * Spine uses and nothing else does, so a `.atlas` in the page's history is a
 * skeleton in the page.
 */

interface Fake {
  performance: { getEntriesByType: (type: string) => Array<{ name: string }> };
}

function page(urls: readonly string[]): Fake {
  return {
    performance: {
      getEntriesByType: (type: string) =>
        type === 'resource' ? urls.map((name) => ({ name })) : [],
    },
  };
}

const found = (urls: readonly string[]): readonly string[] =>
  loadedSkeletonNames(page(urls) as unknown as typeof globalThis);

describe('loadedSkeletonNames', () => {
  it('finds a skeleton by the atlas beside it', () => {
    expect(found(['https://cdn.example/assets/spine/hero.atlas'])).toContain('hero');
  });

  it('finds a binary export too', () => {
    expect(found(['/assets/boss.skel'])).toContain('boss');
  });

  /**
   * `.json` belongs to everyone — settings, localisation, level data — so a
   * skeleton export named that way is indistinguishable from the rest. The
   * atlas beside it is what gives it away.
   */
  it('leaves every other kind of file alone', () => {
    const names = found([
      '/assets/levels.json',
      '/assets/ogre.png',
      '/goblin.js',
      '/imp.css',
      '/atlas-viewer.js',
    ]);

    // Not an empty list: what has been seen is kept on purpose, because the
    // buffer these names come from drops its oldest entries. The rule under
    // test is which files count, not what was collected before.
    for (const name of ['levels', 'ogre', 'goblin', 'imp', 'atlas-viewer']) {
      expect(names).not.toContain(name);
    }
  });

  it('reads through a cache-busting query', () => {
    expect(found(['/assets/hero.atlas?v=8fa21c'])).toContain('hero');
  });

  it('reports a name once, however many files carry it', () => {
    const names = found(['/a/hero.atlas', '/b/hero.atlas', '/a/hero.skel']);

    expect(names.filter((name) => name === 'hero')).toHaveLength(1);
  });

  it('survives a page with no resource timing at all', () => {
    expect(() => loadedSkeletonNames({} as unknown as typeof globalThis)).not.toThrow();
  });
});

/**
 * Reading an export the panel cannot get at.
 *
 * The read is asynchronous and `animationsOf` is not, so the first answer is
 * always `pending` and the panel asks again. That makes what happens to a read
 * that **fails** the whole question: with nothing recorded, every one of those
 * later asks starts the same doomed request over again.
 */
describe('animationsOf, when the export cannot be read', () => {
  it('records the empty answer instead of fetching again', async () => {
    let requests = 0;

    const failing = {
      performance: {
        getEntriesByType: (type: string) =>
          type === 'resource'
            ? [{ name: '/assets/ghost.atlas' }, { name: '/assets/ghost.json' }]
            : [],
      },
      fetch: () => {
        requests += 1;
        return Promise.reject(new Error('cross-origin'));
      },
    } as unknown as typeof globalThis;

    expect(animationsOf('ghost', failing)?.pending).toBe(true);
    expect(requests).toBe(1);

    // Let the rejection settle, which is when the answer is recorded.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const second = animationsOf('ghost', failing);
    expect(second?.pending).toBe(false);
    expect(second?.animations).toEqual([]);
    expect(requests).toBe(1);
  });
});
