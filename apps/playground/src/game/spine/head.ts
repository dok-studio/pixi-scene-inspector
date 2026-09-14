import { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { Container, Spritesheet } from 'pixi.js';
import { Sprite } from 'pixi.js';

import { SPINE_ALIASES } from '../assets.js';

/**
 * The snake's head.
 *
 * The game never names an animation: it says what happened, and this decides
 * what the skeleton does about it. That keeps the two apart — the rules do not
 * know there is a skeleton, and the skeleton does not know there are rules.
 */
export interface DragonHead {
  node: Container;
  /** Advances the skeleton. Not called while paused, which is the whole point. */
  update(deltaSeconds: number): void;
  setHeading(radians: number): void;
  /** The heading it is currently drawn at, so a turn can be eased from it. */
  heading(): number;
  playIdle(): void;
  playBite(): void;
  playDie(): void;
}

/** How much of a cell the head fills. The art is 96px across; a cell is 32. */
const HEAD_SCALE = 0.46;

/** A little longer than the default: the head is small and a snap reads as a jump. */
const MIX_SECONDS = 0.15;

function createSpineHead(): DragonHead {
  const spine = Spine.from({ skeleton: SPINE_ALIASES.skeleton, atlas: SPINE_ALIASES.atlas });

  spine.label = 'head';
  spine.scale.set(HEAD_SCALE);

  /*
   * The skeleton is driven by the game loop, not by the ticker.
   *
   * This is what makes pausing useful. With `autoUpdate` on, a paused game
   * would still have a skeleton advancing itself, and the panel's scrubbing —
   * `spine.setTrackTime` — would be overwritten before it could be seen. Off,
   * a pause stops the pose dead while the renderer keeps drawing, so the only
   * thing that can move the head is the inspector.
   */
  spine.autoUpdate = false;
  spine.state.data.defaultMix = MIX_SECONDS;
  spine.state.setAnimation(0, 'idle', true);

  return {
    node: spine,

    update(deltaSeconds) {
      spine.update(deltaSeconds);
    },

    setHeading(radians) {
      spine.rotation = radians;
    },

    heading() {
      return spine.rotation;
    },

    playIdle() {
      spine.state.setAnimation(0, 'idle', true);
    },

    playBite() {
      spine.state.setAnimation(1, 'bite', false);

      /*
       * Not cosmetic: this leaves an entry queued behind the bite on track 1,
       * and the queue is a thing the panel shows in its own right. Without it
       * the track empties the instant the chomp ends and that half of the Spine
       * section has nothing in it to photograph.
       */
      spine.state.addEmptyAnimation(1, MIX_SECONDS, 0);
    },

    playDie() {
      // Track 0, so the last pose is held rather than falling back to idle.
      spine.state.setAnimation(0, 'die', false);
    },
  };
}

/**
 * What the head is when the skeleton could not be loaded.
 *
 * A stand with no head at all looks broken in a way that hides the actual
 * fault; a plain sprite keeps the game playable and makes it obvious which
 * piece is missing.
 */
function createFallbackHead(sheet: Spritesheet): DragonHead {
  const texture = sheet.textures['segment'];
  const sprite = new Sprite(texture);

  sprite.label = 'head';
  sprite.anchor.set(0.5);
  sprite.tint = 0xffd43b;

  return {
    node: sprite,
    update() {},
    setHeading(radians) {
      sprite.rotation = radians;
    },
    heading() {
      return sprite.rotation;
    },
    playIdle() {},
    playBite() {},
    playDie() {},
  };
}

export function createHead(sheet: Spritesheet, spineReady: boolean): DragonHead {
  return spineReady ? createSpineHead() : createFallbackHead(sheet);
}
