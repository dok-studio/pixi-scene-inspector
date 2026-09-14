import type { Texture } from 'pixi.js';
import {
  BitmapFont,
  BitmapText,
  BlurFilter,
  Container,
  FillGradient,
  Graphics,
  NineSliceSprite,
  Text,
} from 'pixi.js';

import { ARENA_X, DESIGN_WIDTH, MARGIN, TOPBAR_HEIGHT } from '../config.js';

/**
 * The bar across the top of the stage: the score on the left, the logo on the
 * right, on a plate of their own.
 *
 * Built last of everything on the stage, and not by accident: a nine-slice, a
 * bitmap font and a filter are the three most fragile things here, and each
 * fails in a way that looks like the whole scene is broken rather than like one
 * node is. Assembling them after the board means a fault has only one place to
 * be.
 */

const FONT = 'SnakeScore';

export interface Hud {
  root: Container;
  setScore(score: number): void;
}

/**
 * The font is generated rather than loaded.
 *
 * v8 can build a bitmap font from a text style, which saves shipping a `.fnt`
 * and its page. The catch is that it measures the family *at install time*: ask
 * before the document's fonts are ready and the fallback is baked into the
 * atlas for good. The caller waits on `document.fonts.ready` for that reason.
 */
function installFont(): void {
  BitmapFont.install({
    name: FONT,
    style: {
      fontFamily: ['Cascadia Code', 'Menlo', 'Consolas', 'monospace'],
      fontSize: 28,
      fontWeight: 'bold',
      fill: '#ffe08a',
    },
    chars: [['0', '9'], ' ', ':', 'SCORE'],
  });
}

/** The plate the bar sits on, so it reads as a separate surface from the board. */
function plate(): Graphics {
  const width = DESIGN_WIDTH - MARGIN * 2;

  return new Graphics({ label: 'plate' })
    .roundRect(MARGIN, 8, width, TOPBAR_HEIGHT - 16, 12)
    .fill({ color: 0x0d131c, alpha: 0.92 })
    .roundRect(MARGIN, 8, width, TOPBAR_HEIGHT - 16, 12)
    .stroke({ color: 0x24384a, width: 2 })
    // A single lit line along the bottom edge, the way the frame catches light
    // on its inner edge — it ties the two together without repeating the frame.
    .moveTo(MARGIN + 14, TOPBAR_HEIGHT - 9)
    .lineTo(DESIGN_WIDTH - MARGIN - 14, TOPBAR_HEIGHT - 9)
    .stroke({ color: 0x2f9e6b, width: 1, alpha: 0.5 });
}

/**
 * The wordmark.
 *
 * One word, set large, with a gradient fill and a halo behind it. The gradient
 * is in local space so it maps to the text's own box — in global space it would
 * be measured against the whole stage and the letters would come out flat.
 */
function wordmark(): Container {
  const root = new Container({ label: 'wordmark' });

  const gradient = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: '#f4fffa' },
      { offset: 0.45, color: '#86f2c0' },
      { offset: 1, color: '#189463' },
    ],
    textureSpace: 'local',
  });

  /*
   * The glow is a shape, not a filter on the word.
   *
   * Blurring the text itself is what made it soft — a blur cannot tell the
   * letters from their surroundings, so it eats the edges it is meant to
   * flatter. Here the halo is its own rounded rectangle behind the word and
   * *it* carries the blur, which leaves the letters perfectly sharp and still
   * gives the scene the filtered node the panel's flags and the Stats tab
   * count.
   */
  const glow = new Graphics({ label: 'logo-glow' })
    // Wide enough to sit under the mascot as well as the word: the two are one
    // mark, and a halo that stopped at the text would cut the snake out of it.
    .roundRect(-214, -30, 228, 60, 22)
    .fill({ color: 0x1f8f68, alpha: 0.4 });

  glow.filters = [new BlurFilter({ strength: 10, quality: 3 })];

  const snake = new Text({
    text: 'SNAKE',
    style: {
      fill: gradient,
      fontFamily: 'Cascadia Code, Menlo, Consolas, monospace',
      fontSize: 34,
      fontWeight: 'bold',
      letterSpacing: 6,
      // No stroke, and the shadow kept tight: both were softening the shape.
      // At this size the gradient alone separates the word from the plate.
      dropShadow: { color: '#000000', alpha: 0.55, blur: 3, distance: 2, angle: Math.PI / 2 },
    },
  });

  snake.label = 'wordmark-snake';
  snake.anchor.set(1, 0.5);
  // Text is rasterised at the resolution it is asked for; on a stage that is
  // scaled up to fit the pane, the default would be resampled and fuzzy.
  snake.resolution = 3;

  root.addChild(glow, snake);

  return root;
}

export function createHud(frameTexture: Texture, mascot: Container | null): Hud {
  installFont();

  const root = new Container({ label: 'hud' });

  const scorePlate = new NineSliceSprite({
    texture: frameTexture,
    leftWidth: 16,
    rightWidth: 16,
    topHeight: 16,
    bottomHeight: 16,
  });

  scorePlate.label = 'score-plate';
  scorePlate.width = 168;
  scorePlate.height = 42;
  scorePlate.position.set(ARENA_X + 6, TOPBAR_HEIGHT / 2 - 21);

  const score = new BitmapText({ text: 'SCORE 0', style: { fontFamily: FONT, fontSize: 21 } });

  score.label = 'score';
  score.anchor.set(0, 0.5);
  score.position.set(ARENA_X + 22, TOPBAR_HEIGHT / 2);

  const logo = new Container({ label: 'logo' });
  const mark = wordmark();

  mark.position.set(DESIGN_WIDTH - MARGIN - 20, TOPBAR_HEIGHT / 2);
  logo.addChild(mark);

  if (mascot !== null) {
    // Placed by eye, in the inspector, against the finished wordmark — which is
    // what this stand is for. Stated outright rather than derived from the
    // margins: the number that matters is where it sits next to the letters.
    mascot.position.set(320, 39);
    logo.addChild(mascot);
  }

  root.addChild(plate(), scorePlate, score, logo);

  return {
    root,

    setScore(value) {
      // Called every frame; assigning the same string still dirties the text's
      // geometry, so the comparison is the cheap half of this.
      const next = `SCORE ${value}`;
      if (score.text !== next) score.text = next;
    },
  };
}
