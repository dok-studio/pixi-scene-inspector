import type { Revisioned } from '@scene-inspector/protocol';

import type { Node, PixiAdapter } from '../adapters/types.js';
import { FNV_OFFSET, hashString } from '../scene/fingerprint.js';

/**
 * The names a sprite's `textureId` can be set to (docs/architecture.md §3.6).
 *
 * Deliberately not derived from the texture list. `assets.list` reports what
 * the renderer holds, which is atlas *pages* — a sheet of two hundred frames is
 * one entry there, named after its file, and pointing a sprite at that name
 * draws the whole sheet. What can actually be drawn is the frames cut out of
 * it, and those live in the page's own caches.
 *
 * Two sources, because neither is enough alone:
 *
 *  - the texture cache, which has every loaded name whether or not anything is
 *    drawing it — but only on a page that publishes its PixiJS module;
 *  - the scene, which needs nothing published, and answers for exactly what is
 *    on screen. A bundle that exposes nothing has this and nothing else.
 */

/**
 * Spine draws its own atlas pages and keeps its regions out of Pixi's caches,
 * so a Spine node's texture is a sheet — the one thing this list must not
 * offer.
 *
 * Only the node itself, though. `Spine` is an ordinary container, and a game
 * parents whole screens to one, either through `addSlotObject` or by plain
 * `addChild` so the subtree follows the animation's transform. Skipping those
 * along with the skeleton emptied the list on a real page where one Spine held
 * 698 of the scene's 731 nodes — every sprite that had a name to offer.
 *
 * Descending costs nothing where the assumption did hold: a slot attachment
 * that really is drawing a Spine region has no name to answer with, since the
 * runtime never registered one.
 */
const ATLAS_TYPE = 'Spine';

function collectScene(adapter: PixiAdapter, node: Node, into: Set<string>): void {
  if (adapter.typeOf(node) !== ATLAS_TYPE) {
    for (const name of adapter.nodeTextureNames(node)) {
      if (name !== '') into.add(name);
    }
  }

  for (const child of adapter.children(node)) {
    collectScene(adapter, child, into);
  }
}

/**
 * @param knownRev the revision the panel already holds, if any.
 * @returns the names, or `unchanged` when they match `knownRev`.
 *
 * The order is the order the names were collected in — cache first, scene
 * after — and the revision follows it. A shuffle would cost one extra update
 * and nothing else, so it is not worth sorting the page's work to prevent;
 * the panel sorts what it displays anyway.
 */
export function readTextureNames(adapter: PixiAdapter, knownRev?: number): Revisioned<string[]> {
  const found = new Set<string>();

  for (const name of adapter.pickableTextureNames()) {
    if (name !== '') found.add(name);
  }

  const stage = adapter.stage();
  if (stage !== null) collectScene(adapter, stage, found);

  const names = [...found];

  let rev = FNV_OFFSET;
  for (const name of names) rev = hashString(rev, name);

  if (rev === knownRev) return { rev, unchanged: true };
  return { rev, data: names };
}
