import type { SessionStatus } from '@scene-inspector/protocol';

import { ProtocolCallError } from '../transport/client.js';
import type { ResourceState } from '../transport/useResource.js';

export type Screen =
  /** The first status request has not come back yet. */
  | 'connecting'
  /** The page has no host: it was loaded before the extension was enabled. */
  | 'no-host'
  /** A host answered, but found no application on the page. */
  | 'not-detected'
  /** An application was found, and its version is outside v6–v8. */
  | 'unsupported'
  /** There is something to inspect. */
  | 'ready';

/**
 * Which screen the shell owes the user, given the state of the status poll.
 *
 * A function rather than a chain of conditions inside the component: the
 * distinctions here are the ones easy to get subtly wrong — "no application"
 * and "no inspector" are different stories with the same empty look, and a
 * single failed request must not throw away data that is still good.
 */
export function screenFor({ data, error, loading }: ResourceState<SessionStatus>): Screen {
  // Checked before the data, and on purpose: once the host is gone, whatever
  // the panel is holding describes a page that no longer exists.
  if (error instanceof ProtocolCallError && error.code === 'no-host') return 'no-host';

  if (data === null) return loading ? 'connecting' : 'not-detected';
  if (!data.connected) return 'not-detected';
  if (data.major === null) return 'unsupported';

  return 'ready';
}
