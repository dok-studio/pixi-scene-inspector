import type { Json, PropertyDescriptor, Revisioned } from '@scene-inspector/protocol';

import { targetOf } from '../../adapters/common.js';
import type { Node, PixiAdapter } from '../../adapters/types.js';
import { FNV_OFFSET, hashJson, hashString } from '../fingerprint.js';
import { isFittedText } from '../text/relayout.js';
import { gradientSource } from '../text/styleSnippet.js';
import { isGradientFill, readFill, writeFill } from './fill.js';
import { asSettings, switchesOn } from './groupSwitch.js';
import { FILL_KEYS, schemaFor, SYNTHETIC_KEYS, TEXTURE_ID_KEY } from './schema.js';
import { readStroke, strokeShapeOf, writeStroke } from './stroke.js';

/**
 * Two declared keys are not fields on the node.
 *
 * `type` is what the adapter's own detection says the node is — reading a
 * `type` property off a container would find nothing, or something an
 * application happened to put there. `scaleXY` reads one axis and writes both,
 * which is the common case of scaling a node evenly; the previous project
 * special-cased both of these in the middle of its generic reducer.
 */
/**
 * Whether a reading amounts to the node having been named.
 *
 * A number counts: an application that identifies its nodes by `id` has named
 * them, even where that name is a digit, and the row for it is drawn. Only
 * nothing at all — absent, null, or blank — leaves the question open.
 */
function carriesName(value: Json | undefined): boolean {
  return value !== undefined && value !== null && value !== '';
}

function readSynthetic(adapter: PixiAdapter, node: Node, key: string): Json | undefined {
  switch (key) {
    case SYNTHETIC_KEYS.type:
      return adapter.typeOf(node);
    case SYNTHETIC_KEYS.scaleXY:
      return adapter.getProp(node, 'scale.x');
    case SYNTHETIC_KEYS.id: {
      const id = adapter.getProp(node, 'id');

      // On v8 the application's own id is in `label` as well, and the panel
      // draws a row for that already — two rows saying the same thing is one
      // row of noise. v6/v7 have no `label` at all, so there this row is the
      // only place that name appears, and it stays.
      return adapter.getProp(node, 'label') === id ? undefined : id;
    }
    /*
     * The third spelling of the one name, and the last resort among them: a
     * node that has said who it is through `id` or `label` does not say it
     * again here. Only v6/v7 ever answers — see `PixiAdapter.pixiName`.
     *
     * An empty string counts as having said nothing, which is why this asks
     * `named` rather than testing for absence: v8 initialises `label` to null
     * but an application is free to set it to '', and a blank row is not an
     * answer that should silence a real name below it.
     */
    case SYNTHETIC_KEYS.name: {
      const named =
        carriesName(adapter.getProp(node, 'label')) || carriesName(adapter.getProp(node, 'id'));

      return named ? undefined : adapter.pixiName(node);
    }
    // A game's own settings, on a game's own class. `isFittedText` is the mark:
    // a plain PixiJS `Text` answers `undefined` here and draws no row, while a
    // patched one answers with a value even where its style has none yet — an
    // unset `flexFont` that could not be seen could not be switched on either.
    case SYNTHETIC_KEYS.flexFont:
      return isFittedText(node) ? (adapter.getProp(node, key) ?? false) : undefined;
    case SYNTHETIC_KEYS.wordWrapHeight:
      return isFittedText(node) ? (adapter.getProp(node, key) ?? 0) : undefined;

    // Not a field either, and for a harder reason than the shadow's: PixiJS has
    // no flag for a stroke at all, so whether there is one has to be concluded
    // from its width. See `properties/stroke.ts`.
    case SYNTHETIC_KEYS.strokeEnabled:
      return readStroke(node, STROKE_PATH);

    case SYNTHETIC_KEYS.dropShadow: {
      const flag = adapter.getProp(node, 'style.dropShadow');
      // v6/v7 keep a plain boolean here.
      if (typeof flag === 'boolean') return flag;

      // v8 keeps either `false` — caught above — or a settings object, which
      // `getProp` cannot carry across and reports as `undefined`, the same
      // answer it gives for a property that is not there at all. Asking for one
      // of the object's own fields tells the two apart.
      return adapter.getProp(node, 'style.dropShadow.alpha') !== undefined;
    }
    default:
      return undefined;
  }
}

/** Where the stroke itself is, which is not where its switch is declared. */
const STROKE_PATH = 'style.stroke';

/** The size the panel edits, and the one a fitted text restores it from. */
const FONT_SIZE_KEY = 'style.fontSize';
const ORIGINAL_FONT_SIZE_KEY = 'style.originalFontSize';

function isSynthetic(key: string): boolean {
  return (
    key === SYNTHETIC_KEYS.type ||
    key === SYNTHETIC_KEYS.scaleXY ||
    key === SYNTHETIC_KEYS.dropShadow ||
    key === SYNTHETIC_KEYS.strokeEnabled ||
    key === SYNTHETIC_KEYS.id ||
    key === SYNTHETIC_KEYS.name ||
    key === SYNTHETIC_KEYS.flexFont ||
    key === SYNTHETIC_KEYS.wordWrapHeight
  );
}

/**
 * A fill, with the source of a gradient alongside it.
 *
 * The shape the panel reads is one shape for both PixiJS lines and can be
 * pasted nowhere; `source` is the same gradient in the spelling the running
 * library uses, and it is added here because this is a reader with an adapter to
 * ask. A tag's style has none, and its rows offer no copy — see
 * `GradientFill.source`.
 */
function readFillValue(adapter: PixiAdapter, node: Node, key: string): Json | undefined {
  const fill = readFill(node, key);
  if (!isGradientFill(fill)) return fill;

  const found = targetOf(node, key);
  if (found === null) return fill;

  return { ...fill, source: gradientSource(fill, found.target, adapter.gradientSupport().shape) };
}

/**
 * Values behind the schema: read in bulk, written one at a time.
 *
 * Reads are revisioned like the tree. A selected node that is not changing
 * costs a walk over the handful of keys the panel can see and no payload at
 * all. In the previous project the whole property model — labels, sections,
 * tooltips, options — was re-sent alongside the values ten times a second.
 */

/**
 * @param keys exactly what the panel can see. A collapsed section contributes
 * nothing, so it is not read.
 * @returns `unchanged` when the values still match `knownRev`. The key list is
 * folded into the fingerprint too, so asking for a different set always
 * produces an answer rather than a false `unchanged`.
 */
export function readValues(
  adapter: PixiAdapter,
  node: Node,
  keys: readonly string[],
  knownRev?: number,
): Revisioned<Record<string, Json>> {
  const data: Record<string, Json> = {};
  let rev = FNV_OFFSET;

  for (const key of keys) {
    const value = isSynthetic(key)
      ? readSynthetic(adapter, node, key)
      : FILL_KEYS.has(key)
        ? readFillValue(adapter, node, key)
        : adapter.getProp(node, key);

    // A key the node does not carry becomes null rather than being dropped:
    // the panel can then render the editor as empty instead of guessing why a
    // declared field went missing.
    data[key] = value ?? null;
    rev = hashJson(hashString(rev, key), value);
  }

  return rev === knownRev ? { rev, unchanged: true } : { rev, data };
}

/**
 * The descriptor behind a key, or undefined where the type declares none.
 *
 * A descriptor rather than a yes/no, because two callers need more than
 * permission from it: one asks whether the key is writable at all, the other
 * whether it is a switch — and a switch is written differently.
 */
function declaredField(adapter: PixiAdapter, node: Node, key: string): PropertyDescriptor | undefined {
  return schemaFor(adapter.typeOf(node))
    .flatMap((section) => section.fields)
    .find((field) => field.key === key);
}

/**
 * Flips a group's switch, and puts back what the group had.
 *
 * Both halves are one command on purpose. A switch is turned on and its settings
 * restored together or not at all: every call crosses the bridge as its own
 * evaluation with no queue behind it, so two of them have neither an order nor
 * an all-or-nothing — and on v8 a blur written before the shadow object exists
 * is a silent no-op, which is half a restored shadow and worse than none.
 *
 * The settings are not trusted for arriving alongside a key that was declared.
 * Each one goes back through `writeValue`, which asks the schema about it the
 * same way it asks about any other write, so a record cannot carry a path nobody
 * declared. Switches are skipped there, which is also what keeps this one level
 * deep rather than a way to write a program.
 *
 * @returns false for a value that is neither a boolean nor a settings record.
 */
function writeSwitch(adapter: PixiAdapter, node: Node, key: string, value: Json): boolean {
  if (value !== true && value !== false && asSettings(value) === null) return false;

  const on = switchesOn(value);

  switch (key) {
    case SYNTHETIC_KEYS.dropShadow:
      // The style's own setter turns `true` into a whole shadow and `false` into
      // none, on both lines.
      adapter.setProp(node, key, on);
      break;

    case SYNTHETIC_KEYS.strokeEnabled: {
      // Which spelling this style uses is a fact about the style, and it carries
      // its own marks — unlike a tag patch, which has to be told.
      const shape = strokeShapeOf(node, STROKE_PATH);
      if (shape === null) return false;

      writeStroke(node, STROKE_PATH, on, shape);
      break;
    }

    default:
      return false;
  }

  const settings = asSettings(value);
  if (settings !== null) {
    for (const [name, carried] of Object.entries(settings)) {
      // A switch is not one of its own group's settings — it is the thing being
      // flipped — and refusing one here is what keeps this a single pass rather
      // than something that could be nested to any depth.
      if (declaredField(adapter, node, name)?.groupSwitch === true) continue;

      writeValue(adapter, node, name, carried);
    }
  }

  return true;
}

/**
 * Writes a value, if the schema says so.
 *
 * The check is the point. `scene.setProp` is a command arriving from another
 * process with a string key, and `getProp`/`setProp` walk paths — without this,
 * the command would be a way to write any value onto anything reachable from a
 * node, prototypes included. Only declared keys pass, matched exactly rather
 * than by prefix (the previous project matched with `startsWith`).
 *
 * @returns false when the key is not a declared, writable property.
 */
export function writeValue(adapter: PixiAdapter, node: Node, key: string, value: Json): boolean {
  // The descriptor rather than a yes/no, because one of its flags decides what
  // the value is allowed to be — see `writeSwitch`.
  const declared = declaredField(adapter, node, key);
  if (declared === undefined || declared.readOnly === true) return false;

  if (declared.groupSwitch === true) return writeSwitch(adapter, node, key, value);

  // Scaling evenly writes both axes; everything else is the path it names.
  if (key === SYNTHETIC_KEYS.scaleXY) {
    if (typeof value !== 'number') return false;
    adapter.setProp(node, 'scale', { x: value, y: value });
    return true;
  }

  // A texture is swapped by the application, not by assigning the string it
  // goes by — see `TEXTURE_ID_KEY`.
  if (key === TEXTURE_ID_KEY) {
    if (typeof value !== 'string') return false;
    adapter.setTextureId(node, value);
    return true;
  }

  // A fill is a colour or a gradient, and a gradient is not one field — see
  // `FILL_KEYS`. The adapter says how this line spells one.
  if (FILL_KEYS.has(key)) {
    return writeFill(node, key, value, adapter.gradientSupport());
  }

  // A size on a text that fits itself to a box is remembered twice: the style
  // carries what it was before any shrinking, and the class restores `fontSize`
  // from it at the start of every pass. Writing only the one on screen therefore
  // holds until the next relayout and then snaps back — which reads as the field
  // being broken. Only the class that keeps the second one gets it written.
  if (key === FONT_SIZE_KEY && adapter.getProp(node, ORIGINAL_FONT_SIZE_KEY) !== undefined) {
    adapter.setProp(node, ORIGINAL_FONT_SIZE_KEY, value);
  }

  adapter.setProp(node, key, value);
  return true;
}
