import type { Rect } from '@scene-inspector/protocol';

/**
 * Lining the overlay up with the canvas.
 *
 * Ported from the previous project's `_updateOverlay()`, pulled out of the DOM
 * so it can be held still in a test. The problem it solves: the overlay is a
 * plain div positioned over a canvas that may be scaled by CSS, offset anywhere
 * on the page, and drawing at a resolution of its own.
 *
 * It is done in two steps because the browser is involved between them — the
 * overlay is sized first, then measured, and the measurement is what the
 * transform is built from.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Transform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Step one: the overlay's own size, in CSS pixels.
 *
 * v6/v7 report renderer dimensions in device pixels; v8 reports CSS pixels and
 * its adapter answers 1, which is why this takes a resolution rather than a
 * version.
 */
export function overlaySize(rendererWidth: number, rendererHeight: number, resolution: number): Size {
  const divisor = resolution > 0 ? resolution : 1;
  return { width: rendererWidth / divisor, height: rendererHeight / divisor };
}

/**
 * Step two: what it takes to land that box exactly on the canvas.
 *
 * @param canvas the canvas as the page draws it.
 * @param overlay the overlay **with no transform applied** — the caller has to
 * clear it before measuring, or this would compound with itself every frame.
 */
export function overlayTransform(canvas: Rect, overlay: Rect): Transform {
  // Zero width happens: a hidden panel, a display:none canvas, a renderer that
  // has not been sized yet. A scale of 0/0 would write NaN into a style.
  const scaleX = overlay.width > 0 ? canvas.width / overlay.width : 1;
  const scaleY = overlay.height > 0 ? canvas.height / overlay.height : 1;

  return {
    translateX: canvas.x - overlay.x,
    translateY: canvas.y - overlay.y,
    scaleX,
    scaleY,
  };
}

/**
 * Half a CSS pixel: below this an overlay is on the canvas as far as anyone
 * looking at it is concerned, and moving it is not worth what the move costs.
 */
const TOLERANCE = 0.5;

/**
 * Step three, which is really step zero: is the work above still done?
 *
 * `overlayTransform` is built to turn the overlay's box into the canvas's box,
 * so the two rectangles agreeing is proof that last frame's answer is still the
 * right one — and it is proof of the thing that matters rather than of its
 * causes. Comparing the inputs instead (the renderer's size, the canvas's
 * position on the page) would miss every other way a div can be moved: a
 * scroll, a reflow around it, a page that restyled its own layout.
 *
 * @param overlay the overlay **with its transform applied** — the opposite of
 * what `overlayTransform` wants, and the reason the two are not called
 * together: this one asks whether that one has to run at all.
 */
export function overlayAligned(canvas: Rect, overlay: Rect): boolean {
  return (
    Math.abs(canvas.x - overlay.x) < TOLERANCE &&
    Math.abs(canvas.y - overlay.y) < TOLERANCE &&
    Math.abs(canvas.width - overlay.width) < TOLERANCE &&
    Math.abs(canvas.height - overlay.height) < TOLERANCE
  );
}
