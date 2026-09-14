import type {
  CommandName,
  CommandParams,
  CommandResult,
  ProtocolError,
  ResponseEnvelope,
} from '@scene-inspector/protocol';
import { COMMAND_NAMES, HOST_GLOBAL, PROTOCOL_VERSION } from '@scene-inspector/protocol';

export type Handlers = {
  [K in CommandName]?: (params: CommandParams<K>) => CommandResult<K>;
};

export interface Host {
  /**
   * Takes a serialized request envelope, returns a serialized response
   * envelope. Strings in and out, because that is all `inspectedWindow.eval`
   * carries reliably.
   */
  call(raw: string): string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKnownCommand(name: string): name is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(name);
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;
  return String(error);
}

function failure(id: number, error: ProtocolError): string {
  const envelope: ResponseEnvelope = { v: PROTOCOL_VERSION, id, ok: false, error };
  return JSON.stringify(envelope);
}

/**
 * The command dispatcher.
 *
 * Its defining property: **`call` never throws**. It runs inside the inspected
 * page, so an exception escaping from here would either corrupt the eval
 * response or surface in someone else's console. Every failure — from
 * unparseable JSON to a handler blowing up — becomes an `ok: false` envelope
 * instead.
 */
export function createHost(handlers: Handlers): Host {
  return {
    call(raw: string): string {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return failure(0, {
          code: 'bad-envelope',
          message: 'Request envelope is not valid JSON',
          detail: describe(error),
        });
      }

      if (!isObject(parsed)) {
        return failure(0, { code: 'bad-envelope', message: 'Request envelope is not an object' });
      }

      const id = typeof parsed['id'] === 'number' ? parsed['id'] : 0;

      if (parsed['v'] !== PROTOCOL_VERSION) {
        return failure(id, {
          code: 'bad-envelope',
          message: `Protocol version ${String(parsed['v'])} does not match ${PROTOCOL_VERSION}`,
        });
      }

      const cmd = parsed['cmd'];
      if (typeof cmd !== 'string' || !isKnownCommand(cmd)) {
        return failure(id, {
          code: 'unknown-command',
          message: `Unknown command: ${String(cmd)}`,
        });
      }

      // The one place the command map's types cannot help: `cmd` is a union at
      // this point, so the handler's parameter type is a union too and no
      // single value satisfies all of them at once. The types are enforced
      // where it matters instead — at registration, against `Handlers`, and in
      // the panel's client. Here the input is JSON that just arrived from
      // another process, and it is validated as such below.
      const handler = handlers[cmd] as ((params: unknown) => CommandResult<CommandName>) | undefined;
      if (handler === undefined) {
        return failure(id, {
          code: 'unknown-command',
          message: `Command ${cmd} has no handler on this host`,
        });
      }

      const params = parsed['params'];
      if (!isObject(params)) {
        return failure(id, {
          code: 'bad-params',
          message: `Parameters for ${cmd} must be an object`,
        });
      }

      let result: CommandResult<CommandName>;
      try {
        result = handler(params);
      } catch (error) {
        return failure(id, {
          code: 'internal',
          message: `Handler for ${cmd} failed`,
          detail: describe(error),
        });
      }

      // Serialization is a failure point too: a handler could return something
      // circular or carrying a BigInt. A clear error beats a broken string.
      try {
        const envelope: ResponseEnvelope = { v: PROTOCOL_VERSION, id, ok: true, result };
        return JSON.stringify(envelope);
      } catch (error) {
        return failure(id, {
          code: 'internal',
          message: `Result of ${cmd} is not serializable`,
          detail: describe(error),
        });
      }
    },
  };
}

/** Installs the host on the page global. Idempotent: a repeat call overwrites. */
export function installHost(target: Record<string, unknown>, handlers: Handlers): Host {
  const host = createHost(handlers);
  target[HOST_GLOBAL] = host;
  return host;
}
