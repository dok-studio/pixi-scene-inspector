// @vitest-environment happy-dom
import './canvasStub.js';

import * as v6 from 'pixi-v6';
import * as v7 from 'pixi-v7';
import * as v8 from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { counterFor, releaseCounter } from './drawCalls.js';

/**
 * The draw path, checked against the real libraries.
 *
 * A renderer cannot be stood up here — it wants a WebGL context, the same wall
 * `adapters.pixi.test.ts` and `version.pixi.test.ts` describe. What can be
 * checked is the claim the counter rests on: that every supported line puts its
 * context on `renderer.gl`, and that PixiJS's own layers end up calling the
 * context rather than each other.
 *
 * This matters more here than for most heuristics. A draw path that moved would
 * not throw and would not look broken — the Stats tab would simply report zero
 * draw calls for ever, which is exactly what happened while the counter was
 * hooked to a PixiJS system instead of to the context.
 */

type Klass = { prototype: object };

const classOf = (module: unknown, name: string): Klass =>
  (module as Record<string, unknown>)[name] as Klass;

/** The body of a shipped method, read rather than remembered. */
const bodyOf = (klass: Klass, method: string): string =>
  String((klass.prototype as Record<string, unknown>)[method]);

describe('the draw path on the real PixiJS', () => {
  /**
   * The one fact the whole counter rests on. Each line sets it from its own
   * context system, and if any of them stops, this is where it shows.
   */
  it('every line hands its context to `renderer.gl`', () => {
    for (const [name, context] of [
      ['v6', classOf(v6, 'ContextSystem')],
      ['v7', classOf(v7, 'ContextSystem')],
      ['v8', classOf(v8, 'GlContextSystem')],
    ] as const) {
      expect(context, name).toBeDefined();
      expect(bodyOf(context, 'initFromContext'), name).toContain('.gl = ');
    }
  });

  /**
   * Why the count is taken underneath PixiJS rather than inside it: the batcher
   * goes straight to the geometry system, so a counter on the encoder — the
   * level a submission looks like it is decided at — never saw a batched
   * sprite, which is most of an ordinary scene.
   */
  it('v8 batches past the encoder, which is why neither is the place to count', () => {
    const execute = bodyOf(classOf(v8, 'GlBatchAdaptor'), 'execute');

    expect(execute).toContain('geometry.draw(');
    expect(execute).not.toContain('encoder.draw(');
  });

  it('WebGPU has no context, so its encoder is still the place to count', () => {
    const encoder = classOf(v8, 'GpuEncoderSystem');

    expect(typeof (encoder.prototype as { draw?: unknown }).draw).toBe('function');
    // Found by the name it registers under, not by its class.
    expect((encoder as unknown as { extension: { name: string } }).extension.name).toBe('encoder');
  });

  /**
   * Wrapping a context whose methods are inherited, which is what a real one
   * is: the wrap has to come off by deleting the shadow rather than by
   * assigning the original back, or the object is no longer the one the
   * application handed over.
   */
  it('leaves a context exactly as it found it', () => {
    const prototype = {
      drawElements: () => undefined,
      drawArrays: () => undefined,
    };
    const gl = Object.create(prototype) as Record<string, unknown>;
    const renderer = { gl };

    expect(counterFor(renderer)).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(gl, 'drawElements')).toBe(true);

    releaseCounter(renderer);

    expect(Object.prototype.hasOwnProperty.call(gl, 'drawElements')).toBe(false);
    expect(gl['drawElements']).toBe(prototype.drawElements);
  });

  it('the installed libraries really are v6, v7 and v8', () => {
    expect(v6.VERSION.startsWith('6.')).toBe(true);
    expect(v7.VERSION.startsWith('7.')).toBe(true);
    expect(v8.VERSION.startsWith('8.')).toBe(true);
  });
});
