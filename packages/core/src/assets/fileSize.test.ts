import { describe, expect, it } from 'vitest';

import type { ResourceTiming } from './fileSize.js';
import { fileSizes } from './fileSize.js';

/** What the page's own resource timings can and cannot say about a file. */

const BASE = 'https://example.test/game/';

const from = (entries: ResourceTiming[]) => fileSizes(() => entries, () => BASE);

describe('fileSizes', () => {
  it('reports the body a URL arrived as', () => {
    const sizes = from([{ name: 'https://example.test/hero.png', encodedBodySize: 4096 }]);

    expect(sizes.find('https://example.test/hero.png')).toBe(4096);
  });

  /** `transferSize` counts the response headers as well; the body is the file. */
  it('prefers the body over what was transferred', () => {
    const sizes = from([{ name: 'a.png', encodedBodySize: 4096, transferSize: 4400 }]);

    expect(sizes.find('a.png')).toBe(4096);
  });

  it('falls back to what was transferred when the body is not reported', () => {
    const sizes = from([{ name: 'a.png', transferSize: 4400 }]);

    expect(sizes.find('a.png')).toBe(4400);
  });

  /**
   * A timing is filed under the absolute URL the browser fetched, and a texture
   * is usually named by whatever the application wrote in its manifest.
   */
  it('resolves a relative name against the page it was loaded from', () => {
    const sizes = from([
      { name: 'https://example.test/game/sprites/hero.png', encodedBodySize: 900 },
    ]);

    expect(sizes.find('sprites/hero.png')).toBe(900);
  });

  /**
   * The reason more than one name is offered: on v8 a texture loaded through
   * `Assets` carries an `ImageBitmap`, which has no `src`, and the address it
   * came from is in the source's label instead.
   */
  it('tries every name it is given, in order', () => {
    const sizes = from([{ name: 'https://example.test/game/hero.png', encodedBodySize: 700 }]);

    expect(sizes.find(null, 'hero.png')).toBe(700);
    expect(sizes.find('nothing.png', 'hero.png')).toBe(700);
  });

  /** An asset alias, a cache key, a Spine region — none of them is a URL. */
  it('answers nothing for a name the page never fetched', () => {
    const sizes = from([{ name: 'https://example.test/game/hero.png', encodedBodySize: 700 }]);

    expect(sizes.find('hero-idle')).toBeNull();
    expect(sizes.find('')).toBeNull();
    expect(sizes.find(null)).toBeNull();
  });

  /**
   * What a cross-origin response without `Timing-Allow-Origin` reports, and
   * what one served from the memory cache reports. Neither file is empty, so
   * saying nothing is the truthful answer and a zero would not be.
   */
  it('treats a zero as no answer rather than as an empty file', () => {
    const sizes = from([{ name: 'a.png', encodedBodySize: 0, transferSize: 0 }]);

    expect(sizes.find('a.png')).toBeNull();
  });

  it('ignores an entry with nothing to identify it by', () => {
    expect(from([{ name: '', encodedBodySize: 10 }]).find('')).toBeNull();
  });

  /**
   * A page is free to have loaded more than the timing buffer holds — 250
   * entries by default — and then nothing is known about any of them.
   */
  it('survives a page with no timings at all', () => {
    expect(from([]).find('a.png')).toBeNull();
  });

  it('survives a document with no base to resolve against', () => {
    const sizes = fileSizes(() => [{ name: 'a.png', encodedBodySize: 10 }], () => '');

    expect(sizes.find('a.png')).toBe(10);
    expect(sizes.find('sprites/a.png')).toBeNull();
  });

  /** A page may load the same file twice; the later entry is the current one. */
  it('keeps the last answer for a URL that appears more than once', () => {
    const sizes = from([
      { name: 'a.png', encodedBodySize: 100 },
      { name: 'a.png', encodedBodySize: 200 },
    ]);

    expect(sizes.find('a.png')).toBe(200);
  });
});
