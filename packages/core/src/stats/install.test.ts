import type { CommandName, RequestEnvelope, ResponseEnvelope } from '@scene-inspector/protocol';
import { HOST_GLOBAL, PROTOCOL_VERSION } from '@scene-inspector/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { install } from '../index.js';
import { resetStats, setStatsClock, statsArmed } from './frame.js';

/**
 * The Stats commands end to end: a serialized envelope in, a serialized
 * envelope out, over a page that renders when told to.
 *
 * What this covers that the unit tests do not is the wiring — that polling
 * `stats.frame` is what puts the proxy on `renderer.render` and that letting
 * the polls stop takes it off again, on the real `install` path rather than on
 * a hand-made session. That is rule 5, and it is the one claim about this
 * feature worth proving through the front door.
 */

type Fake = Record<string, unknown>;

function sprite(label: string): Fake {
  return { renderPipeId: 'sprite', label, children: [], visible: true };
}

function container(label: string, children: Fake[]): Fake {
  return {
    includeInBuild: true,
    measurable: true,
    _didLocalTransformChangeId: 0,
    label,
    children,
    visible: true,
  };
}

function pixiPage() {
  const stage = container('', [container('world', [sprite('hero')])]);

  // Shaped like a real one: the context is where a submission is counted, and
  // `renderPipes` is the marker that says this is a v8 renderer.
  const gl = { drawElements: () => undefined };
  const renderer: Fake = {
    renderPipes: {},
    gl,
    texture: { managedTextures: [] },
    render: () => undefined,
  };

  const page: Fake = { __PIXI_APP__: { stage, renderer } };

  return {
    page,
    renderer,
    /** One frame, with however many draw submissions it made. */
    render(draws = 0) {
      for (let at = 0; at < draws; at += 1) gl.drawElements();
      (renderer['render'] as () => void)();
    },
    /** Whether the application's own render function is still its own. */
    get proxied() {
      return renderer['render'] !== original;
    },
  };
}

let original: unknown;
let nextId = 1;
let now = 0;

function call<K extends CommandName>(
  page: Fake,
  cmd: K,
  params: RequestEnvelope<K>['params'],
): ResponseEnvelope<K> {
  const host = page[HOST_GLOBAL] as { call(raw: string): string };
  const envelope: RequestEnvelope<K> = { v: PROTOCOL_VERSION, id: nextId++, cmd, params };

  return JSON.parse(host.call(JSON.stringify(envelope))) as ResponseEnvelope<K>;
}

function resultOf<K extends CommandName>(
  page: Fake,
  cmd: K,
  params: RequestEnvelope<K>['params'],
) {
  const response = call(page, cmd, params);
  if (!response.ok) throw new Error(response.error.message);

  return response.result;
}

beforeEach(() => {
  now = 0;
  setStatsClock(() => now);
  resetStats();
});

afterEach(() => {
  resetStats();
  setStatsClock(() => performance.now());
});

describe('stats over the host', () => {
  it('puts the render hook on only once the frames are asked for', () => {
    const page = pixiPage();
    install(page.page);
    original = page.renderer['render'];

    expect(page.proxied).toBe(false);
    expect(statsArmed()).toBe(false);

    resultOf(page.page, 'stats.frame', {});

    expect(page.proxied).toBe(true);
  });

  it('takes it off again once nothing is asking', () => {
    const page = pixiPage();
    install(page.page);
    original = page.renderer['render'];

    resultOf(page.page, 'stats.frame', {});
    expect(page.proxied).toBe(true);

    // Frames keep coming; the panel has gone.
    now = 3_000;
    page.render();

    expect(statsArmed()).toBe(false);
    expect(page.proxied).toBe(false);
  });

  it('counts frames and draws through the whole path', () => {
    const page = pixiPage();
    install(page.page);
    resultOf(page.page, 'stats.frame', {});

    for (let at = 1; at <= 10; at += 1) {
      now = at * 16;
      page.render(12);
    }

    const frame = resultOf(page.page, 'stats.frame', {});

    expect(frame).toEqual(
      expect.objectContaining({ frames: 10, drawCalls: 12, fps: 62.5, frameMs: 16 }),
    );
  });

  it('answers null on a page with nothing attached, and hooks nothing', () => {
    const page: Fake = {};
    install(page);

    expect(resultOf(page, 'stats.frame', {})).toBeNull();
    expect(resultOf(page, 'stats.textures', {})).toBeNull();
    expect(statsArmed()).toBe(false);
  });

  it('records across the whole path, and stops on request', () => {
    const page = pixiPage();
    install(page.page);
    original = page.renderer['render'];

    resultOf(page.page, 'stats.setRecording', { keepMs: 300_000 });

    for (let at = 1; at <= 20; at += 1) {
      now = at * 50;
      page.render(3);
    }

    const record = resultOf(page.page, 'stats.record', { since: 0 });
    expect(record).not.toBeNull();
    expect(record?.recording).toBe(true);
    expect(record?.samples.length).toBeGreaterThan(0);
    expect(record?.fields).toContain('drawCalls');
    // Nobody is polling the live figures, and the hook is still on: that is the
    // whole point of recording being armed on its own.
    expect(page.proxied).toBe(true);

    resultOf(page.page, 'stats.setRecording', { keepMs: 0 });

    expect(resultOf(page.page, 'stats.record', { since: 0 })).toBeNull();
    expect(page.proxied).toBe(false);
  });

  it('drains by cursor without repeating what it already handed over', () => {
    const page = pixiPage();
    install(page.page);
    resultOf(page.page, 'stats.setRecording', { keepMs: 300_000 });

    now = 200;
    page.render(1);
    const first = resultOf(page.page, 'stats.record', { since: 0 });

    now = 400;
    page.render(1);
    const second = resultOf(page.page, 'stats.record', { since: first?.cursor ?? 0 });

    expect(first?.samples.length).toBe(1);
    expect(second?.samples.length).toBe(1);
    expect(second?.dropped).toBe(0);
  });

  it('reports texture memory through the host', () => {
    const page = pixiPage();
    install(page.page);

    expect(resultOf(page.page, 'stats.textures', {})).toEqual({
      count: 0,
      onGpu: 0,
      gpuBytes: 0,
    });
  });
});
