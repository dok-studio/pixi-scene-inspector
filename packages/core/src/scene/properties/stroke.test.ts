import { describe, expect, it } from 'vitest';

import { readStroke, strokeShapeOf, writeStroke } from './stroke.js';

/**
 * A stroke, on plain objects.
 *
 * Plain objects because the question this module answers is about the *shape* of
 * a style rather than about a library: the same reading has to serve a node's
 * style, a tag of either MultiStyleText class, and a patch that is still empty.
 * What the real libraries do with what is written here is checked next door, in
 * `stroke.pixi.test.ts`.
 */

type Style = Record<string, unknown>;

const node = (style: Style): { style: Style } => ({ style });

const PATH = 'style.stroke';

describe('reading whether a text is stroked', () => {
  describe('the flat shape', () => {
    it('is stroked when the thickness is above zero', () => {
      expect(readStroke(node({ stroke: 'red', strokeThickness: 6 }), PATH)).toBe(true);
    });

    it('is not stroked at zero thickness, though the colour is still there', () => {
      expect(readStroke(node({ stroke: 'black', strokeThickness: 0 }), PATH)).toBe(false);
    });

    it('is recognised by the thickness alone', () => {
      expect(strokeShapeOf(node({ strokeThickness: 2 }), PATH)).toBe('flat');
    });
  });

  describe('the nested shape', () => {
    it('is stroked when the object says so', () => {
      expect(readStroke(node({ stroke: { color: 'red', width: 6 } }), PATH)).toBe(true);
    });

    it('is not stroked at zero width', () => {
      expect(readStroke(node({ stroke: { color: 'red', width: 0 } }), PATH)).toBe(false);
    });

    /** v8's default. The group has to exist, or there is nowhere to switch it on. */
    it('is not stroked, and still a stroke question, when the field is null', () => {
      expect(readStroke(node({ stroke: null }), PATH)).toBe(false);
      expect(strokeShapeOf(node({ stroke: null }), PATH)).toBe('nested');
    });

    /**
     * `get stroke()` on v8 hands back what was assigned, so a style built with a
     * colour reports the colour and no width at all. The width is in the
     * converted twin, and the text is drawn stroked.
     */
    it('is stroked when only the converted twin knows the width', () => {
      const style = { stroke: 'red', _stroke: { color: 'red', width: 1 } };
      expect(readStroke(node(style), PATH)).toBe(true);
    });

    it('is not stroked when the twin says zero', () => {
      const style = { stroke: 'red', _stroke: { color: 'red', width: 0 } };
      expect(readStroke(node(style), PATH)).toBe(false);
    });
  });

  /**
   * The order of the tests inside the reader, locked down.
   *
   * A v8 style built from v7-shaped options carries a leftover `strokeThickness`:
   * the conversion reads it into `stroke` and does not delete it. Asking about
   * the thickness first would take such a style for a v6/v7 one.
   */
  it('lets an object stroke beat a strokeThickness sitting beside it', () => {
    const style = { stroke: { color: 'red', width: 4 }, strokeThickness: 4 };

    expect(strokeShapeOf(node(style), PATH)).toBe('nested');
    expect(readStroke(node(style), PATH)).toBe(true);
  });

  describe('a style with no such thing', () => {
    it('answers nothing at all, so no row is drawn', () => {
      expect(readStroke(node({ fontSize: 12 }), PATH)).toBeUndefined();
      expect(strokeShapeOf(node({ fontSize: 12 }), PATH)).toBeNull();
    });

    it('answers nothing for a path that leads nowhere', () => {
      expect(readStroke({}, PATH)).toBeUndefined();
    });
  });
});

describe('switching a stroke', () => {
  it('switches the flat shape off by the thickness, keeping colour and join', () => {
    const target = node({ stroke: 'red', strokeThickness: 6, lineJoin: 'bevel' });

    expect(writeStroke(target, PATH, false, 'flat')).toBe(true);
    expect(target.style).toEqual({ stroke: 'red', strokeThickness: 0, lineJoin: 'bevel' });
    expect(readStroke(target, PATH)).toBe(false);
  });

  it('switches the flat shape back on at a visible width', () => {
    const target = node({ stroke: 'red', strokeThickness: 0 });

    expect(writeStroke(target, PATH, true, 'flat')).toBe(true);
    expect(readStroke(target, PATH)).toBe(true);
  });

  it('edits a nested stroke in place, so nothing the panel never showed is lost', () => {
    const stroke = { color: 'red', width: 6, join: 'bevel', miterLimit: 8 };
    const target = node({ stroke });

    expect(writeStroke(target, PATH, false, 'nested')).toBe(true);
    expect(target.style['stroke']).toBe(stroke);
    expect(stroke).toEqual({ color: 'red', width: 0, join: 'bevel', miterLimit: 8 });
  });

  it('builds a stroke where the field is null, since there is nothing to edit', () => {
    const target = node({ stroke: null });

    expect(writeStroke(target, PATH, true, 'nested')).toBe(true);
    expect(target.style['stroke']).toEqual({ width: 1 });
  });

  /** The colour is what is on screen, so it goes into the object being built. */
  it('carries a scalar colour into the object it has to build', () => {
    const target = node({ stroke: 'red' });

    expect(writeStroke(target, PATH, false, 'nested')).toBe(true);
    expect(target.style['stroke']).toEqual({ color: 'red', width: 0 });
  });

  it('refuses to switch off a stroke that is not there', () => {
    const target = node({ stroke: null });

    expect(writeStroke(target, PATH, false, 'nested')).toBe(false);
    expect(target.style['stroke']).toBeNull();
  });

  /**
   * The tag case: a patch of the older class starts empty and carries no marks,
   * which is why the shape is a parameter rather than something concluded.
   */
  it('writes into an empty patch when it is told which shape', () => {
    const flat: Record<string, unknown> = {};
    expect(writeStroke(flat, 'stroke', true, 'flat')).toBe(true);
    expect(flat).toEqual({ strokeThickness: 1 });

    const nested: Record<string, unknown> = {};
    expect(writeStroke(nested, 'stroke', true, 'nested')).toBe(true);
    expect(nested).toEqual({ stroke: { width: 1 } });
  });

  it('writes nothing where the path leads nowhere', () => {
    expect(writeStroke({}, PATH, true, 'nested')).toBe(false);
  });
});
