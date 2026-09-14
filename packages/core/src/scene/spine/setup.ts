import type { SpineSetupTrack } from '@scene-inspector/protocol';

import type { Node } from '../../adapters/types.js';
import { setSkeleton, setSkin } from './skeleton.js';
import { asSpine, refresh } from './spine.js';
import { clearTracks, setTrack, setTimeScale } from './tracks.js';

/**
 * Putting a whole setup on a node at once.
 *
 * The panel can hold several setups for one skeleton and flip between them, and
 * a flip is **one action** — so it is one command rather than six sends in a
 * row. That is not only tidiness: changing the skeleton part way through a
 * sequence would leave the rest of it talking to a node the application had
 * already rebuilt.
 *
 * Nothing here is new behaviour. Every step is the command the panel would have
 * sent by hand, in the order that makes the later ones mean anything: the
 * skeleton decides which skins and animations exist, so it goes first.
 */

export interface Setup {
  /** `null` leaves the skeleton alone — most setups are of the same one. */
  skeleton: string | null;
  /** `null` strips the skeleton; a name it does not have is left alone. */
  skin: string | null;
  timeScale: number;
  tracks: readonly SpineSetupTrack[];
}

/** @returns false when the node is not a skeleton at all. */
export function applySetup(node: Node, setup: Setup): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  if (setup.skeleton !== null) setSkeleton(node, setup.skeleton);

  setSkin(node, setup.skin);
  setTimeScale(node, setup.timeScale);

  // Cleared rather than overwritten: a setup with fewer tracks than the one
  // before it would otherwise leave the extras running underneath.
  clearTracks(node);

  for (const track of setup.tracks) {
    // Names that the new skeleton does not have are refused inside `setTrack`,
    // which is what makes a setup built for one skeleton safe to try on another.
    setTrack(node, track.index, track.animation, track.loop, {
      timeScale: track.timeScale,
      alpha: track.alpha,
      mixDuration: track.mixDuration,
    });
  }

  // The steps above each refresh the node they touched; this is the one that
  // matters, after the last of them, and it costs a pose that is already right.
  refresh(spine);

  return true;
}
