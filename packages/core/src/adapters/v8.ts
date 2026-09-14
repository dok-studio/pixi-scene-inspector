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
import { pickStack, probeEvents } from './picking.js';
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
 * PixiJS v8.
 *
 * What is specific to this line, and nothing else is:
 *
 *  - the user-facing name lives in `label` (it was `name` up to v7);
 *  - textures are `TextureSource`s with WebGPU-style string formats, and
 *    whether one reached the GPU is a separate lookup;
 *  - `renderer.width/height` are already in CSS pixels, so overlay geometry
 *    needs no resolution divisor.
 */

interface V8TextureSource {
  uid?: unknown;
  label?: unknown;
  width?: unknown;
  height?: unknown;
  pixelWidth?: unknown;
  pixelHeight?: unknown;
  format?: unknown;
  resource?: unknown;
  resolution?: unknown;
  /** The setting; `mipLevelCount` is what actually came of it. */
  autoGenerateMipmaps?: unknown;
  mipLevelCount?: unknown;
  alphaMode?: unknown;
  dimension?: unknown;
  antialias?: unknown;
  autoGarbageCollect?: unknown;
  destroyed?: unknown;
}

interface V8TextureSystem {
  managedTextures?: unknown;
  /** Uploaded textures, keyed by uid. WebGL and WebGPU keep separate maps. */
  _glTextures?: Record<number, unknown>;
  _gpuSources?: Record<number, unknown>;
}

interface V8Texture {
  source?: unknown;
  frame?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  label?: unknown;
}

/**
 * One entry of the asset cache, or null when the value is not a texture.
 *
 * The cache holds whatever was loaded — JSON, fonts, the `Spritesheet` object
 * itself — so the shape is what decides, and it is the shape of a `Texture`: a
 * source to draw from and the rectangle of it to draw. That check is also what
 * keeps a Spine `.atlas` entry out of the menu without a rule of its own.
 */
function cacheEntry(name: string, value: unknown): CachedTexture | null {
  if (typeof value !== 'object' || value === null) return null;

  const texture = value as V8Texture;
  const source = texture.source;
  if (typeof source !== 'object' || source === null) return null;

  const frame = texture.frame;
  if (typeof frame !== 'object' || frame === null) return null;

  const width = num((source as { width?: unknown }).width, 0);
  const height = num((source as { height?: unknown }).height, 0);
  const whole = num(frame.width, 0) >= width && num(frame.height, 0) >= height;

  return { name, source, whole };
}

/**
 * Everything the asset cache is holding, as a flat list.
 *
 * `Cache` exposes `get` but nothing that enumerates, so its private `_cache`
 * is what there is. A build that renames it yields an empty list rather than a
 * crash, and the scene is then the only source of names — which is exactly the
 * situation on a page that publishes no module at all.
 */
function cacheValues(pixi: unknown): { names: string[]; values: unknown[] } {
  const empty = { names: [], values: [] };
  if (typeof pixi !== 'object' || pixi === null) return empty;

  const module = pixi as Record<string, unknown>;
  const cache = (module['Cache'] ?? (module['Assets'] as { cache?: unknown } | undefined)?.cache) as
    | { _cache?: unknown }
    | undefined;

  if (!(cache?._cache instanceof Map)) return empty;

  // Values are collected whole and names only where the key is a string. The
  // cache is keyed by anything: `Texture.from(canvas)` files a texture under
  // the canvas itself, and stringifying that key offered a menu line reading
  // `[object HTMLCanvasElement]`. Such an entry has no name a `textureId`
  // could ever be — but the object behind it may still be an atlas, so it has
  // to stay in the values that are searched for one.
  const names: string[] = [];
  for (const key of cache._cache.keys()) names.push(typeof key === 'string' ? key : '');

  return { names, values: [...cache._cache.values()] };
}

/**
 * Names PixiJS makes up for itself, which no `textureId` is ever spelled with:
 * the render-texture pool numbers its entries, and `EMPTY`/`WHITE` are the
 * library's own stand-ins for "nothing" and "a white pixel".
 *
 * The same idea as `GENERATED_CACHE_ID` on v6/v7, against different strings.
 */
const GENERATED_LABEL = /^(?:texturePool_\d+|EMPTY|WHITE)$/;

function usableName(label: string): boolean {
  return label !== '' && !GENERATED_LABEL.test(label);
}

/**
 * Every live texture cut from a source, read off the source itself.
 *
 * PixiJS keeps no list of them — but there is a back-reference nobody meant as
 * one. A `Texture` subscribes to its source's `resize` with **itself** as the
 * listener's context (`Texture.set source`), and `eventemitter3` files that
 * context in a private `_events`. So the listeners of a source are the textures
 * drawing from it, and for a spritesheet that is every frame it cut.
 *
 * This is the only way to those frames on a page that publishes no module. It
 * is also what makes `managedTextures` usable as a source of names at all:
 * an atlas page and a standalone texture are the same object, and the frames
 * found here are exactly what tells them apart (see `pickableNames`).
 *
 * Three details it has to get right, all learned from the library rather than
 * guessed:
 *
 *  - `eventemitter3` stores one listener as an object and several as an array,
 *    and prefixes the event name with `~` on an engine without
 *    `Object.create(null)`. Both shapes and both keys are handled;
 *  - `Texture.destroy()` clears its own listeners but never unsubscribes from
 *    its source, so a destroyed texture stays in this list as long as something
 *    holds it. It has to be dropped by its own flag;
 *  - a build that renames `_events` yields nothing here rather than throwing,
 *    and the cache and the scene are the sources they always were.
 */
const RESIZE_KEYS = ['resize', '~resize'] as const;

function texturesOf(source: object): object[] {
  const events = (source as { _events?: unknown })._events;
  if (typeof events !== 'object' || events === null) return [];

  const found: object[] = [];

  for (const key of RESIZE_KEYS) {
    const held = (events as Record<string, unknown>)[key];
    if (held === undefined || held === null) continue;

    for (const listener of Array.isArray(held) ? held : [held]) {
      const context = (listener as { context?: unknown } | null)?.context;
      if (typeof context !== 'object' || context === null) continue;

      const texture = context as { isTexture?: unknown; destroyed?: unknown };
      if (texture.isTexture === true && texture.destroyed !== true) found.push(context);
    }
  }

  return found;
}

/**
 * What the renderer is holding, as entries the pickable-name rule can judge.
 *
 * Two kinds go in per source, and both are needed:
 *
 *  - the **source's own** name, as an entry covering all of it. `Assets` labels
 *    the source as well as the texture, and a texture built by hand carries no
 *    label at all — so for a standalone texture this is the only name there is;
 *  - every **texture** cut from it that carries a name of its own, which is
 *    what a spritesheet gives its frames.
 *
 * A sheet therefore contributes a whole-covering entry under the file's name
 * and a partial entry per frame, and the rule drops the first exactly as it
 * does for the cache. A standalone texture contributes only whole-covering
 * entries and is kept.
 */
function rendererEntries(system: V8TextureSystem | null): CachedTexture[] {
  const managed = system?.managedTextures;
  if (!Array.isArray(managed)) return [];

  const entries: CachedTexture[] = [];

  for (const source of managed) {
    if (typeof source !== 'object' || source === null) continue;

    const label = str((source as V8TextureSource).label, '');
    if (usableName(label)) entries.push({ name: label, source, whole: true });

    for (const texture of texturesOf(source)) {
      const name = str((texture as V8Texture).label, '');
      const entry = cacheEntry(name, texture);

      if (entry === null) continue;

      // An entry whose name is not usable still counts when it is partial: it
      // is what marks the source as an atlas, and that is a fact about the
      // group rather than about the entry. Its name is emptied so nothing can
      // offer it, and empty names are dropped on the way out.
      if (usableName(name)) entries.push(entry);
      else if (!entry.whole) entries.push({ ...entry, name: '' });
    }
  }

  return entries;
}

/**
 * The atlas pages the skeletons in the scene are drawing on.
 *
 * Spine keeps its regions out of Pixi's caches, so its page looks exactly like
 * a standalone texture and only the atlas object tells them apart — and that
 * object lives in the asset cache, which a page publishing no module does not
 * hand over. The skeleton in the scene is what is left.
 *
 * A page with several regions marks itself anyway, since its regions are
 * partial textures of it and `pickableNames` reads that as an atlas. This is
 * for the one that does not: a skeleton whose region covers the whole page.
 *
 * Two places are read because they fill at different times — what each slot is
 * showing is set up before the skeleton is ever drawn, while the runtime's own
 * cache fills as it draws. Neither is complete alone.
 */
function skeletonPages(node: object, into: Set<object>): void {
  const add = (texture: unknown): void => {
    const source = (texture as { source?: unknown } | null)?.source;
    if (typeof source === 'object' && source !== null) into.add(source);
  };

  const cached = (node as { attachmentCacheData?: unknown }).attachmentCacheData;
  if (Array.isArray(cached)) {
    for (const perSlot of cached) {
      if (typeof perSlot !== 'object' || perSlot === null) continue;

      for (const data of Object.values(perSlot as Record<string, unknown>)) {
        add((data as { texture?: unknown } | null)?.texture);
      }
    }
  }

  const slots = (node as { skeleton?: { slots?: unknown } }).skeleton?.slots;
  if (Array.isArray(slots)) {
    for (const slot of slots) {
      const region = (slot as { attachment?: { region?: unknown } } | null)?.attachment?.region;
      const wrapper = (region as { texture?: unknown } | null)?.texture;
      if (typeof wrapper !== 'object' || wrapper === null) continue;

      // The runtime wraps the Pixi texture, the same as an atlas page does.
      add((wrapper as { texture?: unknown }).texture ?? wrapper);
    }
  }
}

function spinePageSources(candidate: PixiCandidate): Set<object> {
  const sources = new Set<object>();

  const walk = (node: Node): void => {
    if (nodeType(node) === SPINE_TYPE) skeletonPages(node, sources);
    for (const child of children(node)) walk(child);
  };

  const stage = resolveStage(candidate);
  if (stage !== null) walk(stage);

  return sources;
}

/** As `nodeType` reports a skeleton. Kept here because only this file asks. */
const SPINE_TYPE = 'Spine';

/** A v8 Spine atlas page holds a Spine texture that wraps the Pixi one. */
function pageSource(page: object): object | null {
  const wrapper = (page as { texture?: unknown }).texture;
  if (typeof wrapper !== 'object' || wrapper === null) return null;

  const inner = (wrapper as { texture?: unknown }).texture ?? wrapper;
  const source = (inner as { source?: unknown }).source;
  return typeof source === 'object' && source !== null ? source : null;
}

function textureSystem(candidate: PixiCandidate): V8TextureSystem | null {
  const system = (candidate.renderer as { texture?: unknown } | undefined)?.texture;
  return typeof system === 'object' && system !== null ? (system as V8TextureSystem) : null;
}

/**
 * Whether a texture is on the GPU — asked of the renderer in whichever way
 * this build of v8 can answer.
 *
 * Early 8.x kept a map of uploaded textures keyed by uid, and it was possible
 * for a texture to be managed without being in it. Later builds (8.14 was
 * checked) hold the GPU data on the source itself and add a source to
 * `managedTextures` only once it has been initialised on the GPU — so being in
 * the list *is* being uploaded, which is exactly the situation on v6/v7.
 *
 * Guessing "not loaded" where the map is absent would mark every texture on a
 * current build as unloaded, which is both wrong and the more misleading of
 * the two possible mistakes.
 */
function isUploaded(system: V8TextureSystem | null, id: number): boolean {
  const uploaded = system?._glTextures ?? system?._gpuSources;
  return uploaded === undefined ? true : uploaded[id] !== undefined;
}

/**
 * The gradient class, found wherever this page happens to keep it.
 *
 * Unlike every other version difference, this one cannot be answered by reading a
 * field: a v8 gradient has to be an instance of `FillGradient`, because the
 * conversion that turns a fill into something the renderer can draw checks with
 * `instanceof` and treats anything else as a solid colour. So the class itself has
 * to be got hold of, and there are only two honest ways:
 *
 *  - the module, when the application exposes it — which is what the documented
 *    `__PIXI_DEVTOOLS__` integration does, and what detection already collects;
 *  - the constructor of a gradient the scene already contains, for a bundle that
 *    exposes nothing.
 *
 * A page with neither can still have its existing gradients edited — that needs no
 * class — but not have a new one made. That is a limit of the library, not a gap
 * here, and it is reported honestly as `null` rather than papered over with an
 * object that would silently draw as a solid colour.
 */
type Constructor = new () => object;

function fromModule(candidate: PixiCandidate): Constructor | null {
  const module = candidate.pixi;
  if (typeof module !== 'object' || module === null) return null;

  const found = (module as Record<string, unknown>)['FillGradient'];
  return typeof found === 'function' ? (found as Constructor) : null;
}

/**
 * A gradient, recognised by its own marks rather than by name, since a bundle is
 * minified: a list of colour stops and the method that turns them into a texture is
 * not a shape anything else has.
 */
function asGradient(value: unknown): object | null {
  if (typeof value !== 'object' || value === null) return null;

  return Array.isArray((value as { colorStops?: unknown }).colorStops) &&
    typeof (value as { buildGradient?: unknown }).buildGradient === 'function'
    ? (value as object)
    : null;
}

/**
 * A gradient on one style, wherever that style is keeping it.
 *
 * There are more hiding places than one would hope, and the first version of this
 * looked in only the first of them — which is why a page whose gradients were all in
 * the other four could not make a new one:
 *
 *  - `fill` — the instance, where the application assigned one outright;
 *  - `fill.fill` — the fill-style object form, which is also what the v7
 *    compatibility shim builds when it meets `fillGradientStops`, so every style
 *    ported from the older spelling lands here;
 *  - `_fill.fill` — the converted fill, which is what a **cloned** style carries;
 *  - the same three under `stroke`, since an outline can be a gradient too;
 *  - `subStyles` — the tags of a multi-style text, where a game most often puts one.
 */
function fromStyle(style: unknown): Constructor | null {
  if (typeof style !== 'object' || style === null) return null;

  const source = style as Record<string, unknown>;

  for (const key of ['fill', '_fill', 'stroke', '_stroke']) {
    const value = source[key];
    const direct = asGradient(value);
    if (direct !== null) return direct.constructor as Constructor;

    const nested =
      typeof value === 'object' && value !== null
        ? asGradient((value as Record<string, unknown>)['fill'])
        : null;
    if (nested !== null) return nested.constructor as Constructor;
  }

  const subStyles = source['subStyles'];
  if (typeof subStyles === 'object' && subStyles !== null) {
    for (const sub of Object.values(subStyles as Record<string, unknown>)) {
      const found = fromStyle(sub);
      if (found !== null) return found;
    }
  }

  return null;
}

/**
 * A gradient anywhere under the stage.
 *
 * Bounded by a budget of nodes rather than by depth: a game's tree is deep and wide,
 * and this runs once per session — the first time someone asks for a gradient on a
 * page that does not hand its module over.
 */
function fromScene(node: Node | null, budget = { left: 20000 }): Constructor | null {
  if (node === null || budget.left <= 0) return null;
  budget.left -= 1;

  const found = fromStyle((node as { style?: unknown }).style);
  if (found !== null) return found;

  for (const child of children(node)) {
    const inside = fromScene(child, budget);
    if (inside !== null) return inside;
  }

  return null;
}

/**
 * What the lookup found, kept **per stage** rather than per adapter.
 *
 * `session.adapter()` builds a fresh adapter for every command, so a memo held
 * on the instance is gone by the next click and the walk above runs again.
 * Keyed weakly on the stage instead: a reload or an application swap brings a
 * different one and therefore a fresh answer, and nothing here holds a dead
 * scene alive.
 */
const gradientClasses = new WeakMap<Node, Constructor | null>();

export function createV8Adapter(candidate: PixiCandidate): PixiAdapter {
  return {
    major: 8,

    stage: () => resolveStage(candidate),
    children,
    parentOf,
    removeChild,
    addChildAt,
    typeOf: nodeType,

    // The application's own id wins where it has one; see `applicationId`.
    label: (node) => applicationId(node) ?? str((node as { label?: unknown }).label, ''),
    setLabel: (node, value) => {
      const target = applicationId(node) === null ? 'label' : 'id';
      (node as Record<string, unknown>)[target] = value;
    },

    // Nothing to read: `name` here is a deprecated accessor over `label`, and
    // it warns. See `PixiAdapter.pixiName`.
    pixiName: () => undefined,
    visible,
    hasFilter,
    hasMask,
    getProp,
    setProp,
    setTextureId,

    gradientSupport: () => ({
      shape: 'object',
      make: () => {
        const stage = resolveStage(candidate);

        // `undefined` is "not looked for yet"; `null` is "looked for and not
        // there" — and that is the answer worth remembering, because it is the
        // one that costs a whole scene walk. `??=` treats the two the same, so
        // a page with no gradient to copy re-walked on every single click.
        let gradientClass = stage === null ? undefined : gradientClasses.get(stage);

        if (gradientClass === undefined) {
          gradientClass = fromModule(candidate) ?? fromScene(stage);
          if (stage !== null) gradientClasses.set(stage, gradientClass);
        }

        if (gradientClass === null) return null;

        try {
          return new gradientClass();
        } catch {
          // A constructor taken from a minified bundle by its shape may want
          // arguments this one does not know about.
          return null;
        }
      },
    }),

    globalBounds,

    hitStack: (clientX, clientY, depth) => {
      const events = (candidate.renderer as { events?: unknown } | undefined)?.events;
      const stage = resolveStage(candidate);

      return pickStack(stage, children, () => probeEvents(events, clientX, clientY, stage), depth);
    },

    spineStore: () => spineStore(candidate),

    pickableTextureNames: () => {
      const { names, values } = cacheValues(candidate.pixi);

      const entries: CachedTexture[] = [];
      names.forEach((name, index) => {
        if (!usableName(name)) return;

        const entry = cacheEntry(name, values[index]);
        if (entry !== null) entries.push(entry);
      });

      // Both feeds go through one rule. The cache is the better of the two —
      // it holds what was loaded and never drawn — but it needs the module;
      // the renderer needs nothing and reaches the same frames through their
      // sources. On a page that publishes its module the two overlap, which
      // costs a duplicate name and nothing else.
      entries.push(...rendererEntries(textureSystem(candidate)));

      // The atlases the rule cannot see for itself: the cached ones, and — for
      // a page that hands over no cache — the skeletons standing in the scene.
      const atlases = atlasPageSources(values, pageSource);
      for (const source of spinePageSources(candidate)) atlases.add(source);

      return pickableNames(entries, atlases).filter((name) => name !== '');
    },

    nodeTextureNames: (node: Node) => {
      const texture = (node as { texture?: unknown }).texture;
      if (typeof texture !== 'object' || texture === null) return [];

      // The frame's own label first: a spritesheet names every frame it cuts,
      // while the source keeps the name of the sheet — so preferring the source
      // would answer `hero_sheet.png` for every frame of it.
      const label = str((texture as V8Texture).label, '');
      if (usableName(label)) return [label];

      // Nothing cut this one, and `Texture.from(image)` leaves the name on the
      // source: a sprite drawing a whole texture goes by the source's name.
      // Guarded on covering the whole source, because a frame that its sheet
      // did not name must not answer the sheet's name instead.
      const entry = cacheEntry('', texture);
      if (entry === null || !entry.whole) return [];

      const source = str((entry.source as { label?: unknown }).label, '');
      return usableName(source) ? [source] : [];
    },

    /**
     * A sprite holds a `Texture`; the id the grid knows it by is its source's
     * `uid`, which is what `textureInfo` reports.
     */
    nodeTextureSourceId: (node) => {
      const texture = (node as { texture?: unknown }).texture;
      if (typeof texture !== 'object' || texture === null) return null;

      const source = (texture as V8Texture).source;
      if (typeof source !== 'object' || source === null) return null;

      const uid = (source as { uid?: unknown }).uid;
      return typeof uid === 'number' ? uid : null;
    },

    textures: () => {
      const managed = textureSystem(candidate)?.managedTextures;
      return Array.isArray(managed) ? (managed as TextureHandle[]) : [];
    },

    textureInfo: (texture): TextureMeta => {
      const source = texture as V8TextureSource;
      const id = num(source.uid, 0);
      const pixelWidth = num(source.pixelWidth, 0);
      const pixelHeight = num(source.pixelHeight, 0);
      const format = str(source.format, '');
      const label = str(source.label, '');
      const sourceKind = sourceKindOf(source.resource);

      return {
        id,
        label,
        width: num(source.width, 0),
        height: num(source.height, 0),
        pixelWidth,
        pixelHeight,
        format,
        gpuSize: gpuSizeOf(format, pixelWidth, pixelHeight),
        isLoaded: isUploaded(textureSystem(candidate), id),
        resolution: num(source.resolution, 1),
        // The count is the answer where there is one: asking for mipmaps and
        // getting them are different things, and a source with more than one
        // level has them however it was configured.
        mipmap: num(source.mipLevelCount, 1) > 1 || bool(source.autoGenerateMipmaps, false),
        alphaMode: str(source.alphaMode, ''),
        dimension: str(source.dimension, '2d'),
        antialias: bool(source.antialias, false),
        isPowerOfTwo: powerOfTwo(pixelWidth, pixelHeight),
        autoGarbageCollect: bool(source.autoGarbageCollect, false),
        destroyed: source.destroyed === true,
        sourceKind,
        // The resource first, and the label after it: `Assets` hands back an
        // `ImageBitmap`, which has no `src`, and writes the address it loaded
        // from into the label instead. Only where there could have been an
        // address at all — see `couldBeFetched`.
        url:
          resourceUrl(source.resource) ??
          (couldBeFetched(sourceKind) ? labelAddress(label) : null),
        updates: updateCount(source),
      };
    },

    drawable: (texture) => asDrawable((texture as V8TextureSource).resource),

    /**
     * Through `renderer.extract`, which renders the texture into a target of
     * its own and reads it back.
     *
     * It wants a `Texture`, not a source, and the panel only ever holds the
     * latter — so the texture is found the way the frame list finds them, off
     * the source's own `resize` listeners. For the two cases this exists for
     * there is exactly one: a `Text` and a render target each have a single
     * texture over their source.
     *
     * Everything here is allowed to fail quietly. A build can leave the extract
     * system out; a WebGPU backend may answer with a promise, which a command
     * handler cannot wait for; and a texture the renderer has since dropped
     * throws. All of it means the same thing to the panel — no picture — and it
     * already draws that.
     */
    readback: (texture) => {
      const extract = (candidate.renderer as { extract?: unknown } | undefined)?.extract;
      if (typeof extract !== 'object' || extract === null) return null;

      const toCanvas = (extract as { canvas?: unknown }).canvas;
      if (typeof toCanvas !== 'function') return null;

      const [cut] = texturesOf(texture);
      if (cut === undefined) return null;

      try {
        const canvas = (toCanvas as (target: object) => unknown).call(extract, cut);
        const image = asDrawable(canvas);
        if (image === null) return null;

        const { width, height } = canvas as { width: number; height: number };
        return width > 0 && height > 0 ? { image, width, height } : null;
      } catch {
        return null;
      }
    },

    /**
     * Read off the source's own listeners, the same back-reference the pickable
     * names are found through (`texturesOf`). Nobody meant it as an API, and it
     * is still the only route to a sheet's frames on a page that publishes no
     * module.
     *
     * A region that covers the whole source is not a frame — it is the page, or
     * an alias of a standalone texture — so it is left out by the same rule the
     * name list uses.
     */
    framesOf: (texture) => {
      const source = texture as object;
      const width = num((source as { width?: unknown }).width, 0);
      const height = num((source as { height?: unknown }).height, 0);
      const frames: TextureFrame[] = [];

      for (const cut of texturesOf(source)) {
        const frame = (cut as V8Texture).frame;
        if (typeof frame !== 'object' || frame === null) continue;

        const frameWidth = num(frame.width, 0);
        const frameHeight = num(frame.height, 0);
        if (frameWidth >= width && frameHeight >= height) continue;

        frames.push({
          name: str((cut as V8Texture).label, ''),
          x: num(frame.x, 0),
          y: num(frame.y, 0),
          width: frameWidth,
          height: frameHeight,
        });
      }

      return sortFrames(frames);
    },

    canvas: () => asCanvas((candidate.renderer as { canvas?: unknown } | undefined)?.canvas),
    rendererSize: () => rendererSizeOf(candidate.renderer),

    overlayResolution: () => 1,

    drawCounter: () => counterFor(candidate.renderer),
  };
}
