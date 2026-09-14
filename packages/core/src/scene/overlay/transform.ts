import type { Rect } from '@scene-inspector/protocol';

import type { Matrix, Point } from '../nodeSpace.js';
import { apply, applyVector, invert, multiply } from '../nodeSpace.js';

/**
 * The arithmetic of the free transform — what a drag on the frame does to the
 * node it is drawn on. The DOM that draws that frame and takes the pointer is
 * next door in `freeTransform.ts`, for the same reason `geometry.ts` is not
 * inside `overlay.ts`.
 *
 * **The rule this module exists to keep: what you grabbed stays under the
 * pointer, and what is opposite it does not move.** That is what a free
 * transform means to anyone who has used one, and it is not what PixiJS does on
 * its own — a node scales and turns about its own zero, wherever that happens
 * to be, so scaling a sprite anchored at its top left throws its bottom right
 * across the screen.
 *
 * Which is why every solver here returns a **position as well**: the scale or
 * the angle is only half the answer, and the other half is the move that puts
 * the anchor back where it was. A caller that writes one without the other has
 * written a bug.
 *
 * Everything is worked out in the node's **parent** space, because that is the
 * space `position` and `rotation` are written in. A turned or mirrored ancestor
 * then costs nothing: the pointer is mapped into that space once, and the
 * angles and deltas come out already in the units the node is written in.
 */

/** The eight points a frame can be seized by, named the way a compass is. */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLE_IDS: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Where each handle sits on the node's local bounds, in fractions of it. */
const HANDLE_AT: Record<HandleId, Point> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
};

/** Whether this handle is a corner — only the corners also turn the node. */
export function isCorner(handle: HandleId): boolean {
  const at = HANDLE_AT[handle];
  return at.x !== 0.5 && at.y !== 0.5;
}

/** A point on the node's local bounds, by the fractions above. */
export function handlePoint(bounds: Rect, handle: HandleId): Point {
  const at = HANDLE_AT[handle];
  return { x: bounds.x + bounds.width * at.x, y: bounds.y + bounds.height * at.y };
}

export function centreOf(bounds: Rect): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** The point held still while a handle is dragged: the one across the frame. */
function anchorPoint(bounds: Rect, handle: HandleId, fromCentre: boolean): Point {
  if (fromCentre) return centreOf(bounds);

  const at = HANDLE_AT[handle];
  return { x: bounds.x + bounds.width * (1 - at.x), y: bounds.y + bounds.height * (1 - at.y) };
}

/**
 * The state a drag started from, read **once** at `pointerdown`.
 *
 * Once rather than per move, because every answer below is a function of the
 * pointer and this snapshot alone. Reading the node again each frame would make
 * every step depend on the last one's rounding, and a handle dragged out and
 * back would not come home to the number it left.
 */
export interface DragStart {
  /** What the node covers in its own coordinates. */
  bounds: Rect;
  /** The node's own transform into canvas coordinates. */
  world: Matrix;
  /** The parent's, or the identity for a node with no parent. */
  parent: Matrix;
  position: Point;
  scale: Point;
  rotation: number;
  pivot: Point;
  /** Where the pointer was, in canvas coordinates. */
  pointer: Point;
}

/** What the keyboard was holding while the pointer moved. */
export interface Modifiers {
  /**
   * Let the two axes go their own way; on a turn, land on a whole step of
   * `SNAP`.
   *
   * **A corner keeps the proportions unless this is held** — the opposite of
   * the way an image editor's Shift used to work, and the way the same editors
   * now behave by default. A node's proportions are almost always the thing
   * someone wants kept, and asking for the keystroke to keep them meant every
   * unmodified drag squashed the sprite it was resizing.
   */
  shift: boolean;
  /** Anchor the middle of the frame rather than the far side of it. */
  alt: boolean;
}

/** What to write onto the node. `position` is in all of them — see above. */
export interface Change {
  position: Point;
  scale?: Point;
  rotation?: number;
}

/** Fifteen degrees: the step a held Shift lands a turn on. */
const SNAP = Math.PI / 12;

/**
 * Below this a handle and its anchor are the same point and the ratio between
 * them is not a number. That is every edge handle, on the axis it does not move.
 */
const EPSILON = 1e-6;

/** Local coordinates into the parent's — the space `position` is written in. */
function toParent(start: DragStart): Matrix | null {
  const back = invert(start.parent);
  return back === null ? null : multiply(back, start.world);
}

function sign(value: number): number {
  return value < 0 ? -1 : 1;
}

/**
 * Dragging the inside of the frame.
 *
 * The delta is taken in the parent's space rather than the canvas's, so a node
 * inside a container turned 30° follows the pointer instead of setting off at
 * an angle to it.
 */
export function movedTo(start: DragStart, pointer: Point): Change | null {
  const back = invert(start.parent);
  if (back === null) return null;

  const delta = applyVector(back, {
    x: pointer.x - start.pointer.x,
    y: pointer.y - start.pointer.y,
  });

  return { position: { x: start.position.x + delta.x, y: start.position.y + delta.y } };
}

/**
 * Dragging a handle.
 *
 * The factor on each axis is a ratio of distances **from the anchor**, measured
 * in the node's own coordinates: where the pointer is now over where the handle
 * was, both taken from the point that is staying put. Dragging a handle past
 * its anchor makes the ratio negative, which mirrors the node — the same as it
 * does in an image editor, and nothing here has to special-case it.
 *
 * A corner keeps the node's proportions and so cannot always sit under the
 * pointer; Shift lets it, and then it does. A side handle moves its one axis
 * either way.
 *
 * @returns null for a node with no space to measure in: an axis scaled to zero
 * has no local coordinates to map the pointer back into.
 */
export function scaledTo(
  start: DragStart,
  handle: HandleId,
  pointer: Point,
  modifiers: Modifiers,
): Change | null {
  const inverse = invert(start.world);
  const local = toParent(start);
  if (inverse === null || local === null) return null;

  const grabbed = handlePoint(start.bounds, handle);
  const anchor = anchorPoint(start.bounds, handle, modifiers.alt);
  const at = apply(inverse, pointer);

  const spanX = grabbed.x - anchor.x;
  const spanY = grabbed.y - anchor.y;

  // A factor on the scale rather than the scale itself, so that the two axes
  // can be compared below however far apart their scales are.
  let factorX = Math.abs(spanX) < EPSILON ? 1 : (at.x - anchor.x) / spanX;
  let factorY = Math.abs(spanY) < EPSILON ? 1 : (at.y - anchor.y) / spanY;

  if (!Number.isFinite(factorX) || !Number.isFinite(factorY)) return null;

  // Proportional, which is what a corner does unless Shift says otherwise: the
  // axis that moved further decides, and each keeps whichever side of the
  // anchor the pointer put it on.
  //
  // An edge handle is never touched by this. One of its spans is zero, so there
  // is no second factor to agree with — and carrying the moving axis over to
  // the frozen one would make the four side handles four more corners, which is
  // the one thing they are there not to be.
  if (!modifiers.shift && Math.abs(spanX) >= EPSILON && Math.abs(spanY) >= EPSILON) {
    const magnitude = Math.max(Math.abs(factorX), Math.abs(factorY));
    factorX = sign(factorX) * magnitude;
    factorY = sign(factorY) * magnitude;
  }

  // Where the anchor is in the parent right now, which is where it has to stay.
  // `local` carries the node's position, so this is a single mapping.
  const held = apply(local, anchor);

  // The same mapping with the new scale folded in. Only its linear part is
  // used below, which is the whole reason it can be composed rather than
  // rebuilt: a local transform also carries the node's skew, and building a
  // fresh one out of `rotation` and `scale` would quietly drop it.
  const scaled = multiply(local, { a: factorX, b: 0, c: 0, d: factorY, tx: 0, ty: 0 });
  const moved = applyVector(scaled, {
    x: anchor.x - start.pivot.x,
    y: anchor.y - start.pivot.y,
  });

  return {
    scale: { x: start.scale.x * factorX, y: start.scale.y * factorY },
    position: { x: held.x - moved.x, y: held.y - moved.y },
  };
}

/**
 * Dragging the outside of a corner — the turn.
 *
 * Around the middle of the frame, which is where an image editor turns things
 * and hardly ever where the node's own zero is. The angle is the one the
 * pointer swept in the parent's space, so a mirrored ancestor turns the node
 * the way the pointer went rather than the opposite way.
 */
export function rotatedTo(start: DragStart, pointer: Point, modifiers: Modifiers): Change | null {
  const back = invert(start.parent);
  const local = toParent(start);
  if (back === null || local === null) return null;

  const centre = apply(local, centreOf(start.bounds));
  const from = apply(back, start.pointer);
  const to = apply(back, pointer);

  const swept =
    Math.atan2(to.y - centre.y, to.x - centre.x) -
    Math.atan2(from.y - centre.y, from.x - centre.x);

  // Snapped on the angle the node ends at, not on the angle swept: a frame
  // Shift-dragged from 7° should land on 0°, not stay 7° out at every step.
  const turned = modifiers.shift
    ? Math.round((start.rotation + swept) / SNAP) * SNAP
    : start.rotation + swept;
  const delta = turned - start.rotation;

  // The arm from the node's zero to the middle of the frame. The middle is what
  // stays still, so the zero is what has to travel around it.
  const arm = { x: centre.x - start.position.x, y: centre.y - start.position.y };
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);

  return {
    rotation: turned,
    position: {
      x: centre.x - (arm.x * cos - arm.y * sin),
      y: centre.y - (arm.x * sin + arm.y * cos),
    },
  };
}

/**
 * The turn cursor, drawn here because there is none to name.
 *
 * CSS offers no rotate cursor, and the `grab` hand that stood in for one says
 * "this can be dragged" — which is what every other part of the frame does too,
 * so the one gesture that is *not* a drag was the one advertising itself as one.
 *
 * So: a curved arrow, headed at both ends, white on a dark outline for the same
 * reason the axis gizmo is drawn that way — it lands on whatever the game is
 * drawing and has to survive it.
 *
 * A data URI rather than a file, because this element lives in the inspected
 * page and has nothing of ours to fetch from. A page with a strict `img-src`
 * can refuse it, which is what the fallback after the comma is for.
 *
 * **It is built to the weight of the cursors it stands among**, which is the
 * hard part of drawing one. The pointer either side of it is a white body
 * behind a hairline of black, a dozen or so pixels across; a glyph twice that
 * and three times as thick does not read as a cursor at all but as something
 * the page has drawn, and the eye stops treating it as the pointer. So: an arc
 * twelve pixels across, a body a pixel and a half wide, and one pixel of black
 * around it — the same recipe the system's own arrow is drawn to.
 */
const CURSOR = { size: 24, hotspot: 12 };

function turnCursorImage(degrees: number): string {
  /*
   * An arc over the middle of the box with a head falling away from each end.
   *
   * **Short of a half circle**, at 140°, and that is the whole shape of it. A
   * half circle stands vertically at both ends, so both heads come off it
   * pointing straight down — two parallel arrows, which is a cursor for moving
   * something, not for turning it. Stopping the arc twenty degrees early on
   * each side tilts the ends outwards, the heads follow the curve they are on,
   * and the pair reads as one thing swinging round rather than two going the
   * same way.
   */
  const arc = 'M6.36 9.95A6 6 0 0 1 17.64 9.95';
  const heads = 'M3.84 8.39 4.86 14.08 9.29 10.38ZM14.71 10.38 19.14 14.08 20.16 8.39Z';
  const turn = `rotate(${String(degrees)} ${String(CURSOR.hotspot)} ${String(CURSOR.hotspot)})`;
  const box = String(CURSOR.size);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}">`,
    `<g transform="${turn}" stroke-linecap="round" stroke-linejoin="round">`,
    // The dark outline first, as one stroke under the whole glyph: a pixel of
    // it shows either side of the white, and no more.
    `<g fill="none" stroke="#000" stroke-opacity=".8" stroke-width="3">`,
    `<path d="${arc}"/><path d="${heads}"/></g>`,
    `<path d="${arc}" fill="none" stroke="#fff" stroke-width="1.5"/>`,
    `<path d="${heads}" fill="#fff" stroke="#fff" stroke-width="0.6"/>`,
    '</g></svg>',
  ].join('');
}

/**
 * Built once per direction and kept. The glyph reads the same upside down, so
 * eight steps are really four looks — and quantising is what stops a frame
 * being turned from building a fresh image on every frame of the drag.
 */
const turnCursors = new Map<number, string>();

/**
 * Which way the turn cursor faces at this corner: its arc bulges away from the
 * middle of the frame, so the arrow curves around the thing it will turn.
 */
export function turnCursorFor(corner: Point, centre: Point): string {
  const angle = Math.atan2(corner.y - centre.y, corner.x - centre.x);
  const step = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;

  const held = turnCursors.get(step);
  if (held !== undefined) return held;

  // The glyph points up as drawn, so it is turned a quarter past the direction
  // the corner lies in.
  const image = turnCursorImage(step * 45 + 90);
  const cursor = `url("data:image/svg+xml,${encodeURIComponent(image)}") ${String(CURSOR.hotspot)} ${String(CURSOR.hotspot)}, crosshair`;

  turnCursors.set(step, cursor);
  return cursor;
}

/** The four resize cursors, by the octant an arrow out through the handle lies in. */
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

/**
 * Which cursor a handle shows, taken from where it sits on screen rather than
 * from its name: the frame turns with the node, and the handle called `nw` is
 * at the bottom on a node stood on its head.
 */
export function cursorFor(handle: Point, centre: Point): string {
  const angle = Math.atan2(handle.y - centre.y, handle.x - centre.x);
  const octant = Math.round(angle / (Math.PI / 4));

  return CURSORS[((octant % 4) + 4) % 4] ?? 'move';
}
