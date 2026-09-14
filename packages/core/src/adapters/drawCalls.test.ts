import { describe, expect, it } from 'vitest';

import { counterFor, releaseCounter } from './drawCalls.js';

/**
 * A WebGL context, as v6, v7 and v8-on-WebGL all hang one off `renderer.gl`.
 *
 * The methods sit on a prototype, the way a real context's do — that is the
 * case the restore has to get right.
 */
function glContext(names = ['drawElements', 'drawArrays']) {
  const drawn: string[] = [];
  const prototype: Record<string, unknown> = {};
  for (const name of names) prototype[name] = () => drawn.push(name);

  return { gl: Object.create(prototype) as Record<string, () => void>, drawn };
}

function webGLRenderer(names?: string[]) {
  const { gl, drawn } = glContext(names);

  return { renderer: { gl }, gl, drawn };
}

/** WebGPU: an encoder system and no context to count at instead. */
function webGPURenderer() {
  const drawn: unknown[][] = [];

  return { renderer: { encoder: { draw: (...args: unknown[]) => void drawn.push(args) } }, drawn };
}

describe('counterFor', () => {
  it('counts submissions at the context', () => {
    const page = webGLRenderer();

    const counter = counterFor(page.renderer);
    expect(counter?.total()).toBe(0);

    page.gl['drawElements']?.();
    page.gl['drawArrays']?.();

    expect(counter?.total()).toBe(2);
    expect(page.drawn).toEqual(['drawElements', 'drawArrays']);
  });

  /**
   * The reason this counts at the context at all. Every layer above it is a
   * route to a draw, and which route a given scene takes differs by version, by
   * backend and by what is on screen — a counter on v8's `encoder.draw` never
   * saw a batched sprite, because the batcher goes straight past it.
   */
  it('counts a draw whatever PixiJS layer decided to make it', () => {
    const page = webGLRenderer();
    const counter = counterFor(page.renderer);

    // Standing in for the batcher, the graphics adaptor and the encoder: three
    // different callers, one submission each.
    page.gl['drawElements']?.();
    page.gl['drawElements']?.();
    page.gl['drawElements']?.();

    expect(counter?.total()).toBe(3);
  });

  it('counts instanced draws, which are their own entry points', () => {
    const page = webGLRenderer([
      'drawElements',
      'drawArrays',
      'drawElementsInstanced',
      'drawArraysInstanced',
    ]);
    const counter = counterFor(page.renderer);

    page.gl['drawElementsInstanced']?.();
    page.gl['drawArraysInstanced']?.();

    expect(counter?.total()).toBe(2);
  });

  it('counts at the encoder on WebGPU, where there is no context', () => {
    const page = webGPURenderer();
    const counter = counterFor(page.renderer);

    page.renderer.encoder.draw('a');

    expect(counter?.total()).toBe(1);
    expect(page.drawn).toEqual([['a']]);
  });

  it('prefers the context where a renderer has both', () => {
    // v8 on WebGL has an encoder system as well, and it ends up calling the
    // context — counting both would report every filter and mesh twice.
    const { gl } = glContext();
    const renderer = { gl, encoder: { draw: () => gl['drawElements']?.() } };

    const counter = counterFor(renderer);
    renderer.encoder.draw();

    expect(counter?.total()).toBe(1);
  });

  it('never resets, so two readers do not steal each other frames', () => {
    const page = webGLRenderer();
    const one = counterFor(page.renderer);
    const two = counterFor(page.renderer);

    page.gl['drawElements']?.();
    const afterFirst = { one: one?.total(), two: two?.total() };
    page.gl['drawElements']?.();

    expect(afterFirst).toEqual({ one: 1, two: 1 });
    expect(one?.total()).toBe(2);
    expect(two?.total()).toBe(2);
  });

  it('joins the wraps already on a renderer rather than doubling them', () => {
    const page = webGLRenderer();
    const counter = counterFor(page.renderer);
    counterFor(page.renderer);
    counterFor(page.renderer);

    page.gl['drawElements']?.();

    expect(counter?.total()).toBe(1);
  });

  /**
   * A lost and restored WebGL context is a new object. Without noticing that,
   * the wraps would still be on one nothing calls any more and the count would
   * go quiet without saying so.
   */
  it('moves to a context that has been replaced', () => {
    const first = glContext();
    const renderer: { gl: Record<string, () => void> } = { gl: first.gl };

    counterFor(renderer);

    const second = glContext();
    renderer.gl = second.gl;
    const counter = counterFor(renderer);

    second.gl['drawElements']?.();

    expect(counter?.total()).toBe(1);
    // And the context it left is exactly as it was found.
    expect(Object.prototype.hasOwnProperty.call(first.gl, 'drawElements')).toBe(false);
  });

  it('keeps the receiver, because a context method refuses any other', () => {
    const context = {
      calls: 0,
      drawElements(this: { calls: number }) {
        this.calls += 1;
      },
    };

    counterFor({ gl: context });
    context.drawElements();

    expect(context.calls).toBe(1);
  });

  it('hands back the return value untouched', () => {
    const gl = { drawElements: (n: number) => n * 2 };
    counterFor({ gl });

    expect(gl.drawElements(21)).toBe(42);
  });

  it('returns null for a renderer with no draw path to find', () => {
    expect(counterFor({ gl: {} })).toBeNull();
    expect(counterFor({ encoder: {} })).toBeNull();
    expect(counterFor({})).toBeNull();
    expect(counterFor(null)).toBeNull();
  });
});

describe('releaseCounter', () => {
  it('puts an inherited method back by removing the shadow', () => {
    const page = webGLRenderer();

    counterFor(page.renderer);
    expect(Object.prototype.hasOwnProperty.call(page.gl, 'drawElements')).toBe(true);

    releaseCounter(page.renderer);

    expect(Object.prototype.hasOwnProperty.call(page.gl, 'drawElements')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(page.gl, 'drawArrays')).toBe(false);
  });

  it('puts an own method back by value', () => {
    const gl = { drawElements: () => undefined };
    const original = gl.drawElements;

    counterFor({ gl });
    expect(gl.drawElements).not.toBe(original);

    releaseCounter({ gl });
    // A different renderer object, so nothing was released: the map is keyed by
    // the renderer, and this proves it rather than assuming it.
    expect(gl.drawElements).not.toBe(original);
  });

  it('lets a released renderer be counted again from zero', () => {
    const page = webGLRenderer();

    const first = counterFor(page.renderer);
    page.gl['drawElements']?.();
    expect(first?.total()).toBe(1);

    releaseCounter(page.renderer);
    const second = counterFor(page.renderer);
    expect(second?.total()).toBe(0);
  });

  it('says nothing about a renderer that was never counted', () => {
    expect(() => {
      releaseCounter({});
      releaseCounter(null);
    }).not.toThrow();
  });
});

describe('counter.release', () => {
  it('puts the draw functions back without being handed the renderer again', () => {
    const page = webGLRenderer();

    const counter = counterFor(page.renderer);
    expect(Object.prototype.hasOwnProperty.call(page.gl, 'drawElements')).toBe(true);

    counter?.release();

    expect(Object.prototype.hasOwnProperty.call(page.gl, 'drawElements')).toBe(false);
  });

  it('does nothing the second time, and nothing to a counter that replaced it', () => {
    const page = webGLRenderer();

    const first = counterFor(page.renderer);
    first?.release();

    // Counted again, by a wrap the stale handle knows nothing about. Releasing
    // it once more must not take that one off.
    const second = counterFor(page.renderer);
    first?.release();

    page.gl['drawElements']?.();
    expect(second?.total()).toBe(1);
  });
});
