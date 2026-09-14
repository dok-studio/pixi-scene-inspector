import type { Json, Rect } from '@scene-inspector/protocol';

import type { Node, PixiCandidate } from './types.js';

/**
 * The parts of an adapter that turned out not to differ between versions at
 * all: walking children, measuring bounds, finding the root.
 *
 * They live here rather than being duplicated into each adapter so that the
 * version files contain only what is genuinely version-specific — which makes
 * "what actually changed between v6 and v8" readable from the source.
 */

export function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** A destroyed stage counts as no stage: nothing can be read off it safely. */
export function resolveStage(candidate: PixiCandidate): Node | null {
  const stage = candidate.stage;
  if (typeof stage !== 'object' || stage === null) return null;
  if ((stage as { destroyed?: unknown }).destroyed === true) return null;

  return stage;
}

/**
 * @returns the node's own array — **not** a copy. A tree walk touches every
 * node on every poll, and allocating a copy per node is exactly the kind of
 * cost the pull model was designed to avoid. Callers must not mutate it.
 */
export function children(node: Node): Node[] {
  const list = (node as { children?: unknown }).children;
  return Array.isArray(list) ? (list as Node[]) : [];
}

/** @returns null for the stage, and for a node that has been detached. */
export function parentOf(node: Node): Node | null {
  const parent = (node as { parent?: unknown }).parent;
  return typeof parent === 'object' && parent !== null ? parent : null;
}

/**
 * Reparenting through the node's **own methods**, never by splicing `children`.
 *
 * The array is real on every version, and editing it directly appears to work.
 * It also skips the bookkeeping Pixi keeps behind these methods — render groups
 * on v8, the transform and bounds invalidation everywhere — and the damage
 * surfaces later as a node that draws in the wrong place or not at all.
 */
export function removeChild(parent: Node, child: Node): void {
  (parent as { removeChild?: (child: Node) => void }).removeChild?.(child);
}

export function addChildAt(parent: Node, child: Node, index: number): void {
  (parent as { addChildAt?: (child: Node, index: number) => void }).addChildAt?.(child, index);
}

/**
 * Reading and writing a declared property by its path.
 *
 * This is the widest opening in the `Node` boundary, and it is deliberately
 * shaped so that it cannot be used as a general escape hatch: only paths
 * declared in the property schema ever reach it, and only JSON comes back.
 *
 * It sits behind `PixiAdapter` even though the implementation is identical on
 * all three lines, for the same reason `visible` does — every read of a node's
 * field goes through the adapter by construction. It is also where a version
 * difference in a *value* would be intercepted if one turned up: v8 reports
 * `blendMode` as a string where v6/v7 use a number, and that translation would
 * live in an override here rather than leaking into the property model.
 */

/**
 * Steps that would leave the object and climb into the prototype chain. The
 * property schema already decides which keys are legal, but a path walk that
 * can reach `Object.prototype` is worth closing where it is rather than only
 * where it currently happens to be guarded.
 */
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * @returns the object a path ends in and the name of its last step, or null when
 * the path leads nowhere.
 *
 * Exported because a fill is read and written whole rather than as a leaf value
 * (`properties/fill.ts`): a gradient lives across three fields of the style on one
 * line and inside an object on the other, and reaching either means holding the
 * style itself. Everything else goes through `getProp`/`setProp` below.
 */
export function targetOf(
  node: Node,
  path: string,
): { target: Record<string, unknown>; leaf: string } | null {
  const steps = path.split('.');
  if (steps.some((step) => FORBIDDEN.has(step))) return null;

  const leaf = steps.pop();
  if (leaf === undefined || leaf === '') return null;

  let target: unknown = node;
  for (const step of steps) {
    if (typeof target !== 'object' || target === null) return null;
    target = (target as Record<string, unknown>)[step];
  }

  if (typeof target !== 'object' || target === null) return null;
  return { target: target as Record<string, unknown>, leaf };
}

/** A point-like value: everything else about a `Point` stays out of the panel. */
function asVector(value: Record<string, unknown>): Json | undefined {
  const { x, y } = value;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined;
}

/** @returns undefined for anything that could not survive the bridge. */
export function getProp(node: Node, path: string): Json | undefined {
  const found = targetOf(node, path);
  if (found === null) return undefined;

  const value = found.target[found.leaf];

  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? value : undefined;
    case 'boolean':
    case 'string':
      return value;
    case 'object':
      return value === null ? null : asVector(value as Record<string, unknown>);
    default:
      return undefined;
  }
}

export function setProp(node: Node, path: string, value: Json): void {
  if ((node as { destroyed?: unknown }).destroyed === true) return;

  const found = targetOf(node, path);
  if (found === null) return;

  const current = found.target[found.leaf];

  // A point is written component by component. Assigning a fresh object over
  // `position` would drop the live Point the renderer holds a reference to,
  // and on v8 the observer that tells it the transform moved.
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof current === 'object' &&
    current !== null
  ) {
    for (const [component, componentValue] of Object.entries(value)) {
      if (component in current) (current as Record<string, unknown>)[component] = componentValue;
    }
    return;
  }

  found.target[found.leaf] = value;
}

/**
 * The texture a sprite draws, as the **application** names it.
 *
 * Not a PixiJS property and not version-specific: games that identify their
 * textures by a string of their own put a `textureId` on the node and a
 * `setTextureId` beside it, and the previous project wrote through exactly that
 * pair. Assigning the field alone would change the string while the sprite went
 * on drawing what it had, so the setter wins wherever there is one — and where
 * there is none, the field is still written, which is honest: the next poll
 * reports whatever the sprite actually holds.
 */
export function setTextureId(node: Node, value: string): void {
  if ((node as { destroyed?: unknown }).destroyed === true) return;

  const setter = (node as { setTextureId?: unknown }).setTextureId;
  if (typeof setter === 'function') {
    (setter as (id: string) => void).call(node, value);
    return;
  }

  (node as Record<string, unknown>)['textureId'] = value;
}

/**
 * The renderer surface. Uniform across versions, unlike the canvas itself.
 */
export function rendererSizeOf(renderer: unknown): { width: number; height: number } {
  const source = renderer as { width?: unknown; height?: unknown } | undefined;
  return { width: num(source?.width, 0), height: num(source?.height, 0) };
}

/** A canvas only if it looks like one: an iframe makes instanceof useless. */
export function asCanvas(value: unknown): HTMLCanvasElement | null {
  if (typeof value !== 'object' || value === null) return null;
  return typeof (value as { getContext?: unknown }).getContext === 'function'
    ? (value as HTMLCanvasElement)
    : null;
}

/**
 * The name a node goes by, when the application owns that name.
 *
 * Frameworks built on PixiJS commonly identify nodes through their own `id`
 * rather than through Pixi's `name` — the previous project read `id` outright
 * on v6/v7 for exactly that reason. Preferring `id` and falling back to the
 * version's own field covers both without the inspector having to know which
 * framework is in play.
 *
 * Only a non-empty string counts: an `id` that is a number is an identifier,
 * not a name, and showing it would replace a readable label with a digit.
 */
export function applicationId(node: Node): string | null {
  const id = (node as { id?: unknown }).id;
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * Whether the node draws at all.
 *
 * Defaults to visible when the field is missing: this is the tree's dimming
 * cue, and inventing "hidden" for a node that simply does not carry the flag
 * would be a lie about the scene.
 */
export function visible(node: Node): boolean {
  return (node as { visible?: unknown }).visible !== false;
}

/**
 * Whether the node carries at least one filter.
 *
 * Here rather than in a version file, and that is worth stating because it
 * looks like it should be one: v8 moved filters into an effect object, but it
 * kept a `filters` accessor over it (`container-mixins/effectsMixin`), and
 * v6/v7 hold the array on the display object itself. Both lines answer to the
 * same read, so this is `visible` all over again (§3.3: most of the interface
 * is not version-specific).
 *
 * A lone filter is accepted as well as an array — v8's setter takes either, and
 * its getter hands back what it was given.
 */
export function hasFilter(node: Node): boolean {
  const filters = (node as { filters?: unknown }).filters;
  if (Array.isArray(filters)) return filters.length > 0;

  return filters !== null && filters !== undefined;
}

/** Whether the node is masked. `mask` is spelled the same on every line. */
export function hasMask(node: Node): boolean {
  const mask = (node as { mask?: unknown }).mask;

  return mask !== null && mask !== undefined;
}

/**
 * Bounds as plain data.
 *
 * The copy is the point: v6/v7 `getBounds()` returns a shared Rectangle that is
 * reused on the next call, and v8 returns a reused `Bounds`. Passing either one
 * through would hand the caller a value that changes on its own.
 *
 * A destroyed node is not measured — asking one throws in some versions — and
 * reports a zero rectangle, which the overlay renders as "nothing to show".
 */
export function globalBounds(node: Node): Rect {
  const target = node as { destroyed?: unknown; getBounds?: unknown };
  if (target.destroyed === true || typeof target.getBounds !== 'function') {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const measured = (target.getBounds as () => Partial<Rect>)();

  return {
    x: num(measured.x, 0),
    y: num(measured.y, 0),
    width: num(measured.width, 0),
    height: num(measured.height, 0),
  };
}
