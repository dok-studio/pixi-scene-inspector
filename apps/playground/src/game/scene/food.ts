import type { Spritesheet } from 'pixi.js';
import { AnimatedSprite } from 'pixi.js';

import { CELL } from '../config.js';
import type { Cell } from '../logic/grid.js';
import { centreOf } from '../logic/grid.js';

/** The berry: four frames, pulsing, so the board is never completely still. */
export function createFood(sheet: Spritesheet): AnimatedSprite {
  const frames = ['berry-0', 'berry-1', 'berry-2', 'berry-3'].map((name) => {
    const texture = sheet.textures[name];
    if (texture === undefined) throw new Error(`the sheet has no frame "${name}"`);

    return texture;
  });

  const food = new AnimatedSprite(frames);

  food.label = 'food';
  food.anchor.set(0.5);
  food.animationSpeed = 0.12;
  food.play();

  return food;
}

export function placeFoodSprite(food: AnimatedSprite, cell: Cell): void {
  const centre = centreOf(cell, CELL);

  food.position.set(centre.x, centre.y);
}
