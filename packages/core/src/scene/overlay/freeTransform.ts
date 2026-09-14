import type { Json, Rect } from '@scene-inspector/protocol';

import type { Node, PixiAdapter } from '../../adapters/types.js';
import type { Locks } from '../mutate.js';
import type { Matrix, Point } from '../nodeSpace.js';
import { IDENTITY, apply, localBoundsOf, worldMatrix } from '../nodeSpace.js';
import type { Change, DragStart, HandleId, Modifiers } from './transform.js';
import {
  HANDLE_IDS,
  centreOf,
  cursorFor,
  handlePoint,
  isCorner,
  movedTo,
  rotatedTo,
  scaledTo,
  turnCursorFor,
} from './transform.js';

/**
 * The frame you can take hold of: eight handles, a turn outside each corner,
 * and the inside of the box to drag the node around by.
 *
 * **This is the only thing in the overlay that writes to the scene**, and it is
 * why the whole gesture lives in the page rather than in the panel. A drag is
 * sixty pointer events a second; sending each one across the bridge and waiting
 * for the answer would put the frame a poll behind the pointer, which is the
 * one thing a direct-manipulation tool cannot be. The panel arms it with a
 * single flag and learns what changed the way it learns about anything else —
 * from the next poll of `scene.propValues`.
 *
 * The arithmetic is next door in `transform.ts`, under tests. What is here is
 * the DOM, the pointer, and the reading and writing of the node.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

/**
 * The frame's own colours, fixed rather than taken from `OverlayStyle`.
 *
 * The highlight is a way of *looking* at a node and its paint is a preference;
 * this is a tool, and its handles have to read as handles on whatever the game
 * is drawing. Same reasoning as the axis gizmo's colours in `overlay.ts`.
 */
const PAINT = {
  edge: 'hsl(210 100% 60%)',
  shadow: 'rgba(0, 0, 0, 0.65)',
  handle: 'hsl(0 0% 100%)',
};

/** In CSS pixels on screen, held there whatever the canvas is scaled to. */
const SIZE = {
  handle: 9,
  /** How far outside a corner the turn can be seized. */
  rotate: 30,
  edge: 1.5,
};

/** The four handles that also turn the node, in the order the zones are built. */
const CORNER_IDS = HANDLE_IDS.filter(isCorner);

/** What a press on one part of the frame means. */
type Grab =
  | { kind: 'move' }
  | { kind: 'scale'; handle: HandleId }
  | { kind: 'rotate' };

interface Session {
  grab: Grab;
  start: DragStart;
  node: Node;
  pointerId: number;
}

export interface FreeTransform {
  /** The element the overlay hangs in its root. */
  readonly element: SVGSVGElement;
  /**
   * Draw the frame on this node, or take it off the page when there is none.
   *
   * @param scale how many CSS pixels one of the overlay's own is, so the
   * handles stay the same size on a canvas the page has stretched.
   */
  place(node: Node | null, scale: number): void;
  /** Whether a drag is in flight. */
  readonly dragging: boolean;
  /**
   * Let go of any drag in flight, keeping the element.
   *
   * The overlay calls this when it comes off the page: the frame is going out
   * of the document, and a gesture that can no longer be finished must not
   * leave a pointer captured or a key listener on the game's window.
   */
  release(): void;
  destroy(): void;
}

/** A `{x, y}` off the node, or null for anything that is not one. */
function vectorOf(value: Json | undefined): Point | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const { x, y } = value as Record<string, Json>;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
}

/**
 * Everything the drag needs, read in one go at `pointerdown`.
 *
 * @returns null for a node that cannot answer — destroyed, or not a display
 * object. Nothing is drawn on those either, so this is belt and braces for the
 * gap between a frame being drawn and the pointer landing on it.
 */
function snapshot(adapter: PixiAdapter, node: Node, pointer: Point): DragStart | null {
  const world = worldMatrix(node);
  const bounds = localBoundsOf(node);
  if (world === null || bounds === null) return null;

  const parentNode = adapter.parentOf(node);
  const parent = parentNode === null ? IDENTITY : (worldMatrix(parentNode) ?? IDENTITY);

  const rotation = adapter.getProp(node, 'rotation');

  return {
    bounds,
    world,
    parent,
    position: vectorOf(adapter.getProp(node, 'position')) ?? { x: 0, y: 0 },
    scale: vectorOf(adapter.getProp(node, 'scale')) ?? { x: 1, y: 1 },
    pivot: vectorOf(adapter.getProp(node, 'pivot')) ?? { x: 0, y: 0 },
    rotation: typeof rotation === 'number' ? rotation : 0,
    pointer,
  };
}

function real(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/**
 * Writing an answer onto the node.
 *
 * The position goes on last. The other two move the node about its own zero,
 * and this is the write that puts the zero where the anchor being held still
 * requires it — see `transform.ts`.
 *
 * **All of it or none of it, and only if every number is a real one.** The
 * inspector is a guest in this scene, and a node it leaves at `NaN` is broken
 * for the rest of the session — it draws nothing, and nothing in the game says
 * why. The solvers divide, and a scene contains ancestors scaled to a
 * millionth; refusing the answer costs one skipped frame of a drag, which is
 * invisible, and the pointer's next move asks again from the same snapshot.
 *
 * Partial writes are refused for a plainer reason: a scale written without the
 * position that goes with it is the node jumping across the screen.
 */
function write(adapter: PixiAdapter, node: Node, change: Change): void {
  const { position, scale, rotation } = change;

  if (!real(position)) return;
  if (scale !== undefined && !real(scale)) return;
  if (rotation !== undefined && !Number.isFinite(rotation)) return;

  // Spread into a plain record on the way out: `Json` is an index-signature
  // type and a `Point` is not one, however alike they read.
  if (scale !== undefined) adapter.setProp(node, 'scale', { x: scale.x, y: scale.y });
  if (rotation !== undefined) adapter.setProp(node, 'rotation', rotation);
  adapter.setProp(node, 'position', { x: position.x, y: position.y });
}

/** One handle: the square you see, and the square you can actually hit. */
interface Handle {
  group: SVGGElement;
  box: SVGRectElement;
}

function handleElement(): Handle {
  const group = svg('g');
  const box = svg('rect');

  Object.assign(box.style, {
    fill: PAINT.handle,
    stroke: PAINT.shadow,
    pointerEvents: 'all',
  });

  group.append(box);
  return { group, box };
}

/** The invisible square outside a corner that turns the node. */
function rotateZone(): SVGRectElement {
  const zone = svg('rect');
  Object.assign(zone.style, {
    fill: 'transparent',
    // Under the body of the frame in document order, so the half of it that
    // falls inside the box loses to the drag-to-move — which is how an image
    // editor behaves: the turn is the space *around* the corner.
    pointerEvents: 'all',
  });
  // The cursor is set in `place()`: it faces away from the middle of the frame,
  // and the frame turns.
  return zone;
}

/**
 * Writes a cursor only when it is a different one.
 *
 * The turn cursor is a drawn image a kilobyte long, and this runs on every
 * frame of a moving scene. Assigning the same string over and over is a style
 * invalidation each time for nothing.
 */
function setCursor(element: SVGElement, cursor: string): void {
  if (element.style.cursor !== cursor) element.style.cursor = cursor;
}

export function createFreeTransform(
  adapter: () => PixiAdapter | null,
  locks: Locks,
  /** Client coordinates into the space the frame is drawn in, or null. */
  toCanvas: (clientX: number, clientY: number) => Point | null,
  /** Draw the scene and the frame again: the game may not be rendering at all. */
  redraw: () => void,
): FreeTransform {
  const element = svg('svg');
  Object.assign(element.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    // The frame's parts take the pointer, the sheet between them does not: with
    // the mode armed the game is still usable everywhere the frame is not.
    pointerEvents: 'none',
    overflow: 'visible',
    display: 'none',
  });

  const body = svg('polygon');
  Object.assign(body.style, {
    fill: 'transparent',
    stroke: PAINT.edge,
    strokeWidth: String(SIZE.edge),
    pointerEvents: 'all',
    cursor: 'move',
  });

  const zones = new Map<HandleId, SVGRectElement>(
    CORNER_IDS.map((id) => [id, rotateZone()]),
  );
  const handles = new Map<HandleId, Handle>(HANDLE_IDS.map((id) => [id, handleElement()]));

  // Document order is the hit order: the turns underneath, the body of the
  // frame over them, the handles on top of everything.
  element.append(...zones.values(), body);
  for (const handle of handles.values()) element.append(handle.group);

  /** What each part of the frame means when it is pressed. */
  const grabs = new WeakMap<Element, Grab>();
  grabs.set(body, { kind: 'move' });
  for (const zone of zones.values()) grabs.set(zone, { kind: 'rotate' });
  for (const [id, handle] of handles) grabs.set(handle.box, { kind: 'scale', handle: id });

  /** The node the frame is currently drawn on. */
  let target: Node | null = null;
  let session: Session | null = null;

  const cancel = (): void => {
    if (session === null) return;

    const current = adapter();
    const { start } = session;
    if (current !== null) {
      write(current, session.node, {
        position: start.position,
        scale: start.scale,
        rotation: start.rotation,
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (session === null || event.key !== 'Escape') return;

    // Taken from the page: a game that closes its own menu on Escape must not
    // do so because a drag was called off over its canvas.
    event.preventDefault();
    event.stopPropagation();
    cancel();
    finish();
    redraw();
  };

  function finish(): void {
    if (session === null) return;

    try {
      element.releasePointerCapture(session.pointerId);
    } catch {
      // The pointer is already gone — a cancelled gesture, a lost device.
    }
    window.removeEventListener('keydown', onKeyDown, true);
    session = null;
  }

  const onPointerDown = (event: PointerEvent): void => {
    const grab = grabs.get(event.target as Element);
    const current = adapter();
    if (grab === undefined || current === null || target === null || session !== null) return;

    // A locked node is out of reach of the tree's own gestures, and this is one
    // more of them. The frame stays drawn: it says where the node is, and
    // taking it away would look like the mode had switched itself off.
    if (locks.isLocked(target)) return;

    const pointer = toCanvas(event.clientX, event.clientY);
    if (pointer === null) return;

    const start = snapshot(current, target, pointer);
    if (start === null) return;

    event.preventDefault();
    event.stopPropagation();

    session = { grab, start, node: target, pointerId: event.pointerId };
    // On the root rather than on the handle: the pointer leaves a nine-pixel
    // square immediately, and every move after that has to keep coming here.
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // No capture available: the drag still tracks while the pointer is over
      // the overlay, which covers the canvas.
    }
    window.addEventListener('keydown', onKeyDown, true);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (session === null || event.pointerId !== session.pointerId) return;

    const current = adapter();
    const pointer = toCanvas(event.clientX, event.clientY);
    if (current === null || pointer === null) return;

    event.preventDefault();

    const modifiers: Modifiers = { shift: event.shiftKey, alt: event.altKey };
    const { grab, start } = session;
    const change =
      grab.kind === 'move'
        ? movedTo(start, pointer)
        : grab.kind === 'rotate'
          ? rotatedTo(start, pointer, modifiers)
          : scaledTo(start, grab.handle, pointer, modifiers);

    if (change !== null) write(current, session.node, change);

    // The scene may be frozen — an edit that lands and is never drawn is an
    // edit nobody can see they are making.
    redraw();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (session === null || event.pointerId !== session.pointerId) return;

    event.preventDefault();
    finish();
    redraw();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerUp);

  const points = (world: Matrix, bounds: Rect): Map<HandleId, Point> =>
    new Map(HANDLE_IDS.map((id) => [id, apply(world, handlePoint(bounds, id))]));

  return {
    element,

    place(node, scale) {
      // Never taken off the page mid-drag: the panel's selection is polled, and
      // a poll landing halfway through a gesture must not end it.
      const drawn = session === null ? node : session.node;
      target = node;

      const world = drawn === null ? null : worldMatrix(drawn);
      const bounds = drawn === null ? null : localBoundsOf(drawn);
      // A node with no extent gets no frame: eight handles piled on one point
      // are nothing anyone can take hold of, and the pile lands at the top left
      // of the canvas, which is where an empty container's zero tends to be.
      if (world === null || bounds === null || (bounds.width === 0 && bounds.height === 0)) {
        element.style.display = 'none';
        return;
      }

      element.style.display = '';

      const at = points(world, bounds);
      const middle = apply(world, centreOf(bounds));
      // One CSS pixel on screen is this many of the overlay's own, so a canvas
      // the page has stretched does not stretch the handles with it.
      const unit = scale > 0 ? 1 / scale : 1;

      body.setAttribute(
        'points',
        (['nw', 'ne', 'se', 'sw'] as const)
          .map((id) => at.get(id))
          .map((point) => (point === undefined ? '' : `${String(point.x)},${String(point.y)}`))
          .join(' '),
      );
      body.style.strokeWidth = String(SIZE.edge * unit);

      // The frame turns with the node, so the squares turn with it too — an
      // upright handle on a frame at 30° reads as a sticker rather than a grip.
      const east = at.get('e');
      const west = at.get('w');
      const angle =
        east === undefined || west === undefined
          ? 0
          : (Math.atan2(east.y - west.y, east.x - west.x) * 180) / Math.PI;

      const side = SIZE.handle * unit;
      for (const [id, handle] of handles) {
        const point = at.get(id);
        if (point === undefined) continue;

        handle.group.setAttribute(
          'transform',
          `translate(${String(point.x)} ${String(point.y)}) rotate(${String(angle)})`,
        );
        handle.box.setAttribute('x', String(-side / 2));
        handle.box.setAttribute('y', String(-side / 2));
        handle.box.setAttribute('width', String(side));
        handle.box.setAttribute('height', String(side));
        handle.box.style.strokeWidth = String(unit);
        setCursor(handle.box, cursorFor(point, middle));
      }

      const reach = SIZE.rotate * unit;
      for (const [id, zone] of zones) {
        const point = at.get(id);
        if (point === undefined) continue;

        zone.setAttribute('x', String(-reach / 2));
        zone.setAttribute('y', String(-reach / 2));
        zone.setAttribute('width', String(reach));
        zone.setAttribute('height', String(reach));
        zone.setAttribute(
          'transform',
          `translate(${String(point.x)} ${String(point.y)}) rotate(${String(angle)})`,
        );
        setCursor(zone, turnCursorFor(point, middle));
      }
    },

    get dragging() {
      return session !== null;
    },

    release: finish,

    destroy() {
      // Whatever the drag has written stays written. The mode going away under
      // a moving pointer is not the person changing their mind, and silently
      // putting the node back would undo an edit they watched themselves make.
      finish();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.remove();
    },
  };
}
