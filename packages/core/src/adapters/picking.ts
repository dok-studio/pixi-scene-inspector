import { MAX_PICK_DEPTH } from '@scene-inspector/protocol';

import { parentOf } from './common.js';
import type { Node } from './types.js';

/**
 * Hit testing for the picker, and the part of it that is easy to get wrong.
 *
 * PixiJS only hit-tests nodes that opted into interactivity, and an application
 * marks almost nothing as interactive — so a naive picker finds nothing. The
 * fix, carried over from the previous project because it is the only thing that
 * works: switch the whole tree on, ask, switch it back.
 *
 * Asked more than once, in fact: the page answers with one node, and the
 * picker wants everything under the point, so `pickStack` switches off what
 * came back and asks again.
 *
 * "Back" has to be exact. The page's own input handling runs on these same
 * fields, and a picker that leaves a node interactive turns a decorative sprite
 * into a click target for the rest of the session.
 */

interface Interactive {
  eventMode?: string;
  interactive?: boolean;
  /**
   * A container that opted its whole subtree out of hit testing, which games
   * set on static or crowded layers for the cost of it. The boundary stops
   * descending there, so switching the nodes below it on reaches nothing: the
   * picker answered with the layer, or with nothing at all, for a sprite that
   * highlights perfectly well from the tree.
   */
  interactiveChildren?: boolean;
}

/**
 * Which field this node is steered by. v7 introduced `eventMode` and demoted
 * `interactive` to a setter over it; v6 has only `interactive`. The choice is
 * made per node rather than per version because early v7 builds predate
 * `eventMode` too.
 */
function fieldOf(node: Interactive): 'eventMode' | 'interactive' {
  return node.eventMode === undefined ? 'interactive' : 'eventMode';
}

type Saved = Array<[node: Interactive, field: 'eventMode' | 'interactive', value: unknown]>;

/** The subtree opt-outs that were lifted, and what they held. */
type SavedSubtrees = Array<[node: Interactive, value: boolean | undefined]>;

function enableTree(
  root: Node,
  children: (node: Node) => Node[],
  saved: Saved,
  subtrees: SavedSubtrees,
): void {
  const node = root as Interactive;
  const field = fieldOf(node);

  saved.push([node, field, node[field]]);
  if (field === 'eventMode') node.eventMode = 'static';
  else node.interactive = true;

  if (node.interactiveChildren === false) {
    subtrees.push([node, node.interactiveChildren]);
    node.interactiveChildren = true;
  }

  for (const child of children(root)) {
    enableTree(child, children, saved, subtrees);
  }
}

/**
 * The panel's number, put inside what the page is willing to run.
 *
 * A budget on **questions**, not on answers: what is skipped below costs a hit
 * test each, and a screen sitting under a stack of hidden layers is exactly the
 * case the skipping is for. Counting kept nodes instead meant the dig stopped
 * before it reached anything that was actually on screen — which is why this is
 * a setting at all (`DEFAULT_PICK_DEPTH`).
 *
 * Clamped rather than trusted: every ask walks the scene, synchronously, inside
 * the page's own click handler, and the number arrives across the bridge.
 *
 * There has to be a ceiling of some kind besides. The loop is driven by the
 * page's own hit test, and a node that refuses to be switched off — a `hitArea`
 * on something the adapter cannot reach, a getter for `eventMode` — would hand
 * back the same answer forever. The repeat check below catches that case
 * exactly; this is the blunt stop for the case nobody has thought of yet.
 */
function asks(depth: number): number {
  if (!Number.isFinite(depth)) return MAX_PICK_DEPTH;
  return Math.min(MAX_PICK_DEPTH, Math.max(1, Math.round(depth)));
}

/** Takes a node out of the hit test, in whichever field steers it. */
function disable(node: Interactive): void {
  if (fieldOf(node) === 'eventMode') node.eventMode = 'none';
  else node.interactive = false;
}

/** The three fields that decide whether a node is drawn, on every version. */
interface Drawn {
  visible?: unknown;
  renderable?: unknown;
  alpha?: unknown;
}

/**
 * Whether this node is on screen at all — itself and every ancestor.
 *
 * A hit test answers about geometry, not about what can be seen: a hidden
 * popup, a layer left at `alpha = 0`, a node switched off with `renderable`
 * still occupy their pixels and still come back from it. On a screen built
 * over three of those, the picker spent its whole dig on nodes nobody could
 * point at, and the list read as a set of names with nothing under them.
 *
 * The ancestors count for the same reason they count when the frame is drawn:
 * a node inside a container at `alpha = 0` is not on screen, whatever it says
 * about itself. `renderable = false` stops a whole subtree being drawn, the
 * same as `visible` does.
 *
 * The three fields are spelled the same on v6, v7 and v8, so there is nothing
 * version-specific here beyond living in this folder.
 */
function isDrawn(node: Node): boolean {
  let current: Node | null = node;

  while (current !== null) {
    const step = current as Drawn;
    if (step.visible === false || step.renderable === false || step.alpha === 0) return false;

    current = parentOf(current);
  }

  return true;
}

/**
 * Every node under the point that is drawn there, topmost first, with the whole
 * tree temporarily interactive.
 *
 * The page's own hit test answers with one node, so the stack is taken one
 * answer at a time: ask, switch off what came back, ask again. That is the
 * whole trick, and it is worth the repeated calls because the answers are the
 * game's own — `hitArea`, masks, draw order and every version's quirks
 * included, rather than a second geometry pass this project would have to keep
 * true to three lines of PixiJS.
 *
 * What is not on screen is switched off and **dug past** rather than reported:
 * see `isDrawn`. That also decides what the picker selects, since the panel
 * takes the first of these — a click now lands on the topmost node someone can
 * actually see, rather than on a hidden layer over it.
 *
 * Switching a node off costs nothing to undo: `enableTree` has already written
 * down what every node held, so the restore below puts back the original value
 * rather than the `none` this loop left.
 *
 * **Nothing here throws, and the page is put back whatever happens.** All of it
 * runs inside a click handler on the overlay's own div, over an application
 * that has no idea any of this is going on: v7's boundary throws outright until
 * the game has rendered once, a game's `containsPoint` meets a tree half
 * switched off, a node keeps a setter over `eventMode` that objects. An
 * exception out of here would surface in the game's console as the game's own,
 * and would be a far worse outcome than a short list — which is what comes back
 * instead, holding whatever had been found by then.
 */
export function pickStack(
  stage: Node | null,
  children: (node: Node) => Node[],
  probe: () => Node | null,
  /** How many times this click may ask — see `asks`. */
  depth: number,
): Node[] {
  if (stage === null) return [];

  const saved: Saved = [];
  const subtrees: SavedSubtrees = [];
  const stack: Node[] = [];
  const asked = new Set<Node>();

  try {
    // Inside the `try` as well: a walk that throws half way through still has
    // to have the half it changed put back.
    enableTree(stage, children, saved, subtrees);

    const budget = asks(depth);

    for (let ask = 0; ask < budget; ask++) {
      const hit = probe();
      // Nothing left under the point, which on the first pass is a click on
      // empty canvas.
      if (hit === null) break;
      // A node that came back after being switched off cannot be switched off,
      // and asking again would return it again for as long as the loop runs.
      if (asked.has(hit)) break;

      asked.add(hit);
      if (isDrawn(hit)) stack.push(hit);
      disable(hit as Interactive);
    }
  } catch {
    // Whatever was found before it went wrong is still a list, and still the
    // truth about the top of the stack — see above.
  } finally {
    for (const [node, field, value] of saved) {
      // One node at a time, each survivable: the whole tree is switched on at
      // this moment, and a single node with an opinion about being written to
      // must not be the reason the rest of a game's input handling stays
      // rewired for the rest of the session.
      try {
        if (field === 'eventMode') node.eventMode = value as string;
        else node.interactive = value as boolean;
      } catch {
        // Nothing to do about this one; the next node still gets its turn.
      }
    }

    for (const [node, value] of subtrees) {
      try {
        node.interactiveChildren = value;
      } catch {
        // As above.
      }
    }
  }

  return stack;
}

interface PointTarget {
  x: number;
  y: number;
}

/**
 * The v7/v8 event system: client coordinates are mapped to renderer space, then
 * the boundary is asked directly.
 *
 * `root` is the tree to test against, and passing it is not belt-and-braces on
 * v7. There the boundary is given its root inside the handler for each **native
 * pointer event on the canvas** rather than at startup — and while the picker is
 * armed the overlay sits over that canvas swallowing exactly those events, on a
 * page whose game window the person may never have moused over at all, because
 * the panel they are working in is a different window. The boundary then has no
 * root, and `hitTest` does not answer null: it throws. So the picker on v7 was
 * dead until something else happened to touch the canvas first.
 *
 * Lent rather than given: v7 writes this field itself on the next pointer event,
 * and what the picker borrows for one question it puts back.
 */
export function probeEvents(
  events: unknown,
  clientX: number,
  clientY: number,
  root: Node | null,
): Node | null {
  const system = events as {
    mapPositionToPoint?: (point: PointTarget, x: number, y: number) => void;
    rootBoundary?: { hitTest?: (x: number, y: number) => Node | null; rootTarget?: Node | null };
  };
  // The guard has to survive being handed nothing, rather than throwing while
  // it checks: a v6 application assembled from @pixi/* without @pixi/interaction
  // has no plugin here at all, and the answer to that is plainly null.
  if (typeof system !== 'object' || system === null) return null;

  const map = system.mapPositionToPoint;
  const boundary = system.rootBoundary;
  if (map === undefined || boundary === undefined) return null;

  const hitTest = boundary.hitTest;
  if (hitTest === undefined) return null;

  // Both are called **through their owner**: these are the page's own methods,
  // and they read `this` — the event system for the canvas and the resolution,
  // the boundary for the root. Calling a detached one throws inside the click
  // handler, and the catch upstairs turns that into "nothing was found".
  const point: PointTarget = { x: clientX, y: clientY };
  map.call(system, point, clientX, clientY);

  const borrowed = boundary.rootTarget === undefined || boundary.rootTarget === null;
  if (borrowed) {
    if (root === null) return null;
    boundary.rootTarget = root;
  }

  try {
    return hitTest.call(boundary, point.x, point.y) ?? null;
  } finally {
    if (borrowed) boundary.rootTarget = null;
  }
}

/**
 * The v6 interaction plugin: same idea, but the hit test takes the point object
 * rather than a pair of numbers — and takes the root as a second argument, which
 * is the same borrowing the v7 branch above has to do by hand. Left to itself
 * the plugin falls back to whatever the renderer last drew, which on a page that
 * has not drawn since load is nothing at all.
 */
export function probeInteraction(
  interaction: unknown,
  clientX: number,
  clientY: number,
  root: Node | null,
): Node | null {
  const plugin = interaction as {
    mapPositionToPoint?: (point: PointTarget, x: number, y: number) => void;
    hitTest?: (point: PointTarget, root?: Node | null) => Node | null;
  };
  if (typeof plugin !== 'object' || plugin === null) return null;
  if (plugin.mapPositionToPoint === undefined || plugin.hitTest === undefined) return null;

  const point: PointTarget = { x: clientX, y: clientY };
  plugin.mapPositionToPoint(point, clientX, clientY);

  return plugin.hitTest(point, root) ?? null;
}
