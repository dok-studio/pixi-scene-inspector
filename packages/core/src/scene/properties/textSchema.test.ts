import { describe, expect, it } from 'vitest';

import { createAdapter } from '../../adapters/index.js';
import type { PixiAdapter } from '../../adapters/types.js';
import { schemaFor } from './schema.js';
import { readValues } from './values.js';

/**
 * The Text style.
 *
 * The interesting property is that **one schema covers both lines**. v6/v7 name
 * these `style.strokeThickness` and `style.dropShadowBlur`; v8 names them
 * `style.stroke.width` and `style.dropShadow.blur`. Both sets are declared, and
 * a field the node does not carry is not drawn — so the schema never has to
 * know which version it is describing.
 */

type Fake = Record<string, unknown>;

const keysOf = (type: string): string[] =>
  schemaFor(type).flatMap((section) => section.fields.map((field) => field.key));

function textNode(style: Fake): { node: Fake; adapter: PixiAdapter } {
  const node: Fake = {
    renderPipeId: 'text',
    children: [],
    destroyed: false,
    visible: true,
    text: 'caption',
    style,
  };

  const adapter = createAdapter({ stage: node, renderer: { renderPipes: {} } });
  if (adapter === null) throw new Error('expected an adapter');

  return { node, adapter };
}

function read(adapter: PixiAdapter, node: Fake, key: string): unknown {
  const result = readValues(adapter, node, [key]);
  if ('unchanged' in result) throw new Error('expected data');
  return result.data[key];
}

describe('the Text schema', () => {
  it('is offered for a Text node', () => {
    expect(schemaFor('Text').map((section) => section.id)).toContain('text');
  });

  /** The sections every node has keep their place; Text is added under them. */
  it('comes after the Container sections', () => {
    expect(schemaFor('Text').map((section) => section.id)).toEqual([
      'info',
      'general',
      'interaction',
      'text',
      // On PixiJS 8 a multi-style text is a Text, so the tags are offered here
      // too — see `schema.ts`. A text without any draws no section.
      'multiStyleText',
      'textStyleSnippet',
      // After even the type's own sections: it restates the rows of the tab it
      // is drawn on, and the tab it is drawn on is the first one.
      'objectSnippet',
    ]);
  });

  it('has a tab of its own, and leaves the Container sections in the default one', () => {
    const tabs = schemaFor('Text').map((section) => [section.id, section.tab]);

    expect(tabs).toEqual([
      ['info', undefined],
      ['general', undefined],
      ['interaction', undefined],
      ['text', 'Text'],
      ['multiStyleText', 'Text'],
      // Last of the tab, and the same tab: a snippet repeats what the rows
      // above say, in a form for copying rather than for reading.
      ['textStyleSnippet', 'Text'],
      ['objectSnippet', undefined],
    ]);
  });

  /**
   * A caption is told from its neighbours by the classes it carries, then
   * written, then placed. All three rows are borrowed — the very same
   * descriptors Info and General declare, so a step tuned in one place cannot
   * come out different in the other.
   */
  it('puts the classes, then the placing, ahead of the text itself', () => {
    const info = schemaFor('Text').find((section) => section.id === 'info');
    const general = schemaFor('Text').find((section) => section.id === 'general');
    const text = schemaFor('Text').find((section) => section.id === 'text');

    expect(text?.fields.slice(0, 4).map((field) => field.key)).toEqual([
      'classesList',
      'position',
      'scaleXY',
      'text',
    ]);

    expect(info?.fields).toContain(text?.fields[0]);
    for (const field of text?.fields.slice(1, 3) ?? []) {
      expect(general?.fields).toContain(field);
    }
  });

  it('is offered for the other text-like types', () => {
    expect(schemaFor('BitmapText').map((section) => section.id)).toContain('text');
    expect(schemaFor('HTMLText').map((section) => section.id)).toContain('text');
  });

  it('is not offered for a node that has no style', () => {
    expect(schemaFor('Sprite').map((section) => section.id)).not.toContain('text');
  });

  it('has its own markup, not the generic one', () => {
    expect(schemaFor('Text').find((section) => section.id === 'text')?.layout).toBe('custom:text');
  });

  it('declares both versions’ names for the same thing', () => {
    const keys = keysOf('Text');

    expect(keys).toEqual(expect.arrayContaining(['style.strokeThickness', 'style.stroke.width']));
    expect(keys).toEqual(expect.arrayContaining(['style.dropShadowBlur', 'style.dropShadow.blur']));
  });

  /**
   * Neither is PixiJS's — a game's own `TextStyle` adds them — and both are as
   * much a part of laying a caption out as `wordWrapWidth`. A node without them
   * draws no row, the same as every field belonging to one PixiJS line only.
   */
  it('declares the fitting settings a game’s own style adds', () => {
    const keys = keysOf('Text');

    expect(keys).toEqual(expect.arrayContaining(['style.flexFont', 'style.wordWrapHeight']));
  });

  /**
   * The rows that are always there come first, and the wrap box — which appears
   * and disappears with its switches — comes last, so that flipping a switch
   * moves nothing above it. Nothing reorders a group, so the declaration is the
   * layout.
   */
  it('keeps the rows that never move above the ones that come and go', () => {
    const fields = schemaFor('Text').find((section) => section.id === 'text')?.fields ?? [];

    expect(fields.filter((field) => field.group === 'Layout').map((field) => field.key)).toEqual([
      'style.align',
      'style.padding',
      'resolution',
      'style.flexFont',
      'style.wordWrap',
      'style.wordWrapWidth',
      'style.wordWrapHeight',
    ]);
  });

  /** `oblique` is `italic` by another route, so only one of the two is offered. */
  it('offers one slant, not two spellings of it', () => {
    const fields = schemaFor('Text').find((section) => section.id === 'text')?.fields ?? [];

    expect(fields.find((field) => field.key === 'style.fontStyle')?.options).toEqual([
      'normal',
      'italic',
    ]);
  });

  it('groups every style field, and leaves the borrowed rows and the text ungrouped', () => {
    const fields = schemaFor('Text').find((section) => section.id === 'text')?.fields ?? [];
    const ungrouped = fields.filter((field) => field.group === undefined);

    expect(ungrouped.map((field) => field.key)).toEqual([
      'classesList',
      'position',
      'scaleXY',
      'text',
    ]);
    expect(new Set(fields.map((field) => field.group).filter(Boolean))).toEqual(
      new Set(['Font', 'Fill', 'Stroke', 'Shadow', 'Layout']),
    );
  });

  /**
   * Within a tab, because only one tab is on screen at a time — `position`
   * appears in both, on purpose, and never twice at once.
   */
  it('has no duplicate keys inside a tab', () => {
    const text = schemaFor('Text')
      .filter((section) => section.tab === 'Text')
      .flatMap((section) => section.fields.map((field) => field.key));

    expect(new Set(text).size).toBe(text.length);
  });
});

/**
 * The one place the two lines cannot be told apart by absence: `style.dropShadow`
 * exists on both and means different things.
 */
describe('the drop shadow flag', () => {
  it('reads a v6/v7 boolean straight through', () => {
    const { node, adapter } = textNode({ dropShadow: true });

    expect(read(adapter, node, 'style.dropShadow')).toBe(true);
  });

  it('reads a v6/v7 boolean that is off', () => {
    const { node, adapter } = textNode({ dropShadow: false });

    expect(read(adapter, node, 'style.dropShadow')).toBe(false);
  });

  /**
   * v8 keeps a settings object, which cannot cross the bridge and therefore
   * reads as absent — the same answer as a node with no shadow at all.
   */
  it('reads a v8 settings object as on', () => {
    const { node, adapter } = textNode({
      dropShadow: { alpha: 1, blur: 2, angle: 0.5, distance: 4, color: 0 },
    });

    expect(read(adapter, node, 'style.dropShadow')).toBe(true);
  });

  it('reads a v8 shadow that is switched off', () => {
    const { node, adapter } = textNode({ dropShadow: false });

    expect(read(adapter, node, 'style.dropShadow')).toBe(false);
  });

  it('reads a style with no shadow at all as off', () => {
    const { node, adapter } = textNode({ fontSize: 12 });

    expect(read(adapter, node, 'style.dropShadow')).toBe(false);
  });
});

/**
 * The switches that own their groups.
 *
 * They are the two properties whose value decides whether the rest of the group
 * means anything, and the schema is where that is said — the panel draws such a
 * one in the group's heading, and the page lets it carry the group's settings.
 */
describe('the group switches', () => {
  const textFields = () =>
    schemaFor('Text').flatMap((section) => section.fields);

  it('are the shadow and the stroke, and nothing else', () => {
    const marked = textFields()
      .filter((field) => field.groupSwitch === true)
      .map((field) => field.key);

    expect(marked).toEqual(['style.strokeEnabled', 'style.dropShadow']);
  });

  /** Two switches in one heading would be two answers to one question. */
  it('are at most one per group', () => {
    const groups = textFields()
      .filter((field) => field.groupSwitch === true)
      .map((field) => field.group);

    expect(new Set(groups).size).toBe(groups.length);
  });

  /**
   * The order is the schema's, and the panel does not reorder — so a switch that
   * were declared last would leave its group headed by nothing while the rows it
   * governs sat above it.
   */
  it('are declared first in their group', () => {
    for (const name of ['Stroke', 'Shadow']) {
      const group = textFields().filter((field) => field.group === name);

      expect(group[0]?.groupSwitch).toBe(true);
    }
  });

  /** Never drawn on the Text tab, where the heading is the label — but the tag
   *  section lists it by name in the menu that adds a property. */
  it('carry a label worth reading', () => {
    const labels = textFields()
      .filter((field) => field.groupSwitch === true)
      .map((field) => field.label);

    expect(labels).toEqual(['Stroke', 'Drop shadow']);
  });
});

/**
 * Whether a text is stroked, which PixiJS never says outright: it is concluded
 * from the width, and both lines keep that width somewhere else.
 */
describe('the stroke switch', () => {
  it('reads a v6/v7 thickness above zero as stroked', () => {
    const { node, adapter } = textNode({ stroke: '#ff0000', strokeThickness: 4 });

    expect(read(adapter, node, 'style.strokeEnabled')).toBe(true);
  });

  /** The v6/v7 default. The group used to draw a colour and a join for it. */
  it('reads a v6/v7 thickness of zero as unstroked', () => {
    const { node, adapter } = textNode({ stroke: 'black', strokeThickness: 0 });

    expect(read(adapter, node, 'style.strokeEnabled')).toBe(false);
  });

  it('reads a v8 stroke object by its width', () => {
    const { node, adapter } = textNode({ stroke: { color: 0xff0000, width: 4 } });

    expect(read(adapter, node, 'style.strokeEnabled')).toBe(true);
  });

  /**
   * The whole point of the switch existing. On v8 an unstroked text carries
   * `null` here, every nested key reads as absent, and without this row the
   * Stroke group would not be drawn at all — leaving nowhere to switch one on.
   */
  it('reads a v8 null stroke as unstroked, and still draws a row', () => {
    const { node, adapter } = textNode({ stroke: null });

    expect(read(adapter, node, 'style.strokeEnabled')).toBe(false);
  });

  it('draws no row for a style with no stroke at all', () => {
    const { node, adapter } = textNode({ fontSize: 12 });

    expect(read(adapter, node, 'style.strokeEnabled')).toBeNull();
  });
});

/** The absence rule doing its work: each line sees only its own field names. */
describe('one schema, two shapes', () => {
  it('a v6/v7 style offers the flat stroke keys and not the nested ones', () => {
    const { node, adapter } = textNode({ stroke: '#ff0000', strokeThickness: 4 });

    expect(read(adapter, node, 'style.strokeThickness')).toBe(4);
    expect(read(adapter, node, 'style.stroke.width')).toBeNull();
  });

  it('a v8 style offers the nested stroke keys and not the flat ones', () => {
    const { node, adapter } = textNode({ stroke: { color: 0xff0000, width: 4 } });

    expect(read(adapter, node, 'style.stroke.width')).toBe(4);
    expect(read(adapter, node, 'style.strokeThickness')).toBeNull();
  });
});
