import type { Revisioned, TextureId, TextureUser } from '@scene-inspector/protocol';

import type { Node, PixiAdapter } from '../adapters/types.js';
import { FNV_OFFSET, hashNumber, hashString } from '../scene/fingerprint.js';
import type { Registry } from '../scene/registry.js';

/**
 * Which nodes are drawing a given texture (docs/architecture.md §3.6).
 *
 * The one thing the Assets tab could not say about a texture. The grid reports
 * what the renderer is holding and what it costs; whether anything is *using*
 * it is a property of the scene, and an atlas page nothing draws from is
 * exactly what somebody opens this tab to find.
 *
 * A walk of the whole scene, which is why the panel only asks while the section
 * is open. Nothing is cached between calls: the scene moves, and a cache would
 * have to be invalidated by the very walk it was meant to replace.
 */

/**
 * The label a node is listed under: its own name, or its type where it has
 * none.
 *
 * The same fallback the tree uses, because these are the same nodes under
 * another heading, and a row reading "1487" would be a row nobody could act on.
 */
function labelOf(adapter: PixiAdapter, node: Node): string {
  const name = adapter.label(node);
  return name === '' ? adapter.typeOf(node) : name;
}

function collect(
  adapter: PixiAdapter,
  registry: Registry,
  node: Node,
  id: TextureId,
  into: TextureUser[],
): void {
  if (adapter.nodeTextureSourceId(node) === id) {
    into.push({ id: registry.idOf(node), label: labelOf(adapter, node) });
  }

  for (const child of adapter.children(node)) {
    collect(adapter, registry, child, id, into);
  }
}

/**
 * @param knownRev the revision the panel already holds, if any.
 * @returns the nodes drawing this texture, or `unchanged` when they match.
 *
 * Ids are minted through the registry, so a row here names the node in exactly
 * the terms the Scene tab does and a click can hand it over as a selection.
 * That is also why the walk cannot be skipped for a node the tree has never
 * reported: `idOf` mints on first sight, which is what makes a texture's users
 * findable before anyone has expanded the branch they are in.
 */
export function readTextureUsers(
  adapter: PixiAdapter,
  registry: Registry,
  id: TextureId,
  knownRev?: number,
): Revisioned<TextureUser[]> {
  const users: TextureUser[] = [];
  const stage = adapter.stage();
  if (stage !== null) collect(adapter, registry, stage, id, users);

  let rev = FNV_OFFSET;
  for (const user of users) {
    rev = hashNumber(rev, user.id);
    rev = hashString(rev, user.label);
  }

  if (rev === knownRev) return { rev, unchanged: true };
  return { rev, data: users };
}
