// @vitest-environment happy-dom
import type { Rect } from '@scene-inspector/protocol';
import { DEFAULT_PICK_DEPTH, OVERLAY_STYLE_DEFAULTS } from '@scene-inspector/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getProp, setProp } from '../../adapters/common.js';
import type { Node, PixiAdapter } from '../../adapters/types.js';
import type { FrameHook } from '../../runtime/frame.js';
import type { Locks } from '../mutate.js';
import { createLocks } from '../mutate.js';
import { createRegistry } from '../registry.js';
import type { OverlayConfig } from './overlay.js';
import { createOverlay } from './overlay.js';
import { HANDLE_IDS } from './transform.js';

/**
 * The frame, driven by a pointer, over a node that answers like a real one.
 *
 * `transform.test.ts` next door proves the arithmetic; this proves the parts
 * that only exist together — that a press on the right element starts the right
 * gesture, that what comes out of the solver is written back onto the node, and
 * that a locked node is left alone.
 */

/** A node that composes its own transform the way PixiJS does. */
interface Fake extends Record<string, unknown> {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  pivot: { x: number; y: number };
  rotation: number;
}

function fakeNode(bounds: Rect, at: { x: number; y: number }): Fake {
  const node: Fake = {
    position: { ...at },
    scale: { x: 1, y: 1 },
    pivot: { x: 0, y: 0 },
    rotation: 0,
    getLocalBounds: () => bounds,
    toGlobal(point: { x: number; y: number }) {
      const cos = Math.cos(node.rotation);
      const sin = Math.sin(node.rotation);
      const x = (point.x - node.pivot.x) * node.scale.x;
      const y = (point.y - node.pivot.y) * node.scale.y;

      return {
        x: node.position.x + x * cos - y * sin,
        y: node.position.y + x * sin + y * cos,
      };
    },
  };

  return node;
}

/** Reads and writes go through the real ones: this is what the page does. */
function fakeAdapter(): PixiAdapter {
  const canvas = document.createElement('canvas');
  // Every node here hangs straight off the stage, which is how the overlay
  // tells one the game still has from one it has dropped (`scene/onStage.ts`).
  // The stage answers no transform probe, so the frame is measured against the
  // canvas's own axes exactly as it was before it had one.
  const stage = {};

  return {
    canvas: () => canvas,
    rendererSize: () => ({ width: 800, height: 600 }),
    overlayResolution: () => 1,
    globalBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    stage: () => stage,
    parentOf: (node: Node) => (node === stage ? null : stage),
    getProp,
    setProp,
  } as unknown as PixiAdapter;
}

const frame: FrameHook = {
  subscribe: () => () => {},
  refresh: () => {},
  requestFrame: () => {},
  installed: false,
};

/** The canvas, the overlay and the page all agree on one 800×600 box at 0,0. */
const RECT = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 800,
  bottom: 600,
  width: 800,
  height: 600,
  toJSON: () => ({}),
};

let measure: () => DOMRect;

beforeEach(() => {
  measure = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = () => RECT as DOMRect;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = measure;
  document.body.innerHTML = '';
});

const BOUNDS: Rect = { x: 0, y: 0, width: 50, height: 40 };

function armed(node: Fake, locks: Locks = createLocks(), config: Partial<OverlayConfig> = {}) {
  const registry = createRegistry();
  const overlay = createOverlay(() => fakeAdapter(), registry, frame, locks);

  overlay.configure({
    highlight: 'off',
    picker: false,
    wrapBox: false,
    axes: 'off',
    pinned: [],
    transform: true,
    style: OVERLAY_STYLE_DEFAULTS,
    pickDepth: DEFAULT_PICK_DEPTH,
    ...config,
  });
  overlay.setSelected(registry.idOf(node as unknown as Node));

  const root = document.body.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('the overlay is not in the page');

  // The sheet the outlines share, the two automatic gizmos, then the frame.
  const element = root.children[3];
  if (!(element instanceof SVGElement)) throw new Error('the frame is missing');

  return { overlay, element };
}

/** The inside of the frame — the part that drags the node about. */
function body(element: SVGElement): SVGPolygonElement {
  const polygon = element.querySelector('polygon');
  if (polygon === null) throw new Error('the frame has no body');
  return polygon;
}

/** One handle's square, by the compass name the frame gives it. */
function handle(element: SVGElement, id: (typeof HANDLE_IDS)[number]): SVGRectElement {
  const groups = element.querySelectorAll(':scope > g');
  const group = groups[HANDLE_IDS.indexOf(id)];
  const box = group?.querySelector('rect');
  if (!(box instanceof SVGRectElement)) throw new Error(`no handle ${id}`);
  return box;
}

function press(target: Element, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }),
  );
}

function drag(target: Element, x: number, y: number, keys: Partial<PointerEventInit> = {}): void {
  target.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      ...keys,
    }),
  );
}

function lift(target: Element, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }),
  );
}

describe('the free transform frame', () => {
  it('is drawn on the selected node with the highlight switched off', () => {
    const { element } = armed(fakeNode(BOUNDS, { x: 100, y: 100 }));

    expect(element.style.display).toBe('');
    expect(body(element).getAttribute('points')).toBe('100,100 150,100 150,140 100,140');
  });

  it('is not drawn at all until the mode is armed', () => {
    const { element } = armed(fakeNode(BOUNDS, { x: 100, y: 100 }), createLocks(), {
      highlight: 'fill',
      transform: false,
    });

    expect(element.style.display).toBe('none');
  });

  /** The zones are the only part of the frame that is not a drag. */
  it('shows a drawn turn cursor outside the corners, not a hand', () => {
    const { element } = armed(fakeNode(BOUNDS, { x: 100, y: 100 }));
    const zones = [...element.querySelectorAll<SVGRectElement>(':scope > rect')];

    expect(zones).toHaveLength(4);
    for (const zone of zones) {
      expect(zone.style.cursor.startsWith('url("data:image/svg+xml,')).toBe(true);
    }
  });

  it('moves the node by dragging its inside', () => {
    const node = fakeNode(BOUNDS, { x: 100, y: 100 });
    const { element } = armed(node);
    const inside = body(element);

    press(inside, 120, 120);
    drag(inside, 130, 135);
    lift(inside, 130, 135);

    expect(node.position).toEqual({ x: 110, y: 115 });
  });

  it('scales from a handle and leaves the far corner where it was', () => {
    const node = fakeNode(BOUNDS, { x: 100, y: 100 });
    const { element } = armed(node);
    const corner = handle(element, 'se');

    press(corner, 150, 140);
    drag(corner, 250, 140);
    lift(corner, 250, 140);

    // Proportional with nothing held: the pointer went out along x, and y came
    // with it.
    expect(node.scale).toEqual({ x: 3, y: 3 });
    // The node's zero is its top left here, which is the anchor: it must not
    // have shifted by so much as a pixel.
    expect(node.position).toEqual({ x: 100, y: 100 });
  });

  it('lets the axes go their own way while Shift is down', () => {
    const node = fakeNode(BOUNDS, { x: 100, y: 100 });
    const { element } = armed(node);
    const corner = handle(element, 'se');

    press(corner, 150, 140);
    drag(corner, 250, 140, { shiftKey: true });

    expect(node.scale.x).toBeCloseTo(3, 6);
    expect(node.scale.y).toBeCloseTo(1, 6);
  });

  it('puts the node back when the drag is called off with Escape', () => {
    const node = fakeNode(BOUNDS, { x: 100, y: 100 });
    const { element } = armed(node);
    const inside = body(element);

    press(inside, 120, 120);
    drag(inside, 300, 300);
    expect(node.position).not.toEqual({ x: 100, y: 100 });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(node.position).toEqual({ x: 100, y: 100 });

    // And the gesture is over: the pointer moving on is not a second drag.
    drag(inside, 400, 400);
    expect(node.position).toEqual({ x: 100, y: 100 });
  });

  /**
   * The inspector is a guest in this scene. A node it leaves at `NaN` is broken
   * for the rest of the session — it draws nothing, and nothing in the game
   * says why — so a drag on one it cannot place does not start at all.
   */
  it('will not take hold of a node whose transform is not a number', () => {
    const node = fakeNode(BOUNDS, { x: 100, y: 100 });
    node.position.x = NaN;

    const { element } = armed(node);

    expect(element.style.display).toBe('none');
  });

  it('leaves the node alone rather than writing a number that is not one', () => {
    const node = fakeNode(BOUNDS, { x: 100, y: 100 });
    const { element } = armed(node);
    const inside = body(element);

    press(inside, 120, 120);
    // The pointer cannot report this, but the arithmetic between here and the
    // node divides, and an ancestor scaled to a millionth can overflow it.
    drag(inside, Number.POSITIVE_INFINITY, 130);

    expect(node.position).toEqual({ x: 100, y: 100 });
  });

  it('refuses to move a locked node, and still shows where it is', () => {
    const node = fakeNode(BOUNDS, { x: 100, y: 100 });
    const locks = createLocks();
    locks.set(node as unknown as Node, true);

    const { element } = armed(node, locks);
    const inside = body(element);

    press(inside, 120, 120);
    drag(inside, 300, 300);

    expect(node.position).toEqual({ x: 100, y: 100 });
    expect(element.style.display).toBe('');
  });
});
