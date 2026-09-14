import type { GradientFill, Json, PropertyDescriptor, Revisioned } from '@scene-inspector/protocol';

import { getProp } from '../../adapters/common.js';
import type { GradientSupport, Node, PixiAdapter } from '../../adapters/types.js';
import { FNV_OFFSET, hashString } from '../fingerprint.js';
import { isGradientFill, readFill } from '../properties/fill.js';
import { asMultiStyle, same } from './multiStyle.js';
import { isFittedText } from './relayout.js';
import { TAG_STYLE_FIELDS_MERGED, TAG_STYLE_FIELDS_OVERRIDES } from './tagStyleFields.js';

/**
 * The style of a patched text, written out as the game's own source.
 *
 * The rows above this in the Text tab answer "what is this value now"; a
 * snippet answers a different question — "what would I have to write to get
 * this". Nothing else in the panel does, and copying a look found in DevTools
 * back into the game meant retyping a dozen lines by hand.
 *
 * Three things follow from that purpose, and each of them is a decision:
 *
 *  - **the spelling is the library's, not the panel's.** The panel deliberately
 *    reduces both PixiJS lines to one shape — a gradient is a `GradientFill`, a
 *    stroke has a synthetic switch. None of that can be pasted into a game, so
 *    here it is spelled back out: `fill: [...]` with `fillGradientStops` beside
 *    it on v6/v7, `fillGradient: { colorStops: [...] }` and a nested `stroke` on
 *    v8. Which of the two is asked of `PixiAdapter.gradientSupport()`, the one
 *    method whose whole job is telling those two spellings apart — so this
 *    module still contains no version branch of its own (CLAUDE.md rule 2);
 *  - **only what the game actually said.** A v8 style is a whole `TextStyle`,
 *    some twenty-five fields of which twenty are the library's defaults. Those
 *    are dropped, by comparing against the defaults the class itself publishes;
 *  - **only patched texts have one.** A plain PixiJS `Text` is not something
 *    anyone is copying into a game's own text layer, and a section that appeared
 *    on every caption would be a section nobody read.
 *
 * Like `multiStyle.ts` and `spine/spine.ts` this is a declared boundary with a
 * class that is not PixiJS's, which is why it is allowed to read fields off a
 * style directly rather than through an adapter.
 */

/** The one tag that is the whole style rather than an override of it. */
const DEFAULT_TAG = 'default';

const FILL = 'fill';

/** The one key a patched text reports differently from how it was written. */
const FONT_SIZE = 'fontSize';

/** Synthetic: the panel's answer to "is there a stroke", which no style holds. */
const STROKE_ENABLED = 'strokeEnabled';

/** Where the game's own v8 `TextStyle` takes a gradient as plain options. */
const GRADIENT_OPTIONS = 'fillGradient';

/**
 * v6/v7 `TEXT_GRADIENT` — see `properties/fill.ts`. Only the horizontal one is
 * ever written: the other is what a style that says nothing already does.
 */
const LINEAR_HORIZONTAL = 1;

/** The two ends of a linear ramp in v8's local 0…1 space. */
const AXIS = {
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
};

/**
 * Every key a fill may be written under, in the order a style would list them.
 * They travel together because they are one setting: the panel reads all of them
 * as a single `GradientFill` and this module writes them back out from one.
 */
const FILL_KEYS = [FILL, GRADIENT_OPTIONS, 'fillGradientType', 'fillGradientStops'];

/**
 * The style keys the game's own `TextStyle` adds, which the tag lists do not
 * carry — a tag has never overridden any of them.
 *
 * The first two are what `properties/textSchema.ts` declares for the node: a
 * patched text that shrinks itself to fit says so through them.
 *
 * `isMultiStyle` is the third, and it is here rather than in the schema because
 * it is not a setting anyone edits — it is what makes the newer class read its
 * text as markup at all. Left out, the snippet came back as a style that draws
 * the tags as literal `<score>` in the middle of the sentence. It has no group:
 * it belongs to no heading, and being outside every atomic group is what lets it
 * be reported on its own.
 */
const GAME_FIELDS: readonly PropertyDescriptor[] = [
  { key: 'flexFont', label: 'Flex font', editor: 'boolean', group: 'Layout' },
  { key: 'wordWrapHeight', label: 'Wrap height', editor: 'number', group: 'Layout' },
  { key: 'isMultiStyle', label: 'Multi-style', editor: 'boolean' },
];

function fieldsFor(shape: GradientSupport['shape']): readonly PropertyDescriptor[] {
  const declared = shape === 'list' ? TAG_STYLE_FIELDS_OVERRIDES : TAG_STYLE_FIELDS_MERGED;
  return [...declared, ...GAME_FIELDS];
}

/** The groups a style takes on or off whole — `groupAtomic`, read as data. */
function atomicGroups(fields: readonly PropertyDescriptor[]): ReadonlySet<string> {
  const groups = new Set<string>();
  for (const field of fields) {
    if (field.groupAtomic === true && field.group !== undefined) groups.add(field.group);
  }
  return groups;
}

/**
 * Which group a written key belongs to.
 *
 * The fill needs saying because the keys it is written under are not the key it
 * was read under: `fillGradientStops` is no descriptor's, and it is still part
 * of the fill.
 */
function groupOf(key: string, fields: readonly PropertyDescriptor[]): string | undefined {
  if (FILL_KEYS.includes(key)) return fields.find((field) => field.key === FILL)?.group;
  return fields.find((field) => field.key === key)?.group;
}

/**
 * A colour as a style would be written with one.
 *
 * v8 keeps a converted style, where `'#44240d'` has become 4465677, and a
 * snippet full of six-digit decimals is a dump rather than something to paste.
 * Only whole numbers in range are folded; anything else is left as it stands.
 */
function asColour(value: Json): Json {
  // And the other way a converted colour arrives: v8 writes a gradient's stops
  // back as `#rrggbbaa`, so a colour anyone typed as `#8ecaff` reads as
  // `#8ecaffff`. Only a fully opaque alpha is dropped — it is the one that says
  // nothing.
  if (typeof value === 'string') return OPAQUE.exec(value)?.[1] ?? value;

  if (typeof value !== 'number' || !Number.isInteger(value)) return value;
  if (value < 0 || value > 0xffffff) return value;

  return `#${value.toString(16).padStart(6, '0')}`;
}

const OPAQUE = /^(#[0-9a-f]{6})ff$/i;

/**
 * The size that was **written**, which on a text fitted to a box is not the size
 * the style reports.
 *
 * A patched text shrinks the type until the words fit, and the two lines record
 * what it started from differently: the older class overwrites `fontSize` and
 * keeps the original beside it, the newer one leaves `fontSize` alone and counts
 * the shrinkage in `fontSizeOffset` that its own getter subtracts. Neither of
 * those is what anyone would type into a style.
 *
 * The rows above this section deliberately show the reported size — that is what
 * is on screen. A snippet is the other question: pasting the shrunken size back
 * into the game would shrink it again on the next pass.
 */
function authoredFontSize(style: object, reported: Json): Json {
  const original = (style as { originalFontSize?: unknown }).originalFontSize;
  if (typeof original === 'number' && Number.isFinite(original)) return original;

  const offset = (style as { fontSizeOffset?: unknown }).fontSizeOffset;
  if (typeof reported === 'number' && typeof offset === 'number' && Number.isFinite(offset)) {
    return reported + offset;
  }

  return reported;
}

/** Only what a style may hold and what could be printed — see `entriesOf`. */
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
 * Whether this object holds only what was written into it.
 *
 * A tag of the older class is a plain options object, and everything on it is
 * the game's — including keys no descriptor declares, which are exactly the ones
 * worth reporting. A `TextStyle` is not: its own fields are the underscored
 * twins and its bookkeeping (`styleID`), and none of that is source.
 */
function isPlain(style: object): boolean {
  const proto = Object.getPrototypeOf(style) as object | null;
  return proto === null || proto === Object.prototype;
}

/**
 * Whether the stops are the ones PixiJS 6/7 places when a style names none:
 * `(i + 1) / (n + 1)`, not evenly — see `properties/fill.ts`.
 */
function isDefaultRamp(fill: GradientFill): boolean {
  return fill.stops.every(
    (stop, index) => stop.offset === (index + 1) / (fill.stops.length + 1),
  );
}

/** Writes the fill out in the shape this line's styles are written in. */
function putFill(
  data: Record<string, Json>,
  fill: Json,
  style: object,
  shape: GradientSupport['shape'],
): void {
  if (!isGradientFill(fill)) {
    data[FILL] = asColour(fill);
    return;
  }

  if (shape === 'list') {
    data[FILL] = fill.stops.map((stop) => asColour(stop.color));

    // The two fields beside it are written only where the game wrote them. A
    // vertical ramp is the default, and offsets PixiJS would have worked out for
    // itself are offsets nobody typed — `readFill` reports them because the
    // panel draws a ramp, not because the style holds them.
    if (fill.direction === 'horizontal') data['fillGradientType'] = LINEAR_HORIZONTAL;
    if (!isDefaultRamp(fill)) data['fillGradientStops'] = fill.stops.map((stop) => stop.offset);

    return;
  }

  data[GRADIENT_OPTIONS in style ? GRADIENT_OPTIONS : FILL] = asGradientOptions(fill);
}

/** The options a v8 gradient is built from, which is how a game writes one. */
function asGradientOptions(fill: GradientFill): Json {
  const colorStops = fill.stops.map((stop) => ({
    offset: stop.offset,
    color: asColour(stop.color),
  }));

  if (fill.direction === 'radial') return { type: 'radial', colorStops };
  return { type: 'linear', ...AXIS[fill.direction], colorStops };
}

/**
 * One style, flattened to the keys it would be written with.
 *
 * Dotted while it is being worked on — `stroke.width` rather than a nested
 * object — because comparing two styles key by key is what decides what is
 * printed, and `nest` puts the objects back together afterwards.
 */
function entriesOf(
  style: object,
  fields: readonly PropertyDescriptor[],
  shape: GradientSupport['shape'],
): Record<string, Json> {
  const data: Record<string, Json> = {};

  for (const field of fields) {
    // Not a key of any style: the panel concludes it from the width, and a game
    // writing `strokeEnabled: true` would be writing to nobody.
    if (field.key === STROKE_ENABLED) continue;

    if (field.key === FILL) {
      const fill = readFill(style, FILL);
      if (fill !== undefined) putFill(data, fill, style, shape);
      continue;
    }

    const value = getProp(style, field.key);
    if (value === undefined) continue;

    if (field.key === FONT_SIZE) {
      data[FONT_SIZE] = authoredFontSize(style, value);
      continue;
    }

    data[field.key] = field.editor === 'color' ? asColour(value) : value;
  }

  // Whatever else the game wrote into a plain options object. `getProp` reports
  // nothing for a key no descriptor declares, and a tag that sets one should
  // still say so — the same latitude `readOverrideTag` takes.
  if (isPlain(style)) {
    const declared = new Set(fields.map((field) => field.key));

    for (const [key, raw] of Object.entries(style)) {
      if (declared.has(key) || FILL_KEYS.includes(key) || key in data) continue;

      const value = asJsonValue(raw);
      if (value !== undefined) data[key] = value;
    }
  }

  return data;
}

/**
 * What this style says that the one behind it does not.
 *
 * @param whole whether a group that changed at all has to be carried entire.
 *
 * It does when the style behind this one is another style: a fill, a stroke and
 * a shadow are one decision described from several angles — that is what
 * `groupAtomic` says in `tagStyleFields.ts` — so a tag that only widens the
 * stroke still has to carry its colour, or the snippet pasted back into the game
 * inherits the default's colour instead of the tag's.
 *
 * It does **not** when the style behind this one is the library's own defaults.
 * There the fallback is exactly what was compared against, so a key left out is
 * a key that lands on the same value anyway — and carrying whole groups would
 * only fill the snippet with `lineJoin: "miter"` and `miterLimit: 10`.
 */
function differing(
  mine: Record<string, Json>,
  base: Record<string, Json>,
  fields: readonly PropertyDescriptor[],
  whole: boolean,
): Record<string, Json> {
  const atomic = whole ? atomicGroups(fields) : new Set<string>();
  const changed = new Set<string>();

  for (const key of new Set([...Object.keys(mine), ...Object.keys(base)])) {
    if (same(mine[key], base[key], true)) continue;

    const group = groupOf(key, fields);
    if (group !== undefined && atomic.has(group)) changed.add(group);
  }

  const data: Record<string, Json> = {};

  for (const [key, value] of Object.entries(mine)) {
    const group = groupOf(key, fields);

    if (group !== undefined && atomic.has(group)) {
      if (changed.has(group)) data[key] = value;
      continue;
    }

    if (!same(value, base[key], true)) data[key] = value;
  }

  return data;
}

/**
 * The defaults this line's styles start from, asked of the class itself.
 *
 * Two ways, in this order, and the second is the one that usually answers:
 *
 *  - the class may publish them, and v8's does — `TextStyle.defaultTextStyle`;
 *  - otherwise **a style of that class with nothing asked of it** is what the
 *    defaults are. PixiJS 6 and 7 keep theirs in a module-level object their
 *    `reset()` copies out of, which is reachable no other way.
 *
 * Asking the class rather than keeping a table here is the point either way: a
 * table would be a second copy of PixiJS's defaults, quietly diverging from the
 * one that is actually running — and it would answer for PixiJS where the class
 * on the node is the **game's**, whose own defaults are what its styles start
 * from.
 *
 * Memoized per class: this is polled, and a fresh style is a real allocation.
 *
 * @returns null where the class publishes nothing and refuses to be built with
 * no arguments. Then nothing is filtered at all — a long snippet is worth more
 * than an invented one.
 */
const DEFAULTS = new WeakMap<object, object | null>();

function defaultsOf(style: object | null): object | null {
  if (style === null) return null;

  const ctor = (style as { constructor?: unknown }).constructor;
  if (typeof ctor !== 'function') return null;

  const held = DEFAULTS.get(ctor);
  if (held !== undefined) return held;

  const found = publishedDefaults(ctor) ?? freshStyle(ctor);
  DEFAULTS.set(ctor, found);

  return found;
}

function publishedDefaults(ctor: object): object | null {
  const statics = ctor as { defaultTextStyle?: unknown; defaultStyle?: unknown };
  const found = statics.defaultTextStyle ?? statics.defaultStyle;

  return typeof found === 'object' && found !== null ? found : null;
}

function freshStyle(ctor: object): object | null {
  try {
    const made: unknown = new (ctor as new () => unknown)();
    return typeof made === 'object' && made !== null ? made : null;
  } catch {
    // A class that wants arguments, or one that is not a constructor at all.
    return null;
  }
}

/** The keys in the order a style is written in: declared first, the rest after. */
function orderedKeys(
  flat: Record<string, Json>,
  fields: readonly PropertyDescriptor[],
): string[] {
  const keys: string[] = [];
  const taken = new Set<string>();

  const take = (key: string): void => {
    if (!(key in flat) || taken.has(key)) return;
    taken.add(key);
    keys.push(key);
  };

  for (const field of fields) {
    if (field.key === FILL) for (const key of FILL_KEYS) take(key);
    else take(field.key);
  }

  for (const key of Object.keys(flat)) take(key);

  return keys;
}

/** Dotted keys back into the objects a style is written with. */
function nest(flat: Record<string, Json>, fields: readonly PropertyDescriptor[]): Json {
  const root: Record<string, Json> = {};

  for (const key of orderedKeys(flat, fields)) {
    const steps = key.split('.');
    const leaf = steps.pop();
    if (leaf === undefined) continue;

    let target = root;
    for (const step of steps) {
      const next = target[step];
      if (typeof next !== 'object' || next === null || Array.isArray(next)) target[step] = {};
      target = target[step] as Record<string, Json>;
    }

    target[leaf] = flat[key] as Json;
  }

  return root;
}

const INDENT = '    ';

/** Bare where a key is an identifier, quoted where it is not. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * A value as source rather than as JSON.
 *
 * `JSON.stringify` would quote every key, and a style with `"fontSize"` in it is
 * a style nobody wrote. Only strings borrow it, for the escaping.
 */
function print(value: Json, indent: string): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const inner = indent + INDENT;

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';

    const items = value.map((item) => `${inner}${print(item, inner)}`);
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';

  const rows = entries.map(([key, item]) => {
    const name = IDENTIFIER.test(key) ? key : JSON.stringify(key);
    return `${inner}${name}: ${print(item, inner)}`;
  });

  return `{\n${rows.join(',\n')}\n${indent}}`;
}

/** The style object a node's own style is, whatever else it also is. */
function styleOf(node: Node): object | null {
  const style = (node as { style?: unknown }).style;
  return typeof style === 'object' && style !== null ? style : null;
}

/** @returns the snippet, or an empty string for a node that is not a patched text. */
function buildSnippet(adapter: PixiAdapter, node: Node): string {
  const tags = asMultiStyle(node);
  if (tags === null && !isFittedText(node)) return '';

  const nodeStyle = styleOf(node);

  // On the newer class `default` **is** the node's style; on the older one it is
  // a plain options object beside it. Either way it is what the tags override.
  const base = tags === null ? nodeStyle : (tags.tags[DEFAULT_TAG] ?? nodeStyle);
  if (base === null) return '';

  const shape = adapter.gradientSupport().shape;
  const fields = fieldsFor(shape);

  const baseEntries = entriesOf(base, fields, shape);
  const defaults = defaultsOf(nodeStyle);
  const shown =
    defaults === null
      ? baseEntries
      : differing(baseEntries, entriesOf(defaults, fields, shape), fields, false);

  let text = `style: ${print(nest(shown, fields), '')}`;

  if (tags === null) return text;

  const overrides: Record<string, Json> = {};

  for (const [name, style] of Object.entries(tags.tags)) {
    if (name === DEFAULT_TAG) continue;

    const entries = entriesOf(style, fields, shape);

    // A tag of the older class already holds only its overrides; one of the
    // newer class holds a whole style, and what it overrides has to be worked
    // out against the default — the same comparison `readMergedTag` makes.
    overrides[name] = nest(
      tags.kind === 'overrides' ? entries : differing(entries, baseEntries, fields, true),
      fields,
    );
  }

  text += `,\nmultiStyles: ${print(overrides, '')}`;

  return text;
}

/**
 * @returns the snippet, revisioned like every other pull. An empty string is the
 * answer for a node that is not a patched text, and the panel draws no section
 * for it at all — which is how a section keyed by type can still be per node.
 */
export function readStyleSnippet(
  adapter: PixiAdapter,
  node: Node,
  knownRev?: number,
): Revisioned<string> {
  const text = buildSnippet(adapter, node);
  if (text === '') return { rev: 0, data: '' };

  const rev = hashString(FNV_OFFSET, text);
  return rev === knownRev ? { rev, unchanged: true } : { rev, data: text };
}

/**
 * One gradient, written out as the fields a style holds it in.
 *
 * The panel prints every other field itself — a number is a number on both
 * PixiJS lines — and cannot print this one: on v6/v7 a gradient is three fields
 * of the style and on v8 it is a single options object, and which of the two a
 * page wants is what `gradientSupport` is for. So it is printed here, where that
 * answer is, and travels with the value as `GradientFill.source` (`fill.ts`).
 *
 * More than one line on v6/v7, and that is right: `fillGradientStops` is part of
 * the same gradient as the colours above it, and a copy that left it behind
 * would paste a ramp with the offsets rubbed out.
 *
 * @param style the style the fill belongs to, which decides whether v8's options
 * go under `fillGradient` or under `fill` itself — the same question `putFill`
 * asks when it writes a whole style out.
 */
export function gradientSource(
  fill: GradientFill,
  style: object,
  shape: GradientSupport['shape'],
): string {
  const data: Record<string, Json> = {};
  putFill(data, fill, style, shape);

  return Object.entries(data)
    .map(([key, value]) => `${key}: ${print(value, '')}`)
    .join(',\n');
}
