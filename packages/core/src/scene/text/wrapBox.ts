import type { Rect } from '@scene-inspector/protocol';

import type { Node, PixiAdapter } from '../../adapters/types.js';
import type { Point } from '../nodeSpace.js';
import { localBoundsOf, mapRect } from '../nodeSpace.js';

/**
 * The wrap box of a caption, in the coordinates the overlay draws in.
 *
 * This is the rectangle the text is laid out against: `wordWrapWidth` is where
 * PixiJS breaks the lines, and a game's own `flexFont` shrinks the type until
 * the text fits inside it. The panel already shows both numbers; what it cannot
 * show is whether the caption on screen actually sits in the box, which is the
 * one thing anyone tuning it wants to see.
 *
 * The box is anchored the way the text is — the game lays its own bounds out as
 * `-anchor * size`, and the frame it measures them against has to sit in the
 * same place, or a centred caption would be judged against a box beside it.
 *
 * The frame comes back as four corners rather than a rectangle, because a
 * caption can be turned and the box has to turn with it — the same shape, and
 * for the same reason, as the highlight in `overlay/outline.ts`.
 *
 * Duck-typed like `relayout.ts` next door: `toGlobal` and `getLocalBounds` are
 * on every version's container, so there is no version branch here and nothing
 * for `PixiAdapter` to hide (rule 2). The mapping itself is shared with the
 * origin gizmo and the highlight outline — see `scene/nodeSpace.ts`.
 */

export interface WrapBox {
  /** The frame's corners in canvas coordinates, in drawing order. */
  corners: [Point, Point, Point, Point];
  /**
   * Whether the game gave the frame a height of its own.
   *
   * `wordWrapHeight` is the game's addition, and a plain PixiJS text has no
   * such thing: the wrap box bounds those captions horizontally and not at all
   * vertically. The overlay draws the difference rather than papering over it.
   */
  bounded: boolean;
}

/**
 * The frame in the node's own coordinates.
 *
 * @param height the height the game gave the box, or the text's own local
 * bounds where it gave none — the box then reaches exactly as far as the
 * caption does, which is what the two vertical guides are drawn to.
 */
export function localWrapFrame(anchor: Point, width: number, height: Rect | number): Rect {
  /**
   * An unanchored box starts at `-0 * width`, and `-0` goes into a style as
   * `translate(-0px, …)`. It works, and it reads like a bug every time.
   */
  const zeroed = (value: number): number => (value === 0 ? 0 : value);

  if (typeof height === 'number') {
    return { x: zeroed(-anchor.x * width), y: zeroed(-anchor.y * height), width, height };
  }

  return { x: zeroed(-anchor.x * width), y: height.y, width, height: height.height };
}

/** @returns undefined for anything that is not a usable number. */
function numberAt(adapter: PixiAdapter, node: Node, path: string): number | undefined {
  const value = adapter.getProp(node, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Nothing to measure reads as nothing measured, which is a frame of no height. */
const NO_BOUNDS: Rect = { x: 0, y: 0, width: 0, height: 0 };

/**
 * @returns null when this node has no wrap box worth drawing — which is most
 * nodes, and every node while both switches are off.
 */
export function wrapBoxOf(node: Node, adapter: PixiAdapter): WrapBox | null {
  // Deliberately the same condition the panel applies to the two fields
  // (`WRAP_BOX` in `SceneProperties.tsx`): the box serves both switches, because
  // the game measures the text against it whether or not the lines wrap. Asking
  // for `style.flexFont` on a plain PixiJS text answers undefined, so nothing
  // extra is needed to tell the two classes apart here.
  const wraps = adapter.getProp(node, 'style.wordWrap') === true;
  const flexes = adapter.getProp(node, 'style.flexFont') === true;
  if (!wraps && !flexes) return null;

  const width = numberAt(adapter, node, 'style.wordWrapWidth');
  if (width === undefined || width <= 0) return null;

  const height = numberAt(adapter, node, 'style.wordWrapHeight');
  const bounded = height !== undefined && height > 0;

  const anchor = {
    // A `BitmapText` on the older lines has no anchor at all, and neither has a
    // container someone gave a text style to.
    x: numberAt(adapter, node, 'anchor.x') ?? 0,
    y: numberAt(adapter, node, 'anchor.y') ?? 0,
  };

  const frame = localWrapFrame(anchor, width, bounded ? height : (localBoundsOf(node) ?? NO_BOUNDS));
  const corners = mapRect(node, frame);

  return corners === null ? null : { corners, bounded };
}
