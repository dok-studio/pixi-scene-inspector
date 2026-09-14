import type { SessionStatus } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { ProtocolCallError } from '../transport/client.js';
import { screenFor } from './screen.js';

const status = (patch: Partial<SessionStatus> = {}): SessionStatus => ({
  connected: true,
  version: '8.14.0',
  major: 8,
  source: '__PIXI_APP__',
  inFrame: false,
  generation: 7,
  ...patch,
});

const noHost = new ProtocolCallError('no-host', 'The inspector is not installed on this page');

describe('screenFor', () => {
  it('waits while the first request is still in flight', () => {
    expect(screenFor({ data: null, error: null, loading: true })).toBe('connecting');
  });

  it('shows the application once the status says an application is there', () => {
    expect(screenFor({ data: status(), error: null, loading: false })).toBe('ready');
  });

  it('reports a page without an application', () => {
    expect(screenFor({ data: status({ connected: false, version: null, major: null }), error: null, loading: false })).toBe(
      'not-detected',
    );
  });

  it('reports a version outside the supported range', () => {
    expect(screenFor({ data: status({ version: '5.3.12', major: null }), error: null, loading: false })).toBe(
      'unsupported',
    );
  });

  it('asks for a reload when the page carries no host', () => {
    expect(screenFor({ data: null, error: noHost, loading: false })).toBe('no-host');
  });

  /**
   * The host disappearing under a panel that already had data is the case that
   * matters in the extension: the tab navigated to a page loaded before the
   * extension was enabled. Stale data would otherwise keep a dead scene on
   * screen, and it is a lie the moment `no-host` starts coming back.
   */
  it('asks for a reload even when it still holds data from before', () => {
    expect(screenFor({ data: status(), error: noHost, loading: false })).toBe('no-host');
  });

  /**
   * Any other failure is transient by nature — a page in the middle of a
   * navigation, a handler that threw once. The panel keeps showing what it has
   * and lets the error line say the rest.
   */
  it('keeps showing the application when a single request fails for another reason', () => {
    const error = new ProtocolCallError('internal', 'Handler for scene.tree failed');
    expect(screenFor({ data: status(), error, loading: false })).toBe('ready');
  });
});
