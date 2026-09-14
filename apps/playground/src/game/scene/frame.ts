import { Container, Graphics } from 'pixi.js';

import { ARENA_HEIGHT, ARENA_WIDTH } from '../config.js';

/**
 * The border around the playfield.
 *
 * Deliberately **outside** the arena rather than part of it: the arena carries a
 * mask that clips everything to the board, so a border drawn inside it would be
 * sliced in half along its own edge and could never glow outwards. Here it is a
 * sibling laid over the same rectangle, free to spill past the boundary it
 * draws. `MARGIN` in `config.ts` is the room the design area leaves for it.
 *
 * Built from concentric rounded rectangles rather than a gradient stroke. Each
 * ring is one flat colour, and ordered dark-to-light across the width of the
 * frame they read as a bevel — which is what a bevel is. It keeps the whole
 * border to one `Graphics`, and it cannot go wrong the way a gradient's
 * coordinate space can.
 */

/** How far the outer bloom reaches past the board. Must stay under `MARGIN`. */
const GLOW = 12;

/** The board's corner rounding; every ring adds its own offset to this. */
const RADIUS = 14;

const ring = (
  border: Graphics,
  inset: number,
  color: number,
  width: number,
  alpha = 1,
): void => {
  border
    .roundRect(-inset, -inset, ARENA_WIDTH + inset * 2, ARENA_HEIGHT + inset * 2, RADIUS + inset)
    .stroke({ color, width, alpha });
};

export function createFrame(): Container {
  const root = new Container({ label: 'frame' });
  const border = new Graphics({ label: 'border' });

  // The bloom: faint, widening rings that sit the arena *on* the ground rather
  // than leaving it cut out of it.
  for (let i = GLOW; i > 2; i -= 2) {
    ring(border, i, 0x2f9e6b, 2, 0.04 + (GLOW - i) * 0.014);
  }

  // The casing, outside in. The dark lip gives the frame a silhouette against
  // the tiled ground; the two greys are the bevel; the pale line is the inner
  // edge catching the light.
  ring(border, 9, 0x080c12, 8);
  ring(border, 5, 0x46687d, 3);
  ring(border, 2, 0x24384a, 3);
  ring(border, 0, 0x9ae6c4, 1.5, 0.55);

  root.addChild(border);

  return root;
}

