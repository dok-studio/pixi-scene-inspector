import { targetOf } from '../../adapters/common.js';

/**
 * Whether a text is stroked, read and written as one question through two shapes.
 *
 * PixiJS has no flag for this. A shadow says outright whether it is there —
 * `dropShadow` is a boolean on one line and an object on the other, but either
 * way the question is answered — while a stroke is only ever a width and a
 * colour, and "there is a stroke" is something the reader has to conclude. That
 * conclusion is what this module is: **stroked means the width is above zero**,
 * whichever of the two shapes is holding it.
 *
 * The other available reading — "stroked means the style carries a stroke at
 * all" — cannot work beside the way switching off is done here. Off leaves the
 * colour and the join alone, because they are what makes coming back cheap; a
 * stroke object of zero width would then still read as on, and the switch would
 * snap back on the next poll, a quarter of a second after being pressed.
 *
 * **Reading branches on the shape of the value, not on the version** — the same
 * latitude `properties/fill.ts` takes, and for its two reasons: the shapes cannot
 * be mistaken for one another, and a tag style is not a node and has no adapter
 * to ask (§3.3, §3.5.1).
 *
 * **Writing has to be told which shape**, also as in `fill.ts`: a tag patch of
 * the older class starts life as an empty object and carries no marks at all, so
 * there would be nothing to conclude from. The two classes are the two shapes by
 * construction, and the caller always knows which one it is holding.
 */

/** What a style looks like from here: a bag of fields, walked by name. */
type StyleLike = Record<string, unknown>;

/**
 * The two spellings.
 *
 *  - `flat` — v6/v7: a colour in `stroke`, a number in `strokeThickness`;
 *  - `nested` — v8: `stroke` is null, a colour, or an object with its own width.
 */
export type StrokeShape = 'flat' | 'nested';

/**
 * v8's own `defaultStrokeStyle.width`. A hairline is visible, which is what a
 * stroke that has just been switched on has to be — the panel writes the width
 * it remembers immediately after, so this is only ever what a stroke nobody has
 * set a width for gets.
 */
const DEFAULT_WIDTH = 1;

const FLAT_WIDTH = 'strokeThickness';

/**
 * The converted twin, named by the underscore as everything converted on v8 is.
 *
 * It is needed because `get stroke()` hands back **what was assigned**
 * (`_originalStroke`), so a style built with `stroke: 'red'` reports that string
 * and nothing else — no width anywhere, though the text is drawn stroked at the
 * default width. `_stroke` is where that width actually is. The same situation
 * `fill.ts` already handles for `_fill`, and the same answer.
 */
function twinOf(style: StyleLike, leaf: string): StyleLike | null {
  const converted = style[`_${leaf}`];
  return typeof converted === 'object' && converted !== null ? (converted as StyleLike) : null;
}

function widthOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

interface Found {
  style: StyleLike;
  leaf: string;
  shape: StrokeShape;
  /** Absent where the shape is known but nothing says how wide — a v8 `null`. */
  width: number | undefined;
}

/**
 * Which shape this style is in, and how wide its stroke is.
 *
 * **The order of the tests is the point.** An object `stroke` is asked about
 * first, because a v8 style built from v7-shaped options carries a leftover
 * `strokeThickness`: `convertV7Tov8Style` reads that number into `stroke` and
 * does not delete it, and the constructor then copies every option onto the
 * instance. A reader that asked about `strokeThickness` first would take such a
 * style for a v6/v7 one and go on to write a number nothing reads.
 *
 * The last test is `in` rather than a look at the value, because on v8 `stroke`
 * is an accessor on the prototype: a style that was never given one still
 * answers `null` through it, while a style of a class that has no such thing has
 * no step there at all. That is the same reason `fill.ts` asks about
 * `fillGradient` with `in`.
 */
function look(root: object, path: string): Found | null {
  const found = targetOf(root, path);
  if (found === null) return null;

  const style = found.target;
  const value = style[found.leaf];

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const width = widthOf((value as StyleLike)['width']);
    return { style, leaf: found.leaf, shape: 'nested', width };
  }

  const flat = style[FLAT_WIDTH];
  if (typeof flat === 'number') {
    return { style, leaf: found.leaf, shape: 'flat', width: widthOf(flat) };
  }

  if (found.leaf in style) {
    // A colour was assigned, or nothing was. The twin knows which, and how wide.
    const twin = value === null || value === undefined ? null : twinOf(style, found.leaf);
    return { style, leaf: found.leaf, shape: 'nested', width: widthOf(twin?.['width']) };
  }

  return null;
}

/**
 * @param root the node, or the style object a tag keeps.
 * @param path where the stroke is — `'style.stroke'` on a node, `'stroke'` on a
 * tag.
 * @returns whether the text is stroked, or `undefined` for a style that has no
 * such thing at all. `undefined` is the same answer as "not there", and the panel
 * draws no row — and therefore no Stroke group — for either.
 */
export function readStroke(root: object, path: string): boolean | undefined {
  const found = look(root, path);
  if (found === null) return undefined;

  return (found.width ?? 0) > 0;
}

/**
 * @returns which spelling this style uses, for the caller that has to write one
 * and can conclude it — a node's style always carries its own marks. See
 * `writeStroke` for the caller that cannot.
 */
export function strokeShapeOf(root: object, path: string): StrokeShape | null {
  return look(root, path)?.shape ?? null;
}

/**
 * Switches the stroke, keeping everything that is not the width.
 *
 * Off is a width of zero rather than an emptied stroke, and that is the whole
 * economy of it: the colour and the join stay on the node, so coming back costs
 * one number, and a stroke that was never removed cannot lose what the panel
 * never showed — a texture, a cap, a miter limit.
 *
 * The one case that has to build something is a v8 style whose stroke is null:
 * there is no object to set a width on, and none can be conjured out of the
 * field. It gets a plain `{ width }`, which the style's own setter converts and
 * draws. A colour assigned as a scalar is carried into that object, because it
 * is the colour already on screen.
 *
 * @param shape which spelling to write. Told rather than concluded, because a
 * tag patch of the older class is an empty object with no marks on it at all.
 * @returns whether anything was written. `false` where the path leads nowhere,
 * and where switching off a stroke that is not there would have meant building
 * one in order to say it was off.
 */
export function writeStroke(root: object, path: string, on: boolean, shape: StrokeShape): boolean {
  const found = targetOf(root, path);
  if (found === null) return false;

  const style = found.target;
  const width = on ? DEFAULT_WIDTH : 0;

  if (shape === 'flat') {
    style[FLAT_WIDTH] = width;
    return true;
  }

  const current = style[found.leaf];

  if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
    // In place, through whatever the style put there. On v8 that is a proxy whose
    // every write asks the style to redraw, which is why nothing more is needed
    // here for the change to reach the screen.
    (current as StyleLike)['width'] = width;
    return true;
  }

  // A stroke that is not there is already off, and saying so would mean making
  // one first.
  if (!on && (current === null || current === undefined)) return false;

  style[found.leaf] =
    typeof current === 'string' || typeof current === 'number'
      ? { color: current, width }
      : { width };

  return true;
}
