import type { PropertyDescriptor } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { fieldSnippet, objectSnippet, snippetName } from './objectSnippet.js';

const FIELDS: PropertyDescriptor[] = [
  { key: 'position', label: 'Position', editor: 'vector2' },
  { key: 'scale', label: 'Scale', editor: 'vector2' },
  { key: 'rotation', label: 'Rotation', editor: 'number' },
  { key: 'anchor', label: 'Anchor', editor: 'vector2' },
  { key: 'alpha', label: 'Alpha', editor: 'range' },
  { key: 'zIndex', label: 'Z Index', editor: 'number' },
];

/** A descriptor for a key, since printing now depends on how it is edited. */
const of = (key: string, editor: PropertyDescriptor['editor'] = 'number'): PropertyDescriptor => ({
  key,
  label: key,
  editor,
});

describe('fieldSnippet', () => {
  it('writes a point over lines, the way a style is written', () => {
    expect(fieldSnippet(of('position', 'vector2'), { x: 12, y: -4 })).toBe(
      'position: {\n    x: 12,\n    y: -4\n}',
    );
  });

  it('rounds a number to what the row itself shows', () => {
    expect(fieldSnippet(of('rotation'), 1.5707963267948966)).toBe('rotation: 1.571');
  });

  it('drops the trailing zeros a rounded number would end in', () => {
    expect(fieldSnippet(of('alpha', 'range'), 0.30000000000000004)).toBe('alpha: 0.3');
  });

  it('writes a switch as the boolean it is', () => {
    expect(fieldSnippet(of('visible', 'boolean'), false)).toBe('visible: false');
  });

  it('quotes a string, and escapes it as source', () => {
    expect(fieldSnippet(of('label', 'text'), 'hero "one"')).toBe('label: "hero \\"one\\""');
  });

  it('writes the even scale as the two axes it actually sets', () => {
    expect(fieldSnippet(of('scaleXY'), 2)).toBe('scale: {\n    x: 2,\n    y: 2\n}');
  });

  it('indents a point under whatever it is being written inside', () => {
    expect(fieldSnippet(of('anchor', 'vector2'), { x: 0.5, y: 0.5 }, '    ')).toBe(
      'anchor: {\n        x: 0.5,\n        y: 0.5\n    }',
    );
  });

  it('has nothing to write for a field the node does not carry', () => {
    expect(fieldSnippet(of('anchor', 'vector2'), undefined)).toBeNull();
    expect(fieldSnippet(of('anchor', 'vector2'), null)).toBeNull();
  });

  it('has nothing to write for a number that is not one', () => {
    expect(fieldSnippet(of('rotation'), Number.NaN)).toBeNull();
    expect(fieldSnippet(of('position', 'vector2'), { x: 0, y: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('fieldSnippet, on the fields of a style', () => {
  /**
   * The keys are paths into the node; what is written is the property inside
   * the object it belongs to, which is the last step of the path.
   */
  it('writes a nested key under the name the style holds it by', () => {
    expect(fieldSnippet(of('style.fontSize'), 28)).toBe('fontSize: 28');
    expect(fieldSnippet(of('style.dropShadow.blur'), 3)).toBe('blur: 3');
    expect(fieldSnippet(of('style.dropShadowBlur'), 3)).toBe('dropShadowBlur: 3');
  });

  /** v8 keeps a converted style, and six-digit decimals are a dump. */
  it('writes a colour as a colour, not as the number it was converted to', () => {
    expect(fieldSnippet(of('style.stroke.color', 'color'), 4465677)).toBe('color: "#44240d"');
  });

  it('drops the opaque alpha v8 writes a colour back with', () => {
    expect(fieldSnippet(of('style.fill', 'fill'), '#8ecaffff')).toBe('fill: "#8ecaff"');
  });

  /**
   * A gradient is three fields on one PixiJS line and an options object on the
   * other, so the page writes it out and the row takes it whole — names and all,
   * since on v6/v7 the names are three.
   */
  it('takes a gradient as the page spelled it', () => {
    const gradient = {
      kind: 'gradient',
      direction: 'vertical',
      stops: [{ offset: 0, color: '#8ecaff' }],
      source: [
        'fill: [',
        '    "#8ecaff"',
        '],',
        'fillGradientStops: [',
        '    0',
        ']',
      ].join('\n'),
    };

    expect(fieldSnippet(of('style.fill', 'fill'), gradient)).toBe(gradient.source);
  });

  /**
   * A tag's style is read without an adapter (§3.5.1), so nothing there can say
   * which spelling the page wants — and a row that cannot be written is a row
   * that does not offer to be copied.
   */
  it('has nothing to write for a gradient the page did not spell', () => {
    const gradient = { kind: 'gradient', direction: 'vertical', stops: [{ offset: 0, color: 1 }] };

    expect(fieldSnippet(of('style.fill', 'fill'), gradient)).toBeNull();
  });

  /**
   * PixiJS has no flag for a stroke: the panel concludes it from the width, so
   * a game reading `strokeEnabled` would be reading a key nobody wrote.
   */
  it('has nothing to write for the synthetic stroke switch', () => {
    expect(fieldSnippet(of('style.strokeEnabled', 'boolean'), true)).toBeNull();
  });

  it('writes the shadow switch, which both lines do take', () => {
    expect(fieldSnippet(of('style.dropShadow', 'boolean'), true)).toBe('dropShadow: true');
  });

  it('quotes what a select holds, since it is a string in the style too', () => {
    expect(fieldSnippet(of('style.align', 'select'), 'center')).toBe('align: "center"');
  });
});

describe('objectSnippet', () => {
  it('writes the fields in the order they are declared in', () => {
    const text = objectSnippet('heroSprite', FIELDS, {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 1.5707963267948966,
      anchor: { x: 0.5, y: 0.5 },
      alpha: 0.3,
      zIndex: 3,
    });

    expect(text).toBe(
      [
        'heroSprite: {',
        '    position: {',
        '        x: 0,',
        '        y: 0',
        '    },',
        '    scale: {',
        '        x: 1,',
        '        y: 1',
        '    },',
        '    rotation: 1.571,',
        '    anchor: {',
        '        x: 0.5,',
        '        y: 0.5',
        '    },',
        '    alpha: 0.3,',
        '    zIndex: 3',
        '}',
      ].join('\n'),
    );
  });

  it('leaves out a zero zIndex, which is a line pasted to no effect', () => {
    const text = objectSnippet('box', FIELDS, { position: { x: 1, y: 2 }, zIndex: 0 });

    expect(text).toBe('box: {\n    position: {\n        x: 1,\n        y: 2\n    }\n}');
  });

  it('leaves out a field the node does not carry', () => {
    const text = objectSnippet('box', FIELDS, { alpha: 1, anchor: null });

    expect(text).toBe('box: {\n    alpha: 1\n}');
  });

  it('has nothing to draw before any value has arrived', () => {
    expect(objectSnippet('box', FIELDS, null)).toBe('');
  });
});

describe('snippetName', () => {
  it('names the object after the node', () => {
    expect(snippetName('heroSprite', 'Sprite')).toBe('heroSprite');
  });

  it('falls back to the type, as the tree does for an unnamed node', () => {
    expect(snippetName('', 'Sprite')).toBe('Sprite');
  });

  it('quotes a name that is not a name a variable could have', () => {
    expect(snippetName('hero sprite', 'Sprite')).toBe('"hero sprite"');
  });
});
