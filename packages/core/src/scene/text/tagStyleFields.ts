import type { PropertyDescriptor } from '@scene-inspector/protocol';

/**
 * What one MultiStyleText tag may carry.
 *
 * There are two lists, because there are two classes. The v6 one keeps a tag as
 * a flat object of PixiJS 6 style options; the v8 one keeps it as a `TextStyle`,
 * where the stroke and the shadow are objects of their own. So a tag spells its
 * stroke width `strokeThickness` on one line and `stroke.width` on the other,
 * and offering the wrong spelling would create a property nothing reads.
 *
 * Deliberately **not** derived from `TEXT_SECTION` in `properties/textSchema.ts`,
 * even though most labels repeat. The two describe different things:
 *
 *  - the keys have a different shape — a tag holds `fontSize`, a node holds
 *    `style.fontSize`;
 *  - the membership differs — `valign` is MultiStyleText's own and means nothing
 *    to a plain Text, while `text` and the transform rows are the node's rather
 *    than the tag's.
 *
 * Twenty repeated labels are cheaper than the machinery that would join them.
 *
 * The union is also the **allow-list** for `text.mutateTag`. That is the same
 * rule `writeValue` follows: a command arriving from another process carries a
 * string key, and only a declared one may be written.
 */

const FONT = 'Font';
// Two groups, not one: a fill is a colour and a stroke is four settings, and
// under one heading the colour that belongs to which was a guess every time.
//
// Three of the five are **one thing each** (`groupAtomic`): a fill, a stroke and
// a shadow are single decisions described from several angles, and a tag takes
// each of them on or off whole. Font and Layout are not — a family and a size are
// independent settings that happen to sit under one heading, and a tag may well
// override one of them and nothing else.
const FILL = 'Fill';
const STROKE = 'Stroke';
const SHADOW = 'Shadow';
const LAYOUT = 'Layout';

const ALIGN = ['left', 'center', 'right', 'justify'];
const VALIGN = ['top', 'middle', 'bottom', 'baseline'];
const JOIN = ['round', 'bevel', 'miter'];
// Two choices, not three: `oblique` is the upright face pushed over, which is
// what `italic` falls back to anyway in a family with no italic cut. See
// `properties/textSchema.ts`, which offers the same pair.
const FONT_STYLE = ['normal', 'italic'];
const FONT_VARIANT = ['normal', 'small-caps'];
const FONT_WEIGHT = ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
const WHITE_SPACE = ['normal', 'pre', 'pre-line'];
const BASELINE = ['alphabetic', 'top', 'hanging', 'middle', 'ideographic', 'bottom'];

const ANGLE_RANGE = { min: 0, max: 2 * Math.PI, step: 0.05 };
const UNIT_RANGE = { min: 0, max: 1, step: 0.05 };

/**
 * The lists are assembled in **group order**, alternating what the two classes
 * share with what only one of them spells: the panel draws groups in the order
 * their fields are declared, so a Stroke group whose fields all came from the
 * per-class array would sit after Layout rather than after Fill.
 */

/** Spelled the same way by both classes. */
const FONT_AND_FILL: readonly PropertyDescriptor[] = [
  { key: 'fontFamily', label: 'Family', editor: 'text', group: FONT },
  { key: 'fontSize', label: 'Size', editor: 'number', group: FONT },
  { key: 'fontStyle', label: 'Style', editor: 'select', group: FONT, options: FONT_STYLE },
  { key: 'fontVariant', label: 'Variant', editor: 'select', group: FONT, options: FONT_VARIANT },
  { key: 'fontWeight', label: 'Weight', editor: 'select', group: FONT, options: FONT_WEIGHT },
  { key: 'letterSpacing', label: 'Letter spacing', editor: 'number', group: FONT },
  { key: 'lineHeight', label: 'Line height', editor: 'number', group: FONT },
  { key: 'leading', label: 'Leading', editor: 'number', group: FONT },

  // A colour or, just as often in practice, a gradient — a list of colours on the
  // older class, an object on the newer one. Both arrive as one value and are
  // edited by one control; see `properties/fill.ts`.
  { key: 'fill', label: 'Colour', editor: 'fill', group: FILL, groupAtomic: true },
];

/**
 * Whether there is a stroke at all — which neither class says outright, because
 * PixiJS does not: a stroke is a width and a colour, and the question is answered
 * from the width (`properties/stroke.ts`).
 *
 * Spelled the same on both classes for the same reason the shadow is: what
 * differs between them is where the width is kept, and that difference is the
 * module's, not the descriptor's.
 */
const STROKE_SWITCH: readonly PropertyDescriptor[] = [
  {
    key: 'strokeEnabled',
    label: 'Stroke',
    editor: 'boolean',
    group: STROKE,
    groupSwitch: true,
    groupAtomic: true,
  },
];

/** Both lines have a shadow; only its shape differs. Read as "is there one",
 *  which is the one question that is the same on both. */
const SHADOW_SWITCH: readonly PropertyDescriptor[] = [
  {
    key: 'dropShadow',
    label: 'Drop shadow',
    editor: 'boolean',
    group: SHADOW,
    groupSwitch: true,
    groupAtomic: true,
  },
];

const LAYOUT_FIELDS: readonly PropertyDescriptor[] = [
  { key: 'align', label: 'Align', editor: 'select', group: LAYOUT, options: ALIGN },
  // MultiStyleText's own on both lines: where a span sits against the rest of
  // its line. A number is allowed there too, but the four names are what styles
  // are written with, and a select cannot offer an open number.
  { key: 'valign', label: 'V-align', editor: 'select', group: LAYOUT, options: VALIGN },
  { key: 'wordWrap', label: 'Word wrap', editor: 'boolean', group: LAYOUT },
  { key: 'wordWrapWidth', label: 'Wrap width', editor: 'number', group: LAYOUT },
  { key: 'breakWords', label: 'Break words', editor: 'boolean', group: LAYOUT },
  { key: 'whiteSpace', label: 'White space', editor: 'select', group: LAYOUT, options: WHITE_SPACE },
  { key: 'trim', label: 'Trim', editor: 'boolean', group: LAYOUT },
  { key: 'textBaseline', label: 'Baseline', editor: 'select', group: LAYOUT, options: BASELINE },
  { key: 'padding', label: 'Padding', editor: 'number', group: LAYOUT },
];

/** The flat PixiJS 6 spelling: a tag there is a plain options object. */
const OVERRIDES_STROKE: readonly PropertyDescriptor[] = [
  { key: 'stroke', label: 'Colour', editor: 'color', group: STROKE },
  { key: 'strokeThickness', label: 'Width', editor: 'number', group: STROKE },
  { key: 'lineJoin', label: 'Join', editor: 'select', group: STROKE, options: JOIN },
  { key: 'miterLimit', label: 'Miter limit', editor: 'number', group: STROKE },
];

const OVERRIDES_SHADOW: readonly PropertyDescriptor[] = [
  { key: 'dropShadowColor', label: 'Colour', editor: 'color', group: SHADOW },
  { key: 'dropShadowAlpha', label: 'Alpha', editor: 'range', group: SHADOW, options: UNIT_RANGE },
  { key: 'dropShadowBlur', label: 'Blur', editor: 'number', group: SHADOW },
  { key: 'dropShadowAngle', label: 'Angle', editor: 'range', group: SHADOW, options: ANGLE_RANGE },
  { key: 'dropShadowDistance', label: 'Distance', editor: 'number', group: SHADOW },
];

/** The nested PixiJS 8 spelling: a tag there is a `TextStyle`. */
const MERGED_STROKE: readonly PropertyDescriptor[] = [
  { key: 'stroke.color', label: 'Colour', editor: 'color', group: STROKE },
  { key: 'stroke.width', label: 'Width', editor: 'number', group: STROKE },
  { key: 'stroke.join', label: 'Join', editor: 'select', group: STROKE, options: JOIN },
  { key: 'stroke.miterLimit', label: 'Miter limit', editor: 'number', group: STROKE },
];

const MERGED_SHADOW: readonly PropertyDescriptor[] = [
  { key: 'dropShadow.color', label: 'Colour', editor: 'color', group: SHADOW },
  { key: 'dropShadow.alpha', label: 'Alpha', editor: 'range', group: SHADOW, options: UNIT_RANGE },
  { key: 'dropShadow.blur', label: 'Blur', editor: 'number', group: SHADOW },
  { key: 'dropShadow.angle', label: 'Angle', editor: 'range', group: SHADOW, options: ANGLE_RANGE },
  { key: 'dropShadow.distance', label: 'Distance', editor: 'number', group: SHADOW },
];

/** A tag that holds only what it overrides — the flat v6 class. */
export const TAG_STYLE_FIELDS_OVERRIDES: readonly PropertyDescriptor[] = [
  ...FONT_AND_FILL,
  ...STROKE_SWITCH,
  ...OVERRIDES_STROKE,
  ...SHADOW_SWITCH,
  ...OVERRIDES_SHADOW,
  ...LAYOUT_FIELDS,
];

/** A tag that holds a whole style — the v8 class, where it is a `TextStyle`. */
export const TAG_STYLE_FIELDS_MERGED: readonly PropertyDescriptor[] = [
  ...FONT_AND_FILL,
  ...STROKE_SWITCH,
  ...MERGED_STROKE,
  ...SHADOW_SWITCH,
  ...MERGED_SHADOW,
  ...LAYOUT_FIELDS,
];

const keysOf = (fields: readonly PropertyDescriptor[]): ReadonlySet<string> =>
  new Set(fields.map((field) => field.key));

/**
 * The allow-lists `text.mutateTag` checks a key against — **one per class**,
 * not one between them.
 *
 * A union would let the flat spelling through on a node that uses the nested
 * one, and `strokeThickness` written onto a `TextStyle` is a property nothing
 * ever reads. Derived from the descriptors, so the lists and the editors cannot
 * drift apart.
 */
export const TAG_STYLE_KEYS_OVERRIDES = keysOf(TAG_STYLE_FIELDS_OVERRIDES);
export const TAG_STYLE_KEYS_MERGED = keysOf(TAG_STYLE_FIELDS_MERGED);
