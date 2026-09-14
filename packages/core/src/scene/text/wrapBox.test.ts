import type { Json } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { Node, PixiAdapter } from '../../adapters/types.js';
import { localWrapFrame, wrapBoxOf } from './wrapBox.js';

/**
 * The frame a caption is laid out against.
 *
 * The arithmetic is the whole of it, and getting it wrong is not visible as an
 * error — it is visible as a box beside the text, which reads as the caption
 * being in the wrong place rather than the inspector.
 */

interface Style {
  wordWrap?: boolean;
  flexFont?: boolean;
  wordWrapWidth?: number;
  wordWrapHeight?: number;
}

interface Placement {
  /** The node's own bounds, which is what an unbounded frame is as tall as. */
  local?: { x: number; y: number; width: number; height: number };
  anchor?: { x: number; y: number };
  /** How the node sits in the world: applied to every corner, as `toGlobal` is. */
  scale?: number;
  angle?: number;
  offset?: { x: number; y: number };
}

/** A text node and an adapter that reads it, which is all `wrapBoxOf` needs. */
function textNode(style: Style, placement: Placement = {}) {
  const {
    local = { x: 0, y: 0, width: 120, height: 30 },
    anchor,
    scale = 1,
    angle = 0,
    offset = { x: 0, y: 0 },
  } = placement;

  const radians = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];

  const node = {
    getLocalBounds: () => local,
    toGlobal: (point: { x: number; y: number }) => ({
      x: (point.x * cos - point.y * sin) * scale + offset.x,
      y: (point.x * sin + point.y * cos) * scale + offset.y,
    }),
  } as unknown as Node;

  const values: Record<string, Json | undefined> = {
    'style.wordWrap': style.wordWrap,
    'style.flexFont': style.flexFont,
    'style.wordWrapWidth': style.wordWrapWidth,
    'style.wordWrapHeight': style.wordWrapHeight,
    'anchor.x': anchor?.x,
    'anchor.y': anchor?.y,
  };

  const adapter = { getProp: (_node: Node, path: string) => values[path] } as unknown as PixiAdapter;

  return { node, adapter };
}

describe('localWrapFrame', () => {
  it('hangs the frame off the origin when the text is not anchored', () => {
    expect(localWrapFrame({ x: 0, y: 0 }, 260, 40)).toEqual({ x: 0, y: 0, width: 260, height: 40 });
  });

  /**
   * The same rule the game lays its own bounds out by. A centred caption
   * measured against a box beside it would read as the caption being misplaced.
   */
  it('centres the frame on the origin at an anchor of a half', () => {
    expect(localWrapFrame({ x: 0.5, y: 0.5 }, 260, 40)).toEqual({ x: -130, y: -20, width: 260, height: 40 });
  });

  /** With no height of its own the frame reaches exactly as far as the text. */
  it('takes its vertical extent from the text when given bounds instead', () => {
    const frame = localWrapFrame({ x: 0.5, y: 0.5 }, 260, { x: -60, y: -15, width: 120, height: 30 });

    expect(frame).toEqual({ x: -130, y: -15, width: 260, height: 30 });
  });
});

describe('wrapBoxOf', () => {
  it('draws nothing while both switches are off', () => {
    const { node, adapter } = textNode({ wordWrapWidth: 260, wordWrapHeight: 40 });

    expect(wrapBoxOf(node, adapter)).toBeNull();
  });

  it('draws the box for word wrap alone', () => {
    const { node, adapter } = textNode({ wordWrap: true, wordWrapWidth: 260, wordWrapHeight: 40 });

    expect(wrapBoxOf(node, adapter)?.corners).toEqual([
      { x: 0, y: 0 },
      { x: 260, y: 0 },
      { x: 260, y: 40 },
      { x: 0, y: 40 },
    ]);
  });

  /**
   * And for flex font alone: the game shrinks the type against the box whether
   * or not the lines wrap, which is why the panel shows the two fields under
   * either switch.
   */
  it('draws the box for flex font alone', () => {
    const { node, adapter } = textNode({ flexFont: true, wordWrapWidth: 260, wordWrapHeight: 40 });

    expect(wrapBoxOf(node, adapter)?.bounded).toBe(true);
  });

  it('draws nothing without a width to wrap at', () => {
    const missing = textNode({ wordWrap: true });
    const zero = textNode({ wordWrap: true, wordWrapWidth: 0 });

    expect(wrapBoxOf(missing.node, missing.adapter)).toBeNull();
    expect(wrapBoxOf(zero.node, zero.adapter)).toBeNull();
  });

  /**
   * The case the two vertical guides are for: a plain PixiJS text has no
   * `wordWrapHeight` at all, and a game's own may leave it at zero. The frame
   * then reaches as far as the caption does and says so.
   */
  it('falls back to the height of the text when the game bounds no height', () => {
    const { node, adapter } = textNode(
      { wordWrap: true, wordWrapWidth: 260 },
      { local: { x: 0, y: 0, width: 120, height: 34 } },
    );

    expect(wrapBoxOf(node, adapter)).toEqual({
      corners: [
        { x: 0, y: 0 },
        { x: 260, y: 0 },
        { x: 260, y: 34 },
        { x: 0, y: 34 },
      ],
      bounded: false,
    });
  });

  it('treats a height of zero as no height at all', () => {
    const { node, adapter } = textNode({ wordWrap: true, wordWrapWidth: 260, wordWrapHeight: 0 });

    expect(wrapBoxOf(node, adapter)?.bounded).toBe(false);
  });

  it('anchors the box the way the text is anchored', () => {
    const { node, adapter } = textNode(
      { flexFont: true, wordWrapWidth: 260, wordWrapHeight: 40 },
      { anchor: { x: 0.5, y: 1 } },
    );

    expect(wrapBoxOf(node, adapter)?.corners).toEqual([
      { x: -130, y: -40 },
      { x: 130, y: -40 },
      { x: 130, y: 0 },
      { x: -130, y: 0 },
    ]);
  });

  it('reports the frame where the node puts it, scale and all', () => {
    const { node, adapter } = textNode(
      { wordWrap: true, wordWrapWidth: 260, wordWrapHeight: 40 },
      { scale: 2, offset: { x: 16, y: 70 } },
    );

    expect(wrapBoxOf(node, adapter)?.corners).toEqual([
      { x: 16, y: 70 },
      { x: 536, y: 70 },
      { x: 536, y: 150 },
      { x: 16, y: 150 },
    ]);
  });

  /**
   * The reason the frame is four corners and not a rectangle: a turned caption
   * is laid out against a turned box, and the axis-aligned box around that one
   * is a different, larger shape that the text does not sit in.
   */
  it('turns the frame with the caption', () => {
    const { node, adapter } = textNode(
      { wordWrap: true, wordWrapWidth: 100, wordWrapHeight: 40 },
      { angle: 90 },
    );

    const corners = wrapBoxOf(node, adapter)?.corners ?? [];
    const expected = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: -40, y: 100 },
      { x: -40, y: 0 },
    ];

    expect(corners).toHaveLength(4);
    expected.forEach((want, index) => {
      expect(corners[index]?.x).toBeCloseTo(want.x, 6);
      expect(corners[index]?.y).toBeCloseTo(want.y, 6);
    });
  });

  /** A node that cannot be placed is not a reason to draw a box at the origin. */
  it('draws nothing for a node with no transform to ask', () => {
    const bare = {} as Node;
    const adapter = {
      getProp: (_node: Node, path: string) =>
        ({ 'style.wordWrap': true, 'style.wordWrapWidth': 260 })[path],
    } as unknown as PixiAdapter;

    expect(wrapBoxOf(bare, adapter)).toBeNull();
  });
});
