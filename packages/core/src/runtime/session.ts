import type { PixiMajor, SessionStatus } from '@scene-inspector/protocol';

import { resolveStage } from '../adapters/common.js';
import { createAdapter } from '../adapters/index.js';
import type { PixiAdapter } from '../adapters/types.js';
import { detectVersion } from '../adapters/version.js';
import type { Locks } from '../scene/mutate.js';
import { createLocks } from '../scene/mutate.js';
import type { Registry } from '../scene/registry.js';
import { createRegistry } from '../scene/registry.js';
import type { FrameHook } from './frame.js';
import { createFrameHook } from './frame.js';
import type { WindowLike } from './detect.js';
import { detect } from './detect.js';
import type { InitHooks } from './hooks.js';

const DISCONNECTED: SessionStatus = {
  connected: false,
  version: null,
  major: null,
  source: null,
  inFrame: false,
  generation: 0,
};

const UNKNOWN_VERSION: { major: PixiMajor | null; version: string | null } = {
  major: null,
  version: null,
};

/**
 * The full session state, computed from scratch.
 *
 * There is no cache here on purpose — see the comment on `detect()`. As a
 * result the status heals itself within one poll after a page reload or an
 * application swap, with no separate invalidation mechanism.
 *
 * The version is spread in rather than read field by field: that keeps it as
 * data passing through instead of turning into a version branch, which is
 * exactly what the linter forbids outside the adapters.
 */
export function readSessionStatus(
  root: WindowLike,
  hooks?: InitHooks | null,
  generation = 0,
): SessionStatus {
  const detection = detect(root, hooks);
  if (detection === null) return DISCONNECTED;

  // A destroyed application is still sitting in the global that found it, and
  // its renderer still looks like a renderer. `resolveStage` already counts a
  // destroyed stage as no stage — which is what the adapter goes by — so the
  // status has to agree, or the panel reports "ready" over a scene that can
  // never be read, with nothing to explain why.
  if (detection.stage !== undefined && resolveStage(detection) === null) return DISCONNECTED;

  const version = detectVersion(detection) ?? UNKNOWN_VERSION;

  return {
    connected: true,
    source: detection.source,
    inFrame: detection.inFrame,
    generation,
    ...version,
  };
}

/**
 * The connected application, as the command handlers see it.
 *
 * The split of what is recomputed and what is kept is the point of this type:
 *
 *  - the **adapter** is rebuilt on every call, because detection is not cached
 *    and an application can be swapped or reloaded between two polls. It is an
 *    object literal of closures, so rebuilding costs nothing;
 *  - the **registry** is kept for the lifetime of the session, because node ids
 *    have to be stable across polls. If they were not, the panel would lose its
 *    selection and its expanded rows on every tick.
 */
export interface Session {
  status(): SessionStatus;
  /** @returns null when there is no application, or none of a supported version. */
  adapter(): PixiAdapter | null;
  readonly registry: Registry;
  /** Nodes the user has locked. Session-scoped for the same reason ids are. */
  readonly locks: Locks;
  /**
   * The render hook. Installed only while something needs a frame, so an
   * application with the inspector open and the overlay off renders through
   * its own function (docs/architecture.md §3.7).
   */
  readonly frame: FrameHook;
}

export function createSession(root: WindowLike, hooks?: InitHooks | null): Session {
  const registry = createRegistry();
  const locks = createLocks();

  /**
   * This install, told apart from the last one.
   *
   * The host is installed with the page, so a navigation gives a new number
   * and the panel can see that every id it holds now names something else.
   * Random rather than a clock: two loads within the same millisecond are
   * ordinary, and nothing here needs the value to be ordered.
   */
  const generation = Math.floor(Math.random() * 2 ** 31) + 1;

  // Looked up on demand, never captured: detection is not cached, and the
  // application can be replaced between two polls.
  const frame = createFrameHook(
    () => detect(root, hooks)?.renderer,
    () => detect(root, hooks)?.stage,
  );

  return {
    status: () => readSessionStatus(root, hooks, generation),
    adapter: () => {
      const detection = detect(root, hooks);
      return detection === null ? null : createAdapter(detection);
    },
    registry,
    locks,
    frame,
  };
}
