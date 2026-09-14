import type { ResponseEnvelope, SessionStatus } from '@scene-inspector/protocol';
import { HOST_GLOBAL, PROTOCOL_VERSION } from '@scene-inspector/protocol';
import { describe, expect, it, vi } from 'vitest';

import { createHost, installHost } from './host.js';

const status: SessionStatus = {
  connected: true,
  version: '8.14.0',
  major: 8,
  source: '__PIXI_APP__',
  inFrame: false,
  generation: 7,
};

function request(cmd: string, params: unknown, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, id: 7, cmd, params, ...overrides });
}

function parse(raw: string): ResponseEnvelope {
  return JSON.parse(raw) as ResponseEnvelope;
}

describe('createHost', () => {
  it('runs a known command and returns its result', () => {
    const host = createHost({ 'session.status': () => status });
    const response = parse(host.call(request('session.status', {})));

    expect(response.ok).toBe(true);
    expect(response.id).toBe(7);
    if (response.ok) expect(response.result).toEqual(status);
  });

  it('turns invalid JSON into an error envelope rather than an exception', () => {
    const host = createHost({});

    expect(() => host.call('{ not json')).not.toThrow();
    const response = parse(host.call('{ not json'));
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('bad-envelope');
  });

  /**
   * Version skew is a real scenario: the extension updated while a tab still
   * holds the previously injected script. A clear error beats guessing at a
   * foreign envelope.
   */
  it('rejects a foreign protocol version', () => {
    const host = createHost({ 'session.status': () => status });
    const response = parse(host.call(request('session.status', {}, { v: PROTOCOL_VERSION + 1 })));

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('bad-envelope');
  });

  it('rejects an unknown command', () => {
    const host = createHost({ 'session.status': () => status });
    const response = parse(host.call(request('scene.tree', {})));

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('unknown-command');
  });

  it('rejects a known command that has no handler', () => {
    const host = createHost({});
    const response = parse(host.call(request('session.status', {})));

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('unknown-command');
  });

  it('rejects parameters that are not an object', () => {
    const host = createHost({ 'session.status': () => status });

    for (const params of [null, 'x', 42]) {
      const response = parse(host.call(request('session.status', params)));
      expect(response.ok).toBe(false);
      if (!response.ok) expect(response.error.code).toBe('bad-params');
    }
  });

  /**
   * The defining property of the host: it lives inside someone else's page, so
   * an exception escaping from here would either corrupt the eval response or
   * surface in that application's console.
   */
  it('does not let an exception from a handler escape', () => {
    const host = createHost({
      'session.status': () => {
        throw new Error('something went wrong');
      },
    });

    expect(() => host.call(request('session.status', {}))).not.toThrow();
    const response = parse(host.call(request('session.status', {})));
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.code).toBe('internal');
      expect(response.error.detail).toContain('something went wrong');
    }
  });

  it('turns an unserializable result into an error, not a broken string', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    const host = createHost({
      'session.status': () => cyclic as unknown as SessionStatus,
    });

    const response = parse(host.call(request('session.status', {})));
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('internal');
  });

  it('echoes the request id back, including on errors', () => {
    const host = createHost({});
    const response = parse(host.call(request('session.status', {}, { id: 42 })));

    expect(response.id).toBe(42);
  });
});

describe('installHost', () => {
  it('installs the host on the given global', () => {
    const target: Record<string, unknown> = {};
    const handler = vi.fn(() => status);

    installHost(target, { 'session.status': handler });

    const host = target[HOST_GLOBAL] as { call(raw: string): string };
    expect(typeof host.call).toBe('function');

    const response = parse(host.call(request('session.status', {})));
    expect(response.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
