import type { GradientFill } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { GradientSupport } from '../../adapters/types.js';
import { isGradientFill, readFill, writeFill } from './fill.js';

/**
 * A fill, which is a colour or a gradient.
 *
 * The two PixiJS lines agree on nothing here: one spreads a gradient over three
 * fields of the style, the other keeps an object. Both are faked, because both are
 * what this module exists to reconcile — and a fake is enough, since neither shape
 * is more than data plus, on the newer one, a method that rebuilds a texture.
 */

type Fake = Record<string, unknown>;

const LIST: GradientSupport = { shape: 'list' };

/** The newer line, on a page that hands its module over. */
function objectSupport(): { support: GradientSupport; made: Fake[] } {
  const made: Fake[] = [];

  return {
    support: {
      shape: 'object',
      make: () => {
        const fresh: Fake = { type: 'linear', colorStops: [], start: { x: 0, y: 0 }, end: { x: 0, y: 1 } };
        made.push(fresh);
        return fresh;
      },
    },
    made,
  };
}

/** The newer line, on a bundle that exposes neither its module nor a gradient. */
const NO_CLASS: GradientSupport = { shape: 'object', make: () => null };

/** A gradient object as the newer library keeps one. */
function gradientObject(over: Fake = {}): Fake {
  return {
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: '#ffec6c' },
      { offset: 1, color: '#c07e00' },
    ],
    ...over,
  };
}

/**
 * The style a gradient hangs off, with the one method that matters: its counter is
 * part of the key the rendered text is cached under, so moving the stops of a
 * gradient in place shows up only once it has been called.
 */
function styleWith(fill: unknown): Fake {
  const style: Fake = {
    fill,
    updates: 0,
    update() {
      style['updates'] = (style['updates'] as number) + 1;
    },
  };

  return style;
}

const gradient = (over: Partial<GradientFill> = {}): GradientFill => ({
  kind: 'gradient',
  direction: 'vertical',
  stops: [
    { color: '#000000', offset: 0.25 },
    { color: '#ffffff', offset: 0.75 },
  ],
  ...over,
});

describe('isGradientFill', () => {
  it('knows a gradient from the other things a value may be', () => {
    expect(isGradientFill(gradient())).toBe(true);
    expect(isGradientFill('#ffffff')).toBe(false);
    expect(isGradientFill(0xffffff)).toBe(false);
    // A point is an object too, which is why the mark is needed at all.
    expect(isGradientFill({ x: 1, y: 2 })).toBe(false);
    expect(isGradientFill(['#a', '#b'])).toBe(false);
    expect(isGradientFill(null)).toBe(false);
  });
});

describe('readFill', () => {
  it('passes a colour through, written either way', () => {
    expect(readFill({ style: { fill: '#e5d6cc' } }, 'style.fill')).toBe('#e5d6cc');
    expect(readFill({ style: { fill: 0xe5d6cc } }, 'style.fill')).toBe(0xe5d6cc);
  });

  it('reads a fill that is not there as absent, and one that is null as null', () => {
    expect(readFill({ style: {} }, 'style.fill')).toBeUndefined();
    expect(readFill({ style: { fill: null } }, 'style.fill')).toBeNull();
  });

  it('reads a path that leads nowhere as absent', () => {
    expect(readFill({}, 'style.fill')).toBeUndefined();
  });

  describe('the older shape, where a gradient is a list beside two fields', () => {
    it('reads the list as a gradient', () => {
      const value = readFill({ fill: ['#ffec6c', '#ffe641', '#c07e00'] }, 'fill');

      expect(isGradientFill(value) && value.stops.map((stop) => stop.color)).toEqual([
        '#ffec6c',
        '#ffe641',
        '#c07e00',
      ]);
    });

    /**
     * Not evenly, which is what one would guess, but where PixiJS 6 actually puts
     * them: `(i + 1) / (n + 1)`, so three colours sit at 0.25, 0.5 and 0.75. Read
     * as the library computes it so that a round trip changes nothing on screen.
     */
    it('fills in the offsets PixiJS would use when the style names none', () => {
      const value = readFill({ fill: ['#a', '#b', '#c'] }, 'fill');

      expect(isGradientFill(value) && value.stops.map((stop) => stop.offset)).toEqual([
        0.25, 0.5, 0.75,
      ]);
    });

    it('prefers the offsets the style does name', () => {
      const style = { fill: ['#a', '#b'], fillGradientStops: [0.1, 0.9] };
      const value = readFill(style, 'fill');

      expect(isGradientFill(value) && value.stops.map((stop) => stop.offset)).toEqual([0.1, 0.9]);
    });

    it('reads the direction off the flag beside the list', () => {
      expect(
        readFill({ fill: ['#a', '#b'], fillGradientType: 1 }, 'fill'),
      ).toMatchObject({ direction: 'horizontal' });
      expect(
        readFill({ fill: ['#a', '#b'], fillGradientType: 0 }, 'fill'),
      ).toMatchObject({ direction: 'vertical' });
      // Absent means the default, which is vertical.
      expect(readFill({ fill: ['#a', '#b'] }, 'fill')).toMatchObject({ direction: 'vertical' });
    });

    it('leaves out a list holding something that is not a colour', () => {
      expect(readFill({ fill: ['#a', { x: 1 }] }, 'fill')).toBeUndefined();
      expect(readFill({ fill: [] }, 'fill')).toBeUndefined();
    });
  });

  describe('the newer shape, where a gradient is an object', () => {
    it('reads its own stops', () => {
      const value = readFill({ style: { fill: gradientObject() } }, 'style.fill');

      expect(value).toMatchObject({
        kind: 'gradient',
        direction: 'vertical',
        stops: [
          { color: '#ffec6c', offset: 0 },
          { color: '#c07e00', offset: 1 },
        ],
      });
    });

    /** There is no flag here: a linear ramp says which way it runs by its ends. */
    it('reads the direction off the geometry', () => {
      const horizontal = gradientObject({ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } });
      expect(readFill({ fill: horizontal }, 'fill')).toMatchObject({ direction: 'horizontal' });

      const radial = gradientObject({ type: 'radial' });
      expect(readFill({ fill: radial }, 'fill')).toMatchObject({ direction: 'radial' });
    });

    it('leaves out a fill that is an object but not a gradient', () => {
      // A canvas gradient, a pattern, a texture — none can cross the bridge.
      expect(readFill({ fill: { addColorStop: () => {} } }, 'fill')).toBeUndefined();
    });

    /**
     * A gradient with no colours at all is what PixiJS's own v7 shim builds from a
     * style carrying a list of fill colours and an empty `fillGradientStops`: it
     * walks the stops to add the colours, so no stops means no colours. The library
     * draws that white to black, and saying so is what gives anyone a way out of it.
     */
    it('reports one with no stops as the ramp PixiJS draws for it', () => {
      const empty = gradientObject({ colorStops: [] });

      expect(readFill({ fill: empty }, 'fill')).toEqual({
        kind: 'gradient',
        direction: 'vertical',
        stops: [
          { color: '#ffffff', offset: 0 },
          { color: '#000000', offset: 1 },
        ],
      });
    });
  });

  /**
   * A style that was cloned reports its **converted** fill, because that is what
   * `TextStyle.clone()` passes to the copy and the setter keeps a proxy of it. Every
   * tag added from the panel on the newer class is such a copy, so without reading
   * this shape a new tag shows no fill row at all.
   */
  describe('the shape a cloned style reports', () => {
    it('finds the gradient one level down', () => {
      const converted = { color: 16777215, alpha: 1, fill: gradientObject() };

      expect(readFill({ fill: converted }, 'fill')).toMatchObject({
        kind: 'gradient',
        stops: [
          { color: '#ffec6c', offset: 0 },
          { color: '#c07e00', offset: 1 },
        ],
      });
    });

    it('finds the colour where there was no gradient', () => {
      const converted = { color: 15132390, alpha: 1, texture: {} };

      expect(readFill({ fill: converted }, 'fill')).toBe(15132390);
    });
  });
});

describe('writeFill', () => {
  it('writes a colour as it is', () => {
    const style: Fake = { fill: ['#a', '#b'] };

    expect(writeFill(style, 'fill', '#123456', LIST)).toBe(true);
    expect(style['fill']).toBe('#123456');
  });

  it('refuses a value that is neither a colour nor a gradient', () => {
    const style: Fake = { fill: '#ffffff' };

    expect(writeFill(style, 'fill', { x: 1, y: 2 }, LIST)).toBe(false);
    expect(style['fill']).toBe('#ffffff');
  });

  /** One colour is what the panel holds while a gradient is being started. */
  it('refuses a gradient of fewer than two stops', () => {
    const style: Fake = { fill: '#ffffff' };

    expect(
      writeFill(style, 'fill', gradient({ stops: [{ color: '#000000', offset: 0 }] }), LIST),
    ).toBe(false);
    expect(style['fill']).toBe('#ffffff');
  });

  it('writes a gradient onto the older shape as three fields', () => {
    const style: Fake = { fill: '#ffffff' };

    expect(writeFill(style, 'fill', gradient({ direction: 'horizontal' }), LIST)).toBe(true);
    expect(style['fill']).toEqual(['#000000', '#ffffff']);
    expect(style['fillGradientType']).toBe(1);
    expect(style['fillGradientStops']).toEqual([0.25, 0.75]);
  });

  it('edits a gradient already in the older shape', () => {
    const style: Fake = { fill: ['#a', '#b'], fillGradientType: 1, fillGradientStops: [0, 1] };

    expect(writeFill(style, 'fill', gradient(), LIST)).toBe(true);
    expect(style['fill']).toEqual(['#000000', '#ffffff']);
    expect(style['fillGradientType']).toBe(0);
  });

  /**
   * In place, and not by building a replacement: the object carries more than the
   * panel shows — the texture size, the space it is measured in, the geometry of a
   * radial one — and a replacement would drop all of it silently.
   */
  it('edits a gradient already in the newer shape in place', () => {
    const object = gradientObject({ textureSize: 512 });
    const style = styleWith(object);
    const { support } = objectSupport();

    expect(writeFill(style, 'fill', gradient(), support)).toBe(true);
    expect(style['fill']).toBe(object);
    expect(object['colorStops']).toEqual([
      { offset: 0.25, color: '#000000' },
      { offset: 0.75, color: '#ffffff' },
    ]);
    // Everything the panel does not show survives the edit.
    expect(object['textureSize']).toBe(512);
  });

  /** Moving the stops of an object nobody reassigned needs saying out loud. */
  it('asks the style for a redraw after editing in place', () => {
    const style = styleWith(gradientObject());
    const { support } = objectSupport();

    writeFill(style, 'fill', gradient(), support);

    expect(style['updates']).toBe(1);
  });

  it('rewrites the axis when the direction changes', () => {
    const object = gradientObject();
    const { support } = objectSupport();

    writeFill(styleWith(object), 'fill', gradient({ direction: 'horizontal' }), support);

    expect(object['end']).toEqual({ x: 1, y: 0 });
  });

  /** A radial gradient nobody redirected stays radial, geometry untouched. */
  it('leaves the geometry alone when the direction did not change', () => {
    const object = gradientObject({ type: 'radial', innerRadius: 5, outerRadius: 40 });
    const { support } = objectSupport();

    writeFill(styleWith(object), 'fill', gradient({ direction: 'radial' }), support);

    expect(object['type']).toBe('radial');
    expect(object['innerRadius']).toBe(5);
  });

  it('builds a gradient where there is none, on a page that offers the class', () => {
    const style: Fake = { fill: '#ffffff' };
    const { support, made } = objectSupport();

    expect(writeFill(style, 'fill', gradient(), support)).toBe(true);
    expect(made).toHaveLength(1);
    expect(style['fill']).toBe(made[0]);
    expect(made[0]?.['colorStops']).toHaveLength(2);
  });

  /**
   * The one thing a page can refuse. On the newer line a gradient has to be an
   * instance of a class, and a bundle exposing neither its module nor a gradient
   * to copy a constructor from cannot provide one — so nothing is written, and the
   * next poll shows the fill as it still is.
   */
  it('writes nothing where the page cannot make a gradient', () => {
    const style: Fake = { fill: '#ffffff' };

    expect(writeFill(style, 'fill', gradient(), NO_CLASS)).toBe(false);
    expect(style['fill']).toBe('#ffffff');
  });
});

/**
 * The shape the game this inspector is built for actually uses, and the one that
 * had the panel showing black over a gradient text twice over.
 *
 * Its own `TextStyle` takes a gradient as plain options under `fillGradient`,
 * builds the converted fill from them itself, and never puts the result where its
 * `fill` getter would report it — so that getter goes on answering whatever colour
 * was assigned before, which out of the defaults is `'black'`.
 */
describe('a style that keeps its gradient in options', () => {
/**
   * A stand-in for it, and it has to be a working one: the fault this class caused
   * lives in the **two guards** below, not in the shape of its data. The options
   * setter builds the gradient straight into the converted fill without the field
   * ever seeing it, and the field's setter — PixiJS's own — returns early when the
   * value has not changed. Between them a colour can be written and have no effect.
   */
  function gameStyle(over: Fake = {}): Fake {
    const style: Fake = { ...over };
    let assigned: unknown = over['fill'] ?? 'black';
    let options: unknown = { colorStops: [] };

    style['_fill'] = over['_fill'] ?? { color: 16777215, fill: gradientObject() };

    Object.defineProperty(style, 'fillGradient', {
      configurable: true,
      set(value: unknown) {
        options = value;
        style['options'] = value;
        // Only here does a gradient appear, and only in the converted half.
        if (value !== null) style['_fill'] = { color: 16777215, fill: gradientObject() };
      },
    });

    Object.defineProperty(style, 'fill', {
      configurable: true,
      enumerable: true,
      get: () => assigned,
      set(value: unknown) {
        // The class ignores a colour while the options stand.
        if (options !== null) return;
        // PixiJS ignores one that changes nothing.
        if (value === assigned) return;

        assigned = value;
        style['_fill'] = value === null ? null : { color: value };
      },
    });

    return style;
  }

  it('reads the gradient rather than the colour the field still reports', () => {
    expect(readFill(gameStyle(), 'fill')).toMatchObject({
      kind: 'gradient',
      stops: [
        { color: '#ffec6c', offset: 0 },
        { color: '#c07e00', offset: 1 },
      ],
    });
  });

  /** Where the two agree there is nothing to prefer, and the field wins. */
  it('leaves a plain colour alone when there is no gradient anywhere', () => {
    const style: Fake = { fill: '#123456', _fill: { color: 1193046 } };

    expect(readFill(style, 'fill')).toBe('#123456');
  });

  it('writes a gradient through the options, since `fill` would be ignored', () => {
    const style = gameStyle();

    expect(writeFill(style, 'fill', gradient({ direction: 'horizontal' }), NO_CLASS)).toBe(true);
    expect(style['options']).toMatchObject({
      type: 'linear',
      end: { x: 1, y: 0 },
      colorStops: [
        { offset: 0.25, color: '#000000' },
        { offset: 0.75, color: '#ffffff' },
      ],
    });
    // No class was needed: these are options, not an instance.
    expect(style['fill']).toBe('black');
  });

  /** What the panel does not show survives, the same as an in-place edit. */
  it('carries over what the built gradient knew and the panel does not show', () => {
    const style = gameStyle({
      _fill: { fill: gradientObject({ textureSpace: 'local', textureSize: 512 }) },
    });

    writeFill(style, 'fill', gradient(), NO_CLASS);

    expect(style['options']).toMatchObject({ textureSpace: 'local', textureSize: 512 });
  });

  /**
   * The other half of the same trap: while the options are set, the style's own
   * `fill` setter rebuilds the gradient from them and throws the colour away. So
   * going back to a colour means clearing them first.
   */
  it('clears the options before writing a colour back', () => {
    const style = gameStyle();

    expect(writeFill(style, 'fill', '#ffcc00', NO_CLASS)).toBe(true);
    expect(style['options']).toBeNull();
    expect(style['fill']).toBe('#ffcc00');
  });

  /**
   * And empties the field first, which took a second attempt at the same click to
   * notice. Going back to a colour lands the first time — the field still holds
   * the default — and does nothing the second, because by then the field already
   * holds exactly the colour being written, and PixiJS's setter returns early on a
   * value that has not changed. The gradient it never knew about stays drawn.
   */
  it('lands a colour the field already reports while the fill still draws a ramp', () => {
    const style = gameStyle();

    // There and back once: this is the pass that always worked.
    writeFill(style, 'fill', '#ffec6c', NO_CLASS);
    writeFill(style, 'fill', gradient(), NO_CLASS);
    expect((style['_fill'] as Fake)['fill']).toBeDefined();

    // And back again, with the field already saying `#ffec6c`.
    expect(writeFill(style, 'fill', '#ffec6c', NO_CLASS)).toBe(true);
    expect(style['fill']).toBe('#ffec6c');
    expect(style['_fill']).toEqual({ color: '#ffec6c' });
  });
});
