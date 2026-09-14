// @vitest-environment happy-dom
import type { AxesMode, Json, OverlayStyle, Rect } from '@scene-inspector/protocol';
import { DEFAULT_PICK_DEPTH, OVERLAY_STYLE_DEFAULTS } from '@scene-inspector/protocol';
import { afterEach, describe, expect, it } from 'vitest';

import type { Node, PixiAdapter } from '../../adapters/types.js';
import type { FrameHook } from '../../runtime/frame.js';
import { createLocks } from '../mutate.js';
import { createRegistry } from '../registry.js';
import type { OverlayConfig } from './overlay.js';
import { createOverlay } from './overlay.js';

/**
 * The overlay's DOM, as opposed to its arithmetic.
 *
 * `geometry.test.ts` covers where the boxes go; this covers what the page has
 * to put up with while they are there. The inspected application is a guest
 * here — highlighting a node must not move anything the application can see,
 * and the one way a div over a canvas can do that is by growing the document.
 */

/**
 * Enough of an adapter to lay the overlay out over a canvas.
 *
 * Every node a test makes is on the stage, because the stage is where the panel
 * gets the ids it sends. `detach` is how a test says the game has taken one out
 * again — see `scene/onStage.ts`.
 */
function fakeAdapter(bounds: Rect, size = { width: 800, height: 600 }, style: Record<string, Json> = {}) {
  const canvas = document.createElement('canvas');
  const stage = {};
  const detached = new Set<Node>();

  return {
    canvas: () => canvas,
    rendererSize: () => size,
    overlayResolution: () => 1,
    globalBounds: () => bounds,
    stage: () => stage,
    detach: (node: Node) => detached.add(node),
    // Everything hangs straight off the stage, which answers no transform probe
    // — so a node's axes are the canvas's own, which is what the gizmo asks
    // about (see `axes.ts`).
    parentOf: (node: Node) => (node === stage || detached.has(node) ? null : stage),
    // Only the wrap box reads properties, and only a caption has any.
    getProp: (_node: Node, path: string) => style[path],
  } as unknown as PixiAdapter & { detach(node: Node): void };
}

/** A node the wrap box can be read off — see `text/wrapBox.ts`. */
function caption(): Node {
  return {
    getLocalBounds: () => ({ x: 0, y: 0, width: 120, height: 34 }),
    toGlobal: (point: { x: number; y: number }) => point,
  } as unknown as Node;
}

/** How many times the overlay measures its own root, which is the cost. */
function countMeasurements(element: HTMLElement): () => number {
  let measured = 0;
  const real = element.getBoundingClientRect.bind(element);
  element.getBoundingClientRect = () => {
    measured++;
    return real();
  };
  return () => measured;
}

/** The overlay is the subject, not the render hook: subscribing is a no-op. */
const frame = { subscribe: () => () => {} } as unknown as FrameHook;

function root(): HTMLElement {
  const element = document.body.firstElementChild;
  if (!(element instanceof HTMLElement)) throw new Error('the overlay is not in the page');
  return element;
}

/** The two highlights share one sheet; the selected node's is the first on it. */
function selectedOutline(): SVGPolygonElement {
  const element = root().firstElementChild?.firstElementChild;
  if (!(element instanceof SVGPolygonElement)) throw new Error('the selected outline is missing');
  return element;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createOverlay', () => {
  /**
   * The regression this file exists for. The boxes are placed by the node's
   * global bounds, which run off the canvas whenever the node does; a root that
   * did not clip let them enlarge the document's scrollable overflow, which put
   * a scrollbar on the page, which changed the viewport, which resized every
   * application built on `resizeTo`.
   */
  it('clips its contents to the canvas, so a highlight cannot scroll the page', () => {
    const registry = createRegistry();
    const node = {};
    const overlay = createOverlay(() => fakeAdapter({ x: -300, y: 900, width: 200, height: 200 }), registry, frame, createLocks());

    overlay.configure({ highlight: true, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    overlay.setSelected(registry.idOf(node));

    expect(root().style.overflow).toBe('hidden');
  });

  /**
   * The console error this exists to stop: `<polygon> attribute points:
   * Expected number, "NaN,NaN …"`, once per frame for as long as the node is
   * selected.
   *
   * A game leaves a node at `NaN` now and then — a divide by a size that was
   * zero for one frame — and it draws nothing and says nothing about it. The
   * overlay must not be the thing that turns that into a wall of errors.
   */
  it('draws nothing at all for a node whose transform has gone bad', () => {
    const registry = createRegistry();
    const broken = {
      toGlobal: (point: { x: number; y: number }) => ({ x: NaN, y: point.y }),
      getLocalBounds: () => ({ x: 0, y: 0, width: 50, height: 50 }),
    } as unknown as Node;

    const overlay = createOverlay(
      () => fakeAdapter({ x: 0, y: 0, width: 0, height: 0 }),
      registry,
      frame,
      createLocks(),
    );

    overlay.configure({ highlight: true, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    overlay.setSelected(registry.idOf(broken));

    expect(selectedOutline().getAttribute('points')).toBe('');
  });

  /**
   * The clipping is the root's job and nothing else's: the outline still
   * carries the node's real bounds. Clamping them here instead would put the
   * edge of a half-visible node at the edge of the canvas rather than off it.
   */
  it('draws an outline on the raw bounds of the node, off the canvas and all', () => {
    const registry = createRegistry();
    const node = {};
    const overlay = createOverlay(() => fakeAdapter({ x: -300, y: 900, width: 200, height: 200 }), registry, frame, createLocks());

    overlay.configure({ highlight: true, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    overlay.setSelected(registry.idOf(node));

    // This node answers no probe of its own, so the adapter's axis-aligned
    // bounds are what it is outlined by — see `outline.ts`.
    expect(selectedOutline().getAttribute('points')).toBe(
      '-300,900 -100,900 -100,1100 -300,1100',
    );
  });

  /**
   * The bug this exists for: a frame left standing over a node the game has
   * already taken away.
   *
   * The registry answers with the node for as long as the node is in memory,
   * and a game that drops a sprite usually keeps the object — pooled, or hung
   * off a container that was itself removed. It measures the same as it always
   * did, out of the transform it had when it was last drawn, so the highlight
   * went on being redrawn in the place the node used to be. Only `destroyed`
   * was noticed, and detaching is not destroying.
   */
  it('drops the frame when the game takes the node out of the scene', () => {
    const registry = createRegistry();
    const node = {};
    const adapter = fakeAdapter({ x: 10, y: 20, width: 30, height: 40 });
    const settings: OverlayConfig = { highlight: true, picker: false, wrapBox: true, axes: 'arrows', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH };
    const overlay = createOverlay(() => adapter, registry, frame, createLocks());

    overlay.configure(settings);
    overlay.setSelected(registry.idOf(node));
    expect(selectedOutline().getAttribute('points')).toBe('10,20 40,20 40,60 10,60');

    adapter.detach(node);
    // The next poll, with the panel still holding the selection it made.
    overlay.configure(settings);

    expect(selectedOutline().getAttribute('points')).toBe('');
  });

  /** Switching both off leaves nothing behind, clipping container included. */
  it('takes the root out of the page when nothing is on', () => {
    const overlay = createOverlay(() => fakeAdapter({ x: 0, y: 0, width: 10, height: 10 }), createRegistry(), frame, createLocks());

    overlay.configure({ highlight: true, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    overlay.configure({ highlight: false, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });

    expect(document.body.firstElementChild).toBeNull();
  });
});

/**
 * What the overlay costs the application it is watching.
 *
 * `layout()` runs inside the render loop of the inspected page, and it used to
 * write a style and then measure — a forced synchronous layout on every frame
 * the application drew, for a page where in almost every one of those frames
 * nothing had moved at all.
 */
describe('createOverlay layout', () => {
  it('measures without writing while the canvas stays where it is', () => {
    const overlay = createOverlay(() => fakeAdapter({ x: 0, y: 0, width: 10, height: 10 }), createRegistry(), frame, createLocks());

    overlay.configure({ highlight: true, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    // The first pass has nothing to compare against and does the full work.
    const measured = countMeasurements(root());

    overlay.setSelected(null);
    overlay.setSelected(null);

    // One read per pass and no second one, which is what a write between them
    // would have forced.
    expect(measured()).toBe(2);
  });

  /**
   * The rectangles alone cannot see this: a renderer that changed resolution
   * leaves the canvas exactly where it was on the page, while the space the
   * boxes are placed in is now a different size.
   */
  it('lays out again when the renderer changes size under a still canvas', () => {
    const size = { width: 800, height: 600 };
    const overlay = createOverlay(
      () => fakeAdapter({ x: 0, y: 0, width: 10, height: 10 }, size),
      createRegistry(),
      frame,
      createLocks(),
    );

    overlay.configure({ highlight: true, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    const measured = countMeasurements(root());

    size.width = 1024;
    size.height = 768;
    overlay.setSelected(null);

    // Two: the read every pass makes, and the one taken with the transform off.
    expect(measured()).toBe(2);
    expect(root().style.width).toBe('1024px');
    expect(root().style.height).toBe('768px');
  });
});

/**
 * The wrap box a caption is laid out against — `wordWrapWidth` by
 * `wordWrapHeight`, the frame `flexFont` shrinks the type to fit.
 *
 * Where the game bounds no height there is no frame to close, and the overlay
 * says so by taking the lid off: what is left is two vertical guides as tall as
 * the text. The arithmetic behind all of this is in `text/wrapBox.test.ts`.
 */
describe('createOverlay wrap box', () => {
  const WRAPPED = { 'style.wordWrap': true, 'style.wordWrapWidth': 260, 'style.wordWrapHeight': 40 };

  function overlayFor(style: Record<string, Json>) {
    const registry = createRegistry();
    const node = caption();
    const overlay = createOverlay(
      () => fakeAdapter({ x: 0, y: 0, width: 120, height: 34 }, undefined, style),
      registry,
      frame,
      createLocks(),
    );

    overlay.configure({ highlight: true, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    overlay.setSelected(registry.idOf(node));

    // Last on the sheet, over the two highlights the caption may be sitting in.
    const element = root().firstElementChild?.children[2];
    if (!(element instanceof SVGPathElement)) throw new Error('the wrap box is missing');
    return { overlay, box: element };
  }

  const shape = (box: SVGPathElement): string => box.getAttribute('d') ?? '';

  /**
   * The stroke straddles its path, so the path is pushed out by half of it and
   * all four pixels land beyond the measurement: the box the game gives the
   * text runs from (0, 0) to (260, 40), and the ink lies outside that rather
   * than taking four pixels out of it.
   */
  it('draws the whole frame when the game bounds a height', () => {
    expect(shape(overlayFor(WRAPPED).box)).toBe('M -2 -2 L 262 -2 L 262 42 L -2 42 Z');
  });

  /**
   * With no height of the game's own there is no lid to draw: what is left is
   * the two vertical guides, as tall as the caption, pushed apart by the same
   * half stroke.
   */
  it('takes the lid off and stands as tall as the text when it does not', () => {
    const { box } = overlayFor({ 'style.wordWrap': true, 'style.wordWrapWidth': 260 });

    // Two subpaths and no `Z`: left edge, then right edge, down the height the
    // caption's own local bounds give it. They overshoot it by the same half
    // stroke that pushes them apart — the mitre of a corner that is no longer
    // drawn, and half a pixel-width of guide past the text either way.
    expect(shape(box)).toBe('M -2 -2 L -2 36 M 262 -2 L 262 36');
  });

  it('draws nothing on a node with neither switch on', () => {
    expect(shape(overlayFor({ 'style.wordWrapWidth': 260 }).box)).toBe('');
  });

  /** The frame belongs to the highlight, and goes when the highlight goes. */
  it('goes away with the highlight', () => {
    const { overlay, box } = overlayFor(WRAPPED);

    overlay.configure({ highlight: false, picker: true, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });

    expect(shape(box)).toBe('');
  });

  /**
   * Switched off from the panel, the frame is undrawn and nothing else changes:
   * the highlight it rides on stays exactly where it was.
   */
  it('is undrawn when the panel switches it off, highlight and all', () => {
    const { overlay, box } = overlayFor(WRAPPED);
    const drawn = shape(box);
    const outlined = selectedOutline().getAttribute('points');

    overlay.configure({ highlight: true, picker: false, wrapBox: false, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });

    expect(shape(box)).toBe('');
    expect(selectedOutline().getAttribute('points')).toBe(outlined);

    overlay.configure({ highlight: true, picker: false, wrapBox: true, axes: 'off', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    expect(shape(box)).toBe(drawn);
  });
});

/**
 * The sign on the node's zero.
 *
 * The arithmetic is in `axes.test.ts`; what is checked here is that it reaches
 * the page — that the gizmo lands on the origin rather than on a corner of the
 * bounds, that it goes when it is switched off, and that it goes with the
 * highlight it rides on.
 */
describe('createOverlay origin axes', () => {
  /** A node with a transform of its own, unlike the bare `{}` above. */
  function placed(x: number, y: number): Node {
    return {
      toGlobal: (point: { x: number; y: number }) => ({ x: x + point.x, y: y + point.y }),
    } as unknown as Node;
  }

  function overlayFor(axes: AxesMode) {
    const registry = createRegistry();
    const node = placed(300, 200);
    const overlay = createOverlay(
      // Bounds far from the origin: the gizmo must not be placed from them.
      () => fakeAdapter({ x: 250, y: 150, width: 100, height: 100 }),
      registry,
      frame,
      createLocks(),
    );

    overlay.configure({ highlight: true, picker: false, wrapBox: false, axes, pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    overlay.setSelected(registry.idOf(node));

    // Third of the root's children — the sheet, the hovered node's gizmo, then
    // this one. The free transform's frame sits above all three, which is why
    // this is counted from the front rather than taken off the back.
    const element = root().children[2];
    if (!(element instanceof SVGElement)) throw new Error('the gizmo is missing');
    return { overlay, gizmo: element };
  }

  /** Whether each arrow is drawn — the two groups above the origin's own dot. */
  function arms(gizmo: SVGElement): string[] {
    return [...gizmo.children]
      .filter((child): child is SVGGElement => child instanceof SVGGElement)
      .map((group) => group.style.display);
  }

  /**
   * Half the gizmo's box back from the zero, because the SVG's own origin is
   * its middle — which is what lets one translate place it however the node is
   * turned.
   */
  it('sits on the node’s zero rather than on its bounds', () => {
    expect(overlayFor('arrows').gizmo.style.transform).toBe('translate(248px, 148px)');
  });

  it('draws both arrows on the whole setting', () => {
    expect(arms(overlayFor('arrows').gizmo)).toEqual(['', '']);
  });

  /**
   * The middle setting, and the reason there are three. The point says where
   * the zero is and the arrows say which way the node is placed; on a scene of
   * small sprites the second is large next to what it marks while the first
   * never is.
   */
  it('keeps the point and drops the arrows on the middle setting', () => {
    const { gizmo } = overlayFor('origin');

    expect(gizmo.style.transform).toBe('translate(248px, 148px)');
    expect(arms(gizmo)).toEqual(['none', 'none']);
  });

  it('is undrawn when the panel switches it off', () => {
    expect(overlayFor('off').gizmo.style.transform).toBe('scale(0)');
  });

  /** It belongs to the highlight, and goes when the highlight goes. */
  it('goes away with the highlight', () => {
    const { overlay, gizmo } = overlayFor('arrows');

    overlay.configure({ highlight: false, picker: true, wrapBox: false, axes: 'arrows', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });

    expect(gizmo.style.transform).toBe('scale(0)');
  });

  /** Nothing in a scene guarantees a transform; a node without one is not drawn on. */
  it('draws nothing for a node it cannot place', () => {
    const registry = createRegistry();
    const overlay = createOverlay(() => fakeAdapter({ x: 0, y: 0, width: 10, height: 10 }), registry, frame, createLocks());

    overlay.configure({ highlight: true, picker: false, wrapBox: false, axes: 'arrows', pinned: [], transform: false, style: OVERLAY_STYLE_DEFAULTS, pickDepth: DEFAULT_PICK_DEPTH });
    overlay.setSelected(registry.idOf({}));

    expect((root().children[2] as SVGElement).style.transform).toBe('scale(0)');
  });
});

/**
 * How the frames are painted, which is the panel's to decide.
 *
 * The shapes are not settings and none of this changes where anything lands:
 * what is checked is that a colour chosen in the settings reaches the element,
 * and that the wrap box's width reaches the geometry as well as the stroke —
 * the frame is pushed out by half of it, so a width that only reached the paint
 * would put the ink back on the text it is measuring.
 */
describe('createOverlay style', () => {
  const CUSTOM = {
    selected: { fill: '#112233', fillOpacity: 0.75, stroke: '#445566', strokeOpacity: 0.25, strokeWidth: 3 },
    hover: { fill: '#778899', fillOpacity: 0.1, stroke: '#aabbcc', strokeOpacity: 0.9, strokeWidth: 2 },
    wrapBox: { stroke: '#ddeeff', strokeOpacity: 0.5, strokeWidth: 10 },
  };

  const WRAPPED = { 'style.wordWrap': true, 'style.wordWrapWidth': 260, 'style.wordWrapHeight': 40 };

  function overlayFor(style: OverlayStyle) {
    const registry = createRegistry();
    const overlay = createOverlay(
      () => fakeAdapter({ x: 0, y: 0, width: 120, height: 34 }, undefined, WRAPPED),
      registry,
      frame,
      createLocks(),
    );

    overlay.configure({
      highlight: true,
      picker: false,
      wrapBox: true,
      axes: 'off',
      pinned: [],
      transform: false,
      style,
      pickDepth: DEFAULT_PICK_DEPTH,
    });
    overlay.setSelected(registry.idOf(caption()));

    const sheet = root().firstElementChild;
    return { overlay, sheet: sheet as SVGSVGElement };
  }

  it('paints the highlights in the colours the settings chose', () => {
    const { sheet } = overlayFor(CUSTOM);
    const selected = sheet.children[0] as SVGPolygonElement;
    const hover = sheet.children[1] as SVGPolygonElement;

    expect(selected.style.fill).toBe('#112233');
    expect(selected.style.fillOpacity).toBe('0.75');
    expect(selected.style.stroke).toBe('#445566');
    expect(selected.style.strokeOpacity).toBe('0.25');
    expect(selected.style.strokeWidth).toBe('3');
    expect(hover.style.fill).toBe('#778899');
  });

  /** The dashes are in units of the stroke, so a thicker frame is not a denser one. */
  it('paints the wrap box, dashes and all', () => {
    const wrap = overlayFor(CUSTOM).sheet.children[2] as SVGPathElement;

    expect(wrap.style.stroke).toBe('#ddeeff');
    expect(wrap.style.strokeOpacity).toBe('0.5');
    expect(wrap.style.strokeWidth).toBe('10');
    expect(wrap.style.strokeDasharray).toBe('30 20');
    // Never a fill: the frame is drawn over the very text it is measuring.
    expect(wrap.style.fill).toBe('none');
  });

  /**
   * The width is geometry as well as paint. The box the game gives the text
   * runs from (0, 0) to (260, 40); at ten pixels the ink has to start five
   * beyond it on every side.
   */
  it('pushes the wrap box out by half of whatever width it was given', () => {
    const wrap = overlayFor(CUSTOM).sheet.children[2] as SVGPathElement;

    expect(wrap.getAttribute('d')).toBe('M -5 -5 L 265 -5 L 265 45 L -5 45 Z');
  });

  it('draws the overlay as it always has when the caller sends no style', () => {
    const { sheet } = overlayFor(OVERLAY_STYLE_DEFAULTS);
    const selected = sheet.children[0] as SVGPolygonElement;

    expect(selected.style.fill).toBe(OVERLAY_STYLE_DEFAULTS.selected.fill);
    expect(selected.style.fillOpacity).toBe(String(OVERLAY_STYLE_DEFAULTS.selected.fillOpacity));
  });
});

/**
 * Gizmos pinned to particular nodes.
 *
 * The sign follows the selection and the pointer, so comparing where two nodes'
 * zeros are means clicking between them. A pin is how one stays — and the
 * caption is what says whose it is, which is the whole reason a second gizmo on
 * screen is worth anything.
 */
describe('createOverlay pinned axes', () => {
  /** A node with a transform of its own, the same as the block above uses. */
  function placed(x: number, y: number): Node {
    return {
      toGlobal: (point: { x: number; y: number }) => ({ x: x + point.x, y: y + point.y }),
    } as unknown as Node;
  }

  function overlayFor() {
    const registry = createRegistry();
    const overlay = createOverlay(
      () => fakeAdapter({ x: 0, y: 0, width: 10, height: 10 }),
      registry,
      frame,
      createLocks(),
    );

    const configure = (config: Partial<OverlayConfig>): void => {
      overlay.configure({
        highlight: true,
        picker: false,
        wrapBox: false,
        axes: 'arrows',
        pinned: [],
        transform: false,
        style: OVERLAY_STYLE_DEFAULTS,
        pickDepth: DEFAULT_PICK_DEPTH,
        ...config,
      });
    };

    configure({});
    return { overlay, registry, configure };
  }

  /**
   * The pins are appended after the four the overlay is built with: the sheet
   * the outlines share, the two automatic gizmos, and the transform frame.
   */
  function pins(): SVGElement[] {
    return [...root().querySelectorAll(':scope > svg')].slice(4) as SVGElement[];
  }

  function captionOf(element: SVGElement): string {
    return element.querySelector(':scope > text')?.textContent ?? '';
  }

  it('draws a gizmo on a node nobody has selected, captioned with its name', () => {
    const { registry, configure } = overlayFor();
    const id = registry.idOf(placed(300, 200));

    configure({ pinned: [{ id, label: 'checker.png (Sprite)' }] });

    expect(pins()).toHaveLength(1);
    expect(pins()[0]?.style.transform).toBe('translate(248px, 148px)');
    expect(captionOf(pins()[0] as SVGElement)).toBe('checker.png (Sprite)');
  });

  it('draws one for each, so two can be compared', () => {
    const { registry, configure } = overlayFor();

    configure({
      pinned: [
        { id: registry.idOf(placed(100, 100)), label: 'hero' },
        { id: registry.idOf(placed(300, 200)), label: 'coin' },
      ],
    });

    expect(pins().map(captionOf)).toEqual(['hero', 'coin']);
  });

  /** A name long enough to lie across the scene is cut instead. */
  it('cuts a caption rather than laying a path across the canvas', () => {
    const { registry, configure } = overlayFor();
    const label = 'hud/panel/score/valueLabelWithAVeryLongName (Text)';

    configure({ pinned: [{ id: registry.idOf(placed(0, 0)), label }] });

    const caption = captionOf(pins()[0] as SVGElement);
    expect(caption.length).toBeLessThan(label.length);
    expect(caption.endsWith('…')).toBe(true);
  });

  /**
   * The caption is the only thing a pin has that the automatic two do not, so
   * a pinned node that is also selected keeps it rather than losing it to the
   * gizmo that would otherwise be drawn on top.
   */
  it('draws a pinned node once when it is also the selection', () => {
    const { overlay, registry, configure } = overlayFor();
    const id = registry.idOf(placed(300, 200));

    configure({ pinned: [{ id, label: 'hero' }] });
    overlay.setSelected(id);

    // Third of the root's children: the sheet, the hover gizmo, then this one.
    const selectedAxes = root().children[2];
    expect((selectedAxes as SVGElement).style.transform).toBe('scale(0)');
    expect(pins()[0]?.style.transform).toBe('translate(248px, 148px)');
  });

  it('obeys the switch that says how much of a gizmo is drawn', () => {
    const { registry, configure } = overlayFor();
    const pinned = [{ id: registry.idOf(placed(0, 0)), label: 'hero' }];

    configure({ pinned, axes: 'origin' });
    const arms = (): string[] =>
      [...(pins()[0]?.children ?? [])]
        .filter((child): child is SVGGElement => child instanceof SVGGElement)
        .map((group) => group.style.display);
    expect(arms()).toEqual(['none', 'none']);

    configure({ pinned, axes: 'off' });
    expect(pins()[0]?.style.transform).toBe('scale(0)');
  });

  /** One switch still takes everything the overlay draws off the page. */
  it('goes away with the highlight', () => {
    const { registry, configure } = overlayFor();
    const pinned = [{ id: registry.idOf(placed(0, 0)), label: 'hero' }];

    configure({ pinned });
    configure({ pinned, highlight: false, picker: true });

    expect(pins()[0]?.style.transform).toBe('scale(0)');
  });

  /** The pool keeps its elements; what it must not keep is a gizmo on screen. */
  it('empties an element the pool is still holding after a pin goes', () => {
    const { registry, configure } = overlayFor();
    const pinned = [{ id: registry.idOf(placed(300, 200)), label: 'hero' }];

    configure({ pinned });
    configure({ pinned: [] });

    expect(pins()).toHaveLength(1);
    expect(pins()[0]?.style.transform).toBe('scale(0)');
  });
});

/**
 * The picker, from the page's side: a click on the overlay is answered with
 * every node under it, and the panel takes that answer once.
 */
describe('the picker', () => {
  /** An adapter that finds whatever the test currently says is under a point. */
  function pickingAdapter(stack: () => Node[]): PixiAdapter {
    return {
      ...fakeAdapter({ x: 0, y: 0, width: 10, height: 10 }),
      hitStack: stack,
    } as unknown as PixiAdapter;
  }

  function armed(stack: Node[]) {
    const registry = createRegistry();
    let under = stack;
    const overlay = createOverlay(() => pickingAdapter(() => under), registry, frame, createLocks());

    overlay.configure({
      highlight: false,
      picker: true,
      wrapBox: false,
      axes: 'off',
      pinned: [],
      transform: false,
      style: OVERLAY_STYLE_DEFAULTS,
      pickDepth: DEFAULT_PICK_DEPTH,
    });

    const click = (): void => {
      root().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };

    /** What the next click lands on. */
    const finds = (next: Node[]): void => {
      under = next;
    };

    return { registry, overlay, click, finds };
  }

  /**
   * Everything under the click, topmost first. The node on top is the one the
   * panel selects; the rest is the whole point, because a node with something
   * drawn over it cannot be clicked on at all.
   */
  it('reports every node under the click, topmost first', () => {
    const top = {};
    const under = {};
    const { registry, overlay, click } = armed([top, under]);

    click();

    expect(overlay.takePicked()).toEqual([registry.idOf(top), registry.idOf(under)]);
  });

  /** Taken rather than read: a pick is reported to one poll and no more. */
  it('reports a pick once', () => {
    const { overlay, click } = armed([{}]);

    click();
    overlay.takePicked();

    expect(overlay.takePicked()).toEqual([]);
  });

  /**
   * A click on empty canvas is not an answer. Reporting one would be
   * indistinguishable from "nothing has been picked since you last asked",
   * which is what an empty list already means.
   */
  it('leaves the last pick alone when the click lands on nothing', () => {
    const node = {};
    const { registry, overlay, click, finds } = armed([node]);

    click();
    finds([]);
    click();

    expect(overlay.takePicked()).toEqual([registry.idOf(node)]);
  });
});
