import type { Json, PropertyDescriptor } from '@scene-inspector/protocol';

import { formatNumber } from '../../../../lib/formatNumber.js';

/**
 * A node's own properties written out as source, the way `styleSnippet.ts`
 * writes a style out in the page.
 *
 * The rows in the panel answer "what is this value now". This answers "what
 * would I write to get this", and it is the answer that travels: a placement
 * found by dragging a node around in DevTools has to be typed back into the
 * game, and until now that meant copying six numbers out of six rows by hand.
 *
 * It is built **here** rather than in the page, unlike the text style, and the
 * difference is the point. A style has to be spelled the way the running
 * library spells it — which line, which gradient shape — and only the page
 * knows that. A transform is numbers: the values are already on their way to
 * the panel for the rows, so building the text from them costs no round trip
 * and adds no command to the protocol.
 *
 * The same function serves both places a snippet is taken from — the whole
 * object in the Object section, and one field copied off its own row — so the
 * two can never disagree about how a value is printed.
 */

/** As `styleSnippet.ts` writes it: four spaces, and objects broken over lines. */
const INDENT = '    ';

/** Bare where a name is an identifier, quoted where it is not. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * The panel's synthetic even scale, and what a game would actually be written
 * with instead.
 *
 * `scaleXY` reads one axis and writes both (`core/scene/properties/values.ts`),
 * so it is a control rather than a property: no scene holds a `scaleXY`, and a
 * snippet saying so would be a line nobody could paste. What the row means is
 * both axes at that number, and that is what it copies.
 */
const SCALE_XY = 'scaleXY';

/**
 * The panel's synthetic answer to "is there a stroke", and the one field here
 * that copies nothing at all.
 *
 * PixiJS has no flag for a stroke: whether there is one is concluded from its
 * width (`core/scene/properties/stroke.ts`). `scaleXY` is a control over
 * properties that exist, so it can be written as them; this one is a control
 * over a property that does not, so a game reading `strokeEnabled: true` would
 * be reading a key nobody wrote.
 */
const STROKE_ENABLED = 'style.strokeEnabled';

const MAX_FRACTION = 3;

/** A number as source, or null where it is one nothing can be written for. */
function printNumber(value: number): string | null {
  const text = formatNumber(value, MAX_FRACTION);
  return text === '' ? null : text;
}

/** Whether this is a point as `getProp` reports one: `{ x, y }` and nothing else. */
function asVector(value: Json): { x: number; y: number } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const { x, y } = value as { x?: Json; y?: Json };
  if (typeof x !== 'number' || typeof y !== 'number') return null;

  return { x, y };
}

function printVector(value: { x: number; y: number }, indent: string): string | null {
  const x = printNumber(value.x);
  const y = printNumber(value.y);
  if (x === null || y === null) return null;

  const inner = indent + INDENT;
  return `{\n${inner}x: ${x},\n${inner}y: ${y}\n${indent}}`;
}

/**
 * A colour as a style would be written with one, borrowed from `styleSnippet.ts`
 * for the reason given there: v8 keeps a converted style, where `'#44240d'` has
 * become 4465677, and a line full of six-digit decimals is a dump rather than
 * something to paste.
 */
function printColour(value: Json): string | null {
  if (typeof value === 'string') return JSON.stringify(OPAQUE.exec(value)?.[1] ?? value);

  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > 0xffffff) return null;

  return JSON.stringify(`#${value.toString(16).padStart(6, '0')}`);
}

/** v8 writes a colour back as `#rrggbbaa`; the opaque alpha says nothing. */
const OPAQUE = /^(#[0-9a-f]{6})ff$/i;

/**
 * A gradient, which the page has already written out for us.
 *
 * The panel prints every other field itself, and cannot print this one: a
 * gradient is three fields of the style on one PixiJS line and an options object
 * on the other, and which of the two a page wants is a question only the adapter
 * answers. So it arrives spelled — `GradientFill.source`, put there by
 * `core/scene/properties/values.ts` — and all that is left here is to take it.
 *
 * On v6/v7 that is more than one line, because a ramp's offsets are part of the
 * same gradient as its colours. It is still one field being copied.
 */
function gradientSource(value: Json): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const { kind, source } = value as { kind?: Json; source?: Json };
  if (kind !== 'gradient' || typeof source !== 'string' || source === '') return null;

  return source;
}

/**
 * The name a field is written under: the last step of its key.
 *
 * The keys the panel reads by are paths into the node — `style.fontSize`,
 * `style.dropShadow.blur` — and none of those paths is what anyone writes. What
 * is written is the property inside the object it belongs to, which is the last
 * step and nothing else. Both PixiJS lines come out right for free: `blur` on
 * one and `dropShadowBlur` on the other are each what that line's style holds.
 */
function nameOf(key: string): string {
  if (key === SCALE_XY) return 'scale';

  const steps = key.split('.');
  return steps[steps.length - 1] ?? key;
}

/**
 * One field as source, unindented and with no comma of its own.
 *
 * @param indent what the field is being printed under, so a vector's closing
 * brace lines up with the name that opened it. Empty for a field on its own.
 * @returns null for a value there is nothing to write for — a field the node
 * does not carry, a number that is not finite, or a control over a property no
 * style has.
 */
export function fieldSnippet(
  descriptor: PropertyDescriptor,
  value: Json | undefined,
  indent = '',
): string | null {
  if (value === undefined || value === null) return null;
  if (descriptor.key === STROKE_ENABLED) return null;

  const { key } = descriptor;
  const name = nameOf(key);

  // A fill is a colour or a gradient, and the two are written differently: a
  // colour here, a gradient by the page. The name a gradient is written under is
  // the page's too — on v6/v7 it is three names — so it comes back whole.
  if (descriptor.editor === 'color' || descriptor.editor === 'fill') {
    const gradient = gradientSource(value);
    if (gradient !== null) return gradient;

    const printed = printColour(value);
    return printed === null ? null : `${name}: ${printed}`;
  }

  const vector = asVector(value);
  if (vector !== null) {
    const printed = printVector(vector, indent);
    return printed === null ? null : `${name}: ${printed}`;
  }

  // The even scale is a number in the panel and two axes in the scene.
  if (key === SCALE_XY && typeof value === 'number') {
    const printed = printVector({ x: value, y: value }, indent);
    return printed === null ? null : `${name}: ${printed}`;
  }

  switch (typeof value) {
    case 'number': {
      const printed = printNumber(value);
      return printed === null ? null : `${name}: ${printed}`;
    }
    case 'boolean':
      return `${name}: ${String(value)}`;
    case 'string':
      // Borrowed for the escaping, as `styleSnippet.ts` borrows it.
      return `${name}: ${JSON.stringify(value)}`;
    default:
      // An array or an object that is not a point: nothing in this schema is
      // one, and inventing a spelling for it would be inventing a snippet.
      return null;
  }
}

/**
 * The name the object is written under.
 *
 * A node's own name where it has one, and its type where it does not — the same
 * substitution the tree makes for an unnamed node (`tree/nested.ts`). Quoted
 * where it is not an identifier, because a game's names are the game's: `hero
 * sprite` is a perfectly good name and not a perfectly good variable.
 */
export function snippetName(name: string, type: string): string {
  const chosen = name === '' ? type : name;
  return IDENTIFIER.test(chosen) ? chosen : JSON.stringify(chosen);
}

/**
 * A field that is only worth writing when it says something.
 *
 * `zIndex` is the one: every node has one, almost every node has zero, and a
 * zero in a snippet is a line pasted into a game to no effect.
 */
function worthWriting(key: string, value: Json | undefined): boolean {
  return !(key === 'zIndex' && value === 0);
}

/**
 * @param fields the descriptors to write, in the order they are written in —
 * already filtered to what this node carries (`filter.ts`).
 * @returns the whole object as source, or an empty string where the node has
 * nothing to say. The section draws nothing for an empty string, which is how
 * a section declared for every type can still be per node.
 */
export function objectSnippet(
  name: string,
  fields: readonly PropertyDescriptor[],
  values: Record<string, Json> | null,
): string {
  const rows: string[] = [];

  for (const field of fields) {
    const value = values?.[field.key];
    if (!worthWriting(field.key, value)) continue;

    const printed = fieldSnippet(field, value, INDENT);
    if (printed !== null) rows.push(`${INDENT}${printed}`);
  }

  if (rows.length === 0) return '';

  return `${name}: {\n${rows.join(',\n')}\n}`;
}
