import type { SessionStatus } from '@scene-inspector/protocol';
import { HOST_GLOBAL, PROTOCOL_VERSION } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { Bridge } from './bridge.js';
import { buildCallExpression } from './bridge.js';
import { ProtocolCallError, createClient } from './client.js';

const status: SessionStatus = {
  connected: true,
  version: '8.14.0',
  major: 8,
  source: '__PIXI_APP__',
  inFrame: false,
  generation: 7,
};

function bridgeReturning(raw: string | null, capture?: (sent: string) => void): Bridge {
  return {
    send(sent: string) {
      capture?.(sent);
      return Promise.resolve(raw);
    },
  };
}

/**
 * Runs the built expression the way the page would, and reports the string
 * that reached the host. Asserting on the expression's own text would be
 * brittle; here the escaping is verified by its outcome.
 */
function evaluateAgainstStubHost(expression: string): { received: string[]; value: unknown } {
  const received: string[] = [];
  const win = {
    [HOST_GLOBAL]: {
      call(raw: string) {
        received.push(raw);
        return 'HOST_OK';
      },
    },
  };

  const value = new Function('window', `return ${expression};`)(win) as unknown;
  return { received, value };
}

describe('buildCallExpression', () => {
  it('delivers the envelope to the host unchanged', () => {
    const { received, value } = evaluateAgainstStubHost(buildCallExpression('{"a":1}'));

    expect(received).toEqual(['{"a":1}']);
    expect(value).toBe('HOST_OK');
  });

  /**
   * This is exactly why the call is built in one place. User data contains
   * everything — quotes, apostrophes, newlines, backslashes, template
   * placeholders. The expression must stay syntactically valid, carry the data
   * through byte for byte, and execute nothing extra.
   */
  it('survives quotes, apostrophes, newlines and backslashes in the data', () => {
    const nasty = JSON.stringify({
      text: 'he said "hello"\nthen \'left\' \\ entirely `${alert(1)}`',
      path: 'C:\\Users\\Dima\\file.png',
    });

    const { received } = evaluateAgainstStubHost(buildCallExpression(nasty));

    expect(received).toEqual([nasty]);
  });

  it('yields null instead of throwing when the page has no host', () => {
    const expression = buildCallExpression('{}');
    const value = new Function('window', `return ${expression};`)({}) as unknown;

    expect(value).toBeNull();
  });
});

describe('createClient', () => {
  it('sends a well-formed envelope and returns the result', async () => {
    let sent = '';
    const client = createClient(
      bridgeReturning(JSON.stringify({ v: PROTOCOL_VERSION, id: 1, ok: true, result: status }), (raw) => {
        sent = raw;
      }),
    );

    await expect(client.call('session.status', {})).resolves.toEqual(status);

    const envelope = JSON.parse(sent) as Record<string, unknown>;
    expect(envelope['v']).toBe(PROTOCOL_VERSION);
    expect(envelope['cmd']).toBe('session.status');
    expect(envelope['params']).toEqual({});
    expect(typeof envelope['id']).toBe('number');
  });

  it('numbers requests upward so diagnostics can pair them', async () => {
    const ids: number[] = [];
    const client = createClient(
      bridgeReturning(JSON.stringify({ v: PROTOCOL_VERSION, id: 1, ok: true, result: status }), (raw) => {
        ids.push((JSON.parse(raw) as { id: number }).id);
      }),
    );

    await client.call('session.status', {});
    await client.call('session.status', {});

    expect(ids[1]).toBeGreaterThan(ids[0] as number);
  });

  it('turns a missing host into a clear error rather than a crash', async () => {
    const client = createClient(bridgeReturning(null));
    await expect(client.call('session.status', {})).rejects.toMatchObject({ code: 'no-host' });
  });

  it('passes through the error code reported by the page', async () => {
    const client = createClient(
      bridgeReturning(
        JSON.stringify({
          v: PROTOCOL_VERSION,
          id: 1,
          ok: false,
          error: { code: 'unknown-command', message: 'no such thing', detail: 'details' },
        }),
      ),
    );

    await expect(client.call('session.status', {})).rejects.toBeInstanceOf(ProtocolCallError);
    await expect(client.call('session.status', {})).rejects.toMatchObject({
      code: 'unknown-command',
      detail: 'details',
    });
  });

  it('turns a garbage response into a protocol error too', async () => {
    const client = createClient(bridgeReturning('not json'));
    await expect(client.call('session.status', {})).rejects.toMatchObject({ code: 'bad-envelope' });
  });
});
