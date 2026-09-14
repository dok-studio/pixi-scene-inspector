import type { PropertyDescriptor, TextTagStyle } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { atomicGroups, OTHER_GROUP, startingValue, tagRows } from './tagCells.js';

/**
 * What a tag draws and what an untouched cell starts at. How those cells are
 * then arranged is `components/properties/propertyCells.ts`, tested there.
 */

const FONT = 'Font';
const FILL = 'Fill & Stroke';

const FIELDS: PropertyDescriptor[] = [
  { key: 'fontFamily', label: 'Family', editor: 'text', group: FONT },
  { key: 'fontSize', label: 'Size', editor: 'number', group: FONT },
  { key: 'fill', label: 'Fill', editor: 'color', group: FILL },
  { key: 'dropShadow', label: 'Drop shadow', editor: 'boolean', group: 'Shadow' },
  { key: 'align', label: 'Align', editor: 'select', group: 'Layout', options: ['left', 'center'] },
];

const tagWith = (style: TextTagStyle['style']): TextTagStyle => ({
  name: 'score',
  style,
  text: '18 450',
});

const field = (key: string): PropertyDescriptor => {
  const found = FIELDS.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`No field ${key}`);
  return found;
};

describe('tagRows', () => {
  const none: ReadonlySet<string> = new Set();

  it('draws what the tag overrides, in the order the fields are declared', () => {
    const rows = tagRows(tagWith({ fill: '#fff', fontFamily: 'Arial' }), FIELDS, none);

    expect(rows.map((row) => row.key)).toEqual(['fontFamily', 'fill']);
  });

  it('draws what was asked for, even though the tag does not set it', () => {
    const rows = tagRows(tagWith({ fill: '#fff' }), FIELDS, new Set(['fontSize']));

    expect(rows.map((row) => row.key)).toEqual(['fontSize', 'fill']);
  });

  /** A game's own patch adds properties of its own; a tag that sets one says so. */
  it('shows a key the declared list does not cover, read-only and last', () => {
    const rows = tagRows(tagWith({ fill: '#fff', flexFont: true }), FIELDS, none);
    const last = rows[rows.length - 1];

    expect(last?.key).toBe('flexFont');
    expect(last?.label).toBe('Flex Font');
    expect(last?.readOnly).toBe(true);
    expect(last?.group).toBe(OTHER_GROUP);
  });
});

describe('startingValue', () => {
  it('opens a cell at what the default says', () => {
    expect(startingValue(field('fontSize'), { fontSize: 26 })).toBe(26);
  });

  /** An empty string would reach PixiJS as a colour and fail. */
  it('falls back to something the editor can hold', () => {
    expect(startingValue(field('fontSize'), {})).toBe(0);
    expect(startingValue(field('fill'), {})).toBe('#ffffff');
    expect(startingValue(field('dropShadow'), {})).toBe(false);
    expect(startingValue(field('align'), {})).toBe('left');
  });
});

/**
 * A group that is one thing is drawn whole.
 *
 * A stroke is a colour and a width and a join — overriding the width says the
 * tag has a stroke, and showing that width while hiding the colour beside it was
 * the panel describing its own bookkeeping rather than the style. The same
 * argument settles the switch, which lives in the heading: a heading present on
 * one tag and missing on the next reads as two kinds of group, where the truth is
 * only which key this tag happened to touch.
 */
describe('tagRows and a group that is one thing', () => {
  const none: ReadonlySet<string> = new Set();

  const ATOMIC: PropertyDescriptor[] = [
    {
      key: 'strokeEnabled',
      label: 'Stroke',
      editor: 'boolean',
      group: 'Stroke',
      groupSwitch: true,
      groupAtomic: true,
    },
    { key: 'stroke', label: 'Colour', editor: 'color', group: 'Stroke' },
    { key: 'strokeThickness', label: 'Width', editor: 'number', group: 'Stroke' },
    {
      key: 'dropShadow',
      label: 'Drop shadow',
      editor: 'boolean',
      group: 'Shadow',
      groupSwitch: true,
      groupAtomic: true,
    },
    { key: 'dropShadowBlur', label: 'Blur', editor: 'number', group: 'Shadow' },
    // The other kind, sharing the fixture so the two rules are told apart.
    { key: 'fontFamily', label: 'Family', editor: 'text', group: FONT },
    { key: 'fontSize', label: 'Size', editor: 'number', group: FONT },
  ];

  it('draws every field of the group when the tag overrides one of them', () => {
    const rows = tagRows(tagWith({ dropShadowBlur: 4 }), ATOMIC, none);

    expect(rows.map((row) => row.key)).toEqual(['dropShadow', 'dropShadowBlur']);
  });

  it('draws the whole stroke for a tag that overrides only its width', () => {
    const rows = tagRows(tagWith({ strokeThickness: 4 }), ATOMIC, none);

    expect(rows.map((row) => row.key)).toEqual(['strokeEnabled', 'stroke', 'strokeThickness']);
  });

  it('draws nothing for a group the tag says nothing about', () => {
    const rows = tagRows(tagWith({ dropShadowBlur: 4 }), ATOMIC, none);

    expect(rows.map((row) => row.key)).not.toContain('strokeEnabled');
  });

  /** Revealing is asking for the group, and the `+` menu offers it as one. */
  it('draws the whole group when one of its keys was revealed', () => {
    const rows = tagRows(tagWith({}), ATOMIC, new Set(['strokeThickness']));

    expect(rows.map((row) => row.key)).toEqual(['strokeEnabled', 'stroke', 'strokeThickness']);
  });

  it('does not draw a field twice when the tag overrides it as well', () => {
    const tag = tagWith({ strokeEnabled: false, strokeThickness: 0 });
    const rows = tagRows(tag, ATOMIC, new Set(['stroke']));

    expect(rows.map((row) => row.key)).toEqual(['strokeEnabled', 'stroke', 'strokeThickness']);
  });

  /** The other kind: a family and a size are independent, and stay independent. */
  it('leaves a group that is not one thing per property', () => {
    const rows = tagRows(tagWith({ fontSize: 30 }), ATOMIC, none);

    expect(rows.map((row) => row.key)).toEqual(['fontSize']);
  });
});

describe('atomicGroups', () => {
  it('names a group from the one field that declares it', () => {
    const fields: PropertyDescriptor[] = [
      { key: 'a', label: 'A', editor: 'number', group: 'Stroke', groupAtomic: true },
      { key: 'b', label: 'B', editor: 'number', group: 'Stroke' },
      { key: 'c', label: 'C', editor: 'number', group: FONT },
    ];

    expect([...atomicGroups(fields)]).toEqual(['Stroke']);
  });

  it('names nothing where nothing declares it', () => {
    expect(atomicGroups(FIELDS).size).toBe(0);
  });
});
