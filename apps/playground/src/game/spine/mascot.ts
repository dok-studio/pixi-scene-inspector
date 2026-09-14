import { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { Container } from 'pixi.js';

import { LOGO_ALIASES } from '../assets.js';

/**
 * The coiled snake beside the wordmark.
 *
 * Its own skeleton, not the game's head in another skin. The head is drawn
 * top-down because the board is seen from above; a logo is looked at straight
 * on, so it gets a creature drawn for that — and the logo stops being a copy of
 * the thing already on the board.
 *
 * Two skeletons on one page is also worth more to the panel than one: the
 * skeleton chooser has something to choose between, and the tree holds two
 * Spine nodes that can be compared side by side.
 *
 * Unlike the head, this one drives itself — `autoUpdate` stays on. It is not
 * part of the game, so it should keep breathing while the game is paused, and
 * that difference is visible in the panel: one skeleton's tracks advance while
 * the other sits still under the scrubber.
 */
export function createMascot(): Container {
  const spine = Spine.from({ skeleton: LOGO_ALIASES.skeleton, atlas: LOGO_ALIASES.atlas });

  spine.label = 'mascot';
  spine.scale.set(0.7);
  spine.state.data.defaultMix = 0.15;
  spine.state.setAnimation(0, 'idle', true);

  /*
   * The tail runs on a track of its own, on top of the idle.
   *
   * `tail-wag` keys one bone and nothing else, so Spine leaves every other bone
   * to track 0 — the coil keeps breathing and the head keeps swaying underneath
   * it. Two tracks at once is also what the panel's Spine section is built to
   * show, and until now nothing on this page ran more than one.
   */
  spine.state.setAnimation(1, 'tail-wag', true);

  return spine;
}
