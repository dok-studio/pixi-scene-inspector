import type { Texture } from 'pixi.js';
import { TilingSprite } from 'pixi.js';

import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../config.js';

/** The ground the whole stage sits on: one tile, repeated across the design. */
export function createBackground(tile: Texture): TilingSprite {
  const background = new TilingSprite({
    texture: tile,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  });

  background.label = 'background';

  return background;
}
