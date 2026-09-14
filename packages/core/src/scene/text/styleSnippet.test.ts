import { describe, expect, it } from 'vitest';

import type { GradientFill } from '@scene-inspector/protocol';

import type { GradientSupport, Node, PixiAdapter } from '../../adapters/types.js';
import { gradientSource, readStyleSnippet } from './styleSnippet.js';

/**
 * The snippet is the one thing in the panel that has to come out in the game's
 * own spelling, so the fakes here are shaped after the two classes rather than
 * after what this module happens to read: a v6 style is a plain options object
 * with a list of colours for a gradient, a v8 one is a `TextStyle` with the
 * gradient in options of its own and a colour already converted to a number.
 *
 * Exact strings are asserted rather than parsed values. What is being checked is
 * something that will be pasted into a source file, and "close enough" is not a
 * thing a source file is.
 */

type Fake = Record<string, unknown>;

const LIST: GradientSupport = { shape: 'list' };
const OBJECT: GradientSupport = { shape: 'object', make: () => null };

/** Only one method is ever asked of it: which spelling this line writes. */
const adapterFor = (support: GradientSupport): PixiAdapter =>
  ({ gradientSupport: () => support }) as unknown as PixiAdapter;

const snippet = (node: Node, support: GradientSupport): string => {
  const result = readStyleSnippet(adapterFor(support), node);
  if ('unchanged' in result) throw new Error('expected data');
  return result.data;
};

/* ------------------------------------------------------------------ v6/v7 */

/** PixiJS 6's own `TextStyle.defaultStyle`, trimmed to what is compared. */
const LEGACY_DEFAULTS: Fake = {
  align: 'left',
  breakWords: false,
  dropShadow: false,
  dropShadowAlpha: 1,
  dropShadowAngle: Math.PI / 6,
  dropShadowBlur: 0,
  dropShadowColor: 'black',
  dropShadowDistance: 5,
  fill: 'black',
  fillGradientType: 0,
  fillGradientStops: [],
  fontFamily: 'Arial',
  fontSize: 26,
  fontStyle: 'normal',
  fontVariant: 'normal',
  fontWeight: 'normal',
  leading: 0,
  letterSpacing: 0,
  lineHeight: 0,
  lineJoin: 'miter',
  miterLimit: 10,
  padding: 0,
  stroke: 'black',
  strokeThickness: 0,
  textBaseline: 'alphabetic',
  trim: false,
  whiteSpace: 'pre',
  wordWrap: false,
  wordWrapWidth: 100,
};

/** A style there is a class, so its defaults are reachable from an instance. */
class LegacyStyle {
  static defaultStyle = LEGACY_DEFAULTS;

  constructor(options: Fake) {
    Object.assign(this, LEGACY_DEFAULTS, options);
  }
}

/** The game's patched v6 `Text`: `outputText` is what marks one. */
function fittedTextV6(style: Fake): Fake {
  return {
    text: 'flex font fits this line',
    style: new LegacyStyle(style) as unknown as Fake,
    outputText: () => undefined,
  };
}

/**
 * The older MultiStyleText: `_textStyles` holding a tag each, the default one
 * pre-filled with the class's defaults exactly as the real class fills it.
 */
function multiStyleV6(tags: Record<string, Fake>): Fake {
  const node: Fake = {
    text: 'Level cleared\n<score>18 450</score>\n<note>press space</note>',
    style: new LegacyStyle(tags['default'] ?? {}) as unknown as Fake,
    _textStyles: Object.fromEntries(
      Object.entries(tags).map(([name, style]) => [
        name,
        name === 'default' ? { ...LEGACY_DEFAULTS, ...style } : { ...style },
      ]),
    ),
    setTagStyle: () => undefined,
    deleteTagStyle: () => undefined,
  };

  return node;
}

/* --------------------------------------------------------------------- v8 */

const V8_DEFAULTS: Fake = {
  align: 'left',
  breakWords: false,
  dropShadow: null,
  fill: 'black',
  fontFamily: 'Arial',
  fontSize: 20,
  fontStyle: 'normal',
  fontVariant: 'normal',
  fontWeight: 'normal',
  leading: 0,
  letterSpacing: 0,
  lineHeight: 0,
  padding: 0,
  stroke: null,
  textBaseline: 'alphabetic',
  trim: false,
  whiteSpace: 'pre',
  wordWrap: false,
  wordWrapWidth: 100,
};

/**
 * The game's v8 `TextStyle`. Two of its habits matter here and both are real:
 * the gradient lives in `fillGradient` options and nowhere the `fill` getter
 * would report it, and a colour that has been through the library is a number.
 */
class GameStyle {
  static defaultTextStyle = V8_DEFAULTS;

  /** Declared so `'fillGradient' in style` answers even when none was given. */
  fillGradient: Fake | undefined = undefined;

  constructor(options: Fake) {
    Object.assign(this, V8_DEFAULTS, options);

    // What the real class does with them: the gradient is built straight into
    // the converted fill, and the `fill` getter goes on reporting the colour
    // that preceded it. `properties/fill.ts` reads the twin for exactly this.
    const gradient = options['fillGradient'];
    if (gradient !== undefined) {
      (this as unknown as Fake)['_fill'] = { fill: { ...(gradient as Fake) }, color: 0xffffff };
    }
  }
}

function fittedTextV8(style: Fake): Fake {
  return {
    text: 'flex font fits this line',
    style: new GameStyle(style) as unknown as Fake,
    outputText: () => undefined,
  };
}

function multiStyleV8(base: Fake, tags: Record<string, Fake>): Fake {
  const style = new GameStyle(base) as unknown as Fake;

  style['subStyles'] = {
    // `default` is the node's own style rather than a copy of it.
    default: style,
    ...Object.fromEntries(
      Object.entries(tags).map(([name, override]) => [
        name,
        new GameStyle({ ...base, ...override }) as unknown as Fake,
      ]),
    ),
  };

  return { text: 'Level cleared\n<score>18 450</score>', style };
}

/* ------------------------------------------------------------------ tests */

describe('readStyleSnippet', () => {
  it('says nothing about a plain PixiJS Text', () => {
    const node: Fake = { text: 'caption', style: new LegacyStyle({ fontSize: 40 }) };

    expect(snippet(node, LIST)).toBe('');
    expect(readStyleSnippet(adapterFor(LIST), node)).toEqual({ rev: 0, data: '' });
  });

  it('leaves out everything the class defaults to', () => {
    const node = fittedTextV6({
      fontFamily: 'system-ui',
      fontSize: 26,
      fill: '#e5d6cc',
      wordWrap: true,
      wordWrapWidth: 260,
      wordWrapHeight: 40,
      flexFont: true,
    });

    // `fontSize: 26` is PixiJS 6's own default and is therefore not said.
    expect(snippet(node, LIST)).toBe(
      [
        'style: {',
        '    fontFamily: "system-ui",',
        '    fill: "#e5d6cc",',
        '    wordWrap: true,',
        '    wordWrapWidth: 260,',
        '    flexFont: true,',
        '    wordWrapHeight: 40',
        '}',
      ].join('\n'),
    );
  });

  it('writes a v6 gradient as the fields that line spells one with', () => {
    const node = fittedTextV6({
      fontSize: 40,
      fill: ['#ffec6c', '#c07e00'],
      fillGradientStops: [0.2, 0.8],
    });

    // No `fillGradientType`: vertical is the default, and a game that wanted one
    // did not have to say so.
    expect(snippet(node, LIST)).toBe(
      [
        'style: {',
        '    fontSize: 40,',
        '    fill: [',
        '        "#ffec6c",',
        '        "#c07e00"',
        '    ],',
        '    fillGradientStops: [',
        '        0.2,',
        '        0.8',
        '    ]',
        '}',
      ].join('\n'),
    );
  });

  /**
   * `readFill` reports the stops PixiJS would place — the panel draws a ramp and
   * needs them. Nobody typed them, so they are not part of the source.
   */
  it('leaves out v6 stops the library placed itself, and names a horizontal ramp', () => {
    const node = fittedTextV6({
      fill: ['#ffec6c', '#c07e00'],
      fillGradientType: 1,
    });

    expect(snippet(node, LIST)).toBe(
      [
        'style: {',
        '    fill: [',
        '        "#ffec6c",',
        '        "#c07e00"',
        '    ],',
        '    fillGradientType: 1',
        '}',
      ].join('\n'),
    );
  });

  it('carries a v6 tag exactly as it was written, defaults and all', () => {
    const node = multiStyleV6({
      default: { fontFamily: 'system-ui', fontSize: 28, fill: '#e5d6cc' },
      // A tag there holds only what it overrides, so nothing is worked out and
      // nothing is dropped — `wordWrap: false` was said and is reported.
      score: { fontSize: 44, strokeThickness: 8, wordWrap: false },
      note: {},
    });

    expect(snippet(node, LIST)).toBe(
      [
        'style: {',
        '    fontFamily: "system-ui",',
        '    fontSize: 28,',
        '    fill: "#e5d6cc"',
        '},',
        'multiStyles: {',
        '    score: {',
        '        fontSize: 44,',
        '        strokeThickness: 8,',
        '        wordWrap: false',
        '    },',
        '    note: {}',
        '}',
      ].join('\n'),
    );
  });

  it('reports a key of the game’s own that no descriptor declares', () => {
    const node = multiStyleV6({
      default: { fontSize: 28 },
      score: { fontSize: 44, splitCharsSeparator: '-' },
    });

    expect(snippet(node, LIST)).toContain('splitCharsSeparator: "-"');
  });

  it('nests a v8 stroke and turns a converted colour back into a colour', () => {
    const node = fittedTextV8({
      fontFamily: 'system-ui',
      fontSize: 28,
      fill: '#e5d6cc',
      // 0x44240d, which is what a style reports once the library has converted it.
      stroke: { color: 4465677, width: 6, join: 'miter' },
      align: 'center',
    });

    expect(snippet(node, OBJECT)).toBe(
      [
        'style: {',
        '    fontFamily: "system-ui",',
        '    fontSize: 28,',
        '    fill: "#e5d6cc",',
        '    stroke: {',
        '        color: "#44240d",',
        '        width: 6,',
        '        join: "miter"',
        '    },',
        '    align: "center"',
        '}',
      ].join('\n'),
    );
  });

  it('writes a v8 gradient as the options the game builds one from', () => {
    const node = fittedTextV8({
      fontSize: 28,
      fillGradient: {
        type: 'linear',
        colorStops: [
          { offset: 0.25, color: '#ffec6c' },
          { offset: 0.75, color: '#c07e00' },
        ],
      },
    });

    expect(snippet(node, OBJECT)).toBe(
      [
        'style: {',
        '    fontSize: 28,',
        '    fillGradient: {',
        '        type: "linear",',
        '        start: {',
        '            x: 0,',
        '            y: 0',
        '        },',
        '        end: {',
        '            x: 0,',
        '            y: 1',
        '        },',
        '        colorStops: [',
        '            {',
        '                offset: 0.25,',
        '                color: "#ffec6c"',
        '            },',
        '            {',
        '                offset: 0.75,',
        '                color: "#c07e00"',
        '            }',
        '        ]',
        '    }',
        '}',
      ].join('\n'),
    );
  });

  /**
   * The whole reason `groupAtomic` is read here. A v8 tag is a merged style, so
   * what it overrides has to be worked out — and working it out key by key would
   * report the width without the colour, which pasted back into the game is a
   * stroke in the default's colour rather than in the tag's.
   */
  it('carries a whole v8 stroke when a tag changes only its width', () => {
    const node = multiStyleV8(
      {
        fontSize: 28,
        fill: '#e5d6cc',
        stroke: { color: 4465677, width: 6, join: 'miter' },
      },
      { score: { fontSize: 44, stroke: { color: 4465677, width: 8, join: 'miter' } } },
    );

    expect(snippet(node, OBJECT)).toBe(
      [
        'style: {',
        '    fontSize: 28,',
        '    fill: "#e5d6cc",',
        '    stroke: {',
        '        color: "#44240d",',
        '        width: 6,',
        '        join: "miter"',
        '    }',
        '},',
        'multiStyles: {',
        '    score: {',
        '        fontSize: 44,',
        '        stroke: {',
        '            color: "#44240d",',
        '            width: 8,',
        '            join: "miter"',
        '        }',
        '    }',
        '}',
      ].join('\n'),
    );
  });

  /**
   * The flag is what makes the newer class read its text as markup at all.
   * Without it the snippet pasted back draws `<score>` as three literal words in
   * the middle of the sentence.
   */
  it('carries the flag that makes a v8 text read its markup', () => {
    const node = multiStyleV8(
      { fontSize: 28, isMultiStyle: true },
      { score: { fontSize: 44 } },
    );

    const text = snippet(node, OBJECT);

    expect(text.slice(0, text.indexOf('\n},'))).toBe(
      ['style: {', '    fontSize: 28,', '    isMultiStyle: true'].join('\n'),
    );

    // Not repeated on every tag: they inherit it, and a tag says only what it
    // overrides.
    expect(text.slice(text.indexOf('multiStyles'))).not.toContain('isMultiStyle');
  });

  it('says nothing about it on a text that is not multi-style', () => {
    expect(snippet(fittedTextV8({ fontSize: 28 }), OBJECT)).not.toContain('isMultiStyle');
  });

  it('says nothing of a v8 tag that overrides nothing', () => {
    const node = multiStyleV8({ fontSize: 28, fill: '#e5d6cc' }, { note: {} });

    expect(snippet(node, OBJECT)).toContain('note: {}');
  });

  describe('the revision', () => {
    it('reports unchanged for a style nobody touched', () => {
      const node = fittedTextV6({ fontSize: 40 });

      const first = readStyleSnippet(adapterFor(LIST), node);
      expect('unchanged' in first).toBe(false);

      expect(readStyleSnippet(adapterFor(LIST), node, first.rev)).toEqual({
        rev: first.rev,
        unchanged: true,
      });
    });

    it('moves when the style does', () => {
      const node = fittedTextV6({ fontSize: 40 });
      const before = readStyleSnippet(adapterFor(LIST), node).rev;

      (node.style as Fake)['fontSize'] = 41;

      expect(readStyleSnippet(adapterFor(LIST), node).rev).not.toBe(before);
    });
  });
});

/**
 * One gradient on its own, which is what a row copies when its name is
 * double-clicked. The whole point is that the two lines are spelled differently
 * and neither spelling is the panel's to guess.
 */
describe('gradientSource', () => {
  const RAMP: GradientFill = {
    kind: 'gradient',
    direction: 'horizontal',
    stops: [
      { color: '#8ecaff', offset: 0 },
      { color: 4465677, offset: 1 },
    ],
  };

  it('writes v6/v7 gradients as the three fields the style holds', () => {
    expect(gradientSource(RAMP, {}, 'list')).toBe(
      [
        'fill: [',
        '    "#8ecaff",',
        '    "#44240d"',
        '],',
        'fillGradientType: 1,',
        'fillGradientStops: [',
        '    0,',
        '    1',
        ']',
      ].join('\n'),
    );
  });

  it('writes a v8 gradient as the options one is built from', () => {
    expect(gradientSource(RAMP, {}, 'object')).toBe(
      [
        'fill: {',
        '    type: "linear",',
        '    start: {',
        '        x: 0,',
        '        y: 0',
        '    },',
        '    end: {',
        '        x: 1,',
        '        y: 0',
        '    },',
        '    colorStops: [',
        '        {',
        '            offset: 0,',
        '            color: "#8ecaff"',
        '        },',
        '        {',
        '            offset: 1,',
        '            color: "#44240d"',
        '        }',
        '    ]',
        '}',
      ].join('\n'),
    );
  });

  /** A game's own class takes its gradient as options beside the fill. */
  it('writes it under fillGradient where the style keeps one', () => {
    expect(gradientSource(RAMP, { fillGradient: null }, 'object')).toMatch(/^fillGradient: \{/);
  });
});
