import { describe, expect, it } from 'vitest';

import { overlayAligned, overlaySize, overlayTransform } from './geometry.js';

/**
 * Lining the overlay up with the canvas.
 *
 * Ported from the previous project, where it lived inside a DOM method and
 * could only be checked by looking at it. The arithmetic is the whole of the
 * problem: the overlay is a plain div over a canvas that may be scaled by CSS,
 * offset on the page, and drawing at a resolution of its own.
 */

describe('overlaySize', () => {
  /**
   * v6/v7 report renderer dimensions in device pixels, so they have to be
   * divided back down; v8 already reports CSS pixels and its adapter says the
   * resolution is 1.
   */
  it('divides the renderer size by the resolution', () => {
    expect(overlaySize(1600, 1200, 2)).toEqual({ width: 800, height: 600 });
  });

  it('leaves the size alone at a resolution of 1', () => {
    expect(overlaySize(800, 600, 1)).toEqual({ width: 800, height: 600 });
  });

  /** A renderer that has not been sized yet must not produce a division by zero. */
  it('treats a resolution of zero as 1', () => {
    expect(overlaySize(800, 600, 0)).toEqual({ width: 800, height: 600 });
  });
});

describe('overlayTransform', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

  it('is identity when the overlay already sits on the canvas', () => {
    expect(overlayTransform(rect(0, 0, 800, 600), rect(0, 0, 800, 600))).toEqual({
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('moves the overlay onto the canvas', () => {
    const layout = overlayTransform(rect(120, 40, 800, 600), rect(0, 0, 800, 600));

    expect(layout.translateX).toBe(120);
    expect(layout.translateY).toBe(40);
  });

  /** A canvas stretched by CSS: the overlay has to stretch with it. */
  it('scales the overlay to the canvas as the page draws it', () => {
    const layout = overlayTransform(rect(0, 0, 400, 150), rect(0, 0, 800, 600));

    expect(layout.scaleX).toBe(0.5);
    expect(layout.scaleY).toBe(0.25);
  });

  it('handles being moved and scaled at once', () => {
    expect(overlayTransform(rect(10, 20, 400, 300), rect(0, 0, 800, 600))).toEqual({
      translateX: 10,
      translateY: 20,
      scaleX: 0.5,
      scaleY: 0.5,
    });
  });

  /**
   * A hidden panel, a display:none canvas, a renderer with no size yet — all of
   * them measure zero, and a scale of 0/0 would put NaN into a style property.
   */
  it('falls back to a scale of 1 when there is nothing to measure', () => {
    const layout = overlayTransform(rect(0, 0, 0, 0), rect(0, 0, 0, 0));

    expect(layout.scaleX).toBe(1);
    expect(layout.scaleY).toBe(1);
  });
});

describe('overlayAligned', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

  it('holds when the overlay is already lying on the canvas', () => {
    expect(overlayAligned(rect(10, 20, 400, 300), rect(10, 20, 400, 300))).toBe(true);
  });

  /**
   * What `overlayTransform` produces is a float, and the browser measures in
   * floats of its own. A fraction of a pixel is not a misalignment, and
   * treating it as one would put the expensive path back on every frame.
   */
  it('ignores a subpixel difference', () => {
    expect(overlayAligned(rect(10, 20, 400, 300), rect(10.2, 19.8, 400.1, 299.9))).toBe(true);
  });

  it('fails when the canvas has moved', () => {
    expect(overlayAligned(rect(40, 20, 400, 300), rect(10, 20, 400, 300))).toBe(false);
    expect(overlayAligned(rect(10, 50, 400, 300), rect(10, 20, 400, 300))).toBe(false);
  });

  it('fails when the canvas has been resized', () => {
    expect(overlayAligned(rect(10, 20, 600, 300), rect(10, 20, 400, 300))).toBe(false);
    expect(overlayAligned(rect(10, 20, 400, 450), rect(10, 20, 400, 300))).toBe(false);
  });

  /** A whole pixel is a real move, and a highlight one pixel off is visible. */
  it('fails on a difference of a pixel', () => {
    expect(overlayAligned(rect(10, 20, 400, 300), rect(11, 20, 400, 300))).toBe(false);
  });
});
