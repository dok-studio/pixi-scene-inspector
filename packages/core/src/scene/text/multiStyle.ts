import type {
  Json,
  PropertyDescriptor,
  Revisioned,
  TextTagMutation,
  TextTagStyle,
} from '@scene-inspector/protocol';

import { getProp, setProp } from '../../adapters/common.js';
import type { GradientSupport, Node } from '../../adapters/types.js';
import { FNV_OFFSET, hashJson, hashString } from '../fingerprint.js';
import { isGradientFill, readFill, writeFill } from '../properties/fill.js';
import { asSettings, switchesOn } from '../properties/groupSwitch.js';
import type { StrokeShape } from '../properties/stroke.js';
import { readStroke, writeStroke } from '../properties/stroke.js';
import {
  TAG_STYLE_FIELDS_MERGED,
  TAG_STYLE_FIELDS_OVERRIDES,
  TAG_STYLE_KEYS_MERGED,
  TAG_STYLE_KEYS_OVERRIDES,
} from './tagStyleFields.js';

/**
 * MultiStyleText, which is not PixiJS.
 *
 * The class is installed by the application over `Text` — in the game this was
 * written for it lives in its own PixiJS patch layer — and may be absent
 * entirely. So this is a module with **its own detection** rather than a branch
 * in `PixiAdapter`, exactly like `scene/spine/spine.ts` (docs/architecture.md
 * §3.5), and for the same reason it is allowed to read fields off a node
 * directly: it is a declared boundary with an outside library, and the knowledge
 * is contained here rather than spread.
 *
 * **There are two classes, and therefore two shapes.** They correspond to the
 * two PixiJS lines one to one — the older one extends v6's `Text`, the newer one
 * builds on v8's `AbstractText`, and neither can exist under the other library.
 * The branch still lives here rather than behind `PixiAdapter`: the class is the
 * application's, not PixiJS's, and an adapter that described someone else's
 * class would need the same exception Spine already has. Nothing here asks which
 * version is running; the shapes are told apart by their own marks, the way
 * `nodeType.ts` tells every class apart, and for the same reason — bundles are
 * minified and a subclass reports its own name.
 *
 *  - `overrides` — a tag is a plain object holding **only what it overrides**,
 *    written and removed through the class's own `setTagStyle`/`deleteTagStyle`;
 *  - `merged` — a tag is a `TextStyle` holding a **whole style**, merged from
 *    the default and the override when the node was built. What it overrides has
 *    to be worked out by comparing it against the default, and it is written
 *    through the style's own setters.
 */

/** The tag that is the node's whole style rather than an override of it. */
const DEFAULT_TAG = 'default';

/**
 * The class builds a regular expression by joining the tag names into an
 * alternation, so a name carrying a metacharacter would not merely be odd — it
 * would break the parsing of the node's entire text.
 */
const TAG_NAME = /^[A-Za-z0-9_-]+$/;

/** What the tag names are joined into, escaped — see `spansByTag`. */
const METACHARACTER = /[.*+?^${}()|[\]\\]/g;

/**
 * The one key whose shape differs enough to need translating.
 *
 * On the merged shape a shadow is an object or `null`, and `getProp` carries
 * neither across. The question that means the same on both lines is whether
 * there is a shadow at all, so that is what the row shows — and the style's own
 * setter turns `true` back into a full shadow and `false` into none.
 */
const DROP_SHADOW = 'dropShadow';

/**
 * The other key that needs translating, for the other reason: a fill is a colour
 * or a gradient, and a gradient is written differently by each class — a list of
 * colours with two fields beside it on the older one, an object on the newer.
 * `properties/fill.ts` turns both into the one shape the panel edits.
 */
const FILL = 'fill';

/**
 * The third, and the only one neither class carries in any form: PixiJS has no
 * flag for a stroke, so whether there is one is concluded from its width — kept
 * flat on one class and inside an object on the other. `properties/stroke.ts`
 * answers the question and writes it back through both shapes.
 */
const STROKE = 'stroke';
const STROKE_ENABLED = 'strokeEnabled';

/** Where the older class keeps the width the switch is read from. */
const STROKE_WIDTH = 'strokeThickness';

/** Which spelling each class uses, which here is not concluded but known. */
const STROKE_SHAPE: Record<MultiStyleShape['kind'], StrokeShape> = {
  overrides: 'flat',
  merged: 'nested',
};

/**
 * The fields that go with a gradient on the older class. They are read as part of
 * the fill and not on their own: shown separately they would appear under `Other`
 * as two read-only numbers repeating what the fill row already draws.
 */
const FILL_PARTS = new Set(['fillGradientType', 'fillGradientStops']);

interface OverridesLike {
  _textStyles: Record<string, Record<string, unknown>>;
  setTagStyle: (tag: string, style: Record<string, unknown>) => void;
  deleteTagStyle: (tag: string) => void;
}

interface StyleLike {
  clone?: () => object;
  update?: () => void;
}

interface MergedLike {
  style: StyleLike & { subStyles: Record<string, object> };
}

export type MultiStyleShape =
  | { kind: 'overrides'; node: OverridesLike; tags: Record<string, Record<string, unknown>> }
  | { kind: 'merged'; node: MergedLike; tags: Record<string, object> };

function asOverrides(node: Node): MultiStyleShape | null {
  const candidate = node as Partial<OverridesLike>;

  const tags = candidate._textStyles;
  if (typeof tags !== 'object' || tags === null || Array.isArray(tags)) return null;
  if (typeof candidate.setTagStyle !== 'function') return null;
  if (typeof candidate.deleteTagStyle !== 'function') return null;

  return { kind: 'overrides', node: candidate as OverridesLike, tags };
}

function asMerged(node: Node): MultiStyleShape | null {
  const style = (node as { style?: unknown }).style;
  if (typeof style !== 'object' || style === null) return null;

  const tags = (style as { subStyles?: unknown }).subStyles;
  if (typeof tags !== 'object' || tags === null || Array.isArray(tags)) return null;

  return {
    kind: 'merged',
    node: node as MergedLike,
    tags: tags as Record<string, object>,
  };
}

/**
 * @returns the node seen as a multi-style text, or null.
 *
 * Every mark is required in both shapes: a set of named styles alone could be an
 * application's own field, and what surrounds it is what makes it this class.
 */
export function asMultiStyle(node: Node): MultiStyleShape | null {
  return asOverrides(node) ?? asMerged(node);
}

/** The descriptors that fit this node — one spelling, never both. */
export function tagStyleFields(node: Node): readonly PropertyDescriptor[] {
  const shape = asMultiStyle(node);
  if (shape === null) return [];

  return shape.kind === 'overrides' ? TAG_STYLE_FIELDS_OVERRIDES : TAG_STYLE_FIELDS_MERGED;
}

/**
 * Style values cross the bridge as JSON, and a style holds more than plain
 * scalars: a fill is a colour **or a list of them**, which is how a gradient is
 * written. Anything else — an object, a function — is not something the panel
 * could show or send back, so it is left out rather than mangled.
 */
function asJsonValue(value: unknown): Json | undefined {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value;
    default:
      break;
  }

  if (!Array.isArray(value)) return undefined;

  const items: Json[] = [];
  for (const item of value) {
    const converted = asJsonValue(item);
    if (converted === undefined) return undefined;
    items.push(converted);
  }

  return items;
}

/**
 * Every key the tag actually carries, not the resolved style.
 *
 * Unknown keys are reported too — a game's own patch adds properties of its own
 * (`flexFont`, `wordWrapHeight`), and a tag that sets one should say so. Only
 * writing is restricted to the declared list; see `applyTagMutation`.
 */
function readOverrideTag(style: Record<string, unknown>): Record<string, Json> {
  const data: Record<string, Json> = {};

  for (const [key, raw] of Object.entries(style)) {
    if (FILL_PARTS.has(key)) continue;

    const value = key === FILL ? readFill(style, FILL) : asJsonValue(raw);
    if (value !== undefined) data[key] = value;
  }

  // The switch is not a key a tag holds, so it has to be added — and only where
  // the tag really does decide the matter. A tag overriding the stroke *colour*
  // and nothing else has said nothing about whether there is a stroke, and
  // reporting the switch there would claim an override it does not hold.
  if (STROKE_WIDTH in style) data[STROKE_ENABLED] = readStroke(style, STROKE) ?? false;

  return data;
}

/**
 * One declared key off a merged tag.
 *
 * `getProp` does the walking: it already follows a path, refuses steps that
 * would climb into a prototype, and reduces what it finds to JSON. It is used
 * directly rather than through an adapter because a tag style is not a node and
 * has no adapter — the class it belongs to is the application's.
 */
function readMergedKey(style: object, key: string): Json | undefined {
  if (key === FILL) return readFill(style, FILL);
  if (key === STROKE_ENABLED) return readStroke(style, STROKE);

  if (key !== DROP_SHADOW) return getProp(style, key);

  const shadow = (style as { dropShadow?: unknown }).dropShadow;
  return typeof shadow === 'object' && shadow !== null;
}

/**
 * What a merged tag overrides, which is not something it records.
 *
 * A tag there was built by merging the default with its override, so the only
 * way back to "what does this tag change" is to compare the two. `default` is
 * the exception in both shapes: it is a whole style rather than an override of
 * one, so everything it carries is shown.
 */
function readMergedTag(style: object, base: object, isDefault: boolean): Record<string, Json> {
  const data: Record<string, Json> = {};

  for (const field of TAG_STYLE_FIELDS_MERGED) {
    const value = readMergedKey(style, field.key);
    if (value === undefined) continue;

    if (isDefault) {
      data[field.key] = value;
      continue;
    }

    const inherited = readMergedKey(base, field.key);
    if (!same(value, inherited, holdsColour(field.editor))) data[field.key] = value;
  }

  return data;
}

/**
 * The same colour, written two ways.
 *
 * PixiJS 8 keeps a colour as the application wrote it — `'#44240d'` — but
 * `TextStyle.clone()` copies the *converted* style instead, where the same
 * colour is the number 4465677. A tag copied from the default therefore differs
 * from it on paper while being identical on screen, and would open with a row
 * for a property it does not override. Comparing the numbers settles it.
 *
 * Only the `#rrggbb` forms are folded: a named colour or an `rgb()` string has
 * no cheap numeric form, and comparing those as written is right anyway.
 */
function asColourNumber(value: Json | undefined): Json | undefined {
  if (typeof value !== 'string') return value;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex === null) return value;

  const digits = hex[1] ?? '';
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;

  return Number.parseInt(full, 16);
}

/**
 * Style values are scalars, short lists, or a gradient — so this is comparison
 * enough. The gradient is why objects are walked at all: a tag copied from the
 * default carries an equal one, and comparing the two by identity would report a
 * gradient nobody overrode as an override.
 *
 * Exported for `styleSnippet.ts`, which asks the same question about the same
 * two classes: what does this style say that the one behind it does not.
 */
export function same(a: Json | undefined, b: Json | undefined, isColour = false): boolean {
  if (a === b) return true;
  if (isColour && asColourNumber(a) === asColourNumber(b)) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => same(item, b[index], isColour));
  }

  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    if (Array.isArray(a) || Array.isArray(b)) return false;

    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => same(a[key], b[key], isColour))
    );
  }

  return false;
}

/** Whether this field holds a colour, however it spells one. A gradient's stops
 *  are colours too, and the same `#44240d`-versus-4465677 problem applies. */
function holdsColour(editor: PropertyDescriptor['editor']): boolean {
  return editor === 'color' || editor === 'fill';
}

/**
 * Which part of the text each tag covers.
 *
 * The same walk the class makes when it draws: the markup is a stack, and a
 * span belongs to whatever is on top of it. A span inside two tags is therefore
 * attributed to the inner one — that is the tag whose style is actually
 * deciding how those characters look.
 *
 * The names are escaped before being joined, unlike in the class, which builds
 * its alternation raw. A name carrying a metacharacter already breaks the
 * class's own parsing; there is no reason for it to break this one as well.
 */
function spansByTag(text: string, names: readonly string[]): Record<string, string[]> {
  const spans: Record<string, string[]> = {};

  const push = (tag: string, part: string): void => {
    // One line of information: a span is worth showing, the line breaks around
    // it are not.
    const collapsed = part.replace(/\s+/g, ' ').trim();
    if (collapsed === '') return;

    (spans[tag] ??= []).push(collapsed);
  };

  const stack: string[] = [DEFAULT_TAG];
  const top = (): string => stack[stack.length - 1] ?? DEFAULT_TAG;
  let cursor = 0;

  if (names.length > 0) {
    const alternation = names.map((name) => name.replace(METACHARACTER, '\\$&')).join('|');
    const regex = new RegExp(
      `<(${alternation})(?:\\s+[A-Za-z0-9_-]+=(?:"[^"]*"|'[^']*'))*\\s*>|</(${alternation})\\s*>`,
      'g',
    );

    for (const match of text.matchAll(regex)) {
      const at = match.index ?? 0;
      if (at > cursor) push(top(), text.slice(cursor, at));

      const opening = match[1];
      if (opening === undefined) {
        if (stack.length > 1) stack.pop();
      } else {
        stack.push(opening);
      }

      cursor = at + match[0].length;
    }
  }

  // The tail after the last tag, which the loop never reaches.
  if (cursor < text.length) push(top(), text.slice(cursor));

  return spans;
}

/** Repeated spans are joined: a tag used twice covers both, and says so. */
function joinSpans(spans: readonly string[] | undefined): string {
  return (spans ?? []).join(' … ');
}

/**
 * @returns the tags with `default` first, revisioned like every other pull.
 *
 * The order is not the object's: `default` is the style the others override, so
 * it belongs at the top whatever order the application declared them in.
 */
export function readTagStyles(node: Node, knownRev?: number): Revisioned<TextTagStyle[]> {
  const shape = asMultiStyle(node);
  if (shape === null) return { rev: 0, data: [] };

  const names = Object.keys(shape.tags).sort((a, b) => {
    if (a === DEFAULT_TAG) return -1;
    if (b === DEFAULT_TAG) return 1;
    return 0;
  });

  // Read defensively rather than required by the detection: the node is a Text
  // and has it, but nothing here should fall over if an application's own class
  // is arranged differently.
  const source = (node as { text?: unknown }).text;
  const spans = spansByTag(typeof source === 'string' ? source : '', names);

  const base = shape.kind === 'merged' ? (shape.tags[DEFAULT_TAG] ?? {}) : {};

  const tags: TextTagStyle[] = [];
  let rev = FNV_OFFSET;

  for (const name of names) {
    const style =
      shape.kind === 'overrides'
        ? readOverrideTag(shape.tags[name] ?? {})
        : readMergedTag(shape.tags[name] ?? {}, base, name === DEFAULT_TAG);

    const text = joinSpans(spans[name]);
    tags.push({ name, style, text });

    // The text is folded in as well, so editing the markup above refreshes
    // these rows instead of leaving them describing the previous wording.
    rev = hashJson(hashString(hashString(rev, name), text), style);
  }

  return rev === knownRev ? { rev, unchanged: true } : { rev, data: tags };
}

/** Only what a style may hold, and only what can be sent back — see `asJsonValue`.
 *  A gradient is the one object allowed through, and it has its own shape check. */
function isWritable(value: Json): boolean {
  if (isGradientFill(value)) return true;
  if (Array.isArray(value)) return value.every((item) => isWritable(item));
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** The descriptors of one class, which are also its allow-list. */
function fieldsOf(kind: MultiStyleShape['kind']): readonly PropertyDescriptor[] {
  return kind === 'overrides' ? TAG_STYLE_FIELDS_OVERRIDES : TAG_STYLE_FIELDS_MERGED;
}

function keysOf(kind: MultiStyleShape['kind']): ReadonlySet<string> {
  return kind === 'overrides' ? TAG_STYLE_KEYS_OVERRIDES : TAG_STYLE_KEYS_MERGED;
}

function isGroupSwitch(kind: MultiStyleShape['kind'], key: string): boolean {
  return fieldsOf(kind).some((field) => field.key === key && field.groupSwitch === true);
}

/**
 * The fields of one group, in the order they were declared.
 *
 * The order carries a requirement rather than a preference: a group's switch is
 * declared first, and clearing it first is what makes the rest land. On the
 * merged class a shadow that is off is `null`, so a blur put back before the
 * shadow itself would be written into nothing.
 *
 * @returns empty for a group this class does not have, which is what refuses a
 * group name arriving from another process.
 */
function groupFields(
  kind: MultiStyleShape['kind'],
  group: string,
): readonly PropertyDescriptor[] {
  return fieldsOf(kind).filter((field) => field.group === group);
}

/**
 * A switch takes a boolean, or the settings it is coming back on with — and
 * nothing else. `isWritable` would refuse the second, since a settings record is
 * an object and the only object a style may hold is a gradient.
 */
function isSwitchValue(value: Json): boolean {
  return value === true || value === false || asSettings(value) !== null;
}

/**
 * Flips a group's switch on a style, or on a patch that is about to become one.
 *
 * Both classes are served because the difference between them is where the width
 * of a stroke lives, and that belongs to `properties/stroke.ts`. The shadow needs
 * no translating at all: assigning a boolean is what both classes' setters take,
 * and each turns it into a whole shadow or none.
 */
function flipSwitch(
  target: Record<string, unknown>,
  kind: MultiStyleShape['kind'],
  key: string,
  on: boolean,
): boolean {
  if (key === STROKE_ENABLED) return writeStroke(target, STROKE, on, STROKE_SHAPE[kind]);

  target[DROP_SHADOW] = on;
  return true;
}

/**
 * The settings a switch carried, filtered to what this class may actually hold.
 *
 * Checked here rather than trusted for arriving beside a declared key: the record
 * crosses the same bridge, from the same other process, as the key did. A switch
 * among them is dropped — a switch is the thing being flipped, not one of its
 * group's settings, and refusing one is also what keeps this a single pass.
 */
function* carriedSettings(
  kind: MultiStyleShape['kind'],
  value: Json,
): Generator<[string, Json]> {
  const settings = asSettings(value);
  if (settings === null) return;

  for (const entry of Object.entries(settings)) {
    const [key, carried] = entry;
    if (!keysOf(kind).has(key) || isGroupSwitch(kind, key)) continue;
    if (!isWritable(carried)) continue;

    yield entry;
  }
}

/**
 * Takes one key off a tag of the older class.
 *
 * @returns whether the tag was holding it. A key it never had is not an error,
 * but it is not a change either, and a caller clearing a whole group needs to
 * know whether any of it was there at all.
 */
function dropKey(style: Record<string, unknown>, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(style, key)) return false;

  delete style[key];
  // The fields that only make sense beside a gradient go with it.
  if (key === FILL) for (const part of FILL_PARTS) delete style[part];

  return true;
}

/**
 * A tag that holds only its overrides is written through the class's own
 * methods. `setTagStyle` merges rather than replaces, which is why clearing a
 * key has to delete it first — and why the empty merge afterwards is not
 * pointless: it is what makes the class rebuild its style and mark itself dirty.
 */
function mutateOverrides(
  shape: Extract<MultiStyleShape, { kind: 'overrides' }>,
  mutation: TextTagMutation,
  support: GradientSupport,
  exists: boolean,
): boolean {
  switch (mutation.kind) {
    case 'set': {
      if (!exists) return false;

      const isSwitch = isGroupSwitch('overrides', mutation.key);
      if (!(isSwitch ? isSwitchValue(mutation.value) : isWritable(mutation.value))) return false;

      // A gradient is more than the one key it is written under, so the patch is
      // built by the module that knows the shape rather than assembled here.
      // `setTagStyle` merges, which is exactly what a patch wants.
      const patch: Record<string, unknown> = {};

      if (isSwitch) {
        // The switch and everything it is coming back with go into the **same**
        // patch, so the class is told once — which is what makes restoring a
        // group atomic here without anything else arranging it.
        if (!flipSwitch(patch, 'overrides', mutation.key, switchesOn(mutation.value))) return false;

        for (const [key, carried] of carriedSettings('overrides', mutation.value)) {
          if (isGradientFill(carried)) writeFill(patch, key, carried, support);
          else patch[key] = carried;
        }
      } else if (isGradientFill(mutation.value)) {
        if (!writeFill(patch, mutation.key, mutation.value, support)) return false;
      } else {
        patch[mutation.key] = mutation.value;
      }

      shape.node.setTagStyle(mutation.tag, patch);
      return true;
    }

    case 'clear': {
      if (!exists || mutation.tag === DEFAULT_TAG) return false;

      const style = shape.tags[mutation.tag];
      if (style === undefined || !dropKey(style, mutation.key)) return false;

      shape.node.setTagStyle(mutation.tag, {});
      return true;
    }

    case 'clearGroup': {
      if (!exists || mutation.tag === DEFAULT_TAG) return false;

      const style = shape.tags[mutation.tag];
      if (style === undefined) return false;

      const fields = groupFields('overrides', mutation.group);
      if (fields.length === 0) return false;

      // Every key of the group goes, and one merge afterwards tells the class —
      // the switch among them included, since on this class it is a real key the
      // tag may be holding rather than something concluded.
      let dropped = false;
      for (const field of fields) dropped = dropKey(style, field.key) || dropped;
      if (!dropped) return false;

      shape.node.setTagStyle(mutation.tag, {});
      return true;
    }

    case 'add': {
      if (exists) return false;

      shape.node.setTagStyle(mutation.tag, {});
      return true;
    }

    case 'remove': {
      if (!exists || mutation.tag === DEFAULT_TAG) return false;

      shape.node.deleteTagStyle(mutation.tag);
      return true;
    }
  }
}

/**
 * A tag that holds a whole style is written through the style's own setters,
 * and then the node has to be told.
 *
 * Telling it is not obvious. The rendered text is cached under a key built from
 * the node's **default** style — its `uid` and a counter the style bumps on
 * every change — so touching a sub-style ticks a counter nobody is watching and
 * the picture stays as it was. Calling `update()` on the default style is what
 * moves that counter, which changes the key, which is what makes the renderer
 * draw the text again.
 *
 * Clearing has no exact equivalent here: there is nothing to remove from a
 * merged style, so the key is set back to what the default says. The tag then
 * matches the default on that key, the row disappears, and the text draws as if
 * the override had never been there — which is what clearing meant.
 */
/**
 * A tag cloned from the default holds the **same** gradient object, not a copy:
 * v8's `TextStyle.clone()` passes its already-converted fill straight through, and
 * the conversion keeps the instance. Editing that in place would move the
 * default's ramp along with the tag's, so a shared one is dropped first and
 * `writeFill` builds the tag one of its own.
 *
 * The default itself is exempt — its fill is not shared with anything, it *is*
 * the thing others share.
 */
function detachSharedFill(style: object, base: object | undefined): void {
  if (base === undefined || style === base) return;

  const mine = (style as Record<string, unknown>)[FILL];
  if (typeof mine !== 'object' || mine === null) return;
  if (mine !== (base as Record<string, unknown>)[FILL]) return;

  (style as Record<string, unknown>)[FILL] = undefined;
}

/**
 * Puts one key of a merged tag back to what the default says.
 *
 * There is nothing to remove from a whole style, so this is what clearing means
 * on this class: the tag stops differing from the default on that key, the row
 * disappears, and the text draws as if the override had never been there.
 *
 * @returns whether anything changed. A key that already agrees with the default
 * is not an error and not a change — and a caller putting a whole group back
 * needs to know whether any of it was overridden at all.
 */
function restoreKey(
  style: object,
  base: object,
  key: string,
  support: GradientSupport,
): boolean {
  const editor = TAG_STYLE_FIELDS_MERGED.find((field) => field.key === key)?.editor;
  const isColour = editor !== undefined && holdsColour(editor);

  const inherited = readMergedKey(base, key);
  if (inherited === undefined || same(readMergedKey(style, key), inherited, isColour)) {
    return false;
  }

  // Putting a fill back means putting back whichever shape it is in, and a
  // gradient is not assignable field by field the way `setProp` would try.
  if (key === FILL) return writeFill(style, FILL, inherited, support);

  // And a switch is not a field at all: assigning `strokeEnabled` onto a
  // `TextStyle` would leave a property nothing ever reads.
  if (isGroupSwitch('merged', key)) {
    return flipSwitch(style as Record<string, unknown>, 'merged', key, inherited === true);
  }

  setProp(style, key, inherited);
  return true;
}

function mutateMerged(
  shape: Extract<MultiStyleShape, { kind: 'merged' }>,
  mutation: TextTagMutation,
  support: GradientSupport,
  exists: boolean,
): boolean {
  const base = shape.tags[DEFAULT_TAG];
  const refresh = (): true => {
    shape.node.style.update?.();
    return true;
  };

  switch (mutation.kind) {
    case 'set': {
      const style = shape.tags[mutation.tag];
      if (!exists || style === undefined) return false;

      const isSwitch = isGroupSwitch('merged', mutation.key);
      if (!(isSwitch ? isSwitchValue(mutation.value) : isWritable(mutation.value))) return false;

      if (isSwitch) {
        const target = style as Record<string, unknown>;
        if (!flipSwitch(target, 'merged', mutation.key, switchesOn(mutation.value))) return false;

        // After the switch, never before it: on this class a shadow that is off is
        // `null`, and a blur written into it would go nowhere at all.
        for (const [key, carried] of carriedSettings('merged', mutation.value)) {
          if (key === FILL) {
            detachSharedFill(style, base);
            writeFill(style, FILL, carried, support);
          } else {
            setProp(style, key, carried);
          }
        }

        return refresh();
      }

      if (mutation.key === FILL) {
        detachSharedFill(style, base);
        if (!writeFill(style, FILL, mutation.value, support)) return false;
        return refresh();
      }

      setProp(style, mutation.key, mutation.value);
      return refresh();
    }

    case 'clear': {
      const style = shape.tags[mutation.tag];
      if (!exists || style === undefined || mutation.tag === DEFAULT_TAG) return false;
      if (base === undefined) return false;

      return restoreKey(style, base, mutation.key, support) ? refresh() : false;
    }

    case 'clearGroup': {
      const style = shape.tags[mutation.tag];
      if (!exists || style === undefined || mutation.tag === DEFAULT_TAG) return false;
      if (base === undefined) return false;

      const fields = groupFields('merged', mutation.group);
      if (fields.length === 0) return false;

      // In declared order, which puts the group's switch first — and that is the
      // requirement rather than the tidiness: a shadow that is off is `null` here,
      // so a blur put back before the shadow itself would be written into nothing.
      let restored = false;
      for (const field of fields) {
        restored = restoreKey(style, base, field.key, support) || restored;
      }

      return restored ? refresh() : false;
    }

    case 'add': {
      if (exists || base === undefined) return false;

      const clone = (base as StyleLike).clone;
      if (typeof clone !== 'function') return false;

      // A copy of the default overrides nothing, so the new tag opens empty —
      // which is exactly what a tag that has just been named should say.
      shape.tags[mutation.tag] = clone.call(base);
      return refresh();
    }

    case 'remove': {
      if (!exists || mutation.tag === DEFAULT_TAG) return false;

      delete shape.tags[mutation.tag];
      return refresh();
    }
  }
}

/**
 * Applies one change, if the guards allow it.
 *
 * The checks are the point, the same way they are in `writeValue`: this arrives
 * from another process as a pair of strings, and neither class would question
 * either of them.
 *
 * `default` is protected twice over. It cannot be removed — on the older class
 * `deleteTagStyle` answers that by resetting the style to its built-in defaults,
 * which looks like the node falling apart, and on the newer one it *is* the
 * node's style — and no key can be cleared off it, because it is the one tag
 * that is a complete style rather than an override.
 *
 * @param support how this line spells a gradient. Reading a tag needs no adapter —
 * the class is the application's and this module detects it — but **making a
 * gradient does**, because on v8 a gradient is an instance of a PixiJS class and
 * only the adapter can reach one.
 * @returns whether anything changed, so the caller knows to ask for a frame.
 */
export function applyTagMutation(
  node: Node,
  mutation: TextTagMutation,
  support: GradientSupport,
): boolean {
  const shape = asMultiStyle(node);
  if (shape === null) return false;

  // A name only has to be checked where one is being made up: an existing tag
  // was named by the application, and refusing to edit it would help nobody.
  if (mutation.kind === 'add' && !TAG_NAME.test(mutation.tag)) return false;

  // The key is checked against **this class's** list rather than against both.
  // The other spelling would be written as a property nothing reads —
  // `strokeThickness` onto a `TextStyle`, or `stroke.width` as a literal key.
  if (mutation.kind === 'set' || mutation.kind === 'clear') {
    const allowed =
      shape.kind === 'overrides' ? TAG_STYLE_KEYS_OVERRIDES : TAG_STYLE_KEYS_MERGED;
    if (!allowed.has(mutation.key)) return false;
  }

  // A group name is checked the same way, and by the same list: `groupFields`
  // answers with nothing for a group this class does not declare, and a mutation
  // with nothing to do reports no change.

  const exists = Object.prototype.hasOwnProperty.call(shape.tags, mutation.tag);

  return shape.kind === 'overrides'
    ? mutateOverrides(shape, mutation, support, exists)
    : mutateMerged(shape, mutation, support, exists);
}
