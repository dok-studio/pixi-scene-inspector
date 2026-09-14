import type { TextureFrame } from '@scene-inspector/protocol';

import type { TextureMeta } from './types.js';

import {
  addChildAt,
  applicationId,
  asCanvas,
  bool,
  children,
  getProp,
  hasFilter,
  hasMask,
  globalBounds,
  num,
  parentOf,
  removeChild,
  rendererSizeOf,
  resolveStage,
  setProp,
  setTextureId,
  str,
  visible,
} from './common.js';
import { counterFor } from './drawCalls.js';
import { nodeType } from './nodeType.js';
import { pickStack, probeEvents, probeInteraction } from './picking.js';
import type { CachedTexture } from './texture.js';
import { spineStore } from './spineCache.js';
import {
  asDrawable,
  atlasPageSources,
  couldBeFetched,
  gpuSizeOf,
  labelAddress,
  pickableNames,
  powerOfTwo,
  resourceUrl,
  sortFrames,
  sourceKindOf,
  updateCount,
} from './texture.js';
import type { Node, PixiAdapter, PixiCandidate, TextureHandle } from './types.js';

/**
 * PixiJS v6 and v7 in one file, because implementing them separately turned out
 * to mean writing the same adapter twice.
 *
 * Everything the adapter touches is identical on the two lines — `name` for the
 * label, `BaseTexture` with GL format constants, `renderer.resolution` for
 * overlay geometry. The one real difference is where a hit test is asked:
 * v7 has the EventSystem (`renderer.events`), v6 the interaction plugin
 * (`renderer.plugins.interaction`).
 *
 * That single branch is spelled out in `hitStack` below rather than being spread
 * across two files whose diff would be four lines.
 */

interface V6BaseTexture {
  uid?: unknown;
  /** The keys the texture was registered under; the first one reads as a name. */
  textureCacheIds?: unknown;
  width?: unknown;
  height?: unknown;
  /** Uploaded size in texels; differs from width/height when resolution ≠ 1. */
  realWidth?: unknown;
  realHeight?: unknown;
  /** A GL format constant (RGBA = 6408), not a string. */
  format?: unknown;
  /** The drawable is one level deeper than on v8: resources wrap it. */
  resource?: { source?: unknown };
  resolution?: unknown;
  /** A `MIPMAP_MODES` constant: 0 is off, anything else is on. */
  mipmap?: unknown;
  /** An `ALPHA_MODES` constant, not a name. */
  alphaMode?: unknown;
  isPowerOfTwo?: unknown;
  destroyed?: unknown;
}

/**
 * `ALPHA_MODES`, as words.
 *
 * v8 reports these as strings and v6/v7 as an enum, and the panel should not
 * have to know which line it is looking at to read one — so the translation
 * lives here, which is the whole point of the adapter boundary. The names are
 * v8's own, so a row means the same thing on all three lines.
 */
const ALPHA_MODES: Readonly<Record<number, string>> = {
  0: 'no-premultiply-alpha',
  1: 'premultiply-alpha-on-upload',
  2: 'premultiplied-alpha',
};

/**
 * Pixi's own id for a texture nobody named — `Texture.from(canvas)` registers
 * one of these before the application gets a chance to add a name of its own.
 */
const GENERATED_CACHE_ID = /^pixiid_\d+$/;

/**
 * The name to show for a texture, out of the keys it is cached under.
 *
 * A texture loaded from a URL has that URL first and this picks it. A texture
 * built from a canvas or a buffer is registered under a generated id *first*
 * and under whatever the application called it second — so taking position
 * zero would label every generated texture `pixiid_31`, hiding the one string
 * a human wrote. The generated id is still the answer when there is nothing
 * else, since it at least tells two textures apart.
 */
function cacheName(value: unknown): string {
  if (!Array.isArray(value)) return '';

  const ids = value.filter((id): id is string => typeof id === 'string');
  return ids.find((id) => !GENERATED_CACHE_ID.test(id)) ?? str(ids[0], '');
}

interface V6Texture {
  baseTexture?: unknown;
  frame?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  textureCacheIds?: unknown;
}

/**
 * One entry of `utils.TextureCache`, or null when the value is not a texture.
 *
 * The cache is typed as holding textures, but it is a plain object a page can
 * put anything in, so the shape is checked rather than trusted. "Whole" is
 * decided against the base's logical size, which is the same unit `frame` is
 * in; `>=` rather than `===` because a frame rounded up to the base is still
 * the page.
 */
function cacheEntry(name: string, value: unknown): CachedTexture | null {
  if (typeof value !== 'object' || value === null) return null;

  const texture = value as V6Texture;
  const base = texture.baseTexture;
  if (typeof base !== 'object' || base === null) return null;

  const frame = texture.frame;
  if (typeof frame !== 'object' || frame === null) return null;

  const width = num((base as { width?: unknown }).width, 0);
  const height = num((base as { height?: unknown }).height, 0);
  const whole = num(frame.width, 0) >= width && num(frame.height, 0) >= height;

  return { name, source: base, whole };
}

/**
 * The Spine atlases the page is holding on to, wherever this line keeps them.
 *
 * v7 loads through `Assets`, whose cache is a private `Map`; v6 has no Assets
 * at all and keeps loaded resources on the shared `Loader`. Both are read for
 * both versions rather than branched on `major`: a v7 application is free to
 * use the old loader, and looking in an absent place costs nothing.
 */
function atlasHolders(pixi: unknown): unknown[] {
  if (typeof pixi !== 'object' || pixi === null) return [];
  const module = pixi as Record<string, unknown>;

  const values: unknown[] = [];

  const cache = (module['Cache'] ?? (module['Assets'] as { cache?: unknown } | undefined)?.cache) as
    | { _cache?: unknown }
    | undefined;
  if (cache?._cache instanceof Map) values.push(...cache._cache.values());

  const resources = (module['Loader'] as { shared?: { resources?: unknown } } | undefined)?.shared
    ?.resources;
  if (typeof resources === 'object' && resources !== null) {
    // A loader resource is a wrapper: the atlas hangs off it under a name the
    // Spine plugin chose, so the resource's own values are what to look at.
    for (const resource of Object.values(resources as Record<string, unknown>)) {
      if (typeof resource === 'object' && resource !== null) {
        values.push(...Object.values(resource as Record<string, unknown>));
      }
    }
  }

  return values;
}

/** A v6/v7 Spine atlas page holds its `BaseTexture` directly. */
function pageBase(page: object): object | null {
  const base = (page as { baseTexture?: unknown }).baseTexture;
  return typeof base === 'object' && base !== null ? base : null;
}

export function createLegacyAdapter(major: 6 | 7, candidate: PixiCandidate): PixiAdapter {
  const renderer = candidate.renderer as
    | { events?: unknown; plugins?: { interaction?: unknown }; resolution?: unknown; texture?: unknown }
    | undefined;

  return {
    major,

    stage: () => resolveStage(candidate),
    children,
    parentOf,
    removeChild,
    addChildAt,
    typeOf: nodeType,

    // The application's own id wins where it has one; see `applicationId`.
    label: (node) => applicationId(node) ?? str((node as { name?: unknown }).name, ''),
    setLabel: (node, value) => {
      const target = applicationId(node) === null ? 'name' : 'id';
      (node as Record<string, unknown>)[target] = value;
    },

    // An empty one is no name, and a row saying nothing is worse than no row.
    pixiName: (node) => {
      const name = str((node as { name?: unknown }).name, '');
      return name === '' ? undefined : name;
    },
    visible,
    hasFilter,
    hasMask,
    getProp,
    setProp,
    setTextureId,

    // A gradient here is three fields of the style — `fill` as a list of colours,
    // `fillGradientType`, `fillGradientStops` — so there is nothing to build.
    gradientSupport: () => ({ shape: 'list' }),

    globalBounds,

    hitStack: (clientX, clientY, depth) => {
      const stage = resolveStage(candidate);

      return pickStack(
        stage,
        children,
        () =>
          major === 7
            ? probeEvents(renderer?.events, clientX, clientY, stage)
            : probeInteraction(renderer?.plugins?.interaction, clientX, clientY, stage),
        depth,
      );
    },

    spineStore: () => spineStore(candidate),

    pickableTextureNames: () => {
      const cache = (candidate.pixi as { utils?: { TextureCache?: unknown } } | undefined)?.utils
        ?.TextureCache;
      if (typeof cache !== 'object' || cache === null) return [];

      const entries: CachedTexture[] = [];
      for (const [name, value] of Object.entries(cache as Record<string, unknown>)) {
        if (name === '' || GENERATED_CACHE_ID.test(name)) continue;

        const entry = cacheEntry(name, value);
        if (entry !== null) entries.push(entry);
      }

      return pickableNames(entries, atlasPageSources(atlasHolders(candidate.pixi), pageBase));
    },

    nodeTextureNames: (node: Node) => {
      const texture = (node as { texture?: unknown }).texture;
      if (typeof texture !== 'object' || texture === null) return [];

      // The frame's own cache keys, not the base's: a sprite drawing out of an
      // atlas holds a `Texture` registered under the frame name, while its
      // `baseTexture` is registered under the sheet.
      const ids = (texture as V6Texture).textureCacheIds;
      if (!Array.isArray(ids)) return [];

      return ids.filter(
        (id): id is string => typeof id === 'string' && id !== '' && !GENERATED_CACHE_ID.test(id),
      );
    },

    /** The `baseTexture` is what v8 calls the source, and what the grid lists. */
    nodeTextureSourceId: (node) => {
      const texture = (node as { texture?: unknown }).texture;
      if (typeof texture !== 'object' || texture === null) return null;

      const base = (texture as V6Texture).baseTexture;
      if (typeof base !== 'object' || base === null) return null;

      const uid = (base as { uid?: unknown }).uid;
      return typeof uid === 'number' ? uid : null;
    },

    textures: () => {
      const managed = (renderer?.texture as { managedTextures?: unknown } | undefined)?.managedTextures;
      return Array.isArray(managed) ? (managed as TextureHandle[]) : [];
    },

    /**
     * `isLoaded` is unconditionally true here: on these versions
     * `managedTextures` is the list of textures the renderer has bound, so
     * being in it *is* being on the GPU. v8 tracks the two separately.
     */
    textureInfo: (texture): TextureMeta => {
      const base = texture as V6BaseTexture;
      const pixelWidth = num(base.realWidth, 0);
      const pixelHeight = num(base.realHeight, 0);
      const format = num(base.format, -1);
      const resource = base.resource;
      const label = cacheName(base.textureCacheIds);
      const sourceKind = sourceKindOf(resource?.source);

      return {
        id: num(base.uid, 0),
        label,
        width: num(base.width, 0),
        height: num(base.height, 0),
        pixelWidth,
        pixelHeight,
        format: String(format),
        gpuSize: gpuSizeOf(format, pixelWidth, pixelHeight),
        isLoaded: true,
        resolution: num(base.resolution, 1),
        mipmap: num(base.mipmap, 0) !== 0,
        alphaMode: ALPHA_MODES[num(base.alphaMode, -1)] ?? '',
        // These lines have no dimension of their own: a `BaseTexture` is a
        // plane, and saying so is truer than leaving the row blank.
        dimension: '2d',
        // Nor a per-texture antialias, nor a garbage collector that can be told
        // to leave one alone — both arrived with v8. Null rather than false,
        // because false would be an answer and there is none.
        antialias: null,
        isPowerOfTwo: bool(base.isPowerOfTwo, powerOfTwo(pixelWidth, pixelHeight)),
        autoGarbageCollect: null,
        destroyed: base.destroyed === true,
        // The resource wraps the drawable here, so both questions are asked of
        // the wrapper first and of what it holds second.
        sourceKind,
        // And the cache key last: on these lines a loaded texture is filed
        // under the URL it came from, which is the same fallback v8 needs.
        url:
          resourceUrl(resource) ??
          resourceUrl(resource?.source) ??
          (couldBeFetched(sourceKind) ? labelAddress(label) : null),
        updates: updateCount(base),
      };
    },

    drawable: (texture) => asDrawable((texture as V6BaseTexture).resource?.source),

    /**
     * Nothing to read back on these lines, and nothing that needs it.
     *
     * The case v8 needs it for does not arise: a `Text` here keeps its canvas
     * after upload, so it draws from the resource like anything else. What is
     * left is render textures — and there is no route from a `BaseTexture` to
     * the `RenderTexture` over it, which is what `extract` would want. The
     * back-reference v8 has (a texture subscribing to its source) is conditional
     * on these lines and a render target does not make one.
     */
    readback: () => null,

    /**
     * Out of the texture cache, which is the only place these lines keep them.
     *
     * v8 can read a source's frames off its own listeners; here the
     * subscription that makes that possible is conditional (`noFrame`), so a
     * sheet's regions leave no trace on the page they were cut from. The cache
     * lives on the PixiJS module, so a build that publishes none answers with
     * nothing — a known limit, the same one `pickableTextureNames` has, and not
     * a failure to report.
     *
     * A region covering the whole base is the sheet itself, or an alias of a
     * standalone texture, and is left out by the same rule the name list uses.
     */
    framesOf: (texture) => {
      const cache = (candidate.pixi as { utils?: { TextureCache?: unknown } } | undefined)?.utils
        ?.TextureCache;
      if (typeof cache !== 'object' || cache === null) return [];

      const base = texture as V6BaseTexture;
      const width = num(base.width, 0);
      const height = num(base.height, 0);
      const frames: TextureFrame[] = [];

      for (const [name, value] of Object.entries(cache as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) continue;

        const entry = value as V6Texture;
        if (entry.baseTexture !== texture) continue;

        const frame = entry.frame;
        if (typeof frame !== 'object' || frame === null) continue;

        const frameWidth = num(frame.width, 0);
        const frameHeight = num(frame.height, 0);
        if (frameWidth >= width && frameHeight >= height) continue;

        frames.push({
          name: GENERATED_CACHE_ID.test(name) ? '' : name,
          x: num(frame.x, 0),
          y: num(frame.y, 0),
          width: frameWidth,
          height: frameHeight,
        });
      }

      return sortFrames(frames);
    },

    canvas: () => asCanvas((renderer as { view?: unknown } | undefined)?.view),
    rendererSize: () => rendererSizeOf(renderer),

    overlayResolution: () => num(renderer?.resolution, 1),

    drawCounter: () => counterFor(candidate.renderer),
  };
}

/** Kept as named entry points so the version map reads off the imports. */
export const createV7Adapter = (candidate: PixiCandidate): PixiAdapter =>
  createLegacyAdapter(7, candidate);

export const createV6Adapter = (candidate: PixiCandidate): PixiAdapter =>
  createLegacyAdapter(6, candidate);
