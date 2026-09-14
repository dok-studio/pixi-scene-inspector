import type { GradientFill, TextTagMutation } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { GradientSupport, Node } from '../../adapters/types.js';
import {
  applyTagMutation as applyWithSupport,
  asMultiStyle,
  readTagStyles,
  tagStyleFields,
} from './multiStyle.js';

/**
 * MultiStyleText, which is not PixiJS.
 *
 * The class is the application's own, installed over `Text`, so this module
 * detects it by its own marks — the same standing `scene/spine/spine.ts` has.
 * There are two of them, one per PixiJS line, and each gets a fake here.
 *
 * The first is the part of the older class this module talks to: `_textStyles`,
 * holding only what each tag overrides, and the two methods that rebuild the
 * node from it. `setTagStyle` merges rather than replaces, which is exactly why
 * `clear` has to delete the key itself before calling it.
 */

type Fake = Record<string, unknown>;

const TEXT = 'Level cleared\n<score>18 450</score>';

/**
 * How the line these fakes belong to spells a gradient. The older class only
 * exists under v6/v7, where a gradient is a list of colours and nothing has to be
 * constructed; the newer one gets `OBJECT` below, next to its own fake.
 */
const LIST: GradientSupport = { shape: 'list' };

/** Every mutation here is on the older class unless a test says otherwise. */
const applyTagMutation = (
  node: Node,
  mutation: TextTagMutation,
  support: GradientSupport = LIST,
): boolean => applyWithSupport(node, mutation, support);

function multiStyleNode(styles: Record<string, Record<string, unknown>> = {}): Fake {
  const node: Fake = {
    text: TEXT,
    _textStyles: {
      default: { fontFamily: 'Arial', fontSize: 26, fill: '#ffffff' },
      score: { fontSize: 44, fill: ['#ffec6c', '#c07e00'] },
      ...styles,
    },
    dirty: false,
    setTagStyle(tag: string, style: Record<string, unknown>) {
      const all = node._textStyles as Record<string, Record<string, unknown>>;
      all[tag] = { ...all[tag], ...style };
      node.dirty = true;
    },
    deleteTagStyle(tag: string) {
      const all = node._textStyles as Record<string, Record<string, unknown>>;
      delete all[tag];
      node.dirty = true;
    },
  };

  return node;
}

const stylesOf = (node: Fake): Record<string, Record<string, unknown>> =>
  node._textStyles as Record<string, Record<string, unknown>>;

const tagOf = (node: Fake, tag: string): Record<string, unknown> => stylesOf(node)[tag] ?? {};

describe('asMultiStyle', () => {
  it('recognises the styles and both methods together', () => {
    expect(asMultiStyle(multiStyleNode())).not.toBeNull();
  });

  it('declines a node that only carries the styles', () => {
    expect(asMultiStyle({ _textStyles: {} })).toBeNull();
  });

  it('declines a plain Text', () => {
    expect(asMultiStyle({ text: 'hello', style: {} })).toBeNull();
  });
});

describe('readTagStyles', () => {
  it('puts default first whatever order the application declared', () => {
    const node = multiStyleNode();
    stylesOf(node).zzz = { fontSize: 10 };
    delete stylesOf(node).default;
    stylesOf(node).default = { fontSize: 26 };

    const result = readTagStyles(node);

    expect('data' in result && result.data.map((tag) => tag.name)).toEqual([
      'default',
      'score',
      'zzz',
    ]);
  });

  it('reports only what a tag sets, not the resolved style', () => {
    const result = readTagStyles(multiStyleNode());

    expect('data' in result && result.data[1]).toEqual({
      name: 'score',
      style: {
        fontSize: 44,
        // A list of colours is a gradient, and it arrives as one — offsets
        // included, since the style names none and PixiJS would space them
        // itself. See `properties/fill.ts`.
        fill: {
          kind: 'gradient',
          direction: 'vertical',
          stops: [
            { color: '#ffec6c', offset: 1 / 3 },
            { color: '#c07e00', offset: 2 / 3 },
          ],
        },
      },
      text: '18 450',
    });
  });

  it('keeps a key the declared list does not cover', () => {
    const node = multiStyleNode({ hint: { flexFont: true } });

    const result = readTagStyles(node);
    const hint = 'data' in result ? result.data.find((tag) => tag.name === 'hint') : undefined;

    expect(hint?.style).toEqual({ flexFont: true });
  });

  it('leaves out a value that could not survive the bridge', () => {
    const node = multiStyleNode({ odd: { fontSize: 10, onClick: () => {}, shape: { x: 1 } } });

    const result = readTagStyles(node);
    const odd = 'data' in result ? result.data.find((tag) => tag.name === 'odd') : undefined;

    expect(odd?.style).toEqual({ fontSize: 10 });
  });

  it('answers unchanged while nothing moves', () => {
    const node = multiStyleNode();
    const first = readTagStyles(node);

    expect(readTagStyles(node, first.rev)).toEqual({ rev: first.rev, unchanged: true });
  });

  it('answers again once a value moves', () => {
    const node = multiStyleNode();
    const first = readTagStyles(node);

    tagOf(node, 'score').fontSize = 45;

    expect(readTagStyles(node, first.rev)).toHaveProperty('data');
  });

  it('is empty for a node that is not a multi-style text', () => {
    expect(readTagStyles({ text: 'hello' })).toEqual({ rev: 0, data: [] });
  });

  /**
   * The row that says what a tag is actually doing: the words it covers, read
   * off the markup rather than described.
   */
  describe('the text a tag covers', () => {
    const textOf = (node: Fake, tag: string): string | undefined => {
      const result = readTagStyles(node);
      return 'data' in result ? result.data.find((entry) => entry.name === tag)?.text : undefined;
    };

    it('gives a tag the words between its markup', () => {
      expect(textOf(multiStyleNode(), 'score')).toBe('18 450');
    });

    /** Whatever the markup leaves alone is what `default` is drawing. */
    it('gives default what no tag claimed', () => {
      expect(textOf(multiStyleNode(), 'default')).toBe('Level cleared');
    });

    it('joins the spans of a tag used more than once', () => {
      const node = multiStyleNode();
      node.text = '<score>10</score> and <score>20</score>';

      expect(textOf(node, 'score')).toBe('10 … 20');
      expect(textOf(node, 'default')).toBe('and');
    });

    /** One line of information, not the text itself — the Text tab has that. */
    it('collapses the whitespace inside a span', () => {
      const node = multiStyleNode();
      node.text = '<score>  18 450\n  points </score>';

      expect(textOf(node, 'score')).toBe('18 450 points');
    });

    /** The inner tag is the one whose style decides how those characters look. */
    it('attributes a nested span to the tag on top of the stack', () => {
      const node = multiStyleNode({ note: {} });
      node.text = '<score>18 <note>450</note> points</score>';

      expect(textOf(node, 'note')).toBe('450');
      expect(textOf(node, 'score')).toBe('18 … points');
    });

    it('says nothing for a tag the text never uses', () => {
      expect(textOf(multiStyleNode({ hint: {} }), 'hint')).toBe('');
    });

    it('answers again once the text moves', () => {
      const node = multiStyleNode();
      const first = readTagStyles(node);

      node.text = 'Level cleared\n<score>19 000</score>';

      expect(readTagStyles(node, first.rev)).toHaveProperty('data');
    });

    /**
     * The class joins its tag names into a regular expression raw, so a name
     * with a metacharacter already breaks its own parsing. There is no reason
     * for it to break this walk as well.
     */
    it('survives a tag name the application should never have used', () => {
      const node = multiStyleNode({ 'a|b': {} });
      node.text = 'plain <score>1</score>';

      expect(textOf(node, 'score')).toBe('1');
      expect(textOf(node, 'a|b')).toBe('');
    });

    it('has nothing to say for a node with no text at all', () => {
      const node = multiStyleNode();
      delete node.text;

      expect(textOf(node, 'default')).toBe('');
    });
  });
});

describe('applyTagMutation', () => {
  it('sets a declared property on a tag', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'set', tag: 'score', key: 'fontSize', value: 50 })).toBe(
      true,
    );
    expect(tagOf(node, 'score').fontSize).toBe(50);
  });

  /**
   * A gradient arrives as one value and lands as three fields, because that is
   * how this class's library spells it. The patch goes through `setTagStyle`,
   * which merges — so the two fields beside the fill arrive with it rather than
   * replacing the tag.
   */
  it('sets a gradient fill as the three fields the older library wants', () => {
    const node = multiStyleNode();

    expect(
      applyTagMutation(node, {
        kind: 'set',
        tag: 'score',
        key: 'fill',
        value: {
          kind: 'gradient',
          direction: 'horizontal',
          stops: [
            { color: '#000000', offset: 0.2 },
            { color: '#ffffff', offset: 0.8 },
          ],
        },
      }),
    ).toBe(true);

    const tag = tagOf(node, 'score');
    expect(tag.fill).toEqual(['#000000', '#ffffff']);
    expect(tag.fillGradientType).toBe(1);
    expect(tag.fillGradientStops).toEqual([0.2, 0.8]);
    expect(tag.fontSize).toBe(44);
  });

  it('refuses a gradient of one colour, which is not a gradient', () => {
    const node = multiStyleNode();

    expect(
      applyTagMutation(node, {
        kind: 'set',
        tag: 'score',
        key: 'fill',
        value: { kind: 'gradient', direction: 'vertical', stops: [{ color: '#000000', offset: 0 }] },
      }),
    ).toBe(false);
  });

  it('takes the fields that only make sense beside a gradient away with it', () => {
    const node = multiStyleNode({
      score: { fill: ['#000000', '#ffffff'], fillGradientType: 1, fillGradientStops: [0.2, 0.8] },
    });

    expect(applyTagMutation(node, { kind: 'clear', tag: 'score', key: 'fill' })).toBe(true);
    expect(tagOf(node, 'score')).toEqual({});
  });

  it('refuses a key the declared list does not cover', () => {
    const node = multiStyleNode();

    expect(
      applyTagMutation(node, { kind: 'set', tag: 'score', key: 'constructor', value: 1 }),
    ).toBe(false);
  });

  it('refuses a value a style cannot hold', () => {
    const node = multiStyleNode();

    expect(
      applyTagMutation(node, { kind: 'set', tag: 'score', key: 'fontSize', value: { x: 1 } }),
    ).toBe(false);
  });

  it('refuses to set on a tag that is not there', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'set', tag: 'ghost', key: 'fontSize', value: 8 })).toBe(
      false,
    );
  });

  it('clears a key off a tag, which merging alone cannot do', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'clear', tag: 'score', key: 'fontSize' })).toBe(true);
    expect(tagOf(node, 'score')).toEqual({ fill: ['#ffec6c', '#c07e00'] });
  });

  it('refuses to clear a key off default, which is a complete style', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'clear', tag: 'default', key: 'fontSize' })).toBe(false);
    expect(tagOf(node, 'default').fontSize).toBe(26);
  });

  it('refuses to clear a key the tag does not have', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'clear', tag: 'score', key: 'padding' })).toBe(false);
  });

  it('adds an empty tag', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'add', tag: 'hint' })).toBe(true);
    expect(stylesOf(node)).toHaveProperty('hint', {});
  });

  it('refuses a tag that already exists', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'add', tag: 'score' })).toBe(false);
  });

  /**
   * The class joins the tag names into a regular expression, so a name with a
   * metacharacter would not merely be odd — it would break the parsing of the
   * node's entire text.
   */
  it('refuses a tag name that is not a plain word', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'add', tag: 'a|b' })).toBe(false);
    expect(applyTagMutation(node, { kind: 'add', tag: '.*' })).toBe(false);
    expect(applyTagMutation(node, { kind: 'add', tag: '' })).toBe(false);
    expect(Object.keys(stylesOf(node))).toEqual(['default', 'score']);
  });

  it('removes a tag', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'remove', tag: 'score' })).toBe(true);
    expect(Object.keys(stylesOf(node))).toEqual(['default']);
  });

  /** `deleteTagStyle('default')` resets the style, which reads as a broken node. */
  it('refuses to remove default', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'remove', tag: 'default' })).toBe(false);
    expect(tagOf(node, 'default').fontSize).toBe(26);
  });

  it('changes nothing on a node that is not a multi-style text', () => {
    expect(applyTagMutation({ text: 'hello' }, { kind: 'add', tag: 'hint' })).toBe(false);
  });
});

/**
 * The other class, the one built on PixiJS 8.
 *
 * Two things make it a different job. A tag there is a whole `TextStyle`, merged
 * from the default and the override when the node was built, so what it
 * overrides has to be worked out by comparing it against the default. And the
 * stroke and the shadow are objects of their own, so a tag spells its stroke
 * width `stroke.width` rather than `strokeThickness`.
 *
 * The fake mirrors two behaviours this module leans on: `clone`, which is how a
 * new tag is made, and the shadow's setter, which turns `true` into a shadow
 * object and anything falsy into none. Without the second, a round trip through
 * `dropShadow` would look broken here and work in the browser.
 */

interface FakeStyle extends Record<string, unknown> {
  clone: () => FakeStyle;
  update: () => void;
}

const copy = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : value;

function fakeStyle(values: Record<string, unknown>, log: string[]): FakeStyle {
  const style = {} as FakeStyle;

  for (const [key, value] of Object.entries(values)) {
    if (key !== 'dropShadow') style[key] = copy(value);
  }

  let shadow: Record<string, unknown> | null = null;
  Object.defineProperty(style, 'dropShadow', {
    enumerable: true,
    get: () => shadow,
    set: (value: unknown) => {
      shadow =
        typeof value === 'object' && value !== null
          ? { color: '#000000', alpha: 1, blur: 0, angle: 0, distance: 5, ...value }
          : value === true
            ? { color: '#000000', alpha: 1, blur: 0, angle: 0, distance: 5 }
            : null;
    },
  });
  style.dropShadow = values.dropShadow;

  style.clone = () => {
    const plain: Record<string, unknown> = {};
    for (const key of Object.keys(style)) {
      if (key !== 'clone' && key !== 'update') plain[key] = copy(style[key]);
    }
    return fakeStyle(plain, log);
  };
  style.update = () => log.push('update');

  return style;
}

const MERGED_TEXT = 'Level cleared\n<score>18 450</score>';

/** A gradient as the newer library keeps one — see `properties/fill.ts`. */
const gradientObject = (): Record<string, unknown> => ({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  colorStops: [
    { offset: 0, color: '#ffec6c' },
    { offset: 1, color: '#c07e00' },
  ],
});

/**
 * The newer line, where a gradient is an instance of a class. `make` stands in for
 * the constructor the adapter finds on the page.
 */
const OBJECT: GradientSupport = {
  shape: 'object',
  make: () => ({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [] }),
};

/** A page that exposes neither its module nor a gradient to take one from. */
const NO_CLASS: GradientSupport = { shape: 'object', make: () => null };

function mergedNode(extra: Record<string, Record<string, unknown>> = {}): {
  node: Fake;
  updates: string[];
} {
  const updates: string[] = [];

  const base = fakeStyle(
    {
      fontFamily: 'Arial',
      fontSize: 26,
      fill: '#ffffff',
      align: 'center',
      stroke: { color: '#44240d', width: 6, join: 'miter' },
      dropShadow: null,
    },
    updates,
  );

  const score = base.clone();
  score.fontSize = 44;
  (score.stroke as Record<string, unknown>).width = 8;
  score.dropShadow = { blur: 4 };

  const subStyles: Record<string, unknown> = { default: base, score };
  for (const [name, values] of Object.entries(extra)) {
    const style = base.clone();
    for (const [key, value] of Object.entries(values)) style[key] = value;
    subStyles[name] = style;
  }

  base.subStyles = subStyles;

  return { node: { text: MERGED_TEXT, style: base }, updates };
}

const subStylesOf = (node: Fake): Record<string, FakeStyle> =>
  (node.style as FakeStyle).subStyles as Record<string, FakeStyle>;

const readTag = (node: Fake, tag: string): Record<string, unknown> | undefined => {
  const result = readTagStyles(node);
  return 'data' in result ? result.data.find((entry) => entry.name === tag)?.style : undefined;
};

describe('asMultiStyle, on the class that keeps its tags inside the style', () => {
  it('recognises the named styles', () => {
    expect(asMultiStyle(mergedNode().node)?.kind).toBe('merged');
  });

  it('declines a text with no tags', () => {
    expect(asMultiStyle({ style: { fontSize: 12 } })).toBeNull();
  });
});

describe('tagStyleFields', () => {
  it('offers the flat spelling to the class that uses it', () => {
    const keys = tagStyleFields(multiStyleNode()).map((field) => field.key);

    expect(keys).toContain('strokeThickness');
    expect(keys).not.toContain('stroke.width');
  });

  it('offers the nested spelling to the class that uses it', () => {
    const keys = tagStyleFields(mergedNode().node).map((field) => field.key);

    expect(keys).toContain('stroke.width');
    expect(keys).not.toContain('strokeThickness');
  });

  it('has nothing to offer for a node that is not a multi-style text', () => {
    expect(tagStyleFields({ text: 'hello' })).toEqual([]);
  });
});

describe('readTagStyles, on a merged tag', () => {
  /** A merged tag records nothing about what it changed; the difference is it. */
  it('reports only what differs from default', () => {
    const { node } = mergedNode({ hint: { fontSize: 30 } });

    expect(readTag(node, 'hint')).toEqual({ fontSize: 30 });
  });

  /**
   * A tag that switches a shadow on where the default has none differs on every
   * one of its settings, and says so. That is the data rather than a quirk: the
   * style's setter fills the unset ones in, so the tag really does carry them.
   */
  it('reports the whole shadow when default has none', () => {
    expect(readTag(mergedNode().node, 'score')).toEqual({
      fontSize: 44,
      'stroke.width': 8,
      dropShadow: true,
      'dropShadow.color': '#000000',
      'dropShadow.alpha': 1,
      'dropShadow.blur': 4,
      'dropShadow.angle': 0,
      'dropShadow.distance': 5,
    });
  });

  it('reports everything default carries, since it overrides nothing', () => {
    const style = readTag(mergedNode().node, 'default');

    expect(style).toMatchObject({
      fontFamily: 'Arial',
      fontSize: 26,
      fill: '#ffffff',
      align: 'center',
      'stroke.color': '#44240d',
      'stroke.width': 6,
      dropShadow: false,
    });
  });

  /** `getProp` carries neither an object nor null, so the row is a yes or no. */
  it('reports a shadow as whether there is one', () => {
    const { node } = mergedNode();

    expect(readTag(node, 'score')?.dropShadow).toBe(true);
    expect(readTag(node, 'default')?.dropShadow).toBe(false);
  });

  it('says nothing for a tag that matches default outright', () => {
    const { node } = mergedNode({ hint: {} });

    expect(readTag(node, 'hint')).toEqual({});
  });

  /**
   * `TextStyle.clone()` copies the converted style, where a colour is a number
   * rather than the string the application wrote. A tag copied from the default
   * is identical on screen and would otherwise open with a row for a stroke it
   * does not override.
   */
  it('takes the same colour written two ways for the same colour', () => {
    const { node } = mergedNode({ hint: { stroke: { color: 0x44240d, width: 6, join: 'miter' } } });

    expect(readTag(node, 'hint')).toEqual({});
  });

  it('still reports a colour that is genuinely different', () => {
    const { node } = mergedNode({ hint: { fill: '#ff0000' } });

    expect(readTag(node, 'hint')).toEqual({ fill: '#ff0000' });
  });

  it('reports a gradient the tag carries', () => {
    const { node } = mergedNode({ hint: { fill: gradientObject() } });

    expect(readTag(node, 'hint')).toEqual({
      fill: {
        kind: 'gradient',
        direction: 'vertical',
        stops: [
          { color: '#ffec6c', offset: 0 },
          { color: '#c07e00', offset: 1 },
        ],
      },
    });
  });

  /**
   * The same reason the colour above is folded: a tag copied from the default holds
   * an equal gradient, and comparing the two objects by identity would open the tag
   * with a row for a fill it does not override.
   */
  it('takes an equal gradient for the same gradient', () => {
    const { node } = mergedNode();
    subStylesOf(node).default!['fill'] = gradientObject();
    subStylesOf(node).hint = subStylesOf(node).default!.clone();
    subStylesOf(node).hint!['fill'] = gradientObject();

    expect(readTag(node, 'hint')).toEqual({});
  });

  it('carries the text a tag covers, the same as on the other class', () => {
    const result = readTagStyles(mergedNode().node);
    const score = 'data' in result ? result.data.find((tag) => tag.name === 'score') : undefined;

    expect(score?.text).toBe('18 450');
  });

  it('answers unchanged while nothing moves', () => {
    const { node } = mergedNode();
    const first = readTagStyles(node);

    expect(readTagStyles(node, first.rev)).toEqual({ rev: first.rev, unchanged: true });
  });
});

describe('applyTagMutation, on a merged tag', () => {
  it('sets a nested key and tells the node', () => {
    const { node, updates } = mergedNode();

    expect(
      applyTagMutation(node, { kind: 'set', tag: 'score', key: 'stroke.width', value: 12 }),
    ).toBe(true);
    expect((subStylesOf(node).score?.stroke as Record<string, unknown>).width).toBe(12);
    expect(updates).toEqual(['update']);
  });

  /**
   * The text is cached under a key built from the default style's own counter,
   * so a change to a sub-style that did not touch it would draw the old picture.
   */
  it('tells the node even when the tag it changed is not the default one', () => {
    const { node, updates } = mergedNode();

    applyTagMutation(node, { kind: 'set', tag: 'score', key: 'fontSize', value: 50 });

    expect(updates).toEqual(['update']);
  });

  it('turns a shadow on through the style own setter', () => {
    const { node } = mergedNode({ hint: {} });

    expect(applyTagMutation(node, { kind: 'set', tag: 'hint', key: 'dropShadow', value: true })).toBe(
      true,
    );
    expect(readTag(node, 'hint')?.dropShadow).toBe(true);
  });

  it('refuses the other class spelling', () => {
    const { node } = mergedNode();

    expect(
      applyTagMutation(node, { kind: 'set', tag: 'score', key: 'strokeThickness', value: 12 }),
    ).toBe(false);
  });

  describe('a gradient fill', () => {
    const value: GradientFill = {
      kind: 'gradient',
      direction: 'horizontal',
      stops: [
        { color: '#000000', offset: 0.2 },
        { color: '#ffffff', offset: 0.8 },
      ],
    };

    it('is built where the tag has none, and the node is told', () => {
      const { node, updates } = mergedNode();

      expect(
        applyTagMutation(node, { kind: 'set', tag: 'score', key: 'fill', value }, OBJECT),
      ).toBe(true);
      expect(readTag(node, 'score')).toMatchObject({ fill: value });
      expect(updates).toEqual(['update']);
    });

    /**
     * The one thing a page can refuse. Here a gradient has to be an instance of a
     * class, and a bundle that exposes neither its module nor a gradient to take a
     * constructor from cannot provide one.
     */
    it('is refused where the page cannot make one', () => {
      const { node } = mergedNode();

      expect(
        applyTagMutation(node, { kind: 'set', tag: 'score', key: 'fill', value }, NO_CLASS),
      ).toBe(false);
    });

    it('is edited in place where the tag already has one', () => {
      const { node } = mergedNode();
      const existing = gradientObject();
      subStylesOf(node).score!['fill'] = existing;

      applyTagMutation(node, { kind: 'set', tag: 'score', key: 'fill', value }, OBJECT);

      expect(subStylesOf(node).score!['fill']).toBe(existing);
      expect(existing['colorStops']).toEqual([
        { offset: 0.2, color: '#000000' },
        { offset: 0.8, color: '#ffffff' },
      ]);
    });

    /**
     * A style holding the **same** gradient object as the default gets one of its
     * own before it is edited. Nothing the panel does creates that situation, but
     * an application assigning one gradient to two styles does, and editing in
     * place would then move the default's ramp along with the tag's.
     */
    it('is detached from the default before a shared one is edited', () => {
      const { node } = mergedNode();
      const shared = gradientObject();
      subStylesOf(node).default!['fill'] = shared;
      subStylesOf(node).score!['fill'] = shared;

      applyTagMutation(node, { kind: 'set', tag: 'score', key: 'fill', value }, OBJECT);

      expect(subStylesOf(node).score!['fill']).not.toBe(shared);
      expect(shared['colorStops']).toEqual([
        { offset: 0, color: '#ffec6c' },
        { offset: 1, color: '#c07e00' },
      ]);
    });
  });

  /** Nothing to remove from a whole style: the default's value goes back in. */
  it('clears a key by putting default back', () => {
    const { node } = mergedNode();

    expect(applyTagMutation(node, { kind: 'clear', tag: 'score', key: 'fontSize' })).toBe(true);
    expect(subStylesOf(node).score?.fontSize).toBe(26);
    expect(readTag(node, 'score')).not.toHaveProperty('fontSize');
  });

  it('refuses to clear a key that already matches default', () => {
    const { node } = mergedNode();

    expect(applyTagMutation(node, { kind: 'clear', tag: 'score', key: 'fontFamily' })).toBe(false);
  });

  it('refuses to clear a key off default', () => {
    const { node } = mergedNode();

    expect(applyTagMutation(node, { kind: 'clear', tag: 'default', key: 'fontSize' })).toBe(false);
  });

  it('adds a tag as a copy of default, which overrides nothing', () => {
    const { node, updates } = mergedNode();

    expect(applyTagMutation(node, { kind: 'add', tag: 'hint' })).toBe(true);
    expect(readTag(node, 'hint')).toEqual({});
    expect(updates).toEqual(['update']);
  });

  it('refuses a tag name that is not a plain word', () => {
    const { node } = mergedNode();

    expect(applyTagMutation(node, { kind: 'add', tag: 'a|b' })).toBe(false);
  });

  it('removes a tag', () => {
    const { node } = mergedNode();

    expect(applyTagMutation(node, { kind: 'remove', tag: 'score' })).toBe(true);
    expect(Object.keys(subStylesOf(node))).toEqual(['default']);
  });

  it('refuses to remove default, which is the node own style', () => {
    const { node } = mergedNode();

    expect(applyTagMutation(node, { kind: 'remove', tag: 'default' })).toBe(false);
  });
});

/**
 * The switch that says whether a tag is stroked at all.
 *
 * It is not a key either class holds — PixiJS has no flag for a stroke — so it is
 * concluded from the width and written back through it. What makes it worth its
 * own set of tests is that the two classes disagree about where that width is,
 * and that a tag is an override rather than a style: saying "there is no stroke"
 * is itself something a tag can be claiming, or not claiming at all.
 */
describe('the stroke switch on a tag of the older class', () => {
  /** A tag that says nothing about the width has said nothing about the stroke. */
  it('is not reported for a tag that only overrides the colour', () => {
    const node = multiStyleNode({ hint: { stroke: '#ff0000' } });

    expect(readTag(node, 'hint')).toEqual({ stroke: '#ff0000' });
  });

  it('is reported by the width the tag overrides', () => {
    const node = multiStyleNode({ hint: { strokeThickness: 4 } });

    expect(readTag(node, 'hint')).toEqual({ strokeThickness: 4, strokeEnabled: true });
  });

  it('reports a width of zero as unstroked', () => {
    const node = multiStyleNode({ hint: { strokeThickness: 0 } });

    expect(readTag(node, 'hint')?.['strokeEnabled']).toBe(false);
  });

  it('is written as the width, which is the only thing the class keeps', () => {
    const node = multiStyleNode({ hint: { stroke: '#ff0000', strokeThickness: 4 } });

    expect(applyTagMutation(node, { kind: 'set', tag: 'hint', key: 'strokeEnabled', value: false })).toBe(true);
    expect(tagOf(node, 'hint')).toEqual({ stroke: '#ff0000', strokeThickness: 0 });
  });

  /**
   * One call, not one per key. `setTagStyle` merges, so a patch carrying the
   * switch and everything it is coming back with is told to the class once —
   * which is what makes restoring a group atomic without anything arranging it.
   */
  it('comes back on with its settings in a single patch', () => {
    const node = multiStyleNode({ hint: { strokeThickness: 0 } });

    const merges: Array<Record<string, unknown>> = [];
    const original = node['setTagStyle'] as (tag: string, style: Record<string, unknown>) => void;
    node['setTagStyle'] = (tag: string, style: Record<string, unknown>) => {
      merges.push(style);
      original.call(node, tag, style);
    };

    expect(
      applyTagMutation(node, {
        kind: 'set',
        tag: 'hint',
        key: 'strokeEnabled',
        value: { strokeThickness: 6, stroke: '#ff0000', lineJoin: 'bevel' },
      }),
    ).toBe(true);

    expect(merges).toHaveLength(1);
    expect(tagOf(node, 'hint')).toEqual({
      strokeThickness: 6,
      stroke: '#ff0000',
      lineJoin: 'bevel',
    });
  });

  it('refuses a value that is neither a boolean nor settings', () => {
    const node = multiStyleNode({ hint: { strokeThickness: 4 } });

    expect(
      applyTagMutation(node, { kind: 'set', tag: 'hint', key: 'strokeEnabled', value: 'yes' }),
    ).toBe(false);
  });

  it('drops a setting spelled the way the other class spells it', () => {
    const node = multiStyleNode({ hint: { strokeThickness: 0 } });

    applyTagMutation(node, {
      kind: 'set',
      tag: 'hint',
      key: 'strokeEnabled',
      value: { 'stroke.width': 6 },
    });

    expect(tagOf(node, 'hint')).toEqual({ strokeThickness: 1 });
  });
});

describe('the stroke switch on a tag of the newer class', () => {
  /** The default is a whole style, so everything it carries is shown. */
  it('is reported on the default, which is stroked', () => {
    expect(readTag(mergedNode().node, 'default')?.['strokeEnabled']).toBe(true);
  });

  /**
   * A tag whose stroke is merely wider than the default's overrides the width and
   * nothing else — the answer to "is there a stroke" is the same on both.
   */
  it('is not reported by a tag that agrees with the default about it', () => {
    const style = readTag(mergedNode().node, 'score');

    expect(style?.['stroke.width']).toBe(8);
    expect(style).not.toHaveProperty('strokeEnabled');
  });

  it('is reported by a tag that takes the stroke away', () => {
    const { node } = mergedNode({ hint: { stroke: { color: '#44240d', width: 0, join: 'miter' } } });

    expect(readTag(node, 'hint')?.['strokeEnabled']).toBe(false);
  });

  it('is written through the width, and asks the node to redraw', () => {
    const { node, updates } = mergedNode();

    expect(
      applyTagMutation(node, { kind: 'set', tag: 'score', key: 'strokeEnabled', value: false }, OBJECT),
    ).toBe(true);

    expect((subStylesOf(node)['score']?.['stroke'] as Record<string, unknown>)['width']).toBe(0);
    expect(updates).not.toHaveLength(0);
  });

  it('builds a stroke for a tag that has none', () => {
    const { node } = mergedNode({ hint: { stroke: null } });

    expect(
      applyTagMutation(node, { kind: 'set', tag: 'hint', key: 'strokeEnabled', value: true }, OBJECT),
    ).toBe(true);

    expect(subStylesOf(node)['hint']?.['stroke']).toEqual({ width: 1 });
  });

  it('comes back on with the settings it was given', () => {
    const { node } = mergedNode({ hint: { stroke: { color: '#44240d', width: 0, join: 'miter' } } });

    expect(
      applyTagMutation(
        node,
        {
          kind: 'set',
          tag: 'hint',
          key: 'strokeEnabled',
          value: { 'stroke.width': 6, 'stroke.join': 'bevel' },
        },
        OBJECT,
      ),
    ).toBe(true);

    expect(subStylesOf(node)['hint']?.['stroke']).toEqual({
      color: '#44240d',
      width: 6,
      join: 'bevel',
    });
  });

  /**
   * Clearing puts back the default's **answer** — that there is a stroke — rather
   * than the default's width, because the switch is only ever about the one
   * question. The width is a row of its own with a reset of its own.
   *
   * Nothing in the panel sends this: a hoisted switch is drawn in the group's
   * heading, where the reset button is not. It is covered because the command is
   * reachable from another process, and every declared key has to behave.
   */
  it('is cleared into the default’s answer, not by assigning the key', () => {
    const { node } = mergedNode({ hint: { stroke: { color: '#44240d', width: 0, join: 'miter' } } });

    expect(
      applyTagMutation(node, { kind: 'clear', tag: 'hint', key: 'strokeEnabled' }, OBJECT),
    ).toBe(true);

    const style = subStylesOf(node)['hint'];
    expect(style).not.toHaveProperty('strokeEnabled');
    expect((style?.['stroke'] as Record<string, unknown>)['width']).toBe(1);
  });
});

/**
 * The shadow switch was always a boolean on both classes; what is new is that it
 * can carry the settings it is coming back with. That matters most here, where
 * the class keeps a shadow as an object and switching it off destroys the lot.
 */
describe('the shadow switch carrying its settings', () => {
  it('turns the shadow on and fills it in, in that order', () => {
    const { node } = mergedNode({ hint: { dropShadow: null } });

    expect(
      applyTagMutation(
        node,
        {
          kind: 'set',
          tag: 'hint',
          key: 'dropShadow',
          value: { 'dropShadow.blur': 7, 'dropShadow.distance': 3 },
        },
        OBJECT,
      ),
    ).toBe(true);

    const shadow = subStylesOf(node)['hint']?.['dropShadow'] as Record<string, unknown>;
    expect(shadow['blur']).toBe(7);
    expect(shadow['distance']).toBe(3);
  });

  it('ignores a setting that is itself a switch', () => {
    const { node } = mergedNode({ hint: { dropShadow: null, stroke: null } });

    applyTagMutation(
      node,
      { kind: 'set', tag: 'hint', key: 'dropShadow', value: { strokeEnabled: true } },
      OBJECT,
    );

    expect(subStylesOf(node)['hint']?.['stroke']).toBeNull();
  });
});

/**
 * Taking a whole group off a tag.
 *
 * A fill, a stroke and a shadow are single decisions written down as several
 * fields, so they are put back as one — a case of its own rather than a series
 * of `clear`s, because every command crosses the bridge alone and a stroke half
 * taken off a tag is not a state anyone meant to pass through.
 */
describe('clearing a whole group off a tag of the older class', () => {
  it('drops every key of the group the tag was holding', () => {
    const node = multiStyleNode({
      hint: { strokeThickness: 4, stroke: '#ff0000', lineJoin: 'bevel', fontSize: 20 },
    });

    expect(applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Stroke' })).toBe(true);
    expect(tagOf(node, 'hint')).toEqual({ fontSize: 20 });
  });

  /** One merge afterwards, not one per key: the class is told once. */
  it('tells the class once', () => {
    const node = multiStyleNode({ hint: { strokeThickness: 4, stroke: '#ff0000' } });

    const merges: Array<Record<string, unknown>> = [];
    const original = node['setTagStyle'] as (tag: string, style: Record<string, unknown>) => void;
    node['setTagStyle'] = (tag: string, style: Record<string, unknown>) => {
      merges.push(style);
      original.call(node, tag, style);
    };

    applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Stroke' });

    expect(merges).toHaveLength(1);
  });

  /** A gradient is more than the key it is written under, and goes whole. */
  it('takes the fields that only make sense beside a gradient with it', () => {
    const node = multiStyleNode({
      hint: { fill: ['#ffec6c', '#c07e00'], fillGradientType: 0, fillGradientStops: [0.25, 0.75] },
    });

    expect(applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Fill' })).toBe(true);
    expect(tagOf(node, 'hint')).toEqual({});
  });

  it('reports no change for a group the tag was not overriding', () => {
    const node = multiStyleNode({ hint: { fontSize: 20 } });

    expect(applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Stroke' })).toBe(false);
  });

  /** The group name arrives from another process, and is checked like a key. */
  it('refuses a group this class does not declare', () => {
    const node = multiStyleNode({ hint: { strokeThickness: 4 } });

    expect(applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Bevel' })).toBe(false);
    expect(tagOf(node, 'hint')).toEqual({ strokeThickness: 4 });
  });

  it('refuses the default, which is a whole style rather than an override', () => {
    const node = multiStyleNode();

    expect(applyTagMutation(node, { kind: 'clearGroup', tag: 'default', group: 'Font' })).toBe(
      false,
    );
  });
});

describe('clearing a whole group off a tag of the newer class', () => {
  it('puts every key of the group back to what the default says', () => {
    const { node } = mergedNode({
      hint: { stroke: { color: '#ffffff', width: 2, join: 'bevel' }, fontSize: 30 },
    });

    expect(
      applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Stroke' }, OBJECT),
    ).toBe(true);

    const style = subStylesOf(node)['hint'];
    expect(style?.['stroke']).toEqual({ color: '#44240d', width: 6, join: 'miter' });
    // Only the group asked for: the rest of the tag is left alone.
    expect(style?.['fontSize']).toBe(30);
  });

  /** The row disappears because the tag stops differing, which is what clearing
   *  means where there is nothing to remove. */
  it('leaves the group reporting no override at all', () => {
    const { node } = mergedNode({ hint: { stroke: { color: '#ffffff', width: 2, join: 'miter' } } });

    applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Stroke' }, OBJECT);

    const style = readTag(node, 'hint') ?? {};
    expect(Object.keys(style).filter((key) => key.startsWith('stroke'))).toEqual([]);
  });

  /**
   * The switch is declared first and therefore put back first, and that is the
   * requirement rather than the tidiness: a shadow that is off is `null` here, so
   * a blur restored before the shadow itself would be written into nothing.
   */
  it('puts a shadow back before the settings that live inside it', () => {
    const { node } = mergedNode({ hint: { dropShadow: null } });

    // The default gets a shadow the tag does not have, which is the only shape of
    // this problem that bites: the blur has to land in a shadow that exists.
    applyTagMutation(
      node,
      { kind: 'set', tag: 'default', key: 'dropShadow', value: { 'dropShadow.blur': 9 } },
      OBJECT,
    );

    expect(
      applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Shadow' }, OBJECT),
    ).toBe(true);

    const shadow = subStylesOf(node)['hint']?.['dropShadow'] as Record<string, unknown> | null;
    expect(shadow?.['blur']).toBe(9);
  });

  it('asks the node to redraw', () => {
    const { node, updates } = mergedNode({ hint: { stroke: { color: '#fff', width: 2 } } });
    updates.length = 0;

    applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Stroke' }, OBJECT);

    expect(updates).not.toHaveLength(0);
  });

  it('reports no change for a group the tag already agrees with', () => {
    const { node } = mergedNode({ hint: { fontSize: 30 } });

    expect(
      applyTagMutation(node, { kind: 'clearGroup', tag: 'hint', group: 'Stroke' }, OBJECT),
    ).toBe(false);
  });

  it('refuses the default', () => {
    const { node } = mergedNode();

    expect(
      applyTagMutation(node, { kind: 'clearGroup', tag: 'default', group: 'Stroke' }, OBJECT),
    ).toBe(false);
  });
});
