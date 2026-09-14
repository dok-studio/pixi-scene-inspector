import type {
  Revisioned,
  TextureFrame,
  TextureId,
  TextureInfo,
} from '@scene-inspector/protocol';

import type { PixiAdapter, TextureHandle } from '../adapters/types.js';
import { FNV_OFFSET, hashNumber, hashString } from '../scene/fingerprint.js';
import type { TimingSource } from './fileSize.js';
import { fileSizes } from './fileSize.js';

/**
 * The texture list, and the preview behind one entry of it
 * (docs/architecture.md §3.6).
 *
 * The split is the whole point. Metadata is small and revisioned, so polling
 * the list costs nothing while nothing is loading; an image is expensive, so it
 * is encoded one at a time, at the size the panel is about to draw it, and only
 * when the panel asks. The previous project encoded **every** texture at
 * **full** size on **every** poll, synchronously, on the inspected page's main
 * thread — a couple of 2048² atlases were megabytes of base64 a second.
 */

/**
 * Only the fields that can change get folded in.
 *
 * `width`/`height` follow the pixel size through the resolution, and `gpuSize`
 * follows the format and the pixel size, so hashing them as well would add work
 * without adding sensitivity. The same goes for most of what the adapter now
 * reports: a texture's alpha mode, its dimension and what kind of source is
 * behind it are settled when it is made and cannot move afterwards.
 *
 * What is left is what a poll exists to notice: a texture arriving or leaving,
 * being uploaded, being resized, being destroyed, growing a mip chain, having
 * its file measured once the timing for it turns up — and having its **pixels
 * replaced**, which is the one change nothing else here would show. A `Text`
 * redrawn from "AAA" to "BBB" keeps its id, its size and its format; without
 * `updates` the list would answer `unchanged` and the panel would go on showing
 * the picture it cached the first time.
 */
function hashInfo(hash: number, info: TextureInfo): number {
  let next = hashNumber(hash, info.id);
  next = hashString(next, info.label);
  next = hashNumber(next, info.pixelWidth);
  next = hashNumber(next, info.pixelHeight);
  next = hashString(next, info.format);
  next = hashNumber(next, info.mipmap ? 1 : 0);
  next = hashNumber(next, info.destroyed ? 1 : 0);
  next = hashNumber(next, info.fileBytes ?? -1);
  next = hashNumber(next, info.updates);
  return hashNumber(next, info.isLoaded ? 1 : 0);
}

/**
 * @param knownRev the revision the panel already holds, if any.
 * @param timings where the file sizes come from; the page's own by default.
 * @returns the list, or `unchanged` when it matches `knownRev`.
 *
 * Unlike the scene tree this builds the payload first and hashes it afterwards.
 * The tree walks twice because the fingerprint of a node can be computed
 * without allocating one, and a scene is thousands of nodes; here the
 * fingerprint *is* read off the metadata, which the adapter has to assemble
 * either way, and a renderer holds textures in the dozens.
 *
 * The one thing not read off the adapter is `fileBytes`. PixiJS does not know
 * what a file weighed — the page's resource timings do — so the two halves are
 * put together here rather than the adapter being made to answer a question
 * about the network (`fileSize.ts`).
 */
export function readTextures(
  adapter: PixiAdapter,
  knownRev?: number,
  timings?: TimingSource,
): Revisioned<TextureInfo[]> {
  const textures: TextureInfo[] = [];
  const sizes = fileSizes(timings);
  let rev = FNV_OFFSET;

  for (const handle of adapter.textures()) {
    const meta = adapter.textureInfo(handle);
    // The label as well as the URL: on v8 a texture loaded through `Assets`
    // carries an `ImageBitmap`, which has no `src` of its own, and the address
    // it came from is what `Assets` wrote into the label. See `fileSize.ts`.
    const info: TextureInfo = { ...meta, fileBytes: sizes.find(meta.url, meta.label) };

    textures.push(info);
    rev = hashInfo(rev, info);
  }

  if (rev === knownRev) return { rev, unchanged: true };
  return { rev, data: textures };
}

/**
 * The canvas this module needs, and no more.
 *
 * A structural type rather than `HTMLCanvasElement` so the encoding can be
 * tested: the core's tests run without a DOM, and this is the one place in it
 * that has to draw something.
 */
export interface PreviewContext {
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
}

export interface PreviewCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): PreviewContext | null;
  toDataURL(type: string): string;
}

export type CanvasFactory = () => PreviewCanvas | null;

const domCanvas: CanvasFactory = () =>
  typeof document === 'undefined' ? null : document.createElement('canvas');

/**
 * The ceiling on a requested size, whatever the panel asks for.
 *
 * `max` arrives from another process, and a preview of an 8192² atlas at full
 * size would have the page allocate a quarter of a gigabyte of canvas and then
 * encode it. Full size means "as large as it is worth showing" here.
 */
const PREVIEW_LIMIT = 1024;

/**
 * The size a preview is drawn at: the longest side capped at `max`, aspect
 * ratio kept, and **never** an upscale — a 16×16 icon asked for at 128 comes
 * back at 16×16 rather than as a blurred enlargement the panel could have made
 * itself with CSS.
 */
export function fitPreview(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= 0 || max <= 0) return { width: 0, height: 0 };

  const scale = Math.min(1, max / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function findTexture(adapter: PixiAdapter, id: TextureId): TextureHandle | null {
  // A scan rather than an index: ids come from the textures themselves, the
  // list is short, and a preview is fetched once per texture — a map kept in
  // step with a renderer's own bookkeeping would cost more than it saves.
  for (const handle of adapter.textures()) {
    if (adapter.textureInfo(handle).id === id) return handle;
  }
  return null;
}

/**
 * One texture, encoded as a data URL.
 *
 * `null` for a texture that is gone, for a source with no image behind it
 * (buffer and compressed data), and for a page with no canvas to draw on.
 *
 * **Why not `OffscreenCanvas`**, which the architecture named: it has no
 * synchronous encoder — `convertToBlob` is a promise — and a command handler
 * has to answer within the call, because `inspectedWindow.eval` carries a value
 * back and not a promise. WebP keeps the payload small instead; browsers that
 * cannot encode it hand back a PNG, which the panel displays just the same.
 */
export function readPreview(
  adapter: PixiAdapter,
  id: TextureId,
  max: number,
  createCanvas: CanvasFactory = domCanvas,
): { dataUrl: string | null } {
  const handle = findTexture(adapter, id);
  if (handle === null) return { dataUrl: null };

  const drawable = adapter.drawable(handle);
  const { pixelWidth, pixelHeight } = adapter.textureInfo(handle);

  const drawn =
    drawable === null ? null : encode(createCanvas, drawable, pixelWidth, pixelHeight, max);
  if (drawn !== null) return { dataUrl: drawn };

  // Nothing on this side of the bus, so ask the renderer for it. Only now: a
  // read from the GPU costs a render pass, and everything with a resource of
  // its own has already been answered above.
  const readback = adapter.readback(handle);
  if (readback === null) return { dataUrl: null };

  return {
    dataUrl: encode(createCanvas, readback.image, readback.width, readback.height, max),
  };
}

/**
 * One image, downscaled and encoded, or `null` when there was nothing to see.
 *
 * The size is passed in rather than read off the image because the two callers
 * mean different things by it: the first draws a **source**, at the size the
 * texture reports, and the second a **frame** read back from the GPU, at the
 * size it came back.
 */
function encode(
  createCanvas: CanvasFactory,
  image: CanvasImageSource,
  width: number,
  height: number,
  max: number,
): string | null {
  const size = fitPreview(width, height, Math.min(max, PREVIEW_LIMIT));
  if (size.width === 0 || size.height === 0) return null;

  const canvas = createCanvas();
  const context = canvas?.getContext('2d') ?? null;
  if (canvas === null || context === null) return null;

  canvas.width = size.width;
  canvas.height = size.height;
  context.drawImage(image, 0, 0, size.width, size.height);

  // A tainted canvas (a texture from another origin without CORS) throws on
  // read. That is a normal thing to meet in a game, and the placeholder the
  // panel already has for sources with no image says enough.
  try {
    if (!hasPixels(context, size.width, size.height)) return null;
    return canvas.toDataURL('image/webp');
  } catch {
    return null;
  }
}

/**
 * Whether anything was actually drawn.
 *
 * Not paranoia: a `Text` on v8 keeps a canvas that Pixi hands back to its pool
 * once the glyphs are on the GPU, so the resource behind such a texture is a
 * blank canvas by the time anyone asks. Encoding it would put a transparent
 * image in the grid — indistinguishable from a thumbnail that has not arrived,
 * and reading as a broken panel. Saying "no preview" is the truth here, and it
 * is what the panel already has a placeholder for.
 *
 * It costs one read of the downscaled canvas, which is at most `PREVIEW_LIMIT`
 * on a side and happens once per texture.
 */
function hasPixels(context: PreviewContext, width: number, height: number): boolean {
  const { data } = context.getImageData(0, 0, width, height);

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true;
  }
  return false;
}

/**
 * The regions cut out of one texture, revisioned like everything else that is
 * polled.
 *
 * Revisioned even though a sheet's frames rarely change, and for the same
 * reason the list is: the panel polls this while the section is open, and a
 * sheet of two hundred regions is two hundred rectangles to send over and over
 * for nothing. What does move it is a texture being replaced under the same id,
 * or a sheet still being parsed when the first poll arrives.
 *
 * An unknown id answers with an empty list rather than an error. The texture
 * may simply have gone since the panel last saw the list, and the panel already
 * draws "no frames" for a standalone texture — there is nothing else it would
 * do with a failure.
 */
export function readTextureFrames(
  adapter: PixiAdapter,
  id: TextureId,
  knownRev?: number,
): Revisioned<TextureFrame[]> {
  const handle = findTexture(adapter, id);
  const frames = handle === null ? [] : adapter.framesOf(handle);

  let rev = FNV_OFFSET;
  for (const frame of frames) {
    rev = hashString(rev, frame.name);
    rev = hashNumber(rev, frame.x);
    rev = hashNumber(rev, frame.y);
    rev = hashNumber(rev, frame.width);
    rev = hashNumber(rev, frame.height);
  }

  if (rev === knownRev) return { rev, unchanged: true };
  return { rev, data: frames };
}
