import type { PropertyDescriptor, SectionSchema } from '@scene-inspector/protocol';

import { CLASSES_LIST, POSITION, SCALE_XY } from './fields.js';

/**
 * The Text style, as descriptors.
 *
 * Ported as data from the previous project's `v7TextProps`/`v8TextProps`, with
 * one structural difference: **both versions' keys are declared here at once**.
 * The two lines name these differently — v7 has `style.strokeThickness` and
 * `style.dropShadowBlur`, v8 has `style.stroke.width` and
 * `style.dropShadow.blur` — and there they were two files chosen by version.
 *
 * They can live together because a field the node does not carry is not drawn:
 * on v8 the v7 keys read as absent, and the other way round. The schema needs
 * no idea which version it is describing, and a page mixing library copies
 * still shows the right rows.
 *
 * The groups are new. The previous project put all of this in one flat 'Text'
 * section; the architecture asks for subgroups (§3.4), and `custom:text` draws
 * them folded.
 */

const FONT = 'Font';
// Two groups, not one: a fill is a colour and a stroke is four settings, and
// under one heading the colour that belongs to which was a guess every time.
//
// Each of the three now says in its heading what the group as a whole is: which
// kind a fill is, and whether a stroke or a shadow is there at all. A switch that
// decides whether the rows below it mean anything is not one of those rows.
const FILL = 'Fill';
const STROKE = 'Stroke';
const SHADOW = 'Shadow';
const LAYOUT = 'Layout';

const ALIGN = ['left', 'center', 'right', 'justify'];
const JOIN = ['round', 'bevel', 'miter'];
// `oblique` is left out on purpose. It is the upright face pushed over, which
// every browser also does for `italic` when the family has no italic cut — so
// the two choices are one look with two spellings, and offering both asks a
// question with no answer.
const FONT_STYLE = ['normal', 'italic'];
const FONT_WEIGHT = ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

const ANGLE_RANGE = { min: 0, max: 2 * Math.PI, step: 0.05 };
const UNIT_RANGE = { min: 0, max: 1, step: 0.05 };

const FIELDS: PropertyDescriptor[] = [
  // First of everything, above the position and the words alike: which classes
  // a caption carries is how it is told from the other four on the screen, and
  // that question is asked before any of the rest.
  CLASSES_LIST,

  // No group, and ahead of the text: a caption is written and then placed, and
  // having to leave the tab to nudge it by ten pixels is what these two rows
  // are here to spare. They are the descriptors General declares, which is
  // allowed because only one tab is on screen at a time.
  POSITION,
  SCALE_XY,

  // No group: the text itself sits above the style, in a box big enough to
  // read what it says.
  { key: 'text', label: 'Text', editor: 'textMultiLine' },

  { key: 'style.fontFamily', label: 'Family', editor: 'text', group: FONT },
  { key: 'style.fontSize', label: 'Size', editor: 'number', group: FONT },
  { key: 'style.fontStyle', label: 'Style', editor: 'select', group: FONT, options: FONT_STYLE },
  { key: 'style.fontWeight', label: 'Weight', editor: 'select', group: FONT, options: FONT_WEIGHT },
  { key: 'style.letterSpacing', label: 'Letter spacing', editor: 'number', group: FONT },
  { key: 'style.lineHeight', label: 'Line height', editor: 'number', group: FONT },

  // The label repeats no heading: under Fill and Stroke alike the question is
  // which colour, and that is what the row says. `fill` rather than `color`
  // because this one may be a gradient — see `properties/fill.ts`.
  { key: 'style.fill', label: 'Colour', editor: 'fill', group: FILL },

  // Synthetic, and the only one of these two switches that PixiJS does not offer
  // in some form: a stroke is a width and a colour, and whether there *is* one is
  // concluded from the width. See `properties/stroke.ts`. Declared first in its
  // group because it is the group's switch, and the heading is where it is drawn.
  {
    key: 'style.strokeEnabled',
    label: 'Stroke',
    editor: 'boolean',
    group: STROKE,
    groupSwitch: true,
  },
  // v6/v7 shape.
  { key: 'style.stroke', label: 'Colour', editor: 'color', group: STROKE },
  { key: 'style.strokeThickness', label: 'Width', editor: 'number', group: STROKE },
  { key: 'style.lineJoin', label: 'Join', editor: 'select', group: STROKE, options: JOIN },
  // v8 shape.
  { key: 'style.stroke.color', label: 'Colour', editor: 'color', group: STROKE },
  { key: 'style.stroke.width', label: 'Width', editor: 'number', group: STROKE },
  { key: 'style.stroke.join', label: 'Join', editor: 'select', group: STROKE, options: JOIN },

  // Synthetic: a toggle that reads the same on both lines. See `values.ts`.
  {
    key: 'style.dropShadow',
    label: 'Drop shadow',
    editor: 'boolean',
    group: SHADOW,
    groupSwitch: true,
  },
  // v6/v7 shape.
  { key: 'style.dropShadowColor', label: 'Colour', editor: 'color', group: SHADOW },
  { key: 'style.dropShadowAlpha', label: 'Alpha', editor: 'range', group: SHADOW, options: UNIT_RANGE },
  { key: 'style.dropShadowBlur', label: 'Blur', editor: 'number', group: SHADOW },
  { key: 'style.dropShadowAngle', label: 'Angle', editor: 'range', group: SHADOW, options: ANGLE_RANGE },
  { key: 'style.dropShadowDistance', label: 'Distance', editor: 'number', group: SHADOW },
  // v8 shape.
  { key: 'style.dropShadow.color', label: 'Colour', editor: 'color', group: SHADOW },
  { key: 'style.dropShadow.alpha', label: 'Alpha', editor: 'range', group: SHADOW, options: UNIT_RANGE },
  { key: 'style.dropShadow.blur', label: 'Blur', editor: 'number', group: SHADOW },
  { key: 'style.dropShadow.angle', label: 'Angle', editor: 'range', group: SHADOW, options: ANGLE_RANGE },
  { key: 'style.dropShadow.distance', label: 'Distance', editor: 'number', group: SHADOW },

  // What every caption has, and always in the same place: the rows below it come
  // and go with the switches, and a setting that moves whenever a switch is
  // flipped is a setting that has to be found again.
  { key: 'style.align', label: 'Align', editor: 'select', group: LAYOUT, options: ALIGN },
  { key: 'style.padding', label: 'Padding', editor: 'number', group: LAYOUT },
  { key: 'resolution', label: 'Resolution', editor: 'number', group: LAYOUT },

  // The wrap box, last, under the two switches that decide whether it is drawn
  // at all — `flexFont` above `wordWrap` because it is the stronger of the two:
  // it decides the size of the type, wrapping only where the lines break.
  //
  // Neither is PixiJS's — a game's own `TextStyle` adds `flexFont` and
  // `wordWrapHeight` — and `flexFont` means "shrink the font until the text
  // fits the wrap box", which is what `wordWrapHeight` is the other side of.
  // Declared here rather than left to be discovered because they are as much a
  // part of laying a caption out as `wordWrapWidth` is — and a node without them
  // draws no row, the same as every field that belongs to one PixiJS line and
  // not the other.
  { key: 'style.flexFont', label: 'Flex font', editor: 'boolean', group: LAYOUT },
  { key: 'style.wordWrap', label: 'Word wrap', editor: 'boolean', group: LAYOUT },
  { key: 'style.wordWrapWidth', label: 'Wrap width', editor: 'number', group: LAYOUT },
  { key: 'style.wordWrapHeight', label: 'Wrap height', editor: 'number', group: LAYOUT },
];

/**
 * The tab the text of a node lives under, away from the properties every
 * Container has. Named here because the transform rows that join it there are
 * declared next to the ones they are borrowed from, in `schema.ts`.
 */
export const TEXT_TAB = 'Text';

/**
 * `custom:text` replaces **only the markup** (§3.4). Every key here is read and
 * written through the same `scene.propValues` / `scene.setProp` as any other
 * property, which is what keeps the get/set logic single and the search over
 * labels working.
 */
export const TEXT_SECTION: SectionSchema = {
  id: 'text',
  title: 'Text',
  layout: 'custom:text',
  tab: TEXT_TAB,
  fields: FIELDS,
};
