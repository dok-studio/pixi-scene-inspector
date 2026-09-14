import type {
  CommandName,
  CommandParams,
  CommandResult,
  ProtocolErrorCode,
  RequestEnvelope,
  ResponseEnvelope,
} from '@scene-inspector/protocol';
import { PROTOCOL_VERSION } from '@scene-inspector/protocol';

import type { Bridge } from './bridge.js';

export class ProtocolCallError extends Error {
  readonly code: ProtocolErrorCode;
  readonly detail: string | undefined;

  constructor(code: ProtocolErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'ProtocolCallError';
    this.code = code;
    this.detail = detail;
  }
}

export interface Client {
  call<K extends CommandName>(cmd: K, params: CommandParams<K>): Promise<CommandResult<K>>;
  /**
   * A write whose answer nobody waits for.
   *
   * Every editing path in the panel is one of these: the value is sent, and
   * the next poll says what the scene made of it. What they are not is
   * exempt from failing — a page reloading, or one that never had a host,
   * rejects them all — and a bare `void client.call(...)` turns that into an
   * unhandled rejection in a DevTools page, which is noise in a console that
   * belongs to whoever is debugging the application. The refusal is the
   * panel’s to swallow: there is nothing it could usefully say about it, and
   * the poll behind it recovers on its own.
   */
  send<K extends CommandName>(cmd: K, params: CommandParams<K>): void;
}

/**
 * A typed wrapper over the bridge.
 *
 * A call reads as `client.call('session.status', {})`, and TypeScript checks
 * both the parameters and the result type against the protocol's command map.
 * A mistake such as a missing dot in a path, or a value of the wrong type,
 * becomes a compile error instead of a silent no-op at runtime.
 */
export function createClient(bridge: Bridge): Client {
  let nextId = 1;

  const client: Client = {
    async call<K extends CommandName>(cmd: K, params: CommandParams<K>): Promise<CommandResult<K>> {
      const envelope: RequestEnvelope<K> = { v: PROTOCOL_VERSION, id: nextId++, cmd, params };
      const raw = await bridge.send(JSON.stringify(envelope));

      if (raw === null) {
        throw new ProtocolCallError('no-host', 'The inspector is not installed on this page');
      }

      let parsed: ResponseEnvelope<K>;
      try {
        parsed = JSON.parse(raw) as ResponseEnvelope<K>;
      } catch (error) {
        throw new ProtocolCallError(
          'bad-envelope',
          'The page response is not valid JSON',
          error instanceof Error ? error.message : String(error),
        );
      }

      if (!parsed.ok) {
        throw new ProtocolCallError(parsed.error.code, parsed.error.message, parsed.error.detail);
      }

      return parsed.result;
    },

    send(cmd, params) {
      client.call(cmd, params).catch(() => undefined);
    },
  };

  return client;
}
