import type { PropertyDescriptor } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import {
  TAG_STYLE_FIELDS_MERGED,
  TAG_STYLE_FIELDS_OVERRIDES,
  TAG_STYLE_KEYS_MERGED,
  TAG_STYLE_KEYS_OVERRIDES,
} from './tagStyleFields.js';

/**
 * Two lists, because there are two MultiStyleText classes and they spell a
 * style differently. Between them they are also the allow-list `text.mutateTag`
 * checks a key against, so both jobs break quietly if either drifts.
 */
const LISTS: Array<[name: string, fields: readonly PropertyDescriptor[]]> = [
  ['overrides', TAG_STYLE_FIELDS_OVERRIDES],
  ['merged', TAG_STYLE_FIELDS_MERGED],
];

describe.each(LISTS)('the %s tag fields', (_name, fields) => {
  it('has no duplicate keys', () => {
    const keys = fields.map((field) => field.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('labels every field', () => {
    expect(fields.filter((field) => field.label === '')).toEqual([]);
  });

  it('offers choices for every select', () => {
    const bare = fields.filter(
      (field) => field.editor === 'select' && !Array.isArray(field.options),
    );

    expect(bare).toEqual([]);
  });

  it('is serializable, since it crosses the bridge', () => {
    expect(JSON.parse(JSON.stringify(fields))).toEqual(fields);
  });
});

describe('the two spellings', () => {
  /** A tag on the older class is a flat object; a path would name nothing. */
  it('keeps paths out of the flat list', () => {
    expect(TAG_STYLE_FIELDS_OVERRIDES.filter((field) => field.key.includes('.'))).toEqual([]);
  });

  /** On the newer class the stroke and the shadow are objects of their own. */
  it('keeps the flat stroke and shadow spelling out of the nested list', () => {
    const flat = TAG_STYLE_FIELDS_MERGED.filter((field) =>
      ['strokeThickness', 'lineJoin', 'miterLimit', 'dropShadowColor', 'dropShadowBlur'].includes(
        field.key,
      ),
    );

    expect(flat).toEqual([]);
  });

  /** Whichever spelling a field has, the label above it stays the same. */
  it('labels the same setting the same way in both', () => {
    const label = (fields: readonly PropertyDescriptor[], key: string): string | undefined =>
      fields.find((field) => field.key === key)?.label;

    expect(label(TAG_STYLE_FIELDS_MERGED, 'stroke.width')).toBe(
      label(TAG_STYLE_FIELDS_OVERRIDES, 'strokeThickness'),
    );
    expect(label(TAG_STYLE_FIELDS_MERGED, 'dropShadow.blur')).toBe(
      label(TAG_STYLE_FIELDS_OVERRIDES, 'dropShadowBlur'),
    );
  });

  it('shares the settings that are spelled the same', () => {
    const merged = new Set(TAG_STYLE_FIELDS_MERGED.map((field) => field.key));

    expect(merged.has('fontSize')).toBe(true);
    expect(merged.has('valign')).toBe(true);
    expect(merged.has('dropShadow')).toBe(true);
  });

  it('derives an allow-list from each list, not one between them', () => {
    expect([...TAG_STYLE_KEYS_OVERRIDES].sort()).toEqual(
      TAG_STYLE_FIELDS_OVERRIDES.map((field) => field.key).sort(),
    );
    expect([...TAG_STYLE_KEYS_MERGED].sort()).toEqual(
      TAG_STYLE_FIELDS_MERGED.map((field) => field.key).sort(),
    );
  });

  /** A union would let the wrong spelling through onto the wrong class. */
  it('keeps each spelling out of the other allow-list', () => {
    expect(TAG_STYLE_KEYS_MERGED.has('strokeThickness')).toBe(false);
    expect(TAG_STYLE_KEYS_OVERRIDES.has('stroke.width')).toBe(false);
  });
});

/**
 * The switches that own their group, which both classes carry the same way.
 *
 * They are spelled identically on the two lists — unlike everything else about a
 * stroke or a shadow — because what differs between the classes is where the
 * value is kept, and that is `properties/stroke.ts`'s problem rather than a
 * descriptor's.
 */
describe.each(LISTS)('the group switches of the %s tag fields', (_name, fields) => {
  const switches = (): readonly PropertyDescriptor[] =>
    fields.filter((field) => field.groupSwitch === true);

  it('are the stroke and the shadow, and nothing else', () => {
    expect(switches().map((field) => field.key)).toEqual(['strokeEnabled', 'dropShadow']);
  });

  it('are booleans, since a switch is one', () => {
    expect(switches().every((field) => field.editor === 'boolean')).toBe(true);
  });

  /** Two switches in one heading would be two answers to one question. */
  it('are at most one per group', () => {
    const groups = switches().map((field) => field.group);

    expect(new Set(groups).size).toBe(groups.length);
  });

  /**
   * The panel draws groups in the order their fields are declared and does not
   * reorder — so a switch declared after its group would head nothing.
   */
  it('are declared first in their group', () => {
    for (const field of switches()) {
      const group = fields.filter((other) => other.group === field.group);

      expect(group[0]?.key).toBe(field.key);
    }
  });

  /**
   * Never drawn on the Text tab, where the heading is the label — but a tag lists
   * its missing properties by name in the menu that adds one.
   */
  it('carry a label worth reading in the menu that adds a property', () => {
    expect(switches().map((field) => field.label)).toEqual(['Stroke', 'Drop shadow']);
  });

  /**
   * A fill, a stroke and a shadow are one decision each; a font and a layout are
   * bags of independent settings. That is what decides whether a tag takes the
   * group on and off whole, so it is worth stating rather than inferring.
   */
  it('mark the three groups that are one thing, and no others', () => {
    const marked = fields.filter((field) => field.groupAtomic === true);

    expect(marked.map((field) => field.group)).toEqual(['Fill', 'Stroke', 'Shadow']);
  });

  /** A fact about the group, said by one member: two could disagree. */
  it('mark exactly one field of each such group', () => {
    const marked = fields.filter((field) => field.groupAtomic === true).map((f) => f.group);

    expect(new Set(marked).size).toBe(marked.length);
  });

  /** The one that says it is the one already drawn in the heading. */
  it('mark the field that owns the heading', () => {
    for (const field of fields.filter((candidate) => candidate.groupAtomic === true)) {
      expect(field.groupSwitch === true || field.editor === 'fill').toBe(true);
    }
  });

  it('are in the allow-list, since they are written like any other key', () => {
    const allowed = fields === TAG_STYLE_FIELDS_OVERRIDES ? TAG_STYLE_KEYS_OVERRIDES : TAG_STYLE_KEYS_MERGED;

    for (const field of switches()) expect(allowed.has(field.key)).toBe(true);
  });
});
