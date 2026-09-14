import type { Node } from '../../adapters/types.js';
import { asSpine, refresh, type SkinLike, type SpineLike } from './spine.js';

/**
 * The skeleton itself — what it wears and which skeleton it carries. Both sit
 * beside the animation state rather than inside it.
 */

function findSkin(spine: SpineLike, name: string): SkinLike | null {
  const data = spine.skeleton.data;
  const found = data?.findSkin?.(name);
  if (found !== null && found !== undefined) return found;

  return (data?.skins ?? []).find((skin) => skin.name === name) ?? null;
}

/**
 * Dresses the skeleton in one of its skins, or strips it with `null`.
 *
 * Resetting the slots is not optional: without it attachments from the previous
 * skin stay on the skeleton, which reads as a bug in the application rather
 * than in the inspector.
 *
 * **The name is checked first.** `Skeleton.setSkinByName` throws `Skin not
 * found` rather than doing nothing, and the caller that hits that is not a typo
 * but a setup built for one skeleton being applied to another — an ordinary
 * thing to do, which must not throw across the bridge. An unknown name is left
 * alone rather than treated as "strip it": undressing a skeleton because a
 * setup mentioned a skin it does not have would be a change nobody asked for.
 */
export function setSkin(node: Node, name: string | null): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  const found = name === null ? null : findSkin(spine, name);
  if (name !== null && found === null) return false;

  const skeleton = spine.skeleton;
  skeleton.setSkin?.(found);
  skeleton.setSlotsToSetupPose?.();
  refresh(spine);

  return true;
}

/**
 * Changes which skeleton the node carries, through the application's own method.
 *
 * There is no runtime path to this — see `SpineLike.changeSkeleton` — so a game
 * that offers nothing simply cannot be moved, and saying so is more use than
 * pretending. The result is checked the way the previous project checked it:
 * `false` means the application refused the name.
 *
 * The contract is a swap **in place**. An implementation that destroys the node
 * and builds a new one leaves the panel holding an id for something that is
 * gone; the section notices on its next poll and says the skeleton is not there.
 *
 * @returns false when nothing changed.
 */
export function setSkeleton(node: Node, name: string): boolean {
  const spine = asSpine(node);
  if (spine === null || typeof spine.changeSkeleton !== 'function') return false;

  if (spine.changeSkeleton(name) === false) return false;

  refresh(spine);
  return true;
}
