import type { Json, PropertyDescriptor, TextTagStyle } from '@scene-inspector/protocol';

import { formatCamelCase } from '../../../../lib/utils.js';

/**
 * Which properties one tag draws, and what they start at.
 *
 * How they are then arranged is not decided here — that is
 * `components/properties/propertyCells.ts`, which every grid in the panel
 * shares. What is particular to a tag is that it holds only what it overrides.
 */

/** Where a property that the declared list does not cover is collected. */
export const OTHER_GROUP = 'Other';

/**
 * A key the declared list does not cover — a game's own patch adds properties
 * of its own (`flexFont`, `wordWrapHeight`).
 *
 * Shown so a tag that sets one says so, and read-only because writing is
 * restricted to the declared list in the page. It is given a group of its own
 * rather than left ungrouped: under the four declared headings, a heading is
 * what says this key is not one of theirs.
 */
export function unknownDescriptor(key: string): PropertyDescriptor {
  return { key, label: formatCamelCase(key), editor: 'text', readOnly: true, group: OTHER_GROUP };
}

/**
 * The groups that are **one thing**, taken from the descriptors that say so.
 *
 * A fill, a stroke and a shadow are single decisions described from several
 * angles, and a tag carries each of them whole or not at all. The schema marks
 * one field of each such group (`groupAtomic`) rather than all of them, because
 * it is a fact about the group and a flag repeated on every member is a flag
 * that can disagree with itself.
 */
export function atomicGroups(fields: readonly PropertyDescriptor[]): ReadonlySet<string> {
  const names = new Set<string>();

  for (const field of fields) {
    if (field.groupAtomic === true && field.group !== undefined) names.add(field.group);
  }

  return names;
}

/**
 * The properties one tag draws: what it overrides, plus what was asked for
 * from the `+` menu and not overridden yet.
 *
 * Declared order first, so related properties sit together; keys the list does
 * not cover after. `revealed` is drawn because someone said they wanted to see
 * it, which is not a fact about the tag and therefore not something the page
 * could answer.
 *
 * **A group that is one thing is drawn whole.** Overriding a stroke's width says
 * the tag has a stroke, and a stroke has a colour and a join whether or not this
 * tag moved them — showing the width alone and hiding the rest was the panel
 * describing its own bookkeeping rather than the style. The cells that are not
 * overridden open at what `default` says, which is what a revealed cell has
 * always done.
 */
export function tagRows(
  tag: TextTagStyle,
  fields: readonly PropertyDescriptor[],
  revealed: ReadonlySet<string>,
): PropertyDescriptor[] {
  const held = (field: PropertyDescriptor): boolean =>
    field.key in tag.style || revealed.has(field.key);

  const atomic = atomicGroups(fields);

  // Which whole groups are on show: an atomic one whose any field is held, and —
  // for the rest — a group is only ever as present as its own fields are.
  const whole = new Set(
    fields
      .filter(
        (field) => field.group !== undefined && atomic.has(field.group) && held(field),
      )
      .map((field) => field.group),
  );

  const declared = fields.filter(
    (field) => held(field) || (field.group !== undefined && whole.has(field.group)),
  );
  const known = new Set(fields.map((field) => field.key));
  const extra = Object.keys(tag.style)
    .filter((key) => !known.has(key))
    .map(unknownDescriptor);

  return [...declared, ...extra];
}

/**
 * What a cell shows before the tag overrides anything.
 *
 * The default's value where there is one, so the number in the field is the
 * number on screen. Otherwise something the editor can hold — an empty string
 * would reach PixiJS as a colour and fail.
 */
export function startingValue(descriptor: PropertyDescriptor, base: Record<string, Json>): Json {
  const inherited = base[descriptor.key];
  if (inherited !== undefined) return inherited;

  switch (descriptor.editor) {
    case 'number':
    case 'range':
      return 0;
    case 'boolean':
      return false;
    // A fill starts as a colour, like any other: a gradient is something it is
    // turned into, and the editor offers the way there.
    case 'color':
    case 'fill':
      return '#ffffff';
    case 'select': {
      const options = descriptor.options;
      return Array.isArray(options) && typeof options[0] === 'string' ? options[0] : '';
    }
    default:
      return '';
  }
}
