import type { GradientFill, GradientStop, Json } from '@scene-inspector/protocol';

import { targetOf } from '../../adapters/common.js';
import type { GradientSupport } from '../../adapters/types.js';

/**
 * A fill, which is a colour or a gradient, read and written through one shape.
 *
 * The two PixiJS lines disagree about everything here except that a fill exists.
 * v6/v7 spread a gradient over three fields of the style — `fill` as a list of
 * colours, with `fillGradientType` and `fillGradientStops` beside it — and v8
 * keeps one `FillGradient` object. `GradientFill` is what crosses the bridge, and
 * this module is where each library's shape is turned into it and back.
 *
 * **Reading branches on the value, not on the version**: a list of colours and an
 * object with its own stops cannot be mistaken for one another. That is the same
 * latitude `readSynthetic` already takes for `dropShadow` — a boolean on one line,
 * an object on the other — and it is what lets the tag styles use this module,
 * since a tag style is not a node and has no adapter to ask (§3.3, §3.5.1).
 *
 * **Writing has to be told**, because an empty style carries no marks: a tag of
 * the older MultiStyleText holds only what it overrides, so the absence of
 * `fillGradientStops` says nothing at all about which library it belongs to. The
 * answer comes as `GradientSupport`, from the one place that is allowed to know —
 * the adapter.
 */

/** What a style looks like from here: a bag of fields, walked by name. */
type StyleLike = Record<string, unknown>;

/** v6/v7 `TEXT_GRADIENT`. Two numbers, so no import is needed for them. */
const LINEAR_VERTICAL = 0;
const LINEAR_HORIZONTAL = 1;

function isColour(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

export function isGradientFill(value: Json | undefined): value is GradientFill {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    value['kind'] === 'gradient'
  );
}

/**
 * Where PixiJS 6/7 puts the colours of a gradient when the style names no stops
 * of its own: **not** evenly, as one would expect, but at `(i + 1) / (n + 1)`,
 * with the first colour repeated at 0 and the last at 1 to stop one line's ramp
 * bleeding into the next. Three colours therefore sit at 0.25, 0.5 and 0.75.
 *
 * Reported as PixiJS computes it rather than as a tidier guess, so that reading a
 * gradient and writing it straight back changes nothing on screen.
 */
function defaultOffset(index: number, count: number): number {
  return (index + 1) / (count + 1);
}

/** The older shape: a list of colours, with the rest of the ramp beside it. */
function readList(style: StyleLike, colours: readonly unknown[]): GradientFill | null {
  if (colours.length === 0) return null;

  const declared = style['fillGradientStops'];
  const offsets = Array.isArray(declared) ? declared : [];

  const stops: GradientStop[] = [];
  for (const [index, colour] of colours.entries()) {
    if (!isColour(colour)) return null;

    const offset = offsets[index];
    stops.push({
      color: colour,
      offset:
        typeof offset === 'number' && Number.isFinite(offset)
          ? offset
          : defaultOffset(index, colours.length),
    });
  }

  return {
    kind: 'gradient',
    direction: style['fillGradientType'] === LINEAR_HORIZONTAL ? 'horizontal' : 'vertical',
    stops,
  };
}

/**
 * What PixiJS 8 draws for a gradient nobody gave any colours to. Reported rather
 * than hidden, because a gradient with no stops is a real thing to run into: the
 * library's own v7 compatibility shim builds one whenever a style carries a list of
 * fill colours and an **empty** `fillGradientStops` — it walks the stops to add the
 * colours, so no stops means no colours. A text like that draws white to black, and
 * showing it as what it is at least offers a way out of it.
 */
const EMPTY_RAMP: GradientStop[] = [
  { color: '#ffffff', offset: 0 },
  { color: '#000000', offset: 1 },
];

/** The newer shape: one object holding its own stops and its own geometry. */
function readObject(fill: StyleLike): GradientFill | null {
  const declared = fill['colorStops'];
  if (!Array.isArray(declared)) return null;
  if (declared.length === 0) {
    return { kind: 'gradient', direction: directionOf(fill), stops: [...EMPTY_RAMP] };
  }

  const stops: GradientStop[] = [];
  for (const [index, entry] of declared.entries()) {
    if (typeof entry !== 'object' || entry === null) return null;

    const { color, offset } = entry as { color?: unknown; offset?: unknown };
    if (!isColour(color)) return null;

    stops.push({
      color,
      offset:
        typeof offset === 'number' && Number.isFinite(offset)
          ? offset
          : defaultOffset(index, declared.length),
    });
  }

  return { kind: 'gradient', direction: directionOf(fill), stops };
}

/**
 * A v8 gradient says which way it runs through its own geometry rather than
 * through a flag: a linear one has a start and an end, and the axis they differ
 * along is the direction. Anything neither horizontal nor vertical is still a
 * linear gradient and is reported as the vertical one — the editor offers no
 * diagonal, and "vertical" is closer to the truth than "radial".
 */
function directionOf(fill: StyleLike): GradientFill['direction'] {
  if (fill['type'] === 'radial') return 'radial';

  const start = fill['start'] as { x?: unknown; y?: unknown } | undefined;
  const end = fill['end'] as { x?: unknown; y?: unknown } | undefined;

  return start?.y === end?.y && start?.x !== end?.x ? 'horizontal' : 'vertical';
}

/**
 * @param root the node, or the style object a tag keeps.
 * @param path where the fill is — `'style.fill'` on a node, `'fill'` on a tag.
 * @returns a colour, a `GradientFill`, or `undefined` for a fill that cannot cross
 * the bridge: a canvas gradient, a pattern, a texture. `undefined` is the same
 * answer as "not there", and no row is drawn for either.
 */
export function readFill(root: object, path: string): Json | undefined {
  const found = targetOf(root, path);
  if (found === null) return undefined;

  const style = found.target;
  const value = style[found.leaf];

  // The older shape keeps the colours in the field itself; the newer one keeps
  // an object that knows its own.
  if (Array.isArray(value)) return readList(style, value) ?? undefined;

  if (typeof value === 'object' && value !== null) {
    const direct = readObject(value as StyleLike) ?? readConverted(value as StyleLike);
    if (direct !== null) return direct;
  }

  // Last, and only for a gradient: the converted twin. A style may keep one
  // there and nowhere else — see `readTwin` — and a gradient found there beats
  // the colour the field is still reporting, because the gradient is what draws.
  const twin = readTwin(style, found.leaf);
  if (twin !== null) return twin;

  if (isColour(value)) return value;
  if (value === null) return null;

  return undefined;
}

/**
 * The gradient a style keeps in its **converted** fill and nowhere else.
 *
 * PixiJS 8 converts a fill once and keeps both: what was assigned, behind the
 * `fill` getter, and what the renderer uses, in `_fill`. They normally agree. In
 * the game this inspector is built for they do not: its own `TextStyle` takes a
 * gradient as plain options under `fillGradient`, builds the converted fill from
 * them directly, and never puts the result where its own getter would report it —
 * so the field still says whatever colour was assigned before, which is `'black'`
 * from the defaults. That is what the panel was showing.
 *
 * The twin is named by the underscore, as everything converted in that library is.
 */
function readTwin(style: StyleLike, leaf: string): GradientFill | null {
  const converted = style[`_${leaf}`];
  if (typeof converted !== 'object' || converted === null) return null;

  const gradient = readConverted(converted as StyleLike);
  return gradient !== null && isGradientFill(gradient) ? gradient : null;
}

/**
 * The fill of a style that was **cloned**, which is not the fill that was set.
 *
 * `TextStyle.clone()` on v8 hands its already-converted fill to the new style as
 * the value to set, and a converted fill is neither a colour nor a gradient, so the
 * setter wraps it in a proxy and keeps that. The result is that a copied style
 * reports an object for `fill` whatever was actually filled with — which is why a
 * tag added from the panel used to show no fill row at all, on a class where every
 * new tag is a copy of the default.
 *
 * What the object carries is the same answer one level down: `fill` is the gradient
 * where there was one, and `color` is the colour where there was not.
 */
function readConverted(fill: StyleLike): Json | null {
  const nested = fill['fill'];
  if (typeof nested === 'object' && nested !== null) {
    const gradient = readObject(nested as StyleLike);
    if (gradient !== null) return gradient;
  }

  const colour = fill['color'];
  return isColour(colour) ? colour : null;
}

/** The two ends of a linear ramp, in the local 0…1 space v8 defaults to. */
const AXIS = {
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
};

/**
 * Fills a v8 gradient in, in place.
 *
 * In place, and not by building a replacement, because the object carries more
 * than the panel shows — how it is measured, how big a texture it wants, the
 * geometry of a radial one — and a replacement would quietly drop all of it. For
 * the same reason the axis is rewritten only when the direction actually changed:
 * a radial gradient nobody redirected stays radial.
 *
 * Moving the stops is enough on its own. A gradient does keep a texture, built
 * once and never rebuilt, but text does not use it: the canvas the glyphs are
 * drawn on gets its ramp from `colorStops` each time it is generated. So what has
 * to happen is not a rebuild but a redraw, and the style is what asks for one — its
 * counter is part of the key the rendered text is cached under.
 */
function applyObject(owner: StyleLike, fill: StyleLike, value: GradientFill): boolean {
  fill['colorStops'] = value.stops.map((stop) => ({ offset: stop.offset, color: stop.color }));

  if (value.direction !== directionOf(fill)) {
    fill['type'] = value.direction === 'radial' ? 'radial' : 'linear';
    if (value.direction !== 'radial') Object.assign(fill, AXIS[value.direction]);
  }

  const update = owner['update'];
  if (typeof update === 'function') (update as () => void).call(owner);

  return true;
}

/**
 * The field a style of the game's own makes the truth about its gradient.
 *
 * Its setter takes plain options, builds the gradient from them and puts the
 * result straight into the converted fill. Two things follow, and both are why
 * this has to be checked before anything else here:
 *
 *  - a gradient is written by assigning **these options**, and no class is needed
 *    — which is just as well, since a bundled page may expose none;
 *  - while they are set, assigning `fill` a colour does **nothing at all**: the
 *    setter sees them and rebuilds the gradient instead of taking the colour. So
 *    going back to a colour means clearing these first.
 *
 * The accessor lives on the prototype and has no getter, so `in` is the only way
 * to ask — reading it always answers `undefined`.
 */
const GRADIENT_OPTIONS = 'fillGradient';

function hasGradientOptions(style: StyleLike): boolean {
  return GRADIENT_OPTIONS in style;
}

/**
 * Rebuilds those options, keeping what the panel does not show.
 *
 * The gradient already built from them carries how it is measured and, when it is
 * radial, the geometry of its circles. None of that is on screen, and dropping it
 * would move the ramp for reasons nobody asked for.
 */
function applyOptions(style: StyleLike, leaf: string, value: GradientFill): boolean {
  const current = style[`_${leaf}`];
  const built =
    typeof current === 'object' && current !== null
      ? ((current as StyleLike)['fill'] as StyleLike | undefined)
      : undefined;

  const kept: StyleLike = {};
  for (const key of ['textureSpace', 'textureSize', 'wrapMode']) {
    const carried = built?.[key];
    if (carried !== undefined) kept[key] = carried;
  }

  if (value.direction === 'radial') {
    for (const key of ['center', 'outerCenter', 'innerRadius', 'outerRadius', 'scale', 'rotation']) {
      const carried = built?.[key];
      if (carried !== undefined) kept[key] = carried;
    }
  }

  style[GRADIENT_OPTIONS] = {
    ...kept,
    type: value.direction === 'radial' ? 'radial' : 'linear',
    ...(value.direction === 'radial' ? {} : AXIS[value.direction]),
    colorStops: value.stops.map((stop) => ({ offset: stop.offset, color: stop.color })),
  };

  return true;
}

function applyList(style: StyleLike, leaf: string, value: GradientFill): boolean {
  style[leaf] = value.stops.map((stop) => stop.color);
  style['fillGradientType'] =
    value.direction === 'horizontal' ? LINEAR_HORIZONTAL : LINEAR_VERTICAL;
  style['fillGradientStops'] = value.stops.map((stop) => stop.offset);

  return true;
}

/**
 * Writes a fill: a colour as it is, a gradient in the shape this library speaks.
 *
 * A gradient already in place is edited rather than replaced, whichever shape it
 * is in. Only a fill that is not yet a gradient needs `support` to build one, and
 * only on v8 can that fail.
 *
 * @returns whether anything was written. `false` where a gradient was asked for
 * and the page offers no way to make one — the caller reports nothing, and the
 * next poll shows the fill as it still is, which is how every refused write here
 * already behaves.
 */
export function writeFill(
  root: object,
  path: string,
  value: Json,
  support: GradientSupport,
): boolean {
  const found = targetOf(root, path);
  if (found === null) return false;

  const style = found.target;

  if (!isGradientFill(value)) {
    if (!isColour(value)) return false;

    // On a style that keeps its gradient in options, two things have to happen
    // before a colour will land, and the second is not obvious.
    if (hasGradientOptions(style)) {
      // While the options stand, the setter rebuilds the gradient from them and
      // throws the colour away — see `GRADIENT_OPTIONS`.
      style[GRADIENT_OPTIONS] = null;

      // And the field has to be emptied first, because on this class what was
      // **assigned** and what is **drawn** can disagree: the gradient went into
      // the converted fill without ever passing through the field, so the field
      // still reports whatever colour preceded it. Writing that same colour back
      // is a no-op to PixiJS, whose setter returns early when the value has not
      // changed — and the gradient it does not know about stays on screen.
      //
      // It takes two goes to see: the first return to a colour lands, because the
      // field still held the default. The second does not, because by then the
      // field holds exactly the colour being written.
      style[found.leaf] = null;
    }

    style[found.leaf] = value;
    return true;
  }

  // One colour is not a gradient. It is what the panel holds while a gradient is
  // being started, and writing it as a list would be a solid fill spelled oddly.
  if (value.stops.length < 2) return false;

  // Before anything else: this style will not take a gradient any other way.
  if (hasGradientOptions(style)) return applyOptions(style, found.leaf, value);

  const current = style[found.leaf];

  if (Array.isArray(current)) return applyList(style, found.leaf, value);

  if (
    typeof current === 'object' &&
    current !== null &&
    Array.isArray((current as StyleLike)['colorStops'])
  ) {
    return applyObject(style, current as StyleLike, value);
  }

  if (support.shape === 'list') return applyList(style, found.leaf, value);

  const fresh = support.make();
  if (fresh === null) return false;

  // Filled in before it is assigned, so the style's own setter sees a finished
  // gradient — that is what puts it on screen, and it runs only once.
  applyObject(fresh as StyleLike, fresh as StyleLike, value);
  style[found.leaf] = fresh;
  return true;
}
