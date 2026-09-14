import type { TextureFrame } from '@scene-inspector/protocol';

/**
 * Texture knowledge shared by all three adapters: how many bytes a format
 * costs per pixel, and whether a resource is something that can be drawn.
 *
 * The two tables are ported verbatim from the previous project. They are
 * reference data, not logic — the WebGPU format names come from the spec and
 * the GL constants from the WebGL enums — so there was nothing to redesign.
 */

/** WebGPU format names, as v8 reports them on a `TextureSource`. */
const gpuTextureFormatSize: Readonly<Record<string, number>> = {
  r8unorm: 1,
  r8snorm: 1,
  r8uint: 1,
  r8sint: 1,
  r16uint: 2,
  r16sint: 2,
  r16float: 2,
  rg8unorm: 2,
  rg8snorm: 2,
  rg8uint: 2,
  rg8sint: 2,
  r32float: 4,
  r32uint: 4,
  r32sint: 4,
  rg16uint: 4,
  rg16sint: 4,
  rg16float: 4,
  rgba8unorm: 4,
  'rgba8unorm-srgb': 4,
  rgba8snorm: 4,
  rgba8uint: 4,
  rgba8sint: 4,
  bgra8unorm: 4,
  'bgra8unorm-srgb': 4,
  rgb10a2unorm: 4,
  rg11b10ufloat: 4,
  rgb9e5ufloat: 4,
  rg32float: 8,
  rg32uint: 8,
  rg32sint: 8,
  rgba16uint: 8,
  rgba16sint: 8,
  rgba16float: 8,
  rgba32float: 16,
  rgba32uint: 16,
  rgba32sint: 16,
  depth16unorm: 2,
  depth24plus: 3,
  'depth24plus-stencil8': 4,
  depth32float: 4,
  stencil8: 1,
  'depth32float-stencil8': 5,
};

/** GL format constants, as v6/v7 keep them on a `BaseTexture.format`. */
const glTextureFormatSize: Readonly<Record<number, number>> = {
  6408: 4, // RGBA
  6407: 3, // RGB
  33319: 2, // RG
  6403: 1, // RED
  36249: 4, // RGBA_INTEGER
  36248: 3, // RGB_INTEGER
  33320: 2, // RG_INTEGER
  36244: 1, // RED_INTEGER
  6406: 1, // ALPHA
  6409: 1, // LUMINANCE
  6410: 2, // LUMINANCE_ALPHA
  6402: 1, // DEPTH_COMPONENT
  34041: 2, // DEPTH_STENCIL
};

/**
 * Estimated bytes a texture occupies on the GPU.
 *
 * Deliberately approximate, and in one direction: mip levels are not counted
 * and compressed formats are not in the tables. That is why an unknown format
 * yields `null` rather than a guess — the panel can then say "unknown" instead
 * of showing a confidently wrong number.
 */
export function gpuSizeOf(format: string | number, pixelWidth: number, pixelHeight: number): number | null {
  const bytesPerPixel =
    typeof format === 'number' ? glTextureFormatSize[format] : gpuTextureFormatSize[format];

  if (bytesPerPixel === undefined) return null;
  return pixelWidth * pixelHeight * bytesPerPixel;
}

/**
 * The resource behind a texture, when it is something `drawImage` accepts.
 *
 * The check is structural rather than `instanceof HTMLImageElement`: inside an
 * iframe the constructors come from a different window and every `instanceof`
 * fails — a bug the previous project hit and patched around per case. Numeric
 * dimensions are what `drawImage` actually needs, so that is what is asked for.
 *
 * Buffer and compressed sources have no drawable at all and yield `null`;
 * the panel shows a placeholder for those.
 */
export function asDrawable(resource: unknown): CanvasImageSource | null {
  if (typeof resource !== 'object' || resource === null) return null;
  if (Array.isArray(resource) || ArrayBuffer.isView(resource)) return null;

  const { width, height } = resource as { width?: unknown; height?: unknown };
  if (typeof width !== 'number' || typeof height !== 'number') return null;

  return resource as CanvasImageSource;
}

/**
 * What kind of thing is behind a texture, named.
 *
 * Structural, like `asDrawable` above and for the same reason: an `instanceof`
 * fails across an iframe boundary, and a page is free to put a texture on a
 * canvas from another document.
 *
 * The order matters. A canvas has width and height like an image does, and a
 * video has both as well, so the narrowest question is asked first and the
 * broadest last.
 */
export function sourceKindOf(resource: unknown): string {
  if (resource === undefined || resource === null) return 'none';

  // v8 hands a compressed source its mip levels as an array of buffers.
  if (Array.isArray(resource)) return 'compressed';
  if (ArrayBuffer.isView(resource) || resource instanceof ArrayBuffer) return 'buffer';
  if (typeof resource !== 'object') return 'unknown';

  const object = resource as Record<string, unknown>;
  if (typeof object['getContext'] === 'function') return 'canvas';
  if (typeof object['videoWidth'] === 'number') return 'video';
  if (typeof object['currentSrc'] === 'string' || typeof object['src'] === 'string') return 'image';
  // An `ImageBitmap` is the one drawable with a size and nothing else to it.
  if (typeof object['close'] === 'function' && typeof object['width'] === 'number') return 'bitmap';

  return 'unknown';
}

/**
 * How much of a `data:` URL is worth reporting.
 *
 * The rest of one *is* the image, base64'd, and this list is polled once a
 * second: a page with a dozen inline textures would be sending its own atlas
 * back across the bridge for ever. The scheme and the media type say what it
 * is, which is the whole of what the row is read for.
 */
function shortenData(url: string): string {
  const end = url.indexOf(';') === -1 ? url.indexOf(',') : url.indexOf(';');
  return end === -1 ? 'data:' : url.slice(0, end);
}

/**
 * Where a resource came from, if it says.
 *
 * Three spellings, because three kinds of object answer: `currentSrc` and
 * `src` on an element, `url` on a v6/v7 Pixi resource, which is a wrapper
 * around the element rather than the element itself.
 */
export function resourceUrl(resource: unknown): string | null {
  if (typeof resource !== 'object' || resource === null) return null;

  const object = resource as Record<string, unknown>;
  for (const key of ['currentSrc', 'src', 'url']) {
    const value = object[key];
    if (typeof value !== 'string' || value === '') continue;

    return value.startsWith('data:') ? shortenData(value) : value;
  }

  return null;
}

/**
 * What a file name looks like: a last segment ending in a short extension.
 *
 * The test is deliberately narrow. A frame of a sheet is cached under names
 * like `ui/button` — a slash and no extension — and treating that as an address
 * would put a 404 behind a double click. An extension is the one mark that
 * separates "this was a file" from "this is what the game calls it".
 */
const FILE_NAME = /\.[A-Za-z0-9]{2,5}$/;

/**
 * Labels already resolved, because the list is polled and they are not.
 *
 * `new URL` is the one expensive step in describing a texture: at three hundred
 * of them it was a sixth of what a poll cost, spent re-deriving the same
 * answers for names that had not changed since the page loaded. The map is
 * keyed by the label and thrown away whole if the document's base ever moves,
 * since every answer in it was relative to that.
 */
const resolved = new Map<string, string | null>();
let resolvedAgainst = '';

/** Enough for any asset manifest; see `labelAddress` for why there is a cap. */
const ADDRESS_LIMIT = 4096;

/**
 * The label as an address, when the label happens to be one.
 *
 * On v8 a texture loaded through `Assets` carries an `ImageBitmap`, which has
 * no `src` of its own — the address it came from is what `Assets` wrote into
 * the source's **label**, and without this the row and the double click behind
 * it would be empty on almost every real page.
 *
 * **Resolved here rather than in the panel**, and that is the whole reason it
 * lives in the page. A manifest names its assets relatively (`sprites/hero.png`),
 * and the panel is a `chrome-extension://` document — resolving there would
 * point at the extension. The page knows its own base; the panel must never
 * guess. Off a document — the core's own tests — the label is returned as it
 * stands, since there is nothing to resolve against.
 *
 * Still a guess, but only where a guess is possible: a source that could not
 * have been fetched at all is excluded before it gets here (`couldBeFetched`).
 */
export function labelAddress(label: string): string | null {
  const trimmed = label.trim();
  if (trimmed === '' || trimmed.startsWith('data:')) return null;
  if (!FILE_NAME.test(trimmed.split('/').pop() ?? '')) return null;

  const base = typeof document === 'undefined' ? '' : document.baseURI;
  if (base !== resolvedAgainst) {
    resolvedAgainst = base;
    resolved.clear();
  }

  const held = resolved.get(trimmed);
  if (held !== undefined) return held;

  const address = resolve(trimmed, base);
  // A page that streams assets could name thousands of textures over a
  // session, and this map lives in somebody else's memory. Starting over costs
  // one resolve per label and is bounded; growing without end is not.
  if (resolved.size >= ADDRESS_LIMIT) resolved.clear();
  resolved.set(trimmed, address);

  return address;
}

function resolve(label: string, base: string): string | null {
  // Nothing to resolve against off a document — the core's own tests — so the
  // label stands as it is.
  if (base === '') return label;

  try {
    return new URL(label, base).href;
  } catch {
    return null;
  }
}

/**
 * How many times a texture has had its pixels replaced since we first saw it.
 *
 * There is no such number on a `TextureSource`. `_resourceId` looks like one
 * and is not: it identifies the resource object and does not move, not even
 * when `update()` is called on it — measured on the stand, on both a redrawn
 * text and an explicit update. What PixiJS actually does is **emit**, and both
 * lines emit the same `'update'` on the same object, so this is one listener
 * rather than a version branch.
 *
 * Why it is needed at all: nothing else about a texture moves when its content
 * is replaced. A `Text` whose string changes from "AAA" to "BBB" keeps its uid,
 * its size, its format — the whole of the list's fingerprint — and redraws in
 * place. Without this the panel would cache the first thumbnail it fetched and
 * show it for ever, which it already did for any canvas a game repaints.
 *
 * **The one thing the inspector leaves on the page.** It is an integer and a
 * closure per texture, added once and never removed: the listener is held by
 * the source, so a texture the page drops takes it with it, and the map is weak
 * so nothing here keeps one alive. Counting starts at zero the first time a
 * texture is described, which is exactly what a cache needs — it does not
 * matter how many times it changed before anyone was looking.
 */
const updates = new WeakMap<object, { count: number }>();

export function updateCount(texture: object): number {
  const held = updates.get(texture);
  if (held !== undefined) return held.count;

  const counter = { count: 0 };
  updates.set(texture, counter);

  const emitter = texture as { on?: (event: string, fn: () => void) => void };
  if (typeof emitter.on === 'function') {
    emitter.on('update', () => {
      counter.count += 1;
    });
  }

  return 0;
}

/**
 * Whether a source of this kind could have come from an address at all.
 *
 * This is what keeps the fallback above from inventing links. A canvas was
 * **drawn**, not downloaded, and a source with nothing behind it was neither —
 * so a file-shaped label on one of those is a name somebody chose and not a
 * place anything can be opened from. A game naming a generated canvas
 * `sprites/checker.png` is not unusual, and a link that 404s is worse than none.
 *
 * Everything else decodes from bytes that arrived from somewhere: an image, a
 * bitmap, a video, a compressed payload.
 */
export function couldBeFetched(sourceKind: string): boolean {
  return sourceKind !== 'canvas' && sourceKind !== 'none';
}

/** Whether both sides are powers of two, which is what the old flag meant. */
export function powerOfTwo(width: number, height: number): boolean {
  const isPower = (value: number): boolean =>
    Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;

  return isPower(width) && isPower(height);
}

/**
 * Frames in reading order, top to bottom and left to right.
 *
 * Neither line hands them over in any order at all — v8 reads them off a
 * listener list and v6/v7 off a cache object — so without this the list under a
 * preview was arranged differently on each of the three, and a sheet whose rows
 * are obvious in the picture looked like nothing in the list beside it.
 *
 * The name settles a tie, so two regions cut at the same spot are still put in
 * a fixed order rather than whichever the page happened to answer with.
 */
export function sortFrames(frames: TextureFrame[]): TextureFrame[] {
  return frames.sort((a, b) => a.y - b.y || a.x - b.x || a.name.localeCompare(b.name));
}

/**
 * One entry of the page's texture cache, reduced to what telling a frame from
 * an atlas page needs.
 *
 * The reduction is what makes the rule below version-neutral: reaching the
 * cache is different on every line — a plain object on v6/v7, a private `Map`
 * on v8 — but once an entry is a name, the identity of what it draws from, and
 * whether it covers all of it, the two lines have nothing left to disagree on.
 */
export interface CachedTexture {
  /** The key the texture is cached under. */
  name: string;
  /** The source it draws from. Compared by identity, never read. */
  source: object;
  /** Whether it covers the whole source — a page rather than a frame. */
  whole: boolean;
}

/**
 * The cached names a sprite can actually be pointed at.
 *
 * A standalone texture and an atlas page are the same object with the same
 * fields; the only thing that tells them apart is whether anyone cut frames
 * out of it. So the rule is about the *group*, not the entry:
 *
 *  - a source that some cached entry covers only partly is an atlas, and the
 *    entries covering all of it are its pages — dropped, since pointing a
 *    sprite at one draws the whole sheet;
 *  - a source whose every entry covers all of it is one texture under several
 *    aliases, and all of them are kept.
 *
 * `atlasSources` carries the pages that rule cannot see. Spine registers no
 * regions in the texture cache — it keeps its own — so its page looks exactly
 * like a standalone texture, and the only way to know is to have found the
 * atlas object that owns it.
 */
export function pickableNames(
  entries: readonly CachedTexture[],
  atlasSources: ReadonlySet<object>,
): string[] {
  const cut = new Set<object>(atlasSources);
  for (const entry of entries) {
    if (!entry.whole) cut.add(entry.source);
  }

  const names: string[] = [];
  for (const entry of entries) {
    if (entry.whole && cut.has(entry.source)) continue;
    names.push(entry.name);
  }
  return names;
}

/**
 * The pages of every atlas object among `values`, as the sources they draw on.
 *
 * Recognised by shape rather than by class, since the runtime is bundled and
 * its names are gone: an atlas is the one thing carrying a list of pages that
 * each hold a texture. `readPage` is the version's part — a `BaseTexture` hangs
 * off a v6/v7 page directly, while a v8 page holds a Spine texture wrapping the
 * Pixi one.
 */
export function atlasPageSources(
  values: Iterable<unknown>,
  readPage: (page: object) => object | null,
): Set<object> {
  const sources = new Set<object>();

  for (const value of values) {
    if (typeof value !== 'object' || value === null) continue;

    const pages = (value as { pages?: unknown }).pages;
    if (!Array.isArray(pages)) continue;

    for (const page of pages) {
      if (typeof page !== 'object' || page === null) continue;

      const source = readPage(page as object);
      if (source !== null) sources.add(source);
    }
  }

  return sources;
}
