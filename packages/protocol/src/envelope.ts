import type { CommandName, CommandParams, CommandResult } from './commands.js';

/** Contract version. Bumped on any incompatible change to the command map. */
export const PROTOCOL_VERSION = 1;

export type ProtocolErrorCode =
  /** No host on the page — the inspector has not been injected there. */
  | 'no-host'
  /** The envelope did not parse: not JSON, wrong shape, or a foreign version. */
  | 'bad-envelope'
  /** Command unknown to this host (the panel is newer than the page). */
  | 'unknown-command'
  /** Command is known, but the parameters are not. */
  | 'bad-params'
  /** The handler threw — details in `detail`. */
  | 'internal';

export interface ProtocolError {
  code: ProtocolErrorCode;
  message: string;
  detail?: string;
}

/**
 * A request, with its parameters tied to its command.
 *
 * Written as a mapped type indexed by `K` rather than as an interface, and that
 * is the whole of it: an interface with `cmd: K` and `params: CommandParams<K>`
 * collapses at the default `K = CommandName` into "any command name, and the
 * parameters of *any* command" — so `{ cmd: 'scene.setProp', params: { rev: 1 } }`
 * type-checks, because `{ rev: 1 }` satisfies `scene.tree`'s member of the
 * union. The host validates parameters with nothing finer than "is an object"
 * (`runtime/host.ts`), so such an envelope reaches the handler and destructures
 * to `undefined` throughout instead of producing the `'bad-params'` this
 * declares. Distributing over `K` pairs the two back up, and the unparameterised
 * form becomes the union of the 29 correct envelopes rather than one loose one.
 */
export type RequestEnvelope<K extends CommandName = CommandName> = {
  [N in K]: {
    /** Protocol version as seen by the panel. */
    v: number;
    /** Correlation id, so diagnostics can pair a request with its response. */
    id: number;
    cmd: N;
    params: CommandParams<N>;
  };
}[K];

export type ResponseEnvelope<K extends CommandName = CommandName> =
  | { v: number; id: number; ok: true; result: CommandResult<K> }
  | { v: number; id: number; ok: false; error: ProtocolError };
