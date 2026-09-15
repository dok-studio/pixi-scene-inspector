import type {
  AxesMode,
  AxesPin,
  HighlightMode,
  NodeId,
  OutlineStyle,
  OverlayStyle,
  WrapBoxStyle,
} from '@scene-inspector/protocol';
import { DEFAULT_PICK_DEPTH, OVERLAY_STYLE_DEFAULTS } from '@scene-inspector/protocol';

import type { Node, PixiAdapter } from '../../adapters/types.js';
import type { FrameHook } from '../../runtime/frame.js';
import type { Locks } from '../mutate.js';
import type { Registry } from '../registry.js';
import { onStage } from '../onStage.js';
import { wrapBoxOf } from '../text/wrapBox.js';
import type { Point } from '../nodeSpace.js';
import { corners } from '../nodeSpace.js';
import { arrowHead, axesOf } from './axes.js';
import type { FreeTransform } from './freeTransform.js';
import { createFreeTransform } from './freeTransform.js';
import type { Size } from './geometry.js';
import { overlayAligned, overlaySize, overlayTransform } from './geometry.js';
import { offsetOutward, outlineOf, spread } from './outline.js';

/**
 * The highlight and the picker: a plain div over the application's canvas.
 *
 * It is the only part of Scene that needs a frame. A highlight has to follow a
 * node that is moving, so it subscribes to the render hook while it is on and
 * lets go when it is off — see `runtime/frame.ts` for why that matters.
 *
 * The geometry is ported from the previous project and lives in `geometry.ts`,
 * where it can be tested; what is left here is the DOM.
 */

/**
 * How the frames are painted is the panel's to decide (`OverlayStyle`), and
 * what is left here is how the decision is applied.
 *
 * The shapes are not settings: a highlight is a filled polygon that turns with
 * its node, and the wrap box is a dashed stroke with no fill at all — it is
 * drawn over the very text it is measuring, and a wash of colour would be in
 * the way. What a colour picker can move is which magenta, which lime, and how
 * much of each.
 *
 * The ink of the wrap box sits **outside** the measurement. A stroke straddles
 * its path, so the path is pushed out by half the width first
 * (`offsetOutward`) and all of it lands beyond the box rather than half of it
 * on the text. That is where the previous project's `content-box` border had
 * it, and it is why the width is read again down in `placeWrap`.
 */

/** Three on, two off, in units of the stroke's own width. */
function wrapDashes(width: number): string {
  return `${String(width * 3)} ${String(width * 2)}`;
}

/**
 * The origin gizmo, in the overlay's own pixels.
 *
 * `REACH` is the half-size of the box the whole sign is drawn in, and it has to
 * clear the far edge of a label or the SVG clips it: an arrow of `ARROW`, the
 * gap to its label, and the label's own height. The rest is drawn at a size of
 * its own rather than the node's — the sign says where the zero is and which way
 * the axes run, and a tiny node's axes are no shorter than anyone else's.
 */
const AXIS = {
  reach: 52,
  arrow: 28,
  head: { length: 9, width: 7 },
  labelGap: 12,
  dot: 3.5,
  /**
   * Where a pinned node's name sits: just above the point, a few pixels clear
   * of it.
   *
   * Close, and not out past the arrows. A caption set beyond them is a caption
   * that has to be traced back to the point it belongs to, and with several
   * pinned at once that is the very work the name was added to save. What it
   * costs is that an arrow pointing up runs through it — which the outline every
   * label here carries is enough to survive.
   *
   * Straight up in the overlay's own space rather than along an axis: the arrows
   * turn with the node, and a caption that turned with them would be upside down
   * on anything past a quarter turn.
   */
  captionY: -12,
};

/**
 * How much of a name is drawn before it is cut.
 *
 * A caption is there to tell one gizmo from another, and the front of a name
 * does that; a game's `hud/panel/score/valueLabel` laid across the scene does
 * not.
 */
const CAPTION_MAX = 28;

/**
 * Red across, green down, and a dot on the zero — the convention every editor
 * draws this sign in, and the reason the hovered node's gizmo is not recoloured
 * to match its highlight: the colours here mean the axes, not the selection.
 * The hovered one is faded instead, so the selected node's stays the loud one.
 *
 * Green is a long way from the wrap box's lime on purpose; the two can be on
 * screen together.
 *
 * Every stroke is laid over a dark one a little wider. The overlay is drawn on
 * whatever the game is drawing, and a 2px line has no other way to survive
 * landing on something its own colour.
 */
const AXIS_COLOUR = {
  x: 'hsl(0 85% 55%)',
  y: 'hsl(120 65% 45%)',
  origin: 'hsl(210 100% 60%)',
  shadow: 'rgba(0, 0, 0, 0.65)',
};

export interface OverlayConfig {
  /** How much of the frame is drawn — see `HighlightMode`. */
  highlight: HighlightMode;
  picker: boolean;
  /**
   * Whether the wrap box is drawn.
   *
   * **On its own, not riding on the highlight.** They used to be one switch and
   * a half, which meant taking the wash off a caption to read it took the
   * measurement off with it — and the measurement is usually why anyone turned
   * the wash off. Each switch answers for what it draws and for nothing else.
   */
  wrapBox: boolean;
  /**
   * How much of the origin gizmo is drawn — the whole sign, the point on its
   * own, or nothing. Independent of the highlight, the same as `wrapBox`.
   */
  axes: AxesMode;
  /**
   * Nodes with a gizmo of their own, on top of the selected and the hovered
   * one. They obey `axes`, which is the switch that says how much of a gizmo
   * is drawn at all.
   */
  pinned: AxesPin[];
  /**
   * How the frames are painted. Whole rather than partial — the panel decides
   * all of it or none of it, and `OVERLAY_STYLE_DEFAULTS` is what "none of it"
   * means.
   */
  style: OverlayStyle;
  /**
   * Whether the selected node gets a frame that can be dragged, scaled and
   * turned — see `freeTransform.ts`. Unlike everything else here it **writes to
   * the scene**, which is why it is last in the panel's row rather than why it
   * stands on its own: every switch here stands on its own.
   */
  transform: boolean;
  /**
   * How far one click digs — see `DEFAULT_PICK_DEPTH`. A setting rather than a
   * constant because what it buys is reaching a node under a stack of hidden
   * layers, and how deep that stack is, is the game's business rather than
   * this file's.
   */
  pickDepth: number;
}

export interface Overlay {
  configure(config: OverlayConfig): void;
  /** The node the pointer is over in the panel's tree, or null. */
  setHovered(id: NodeId | null): void;
  setSelected(id: NodeId | null): void;
  /**
   * What the picker last landed on, topmost first, taken rather than read:
   * reporting it once.
   *
   * The whole stack rather than the node on top, because overlapping nodes are
   * the case the picker is worst at on its own — the panel offers the rest as a
   * list. Empty when nothing has been picked since the last call.
   */
  takePicked(): NodeId[];
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

/**
 * The sheet the two highlights are drawn on: the size of the overlay, with no
 * `viewBox`, so one user unit is one of the overlay's own pixels and a polygon's
 * points go in exactly as they come out of `outline.ts`.
 */
function sheet(): SVGSVGElement {
  const element = svg('svg');
  Object.assign(element.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    // The root clips; this one must not, or a node hanging off the left of the
    // canvas would have its outline cut at the sheet's edge instead.
    overflow: 'visible',
  });
  return element;
}

function outlinePolygon(): SVGPolygonElement {
  return svg('polygon');
}

function paintOutline(element: SVGPolygonElement, style: OutlineStyle): void {
  Object.assign(element.style, {
    fill: style.fill,
    fillOpacity: String(style.fillOpacity),
    stroke: style.stroke,
    strokeOpacity: String(style.strokeOpacity),
    strokeWidth: String(style.strokeWidth),
  });
}

/**
 * Whether a configuration puts anything on the page at all.
 *
 * Five switches, and the overlay is installed if any one of them draws. That is
 * a longer answer than "is the highlight on", and it is the point: each switch
 * owns what it draws, so each has to be asked before the div and the render
 * hook can go.
 */
function draws(config: OverlayConfig): boolean {
  return (
    config.highlight !== 'off' ||
    config.picker ||
    config.transform ||
    config.wrapBox ||
    config.axes !== 'off'
  );
}

/**
 * A fill-less frame as something `paintOutline` can take — `'outline'`, the
 * middle setting of the highlight.
 *
 * The colour of the fill that is not being drawn is the one thing this has to
 * invent, and what it invents is irrelevant: the opacity is zero. Black rather
 * than the frame's own colour so that nothing downstream can read a fill out of
 * this and believe it.
 */
function unfilled(style: WrapBoxStyle): OutlineStyle {
  return { fill: '#000000', fillOpacity: 0, ...style };
}

function paintWrap(element: SVGPathElement, style: WrapBoxStyle): void {
  Object.assign(element.style, {
    fill: 'none',
    stroke: style.stroke,
    strokeOpacity: String(style.strokeOpacity),
    strokeWidth: String(style.strokeWidth),
    strokeDasharray: wrapDashes(style.strokeWidth),
  });
}

/** Writes a list of corners into a polygon, or empties it when there are none. */
function setPoints(element: SVGPolygonElement, points: Point[] | null): void {
  element.setAttribute(
    'points',
    points === null ? '' : points.map((p) => `${String(p.x)},${String(p.y)}`).join(' '),
  );
}

function pathOf(points: Point[], close: boolean): string {
  const at = (index: number): string => {
    const point = points[index];
    return point === undefined ? '' : `${String(point.x)} ${String(point.y)}`;
  };

  // Closed: the frame the game bounds on all four sides.
  if (close) return `M ${at(0)} L ${at(1)} L ${at(2)} L ${at(3)} Z`;

  // Open: the two vertical guides, left edge and right edge, drawn as separate
  // subpaths of the same element so there is still only one thing to hide.
  return `M ${at(0)} L ${at(3)} M ${at(1)} L ${at(2)}`;
}

/** One arrow of the gizmo, kept in pieces so a frame can move it without rebuilding it. */
interface Arm {
  group: SVGGElement;
  shadow: SVGLineElement;
  shaft: SVGLineElement;
  head: SVGPolygonElement;
  label: SVGTextElement;
}

interface Gizmo {
  root: SVGSVGElement;
  x: Arm;
  y: Arm;
  /** Empty on the two that follow the selection and the pointer — see `AxesPin`. */
  caption: SVGTextElement;
}

function arm(name: 'x' | 'y', colour: string): Arm {
  const group = svg('g');
  const shadow = svg('line');
  const shaft = svg('line');
  const head = svg('polygon');
  const label = svg('text');

  for (const line of [shadow, shaft]) {
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '0');
    line.style.strokeLinecap = 'round';
  }

  shadow.style.stroke = AXIS_COLOUR.shadow;
  shadow.style.strokeWidth = '5';
  shaft.style.stroke = colour;
  shaft.style.strokeWidth = '2.5';

  head.style.fill = colour;
  head.style.stroke = AXIS_COLOUR.shadow;
  head.style.strokeWidth = '1';
  head.style.strokeLinejoin = 'round';

  label.textContent = name.toUpperCase();
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('dominant-baseline', 'central');
  Object.assign(label.style, {
    fill: colour,
    stroke: AXIS_COLOUR.shadow,
    strokeWidth: '3',
    // Ink over outline, so the dark stroke stays behind the letter instead of
    // eating it — a bold 11px glyph outlined inwards is a smudge.
    paintOrder: 'stroke',
    font: 'bold 11px sans-serif',
  });

  group.append(shadow, shaft, head, label);

  return { group, shadow, shaft, head, label };
}

/**
 * The sign itself: an SVG the size of `2 * reach`, with its own origin in the
 * middle, so placing it is a translate and nothing else.
 *
 * The arrowheads are polygons this file works out rather than SVG `marker`s.
 * A marker is addressed by `url(#id)`, and this element lives in the inspected
 * page's document, where an id is not ours to claim.
 */
function gizmo(opacity: number): Gizmo {
  const root = svg('svg');
  const size = AXIS.reach * 2;

  root.setAttribute('width', String(size));
  root.setAttribute('height', String(size));
  root.setAttribute(
    'viewBox',
    `${String(-AXIS.reach)} ${String(-AXIS.reach)} ${String(size)} ${String(size)}`,
  );
  Object.assign(root.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    transformOrigin: 'top left',
    overflow: 'visible',
    opacity: String(opacity),
  });

  const x = arm('x', AXIS_COLOUR.x);
  const y = arm('y', AXIS_COLOUR.y);

  const dot = svg('circle');
  dot.setAttribute('cx', '0');
  dot.setAttribute('cy', '0');
  dot.setAttribute('r', String(AXIS.dot));
  dot.style.fill = AXIS_COLOUR.origin;
  dot.style.stroke = 'hsl(0 0% 100%)';
  dot.style.strokeWidth = '1.5';

  // White rather than an axis colour: the caption is about the node, not about
  // either arrow, and giving it one of their two hues would read as a third
  // thing belonging to one of them.
  const caption = svg('text');
  caption.setAttribute('x', '0');
  caption.setAttribute('y', String(AXIS.captionY));
  caption.setAttribute('text-anchor', 'middle');
  caption.setAttribute('dominant-baseline', 'central');
  Object.assign(caption.style, {
    fill: 'hsl(0 0% 100%)',
    stroke: AXIS_COLOUR.shadow,
    strokeWidth: '3',
    paintOrder: 'stroke',
    font: 'bold 11px sans-serif',
  });

  // The dot before the arrows would be buried by them, and it marks the one
  // thing the sign is pointing at.
  root.append(x.group, y.group, dot, caption);

  return { root, x, y, caption };
}

/** The name a pinned gizmo carries, cut to something that fits over a scene. */
function caption(label: string): string {
  return label.length > CAPTION_MAX ? `${label.slice(0, CAPTION_MAX - 1)}…` : label;
}

/** Moves one arrow onto a direction, or takes it off screen when there is none. */
function placeArm(target: Arm, direction: Point | null): void {
  if (direction === null) {
    target.group.style.display = 'none';
    return;
  }

  target.group.style.display = '';

  const tip = { x: direction.x * AXIS.arrow, y: direction.y * AXIS.arrow };

  for (const line of [target.shadow, target.shaft]) {
    line.setAttribute('x2', String(tip.x));
    line.setAttribute('y2', String(tip.y));
  }

  const points = arrowHead(tip, direction, AXIS.head.length, AXIS.head.width);
  target.head.setAttribute(
    'points',
    points.map((point) => `${String(point.x)},${String(point.y)}`).join(' '),
  );

  const reach = AXIS.arrow + AXIS.labelGap;
  target.label.setAttribute('x', String(direction.x * reach));
  target.label.setAttribute('y', String(direction.y * reach));
}

export function createOverlay(
  adapter: () => PixiAdapter | null,
  registry: Registry,
  frame: FrameHook,
  /** Nodes the tree has locked, which the frame refuses to move. */
  locks: Locks,
): Overlay {
  interface Elements {
    root: HTMLDivElement;
    outlines: SVGSVGElement;
    selectedBox: SVGPolygonElement;
    hoverBox: SVGPolygonElement;
    wrapBox: SVGPathElement;
    selectedAxes: Gizmo;
    hoverAxes: Gizmo;
    transform: FreeTransform;
  }

  /**
   * Nothing is built until the panel asks for something. That keeps the promise
   * of §3.7 literal — with the overlay off there is no div in the page — and it
   * is also what lets the core be exercised under vitest, where there is no DOM
   * at all.
   */
  let elements: Elements | null = null;

  const build = (): Elements => {
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      pointerEvents: 'none',
      transformOrigin: 'top left',
      zIndex: '1000',
      // The overlay's contents follow the node, which runs off the canvas
      // whenever the node does. Without this they enlarge the document's
      // scrollable overflow: a scrollbar appears, the viewport changes, and an
      // application with `resizeTo` resizes itself because the inspector
      // highlighted something. Clipping costs nothing here — the root covers
      // exactly the canvas, so the highlight now ends where the drawing does.
      overflow: 'hidden',
    });

    const outlines = sheet();
    const selectedBox = outlinePolygon();
    const hoverBox = outlinePolygon();
    const wrapBox = svg('path');

    // The wrap box shares the sheet, and goes on top of the two highlights: it
    // is a hairline over their wash, and underneath there would be little left
    // of it to see.
    outlines.append(selectedBox, hoverBox, wrapBox);

    // Faded, because the two gizmos are the same colours: what tells them apart
    // is which one is louder, and that has to be the selected node's.
    const selectedAxes = gizmo(1);
    const hoverAxes = gizmo(0.65);

    const transform = createFreeTransform(adapter, locks, toCanvas, redraw);

    // The gizmos go over everything, for the same reason and more so, and the
    // frame over them: it is the one layer here that has to be hit as well as
    // seen, so nothing may sit on top of its handles.
    root.append(outlines, hoverAxes.root, selectedAxes.root, transform.element);

    return {
      root,
      outlines,
      selectedBox,
      hoverBox,
      wrapBox,
      selectedAxes,
      hoverAxes,
      transform,
    };
  };

  let attached = false;
  let config: OverlayConfig = {
    highlight: 'off',
    picker: false,
    wrapBox: true,
    axes: 'arrows',
    pinned: [],
    transform: false,
    style: OVERLAY_STYLE_DEFAULTS,
    pickDepth: DEFAULT_PICK_DEPTH,
  };

  /**
   * A gizmo per pinned node, grown as they are asked for.
   *
   * Kept rather than removed when a pin goes: hiding one is a style write and
   * building one is a dozen elements, and the same handful of nodes tends to be
   * pinned and unpinned while someone is comparing them.
   */
  const pins: Gizmo[] = [];

  const pin = (index: number): Gizmo | null => {
    if (elements === null) return null;

    let element = pins[index];
    if (element === undefined) {
      element = gizmo(1);
      pins.push(element);
      elements.root.append(element.root);
    }

    return element;
  };

  /**
   * The paint last laid down, as the string it was compared by.
   *
   * `configure()` runs on every poll and the style changes only when someone is
   * in the settings, so writing eleven properties ten times a second would be
   * eleven ways to dirty the page's style for nothing. Serialising a handful of
   * fields is cheap at that rate — this is not the render loop, which is what
   * `layout()` guards against and why that one compares rectangles instead.
   *
   * The highlight's setting is part of the key, not just the style: `'outline'`
   * paints the same style differently, and a key that could not tell the two
   * apart would leave the wash on until something else in the settings moved.
   */
  let painted: string | null = null;

  const paint = (next: OverlayStyle, mode: HighlightMode): void => {
    const key = JSON.stringify([next, mode]);
    if (key === painted || elements === null) return;

    const bare = mode === 'outline';
    paintOutline(elements.selectedBox, bare ? unfilled(next.bareSelected) : next.selected);
    paintOutline(elements.hoverBox, bare ? unfilled(next.bareHover) : next.hover);
    paintWrap(elements.wrapBox, next.wrapBox);
    painted = key;
  };
  let selected: NodeId | null = null;
  let hovered: NodeId | null = null;
  let picked: NodeId[] = [];
  let unsubscribe: (() => void) | null = null;

  const hide = (element: HTMLElement | SVGElement): void => {
    element.style.transform = 'scale(0)';
  };

  /**
   * The node an id stands for, **and only while the scene still has it**.
   *
   * Everything drawn here goes through this rather than through `resolve`. The
   * registry's answer means "this node is still in memory", and a node the game
   * has taken out of the scene usually is: pooled for the next wave, or left
   * hanging off a container that was removed with it. Nothing about such a node
   * says so — it measures the same as it always did, out of the transform it
   * had when it was last drawn — so a frame placed from it stands over a place
   * where there is no longer anything to frame, and goes on being redrawn there
   * for as long as the row stays selected.
   *
   * The panel cannot spare us this. It sends the selection it made, and the
   * tree it would notice the loss in is a poll behind the frame this runs on.
   */
  const live = (current: PixiAdapter | null, id: NodeId | null): Node | null => {
    if (current === null || id === null) return null;

    const node = registry.resolve(id);

    return node !== null && onStage(current, node) ? node : null;
  };

  /**
   * The highlight of one node: its own bounds, turned the way it is turned.
   *
   * The adapter's axis-aligned `globalBounds` is the fallback rather than the
   * answer — see `outline.ts`. It is reached for by nodes that answer no probe
   * of their own, where a frame in the right place is still better than none.
   *
   * **A node with no extent is not framed.** An empty container measures as a
   * point, and so does one whose transform has gone bad, and a polygon whose
   * four corners are the same place is a stroked dot — at the top left of the
   * canvas, which is where an empty container's zero usually is. That dot says
   * something untrue about where the node is, and it is drawn on every frame
   * for as long as the row stays selected. A node that is thin but not empty —
   * a rule, a divider — still gets its frame.
   */
  const place = (current: PixiAdapter | null, element: SVGPolygonElement, node: Node | null): void => {
    if (current === null || node === null) {
      setPoints(element, null);
      return;
    }

    const outline = outlineOf(node) ?? corners(current.globalBounds(node));

    setPoints(element, spread(outline) ? outline : null);
  };

  /**
   * The wrap box of a caption, where the caption has one.
   *
   * A frame with a height of its own is drawn whole. Without one — a plain
   * PixiJS text, or a game's own with `wordWrapHeight` left at zero — the top
   * and bottom edges come off and what is left is two vertical guides as tall
   * as the text: the box bounds those captions across and not down, and drawing
   * a lid on it would be claiming a limit the game does not impose.
   */
  const placeWrap = (
    current: PixiAdapter | null,
    element: SVGPathElement,
    node: Node | null,
    style: WrapBoxStyle,
  ): void => {
    const wrap = current !== null && node !== null ? wrapBoxOf(node, current) : null;
    if (wrap === null) {
      element.setAttribute('d', '');
      return;
    }

    // Pushed out by half the stroke, so all of the ink lands beyond the box the
    // game measures the text against rather than half of it on the text. The
    // open frame is offset the same way: the two guides move apart, which is
    // where the old `content-box` border put them.
    const frame = offsetOutward(wrap.corners, style.strokeWidth / 2);

    element.setAttribute('d', pathOf(frame, wrap.bounded));
  };

  /**
   * The origin gizmo of one node.
   *
   * Unlike the outlines this is not placed from bounds at all: bounds are the
   * rectangle around what the node draws, and the zero is often nowhere near a
   * corner of it — an anchored sprite has its zero in the middle, a container
   * with a pivot has it outside its own children.
   */
  const placeAxes = (
    current: PixiAdapter | null,
    element: Gizmo,
    node: Node | null,
    mode: AxesMode,
    label = '',
  ): void => {
    element.caption.textContent = caption(label);

    // The parent is what the arrows are the axes of — see `axes.ts`. It comes
    // from the adapter rather than off a field, because who a node's parent is
    // is a question the adapter already answers.
    const axes =
      mode === 'off' || current === null || node === null
        ? null
        : axesOf(node, current.parentOf(node));
    if (axes === null) {
      hide(element.root);
      return;
    }

    // The SVG's own origin is its middle, so the box is pulled back by half its
    // size and the sign lands on the node's zero.
    element.root.style.transform = `translate(${String(axes.origin.x - AXIS.reach)}px, ${String(axes.origin.y - AXIS.reach)}px)`;

    // `'origin'` keeps the point and drops the arrows, which is what a scene of
    // small sprites wants: the arrows are large next to what they mark, the
    // point never is, and the two are worth having apart.
    const arms = mode === 'arrows';
    placeArm(element.x, arms ? axes.x : null);
    placeArm(element.y, arms ? axes.y : null);
  };

  /**
   * The size last written to the root, in CSS pixels. Kept because it is the
   * one thing the rectangles cannot report: `place()` positions the boxes in
   * this space, so a renderer that has changed resolution has to be followed
   * even on a page where nothing moved.
   */
  let placedSize: Size | null = null;

  /**
   * How many CSS pixels one of the overlay's own is, from the last time the two
   * were lined up.
   *
   * The frame's handles are sized by it, so they stay nine pixels on screen on a
   * canvas the page has stretched to fill a window. Written in the slow path of
   * `layout()` only: the fast path means nothing moved, and a scale that has not
   * changed does not need working out again.
   */
  let placedScale = 1;

  /**
   * A point on the page, in the space the frame and the highlights are drawn in.
   *
   * The root is laid over the canvas exactly (`layout()`), so undoing that
   * placement is all this takes — no adapter, no version branch, and none of the
   * event-system mapping the picker needs, because that one has to ask the
   * page's own hit test and this one only has to ask where.
   */
  const toCanvas = (clientX: number, clientY: number): Point | null => {
    if (elements === null || placedSize === null) return null;

    const rect = elements.root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: ((clientX - rect.left) * placedSize.width) / rect.width,
      y: ((clientY - rect.top) * placedSize.height) / rect.height,
    };
  };

  /**
   * Draw the scene and the frame again, after the frame has written to a node.
   *
   * Both halves are needed. The application may be frozen — a paused game, a
   * scene rendered once — in which case nothing redraws on its own; and where it
   * is rendering, the render hook runs `update()` anyway and this second call
   * costs one pass over a handful of elements.
   */
  const redraw = (): void => {
    frame.requestFrame();
    update();
  };

  /**
   * Lining the overlay up with the canvas — the only place in this file that
   * can make the browser lay the page out, and it runs inside the render loop
   * of the inspected application, so it does that only when it has to.
   *
   * A frame where nothing has moved reads two rectangles and writes nothing.
   * Reads on their own are cheap here: this runs at the top of the
   * application's own frame, before anything of ours has dirtied the layout.
   *
   * The slow path is the expensive one — a write, a read and a write, which is
   * a forced synchronous layout — and it is what used to run on every single
   * frame the application drew.
   */
  const layout = (current: PixiAdapter | null): void => {
    const canvas = current?.canvas() ?? null;
    if (current === null || canvas === null || elements === null) return;

    const { root } = elements;

    const { width, height } = current.rendererSize();
    const size = overlaySize(width, height, current.overlayResolution());

    // Both reads together, and ahead of every write below.
    const canvasRect = canvas.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();

    if (
      placedSize !== null &&
      placedSize.width === size.width &&
      placedSize.height === size.height &&
      overlayAligned(canvasRect, rootRect)
    ) {
      return;
    }

    Object.assign(root.style, { width: `${String(size.width)}px`, height: `${String(size.height)}px` });

    // Two measurements with a write between them: the box is sized, then
    // measured with **no transform**, and the transform is built from that.
    // Measuring without clearing it first would compound the transform.
    root.style.transform = '';
    const untransformed = root.getBoundingClientRect();
    const t = overlayTransform(canvasRect, untransformed);

    root.style.transform = `translate(${String(t.translateX)}px, ${String(t.translateY)}px) scale(${String(t.scaleX)}, ${String(t.scaleY)})`;
    placedSize = size;
    placedScale = t.scaleX;
  };

  const update = (): void => {
    if (!attached || elements === null) return;

    // Resolved once and handed down. `adapter()` is a full detection — a few
    // property reads plus a walk over the frames — and this runs on every
    // rendered frame, so asking for it three times would put that walk at the
    // refresh rate of the application instead of the rate of a poll, which is
    // the arrangement `detect()` says it is not built for.
    const current = adapter();

    layout(current);

    /*
     * The two nodes everything here is drawn from, resolved once each.
     *
     * Once, and **before any switch is consulted**: four things are drawn on
     * these two nodes — the frame, the wrap box, the gizmo and the free
     * transform — and each is switched on and off on its own. Resolving them
     * behind the highlight, as this used to, quietly made the other three
     * depend on it.
     */
    const chosen = live(current, selected);
    // The hovered node is not drawn twice when it is also the selected one.
    const under = hovered !== selected ? live(current, hovered) : null;

    const framed = config.highlight !== 'off';
    place(current, elements.selectedBox, framed ? chosen : null);
    place(current, elements.hoverBox, framed ? under : null);

    // The selected node only: a wrap box is read off a caption's style rather
    // than measured, and drawing one for whatever the pointer is passing over
    // would put a frame on screen for every text in a list being scrolled past.
    placeWrap(current, elements.wrapBox, config.wrapBox ? chosen : null, config.style.wrapBox);

    // The gizmo does follow the pointer, unlike the wrap box: it costs three
    // `toGlobal` calls on a node the tree is already showing, and where the
    // zero of the thing under the pointer is happens to be the question anyone
    // running down a list of similar sprites is asking.
    // A pinned node is drawn once, as its pin: the caption is the only thing
    // the pin has that the other two do not, and dropping it because the
    // pointer reached the row would be a caption that blinks.
    const pinnedIds = new Set(config.pinned.map((entry) => entry.id));
    const automatic = (id: NodeId | null, node: Node | null): Node | null =>
      id !== null && pinnedIds.has(id) ? null : node;

    placeAxes(current, elements.selectedAxes, automatic(selected, chosen), config.axes);
    placeAxes(current, elements.hoverAxes, automatic(hovered, under), config.axes);

    // A pin answers to `axes` and to nothing else: `axes` says how much of a
    // gizmo is drawn, and pinning is the panel's way of saying which nodes get
    // one beyond the two the overlay already follows.
    config.pinned.forEach((entry, index) => {
      const element = pin(index);
      if (element === null) return;

      placeAxes(current, element, live(current, entry.id), config.axes, entry.label);
    });

    // The pool outlives the pins, so whatever it is still holding is emptied.
    for (const element of pins.slice(config.pinned.length)) {
      placeAxes(current, element, null, config.axes);
    }

    elements.transform.place(config.transform ? chosen : null, placedScale);
  };

  const onClick = (event: MouseEvent): void => {
    const current = adapter();
    if (!config.picker || current === null) return;

    const stack = current.hitStack(event.clientX, event.clientY, config.pickDepth);
    // A click on empty canvas leaves the last pick where it is, rather than
    // reporting an empty stack the panel would have to tell from "nothing new".
    if (stack.length === 0) return;

    // The picker stays armed: it is switched on and off from the toolbar, and
    // nowhere else. Disarming it after one hit — as the previous project did —
    // meant every second click went to the page instead of the picker, and
    // walking a scene node by node was a click on the toggle between each.
    picked = stack.map((node) => registry.idOf(node));
  };

  const attach = (): void => {
    if (attached) return;
    elements ??= build();
    document.body.appendChild(elements.root);
    elements.root.addEventListener('click', onClick);
    // The overlay follows a moving scene, so from here on it needs a frame.
    unsubscribe = frame.subscribe(update);
    attached = true;
  };

  const detach = (): void => {
    if (!attached || elements === null) return;
    // A drag cannot be finished by a frame that is leaving the page.
    elements.transform.release();
    unsubscribe?.();
    unsubscribe = null;
    elements.root.removeEventListener('click', onClick);
    elements.root.remove();
    attached = false;
  };

  return {
    configure(next) {
      config = next;

      // Nothing on means nothing installed: no div in the page, no proxy on the
      // renderer, nothing between the application and its own frame. Every
      // switch counts, now that every switch draws something of its own — the
      // highlight going off used to take the whole overlay with it, which is
      // the same bug as the gizmo going off with it, seen from the other end.
      if (!draws(next)) {
        detach();
        return;
      }

      attach();
      if (elements === null) return;

      elements.root.style.pointerEvents = next.picker ? 'auto' : 'none';
      paint(next.style, next.highlight);
      // Whatever a switch has just taken off the page is cleared by `update()`,
      // which places every element from the configuration above — a node it is
      // not to draw reaches it as `null` and empties its element.
      update();
    },

    setHovered(id) {
      hovered = id;
      update();
    },

    setSelected(id) {
      selected = id;
      update();
    },

    takePicked() {
      const value = picked;
      picked = [];
      return value;
    },

    destroy: detach,
  };
}
