/**
 * What a texture's file weighed on the wire, taken from the page's own
 * resource timings.
 *
 * The previous project answered this by `fetch`ing the texture's URL **from
 * the panel** and measuring the response. That could not be carried over: in
 * the extension the panel is a `chrome-extension://` document, so a relative
 * asset path resolves against the wrong origin and every tile read `N/A`, and
 * it put a network request behind every tile besides.
 *
 * The page already knows. Every image it loaded left a `PerformanceResourceTiming`
 * behind it, and reading those costs nothing and asks the network for nothing.
 *
 * Read as a whole rather than per texture: `getEntriesByName` walks the buffer
 * once per call, and this list is polled every second over every texture the
 * renderer holds. One pass builds the map, and the lookups after it are free.
 */

/** The two fields of a timing entry this needs, and nothing else. */
export interface ResourceTiming {
  name: string;
  encodedBodySize?: unknown;
  transferSize?: unknown;
}

export type TimingSource = () => readonly ResourceTiming[];

/** What a relative name is resolved against — the document's own base. */
export type BaseHref = () => string;

const pageTimings: TimingSource = () => {
  if (typeof performance === 'undefined') return [];

  const entries = performance.getEntriesByType('resource') as unknown;
  return Array.isArray(entries) ? (entries as ResourceTiming[]) : [];
};

const pageBase: BaseHref = () => (typeof document === 'undefined' ? '' : document.baseURI);

export interface FileSizes {
  /**
   * The bytes the first of these names arrived as, or `null` if none of them
   * was ever fetched.
   *
   * Several names because a texture is known by more than one string and only
   * some of them are ever a URL. On v8 a texture loaded through `Assets`
   * carries an `ImageBitmap`, which has no `src` at all — the URL it came from
   * is what `Assets` wrote into the source's **label** instead. So the label is
   * offered here too, and a timing existing under it is itself the proof that
   * it was a URL. Nothing is guessed: a string either names something the page
   * fetched or it does not.
   */
  find(...names: readonly (string | null)[]): number | null;
}

/**
 * @returns a lookup over the bytes every fetched URL arrived as.
 *
 * `encodedBodySize` first, because that is the file — `transferSize` includes
 * the response headers, and for a cached response it is 0 while the body size
 * is still known.
 *
 * A zero is left out rather than recorded. It is what a cross-origin response
 * without `Timing-Allow-Origin` reports, and what a resource served from the
 * memory cache reports, and in neither case is the file nought bytes long. An
 * absent entry says "unknown", which is the truth; a zero would say "empty".
 *
 * Nothing is found for a page whose timing buffer has filled up — it holds 250
 * entries by default and a page is free to have loaded more. That is the same
 * "unknown", and it is why this is one number in a row rather than something
 * the tab adds up.
 */
export function fileSizes(source: TimingSource = pageTimings, base: BaseHref = pageBase): FileSizes {
  const sizes = new Map<string, number>();

  for (const entry of source()) {
    if (typeof entry.name !== 'string' || entry.name === '') continue;

    const encoded = typeof entry.encodedBodySize === 'number' ? entry.encodedBodySize : 0;
    const transferred = typeof entry.transferSize === 'number' ? entry.transferSize : 0;
    const bytes = encoded > 0 ? encoded : transferred;

    if (bytes > 0) sizes.set(entry.name, bytes);
  }

  // Resolved once rather than per texture: the base cannot change between two
  // textures of the same poll, and this runs over every one of them.
  const href = base();

  /** A timing is filed under the absolute URL the browser fetched. */
  const absolute = (name: string): string | null => {
    if (href === '') return null;

    try {
      return new URL(name, href).href;
    } catch {
      // Not a URL at all — an asset alias, a cache key, a Spine region name.
      return null;
    }
  };

  return {
    find: (...names) => {
      if (sizes.size === 0) return null;

      for (const name of names) {
        if (name === null || name === '') continue;

        const direct = sizes.get(name);
        if (direct !== undefined) return direct;

        const resolved = absolute(name);
        if (resolved === null) continue;

        const found = sizes.get(resolved);
        if (found !== undefined) return found;
      }

      return null;
    },
  };
}
