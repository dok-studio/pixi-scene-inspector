import type {
  Json,
  PixiMajor,
  Rect,
  TextureFrame,
  TextureId,
  TextureInfo,
} from '@scene-inspector/protocol';

import type { DrawCounter } from './drawCalls.js';

/**
 * A texture as PixiJS describes it — everything in `TextureInfo` except the
 * one field PixiJS knows nothing about.
 *
 * `fileBytes` comes from the page's resource timings rather than from the
 * renderer, so it is filled in above the adapter (`assets/fileSize.ts`). An
 * adapter that returned a null for it would be answering a question it was
 * never asked, and the type would stop saying which half of this an adapter is
 * responsible for.
 */
export type TextureMeta = Omit<TextureInfo, 'fileBytes'>;

/** Pixels read back from the GPU, and the size they came back at. */
export interface Readback {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * The PixiJS objects found by detection. Deliberately `unknown`: their shape
 * differs between versions, and making sense of it is the adapter's job, not
 * the job of whoever located them.
 */
export interface PixiCandidate {
  app?: unknown;
  stage?: unknown;
  renderer?: unknown;
  /** The `pixi.js` module itself, if the application exposes it. */
  pixi?: unknown;
  /**
   * The version PixiJS reported when it handed the application over through an
   * init hook. For a bundled build with no `PIXI` global this is the only place
   * the version string exists at all.
   */
  version?: string;
}

/**
 * `major` is null when a version was read but falls outside the supported
 * range (v5, or a future v9). `version` is still filled in, so the panel can
 * say "found 9.0.0, unsupported" instead of a blank "not detected".
 */
export interface VersionInfo {
  major: PixiMajor | null;
  version: string | null;
}

/**
 * A PixiJS display object, and a texture as the renderer keeps it (a
 * `TextureSource` on v8, a `BaseTexture` on v6/v7).
 *
 * Both are `object` rather than a shape on purpose. `object` has no index
 * signature, so nothing outside the adapters can read a field off one of these
 * — reaching for `node.children` is a compile error, and the only way through
 * is a `PixiAdapter` method. That is the same boundary the linter draws for
 * version checks, expressed in the type system.
 */
export type Node = object;
export type TextureHandle = object;

/**
 * How the running library spells a gradient fill, and where a fresh one comes
 * from. Applied in `scene/properties/fill.ts`, which does the shaping.
 *
 * `list` is v6/v7: three plain fields of the style, nothing to construct. `object`
 * is v8, where a gradient is an instance of `FillGradient` and nothing that merely
 * looks like one will do — `toFillStyle` checks with `instanceof`, and an impostor
 * is taken for a solid colour. `make` returns null on a page that exposes neither
 * its module nor a gradient to take a constructor from; there a gradient can be
 * edited but not created.
 */
export type GradientSupport =
  | { shape: 'list' }
  | { shape: 'object'; make: () => object | null };

/**
 * The single boundary between the core and the differences across PixiJS
 * versions (docs/architecture.md §3.3).
 *
 * An adapter is bound to one detected application: it holds on to the stage and
 * the renderer, so the methods take no context of their own.
 */
/**
 * What the page has loaded for Spine, by the keys it filed it under.
 *
 * Both halves travel together because building a skeleton needs both: a
 * skeleton export says which regions it wants but not where they are, and the
 * atlas beside it is what says. The store keys the two separately and nothing
 * in it ties one to the other, so the pairing has to be tried rather than
 * looked up — see `scene/spine/factory.ts`.
 */
export interface SpineStore {
  /** Skeletons by name, with whatever the store has under it — parsed or raw. */
  skeletons: Array<{ name: string; data: unknown }>;
  /** The keys an atlas is filed under, the application's own names first. */
  atlases: string[];
}

export interface PixiAdapter {
  readonly major: PixiMajor;

  /** The root of the scene, or null when the application has been destroyed. */
  stage(): Node | null;
  children(node: Node): Node[];
  /** @returns null for the stage, and for a node that has been detached. */
  parentOf(node: Node): Node | null;
  /** Reparenting goes through the node's own methods — see the implementation. */
  removeChild(parent: Node, child: Node): void;
  addChildAt(parent: Node, child: Node, index: number): void;
  /** Canonical Pixi type: 'Container', 'Sprite', 'Text', … See `nodeType`. */
  typeOf(node: Node): string;
  /** The name given by the application — `label` on v8, `name` before it. */
  label(node: Node): string;
  setLabel(node: Node, value: string): void;
  /**
   * PixiJS's own `name`, where the line still has one — the Info section shows
   * it for a node that carries neither an application `id` nor a `label`.
   *
   * `undefined` on v8, and that is the reason this is a method rather than a
   * read of the field. v8 renamed `name` to `label` and left behind a getter
   * that answers the label and prints a deprecation while doing it, so asking
   * would put a warning in the inspected page's console — once per node, on a
   * reading that repeats four times a second — to be told something the panel
   * already draws a row for.
   */
  pixiName(node: Node): string | undefined;
  /** Whether the node draws. The tree dims the ones that do not. */
  visible(node: Node): boolean;
  /**
   * The two expensive things a node can quietly be: filtered, or masked.
   *
   * Through the adapter because `Node` is opaque, not because the answer
   * differs — it does not, on any of the three lines. See `common.ts`.
   */
  hasFilter(node: Node): boolean;
  hasMask(node: Node): boolean;
  /**
   * A declared property, by path (`'alpha'`, `'position.x'`, `'position'`).
   * Only paths from the property schema are ever passed, and only JSON comes
   * back — a `Point` arrives as `{x, y}` and anything unserializable as
   * `undefined`.
   */
  getProp(node: Node, path: string): Json | undefined;
  setProp(node: Node, path: string, value: Json): void;
  /**
   * How this line spells a gradient fill, and where a fresh one comes from.
   *
   * Here rather than in `properties/fill.ts` because it is the one thing about a
   * fill that cannot be worked out from the value: an empty style carries no mark
   * saying which library it belongs to, and on v8 a gradient has to be an
   * instance of a class the page may or may not hand over.
   */
  gradientSupport(): GradientSupport;
  /**
   * The texture a sprite draws, as the application names it. Goes through the
   * `setTextureId` the application provides, because assigning the string does
   * not swap anything — see the implementation.
   */
  setTextureId(node: Node, value: string): void;
  /** Bounds in canvas coordinates; a zero rectangle for a destroyed node. */
  globalBounds(node: Node): Rect;
  /**
   * Every node under a point in client (viewport) coordinates, topmost first,
   * as the picker needs them: things overlap, and the one on top is often not
   * the one being looked for. Empty when the point is over nothing.
   *
   * What is not drawn there — hidden, unrenderable, at zero alpha, or inside
   * something that is — is dug past rather than reported.
   *
   * Hit testing only considers interactive nodes, so the adapter turns
   * interactivity on for the duration of the test and puts it back. `depth` is
   * how many times it may ask before giving up (`DEFAULT_PICK_DEPTH`).
   */
  hitStack(clientX: number, clientY: number, depth: number): Node[];
  /**
   * The names the page holds a texture under that a sprite can be pointed at:
   * atlas frames and standalone textures, never an atlas page.
   *
   * The asset cache is the better source and needs the PixiJS module, so on
   * v6/v7 this is empty for a build that publishes none, and the scene is all
   * that is left (see `nodeTextureNames`). v8 has a second way in that needs
   * nothing published — the renderer's own list of sources, and the textures
   * cut from each — so there the answer stands on its own.
   */
  pickableTextureNames(): string[];

  /**
   * What the PixiJS asset store is holding for Spine.
   *
   * The store is PixiJS's even though Spine is not, and reaching it differs by
   * line — which is what puts this here rather than in `scene/spine`. Empty on
   * a page that publishes no module, which is why it is only half of what the
   * skeleton chooser is offered.
   */
  spineStore(): SpineStore;
  /**
   * The names this node's own texture goes by, so a page that exposes nothing
   * still offers what it is drawing. Empty for a node that draws no texture.
   */
  nodeTextureNames(node: Node): string[];
  /**
   * Which texture this node draws out of, by the id `textureInfo` reports.
   *
   * The **source**, not the frame: a sprite holds a `Texture`, and a hundred
   * frames of a sheet are a hundred of those over one source. The grid lists
   * sources, so that is what the answer has to be in terms of.
   *
   * `null` for a node that draws no texture at all, which is most of a scene.
   */
  nodeTextureSourceId(node: Node): TextureId | null;
  /** Every texture the renderer has uploaded or is tracking. */
  textures(): TextureHandle[];
  textureInfo(texture: TextureHandle): TextureMeta;
  /** The image behind the texture, or null for buffer/compressed sources. */
  drawable(texture: TextureHandle): CanvasImageSource | null;
  /**
   * The texture's pixels read back **from the GPU**, for the ones that have
   * none left on this side.
   *
   * The expensive way round, and the only one for two kinds of texture that
   * between them are most of what a v8 page reports as unnamed: a `Text`, whose
   * canvas PixiJS empties into a pool the moment it is uploaded, and a render
   * target, which never had a resource at all. Both draw as nothing from
   * `drawable`, and both come back whole from the renderer.
   *
   * Asked only after the ordinary path has produced an empty picture, because
   * it costs a render pass and a read — about 9ms a texture on the stand.
   *
   * The size comes back with the image because it is the texture's **frame**
   * rather than its source: a text's 105×51 of letters inside a 128×64 sheet.
   */
  readback(texture: TextureHandle): Readback | null;
  /**
   * The regions cut out of this texture — a spritesheet's frames.
   *
   * Empty for a standalone texture, which is the ordinary case and not a
   * failure. How the regions are found differs completely between the lines,
   * which is what puts this behind the adapter: v8 reads them off the source's
   * own listeners, v6/v7 out of the texture cache, and a v6/v7 page that
   * publishes no PixiJS module has no way to them at all.
   */
  framesOf(texture: TextureHandle): TextureFrame[];
  /** The element the application draws into — v8 calls it the canvas, v6/v7 the view. */
  canvas(): HTMLCanvasElement | null;
  /** The renderer surface, in whatever pixels this line reports. */
  rendererSize(): { width: number; height: number };
  /**
   * The divisor between renderer pixels and CSS pixels for overlay geometry.
   * v8 reports `renderer.width` in CSS pixels already, v6/v7 in device pixels.
   */
  overlayResolution(): number;

  /**
   * Counts GPU draw submissions on this application's renderer, wrapping its
   * draw path the first time it is asked.
   *
   * The count is **monotonic** on purpose: a counter that zeroed itself on
   * being read would make two readers steal each other's frames, which is
   * exactly what the previous project did. The per-frame figure is a difference
   * taken by whoever is watching.
   *
   * @returns null on a renderer whose draw path this line cannot find, so the
   * panel can say the number is unavailable rather than draw a flat zero.
   */
  drawCounter(): DrawCounter | null;
}
