/**
 * A minimal 2D canvas context, for the tests that import the real PixiJS.
 *
 * happy-dom provides a DOM but no canvas rendering context, and PixiJS 6.3.0
 * builds `Texture.WHITE` at import time: it creates a 16×16 canvas, fills it,
 * and wraps the result. Without a context that import throws, and the whole
 * test file fails before a single assertion runs. (6.5 later made it lazy — the
 * inspector supports both, so the tests have to cope with the eager one.)
 *
 * Only what that path touches is implemented, and nothing here is ever asserted
 * on: the subject of those tests is what PixiJS puts **on its own objects**, not
 * what it draws. A fuller canvas mock would be a bigger lie, not a smaller one.
 *
 * Imported for its side effect, and it has to come before any `pixi-*` import —
 * ES modules evaluate in the order they are declared, so import order is the
 * mechanism here.
 */

const noop = (): void => {};

function createContext2D(): unknown {
  return {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    fillRect: noop,
    clearRect: noop,
    drawImage: noop,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop,
  };
}

const prototype = (globalThis as { HTMLCanvasElement?: { prototype: object } }).HTMLCanvasElement?.prototype;

if (prototype !== undefined) {
  (prototype as { getContext: (type: string) => unknown }).getContext = (type) =>
    type === '2d' ? createContext2D() : null;
}
