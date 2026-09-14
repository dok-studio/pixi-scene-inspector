import type { Json, PropertyDescriptor } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { visibleFields } from './filter.js';

/**
 * Which property rows are drawn. Pure, and therefore the one part of the Text
 * section that can be held still in a test — the markup around it is verified
 * on the stand.
 */

const field = (key: string, label: string): PropertyDescriptor => ({ key, label, editor: 'number' });

const FIELDS: PropertyDescriptor[] = [
  field('style.wordWrap', 'Word wrap'),
  field('style.flexFont', 'Flex font'),
  field('style.wordWrapWidth', 'Wrap width'),
  field('style.dropShadow', 'Drop shadow'),
  field('style.dropShadowBlur', 'Blur'),
  field('style.fontSize', 'Size'),
];

const CONDITIONS = {
  'style.wordWrapWidth': { anyOf: ['style.wordWrap', 'style.flexFont'] },
  'style.dropShadowBlur': { anyOf: ['style.dropShadow'] },
};

const ALL: Record<string, Json> = {
  'style.wordWrap': true,
  'style.flexFont': false,
  'style.wordWrapWidth': 300,
  'style.dropShadow': true,
  'style.dropShadowBlur': 2,
  'style.fontSize': 12,
};

const keys = (fields: PropertyDescriptor[]): string[] => fields.map((f) => f.key);

describe('visibleFields', () => {
  it('shows everything the node carries', () => {
    expect(keys(visibleFields(FIELDS, ALL, CONDITIONS))).toEqual(FIELDS.map((f) => f.key));
  });

  it('drops a field the node does not carry', () => {
    const values = { ...ALL, 'style.fontSize': null };

    expect(keys(visibleFields(FIELDS, values, CONDITIONS))).not.toContain('style.fontSize');
  });

  describe('conditions', () => {
    it('hides the wrap width when wrapping is off', () => {
      const values = { ...ALL, 'style.wordWrap': false };

      expect(keys(visibleFields(FIELDS, values, CONDITIONS))).not.toContain('style.wordWrapWidth');
    });

    it('keeps the switch that turns it back on', () => {
      const values = { ...ALL, 'style.wordWrap': false };

      expect(keys(visibleFields(FIELDS, values, CONDITIONS))).toContain('style.wordWrap');
    });

    /**
     * The wrap box serves two switches: a game's `flexFont` shrinks the text to
     * fit it whether or not the text also wraps. Either one is enough.
     */
    it('keeps a field any one of its switches asks for', () => {
      const values = { ...ALL, 'style.wordWrap': false, 'style.flexFont': true };

      expect(keys(visibleFields(FIELDS, values, CONDITIONS))).toContain('style.wordWrapWidth');
    });

    it('hides the shadow settings when the shadow is off', () => {
      const values = { ...ALL, 'style.dropShadow': false };

      expect(keys(visibleFields(FIELDS, values, CONDITIONS))).not.toContain('style.dropShadowBlur');
    });

    it('leaves fields with no condition alone', () => {
      const values = { ...ALL, 'style.wordWrap': false, 'style.dropShadow': false };

      expect(keys(visibleFields(FIELDS, values, CONDITIONS))).toContain('style.fontSize');
    });
  });

  it('shows everything before the first values arrive', () => {
    expect(visibleFields(FIELDS, null, CONDITIONS)).toHaveLength(FIELDS.length);
  });

  it('keeps a field the reading says nothing about', () => {
    // What a folded section looks like: its keys are not asked for, so they are
    // missing rather than null. Missing is not an answer.
    const partial = { ...ALL };
    delete partial['style.fontSize'];

    expect(keys(visibleFields(FIELDS, partial, CONDITIONS))).toContain('style.fontSize');
  });
});

/**
 * The stroke, which is the one group whose switch is not a property of the style
 * at all: PixiJS has no flag for it, so a synthetic key answers whether there is
 * one and the rest of the group hangs off that.
 *
 * What is worth holding still here is the pair of them together — the rows go and
 * the switch stays. A switch that went with its own rows could never be pressed
 * again.
 */
describe('a group behind its switch', () => {
  const STROKE_FIELDS: PropertyDescriptor[] = [
    field('style.strokeEnabled', 'Stroke'),
    field('style.stroke.color', 'Colour'),
    field('style.stroke.width', 'Width'),
    field('style.stroke.join', 'Join'),
  ];

  const STROKE_CONDITIONS = {
    'style.stroke.color': { anyOf: ['style.strokeEnabled'] },
    'style.stroke.width': { anyOf: ['style.strokeEnabled'] },
    'style.stroke.join': { anyOf: ['style.strokeEnabled'] },
  };

  const values = (enabled: boolean): Record<string, Json> => ({
    'style.strokeEnabled': enabled,
    'style.stroke.color': '#ff0000',
    'style.stroke.width': 4,
    'style.stroke.join': 'miter',
  });

  it('draws the whole group while the switch is on', () => {
    expect(keys(visibleFields(STROKE_FIELDS, values(true), STROKE_CONDITIONS))).toEqual(
      STROKE_FIELDS.map((f) => f.key),
    );
  });

  /** The width included: it is how the stroke is switched, not a setting beside it. */
  it('leaves only the switch when it is off', () => {
    expect(keys(visibleFields(STROKE_FIELDS, values(false), STROKE_CONDITIONS))).toEqual([
      'style.strokeEnabled',
    ]);
  });

  /**
   * On v8 an unstroked text carries no stroke object, so every nested key reads
   * as absent — and without the synthetic one there would be no group at all, and
   * nowhere to switch a stroke on.
   */
  it('keeps a heading on a node that carries none of the settings', () => {
    const absent: Record<string, Json> = {
      'style.strokeEnabled': false,
      'style.stroke.color': null,
      'style.stroke.width': null,
      'style.stroke.join': null,
    };

    expect(keys(visibleFields(STROKE_FIELDS, absent, STROKE_CONDITIONS))).toEqual([
      'style.strokeEnabled',
    ]);
  });
});
