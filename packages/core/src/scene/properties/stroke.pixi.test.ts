// @vitest-environment happy-dom
import '../../adapters/canvasStub.js';

import * as v7 from 'pixi-v7';
import * as v8 from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { readStroke, strokeShapeOf, writeStroke } from './stroke.js';

/**
 * The stroke against the real `TextStyle`, on both lines.
 *
 * `stroke.test.ts` next door proves the reading is internally consistent — it is
 * written against the shapes this module believes in, by the same hand. This one
 * is what turns a change in either library into a red CI: every branch here
 * exists because a real `TextStyle` does something the shape alone does not say.
 *
 * v6 is left out on purpose. Its `TextStyle` is v7's in every respect this module
 * touches — `stroke` a colour, `strokeThickness` a number — and the line is
 * already covered where it differs.
 */

const PATH = 'style.stroke';

const node = (style: unknown): { style: unknown } => ({ style });

describe('a v7 TextStyle', () => {
  it('is the flat shape, and its defaults are an unstroked text', () => {
    const style = new v7.TextStyle({});

    // `stroke: 'black'`, `strokeThickness: 0` — a colour that means nothing until
    // there is a width. This is the group that used to draw three useless rows.
    expect(strokeShapeOf(node(style), PATH)).toBe('flat');
    expect(readStroke(node(style), PATH)).toBe(false);
  });

  it('reads a stroke it was given', () => {
    const style = new v7.TextStyle({ stroke: 'red', strokeThickness: 4 });

    expect(readStroke(node(style), PATH)).toBe(true);
  });

  /** The colour is normalised by the style itself, so it is compared to itself. */
  it('goes off and back on, keeping the colour it was given', () => {
    const style = new v7.TextStyle({ stroke: 'red', strokeThickness: 4 });
    const colour = style.stroke;

    writeStroke(node(style), PATH, false, 'flat');
    expect(readStroke(node(style), PATH)).toBe(false);
    expect(style.stroke).toBe(colour);

    writeStroke(node(style), PATH, true, 'flat');
    expect(readStroke(node(style), PATH)).toBe(true);
    expect(style.stroke).toBe(colour);
  });
});

describe('a v8 TextStyle', () => {
  it('has no stroke by default, and still says which question it is answering', () => {
    const style = new v8.TextStyle({});

    // Without this the whole Stroke group would vanish on an unstroked text, and
    // there would be nowhere to switch one on.
    expect(strokeShapeOf(node(style), PATH)).toBe('nested');
    expect(readStroke(node(style), PATH)).toBe(false);
  });

  it('grows a stroke where there was none', () => {
    const style = new v8.TextStyle({});

    expect(writeStroke(node(style), PATH, true, 'nested')).toBe(true);
    expect(readStroke(node(style), PATH)).toBe(true);
  });

  /**
   * `get stroke()` hands back what was assigned, so this style reports the string
   * `'red'` and no width at all — while drawing a stroke of the default width.
   * The truth is in the converted twin.
   */
  it('reads a stroke assigned as a bare colour', () => {
    const style = new v8.TextStyle({ stroke: 'red' });

    expect(style.stroke).toBe('red');
    expect(readStroke(node(style), PATH)).toBe(true);
  });

  it('keeps that colour when it is switched off', () => {
    const style = new v8.TextStyle({ stroke: 'red' });

    expect(writeStroke(node(style), PATH, false, 'nested')).toBe(true);
    expect(readStroke(node(style), PATH)).toBe(false);
    expect((style.stroke as { color?: unknown }).color).toBe('red');
  });

  /**
   * The style wraps an object stroke in a proxy whose every write asks it to
   * redraw. `styleKey` carries the counter that proxy moves, and the rendered
   * text is cached under it — so this is the assertion that the picture changes.
   */
  it('redraws itself when the width is written through it', () => {
    const style = new v8.TextStyle({ stroke: { color: 'red', width: 4 } });
    const before = style.styleKey;

    writeStroke(node(style), PATH, false, 'nested');

    expect(style.styleKey).not.toBe(before);
    expect(readStroke(node(style), PATH)).toBe(false);
  });

  /**
   * The library converts v7-shaped options into `stroke` and **does not delete**
   * `strokeThickness`, which the constructor then copies onto the instance. A
   * reader that trusted that leftover would call this style flat and write a
   * number nothing reads.
   */
  it('is not fooled by the strokeThickness left over from v7 options', () => {
    const style = new v8.TextStyle({ stroke: 'red', strokeThickness: 4 } as never);

    expect(strokeShapeOf(node(style), PATH)).toBe('nested');
    expect(readStroke(node(style), PATH)).toBe(true);

    writeStroke(node(style), PATH, false, 'nested');
    expect(readStroke(node(style), PATH)).toBe(false);
  });
});
