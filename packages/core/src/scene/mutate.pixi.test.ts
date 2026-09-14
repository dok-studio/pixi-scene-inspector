// @vitest-environment happy-dom
import '../adapters/canvasStub.js';

import * as v6 from 'pixi-v6';
import * as v7 from 'pixi-v7';
import * as v8 from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { createAdapter } from '../adapters/index.js';
import type { PixiAdapter } from '../adapters/types.js';
import { applyMutation, createLocks } from './mutate.js';
import { createRegistry } from './registry.js';

/**
 * Reordering a **real** scene graph, on all three lines.
 *
 * `mutate.test.ts` builds the graph out of plain objects, and its fake
 * `addChildAt` splices wherever it is told. PixiJS does not: every line bounds-
 * checks the index and throws past the end of the list. That difference is not
 * a detail — it is the whole failure. A move is remove-then-insert, so the node
 * is already detached by the time the insert is refused, and there is nothing
 * left holding it: the subtree vanishes from the scene until the page reloads.
 *
 * Which made this the one mutation worth running against the library itself.
 * The index the panel sends counts slots with the dragged node still in place,
 * so dragging the first of two siblings below the second asks for a slot that
 * only existed before the removal.
 *
 * A renderer needs WebGL and cannot be stood up here, so the adapter is given a
 * stub one — nothing on this path touches it. Reparenting is the scene's own
 * bookkeeping, which is exactly what these lines do differently.
 */

interface Line {
  name: string;
  adapter: PixiAdapter;
  stage: { children: unknown[] };
  world: object;
  hud: object;
  hero: object;
}

function adapterFor(version: string, stage: object): PixiAdapter {
  const adapter = createAdapter({ stage, renderer: {}, pixi: { VERSION: version } });
  if (adapter === null) throw new Error(`no adapter for PixiJS ${version}`);
  return adapter;
}

/** stage → [world → [hero], hud]; the same shape as the unit test's fakes. */
function v8Line(): Line {
  const stage = new v8.Container();
  const world = new v8.Container();
  const hud = new v8.Container();
  const hero = new v8.Container();

  world.label = 'world';
  hud.label = 'hud';
  hero.label = 'hero';

  world.addChild(hero);
  stage.addChild(world, hud);

  return { name: 'v8', adapter: adapterFor(v8.VERSION, stage), stage, world, hud, hero };
}

/** v6 and v7 share this API exactly; see the note in `tree.pixi.test.ts`. */
function legacyLine(name: 'v6' | 'v7', P: typeof v7): Line {
  const stage = new P.Container();
  const world = new P.Container();
  const hud = new P.Container();
  const hero = new P.Container();

  world.name = 'world';
  hud.name = 'hud';
  hero.name = 'hero';

  world.addChild(hero);
  stage.addChild(world, hud);

  return { name, adapter: adapterFor(P.VERSION, stage), stage, world, hud, hero };
}

const LINES: Array<() => Line> = [
  () => legacyLine('v6', v6 as unknown as typeof v7),
  () => legacyLine('v7', v7),
  v8Line,
];

describe.each(LINES.map((build) => [build().name, build] as const))(
  'moving a node in a real scene — %s',
  (_name, build) => {
    /** A registry per test: ids are minted on first sight, and stay stable after. */
    const world = () => {
      const registry = createRegistry();
      const locks = createLocks();
      const id = (node: object): number => registry.idOf(node);

      return { registry, locks, id };
    };

    it('moves a node down past its sibling', () => {
      const line = build();
      const { registry, locks, id } = world();

      expect(
        applyMutation(line.adapter, registry, locks, {
          kind: 'move',
          id: id(line.world),
          parent: id(line.stage as object),
          index: 2,
        }),
      ).toBe(true);

      expect(line.stage.children).toEqual([line.hud, line.world]);
    });

    it('moves a node up past its sibling', () => {
      const line = build();
      const { registry, locks, id } = world();

      expect(
        applyMutation(line.adapter, registry, locks, {
          kind: 'move',
          id: id(line.hud),
          parent: id(line.stage as object),
          index: 0,
        }),
      ).toBe(true);

      expect(line.stage.children).toEqual([line.hud, line.world]);
    });

    it('moves a node into another parent', () => {
      const line = build();
      const { registry, locks, id } = world();

      expect(
        applyMutation(line.adapter, registry, locks, {
          kind: 'move',
          id: id(line.hero),
          parent: id(line.hud),
          index: 0,
        }),
      ).toBe(true);

      expect(line.adapter.children(line.hud)).toEqual([line.hero]);
      expect(line.adapter.children(line.world)).toEqual([]);
    });

    /** The scene may have lost children since the drag began. */
    it('survives an index past the end of the list', () => {
      const line = build();
      const { registry, locks, id } = world();

      expect(
        applyMutation(line.adapter, registry, locks, {
          kind: 'move',
          id: id(line.hero),
          parent: id(line.hud),
          index: 99,
        }),
      ).toBe(true);

      expect(line.adapter.children(line.hud)).toEqual([line.hero]);
    });

    it('deletes a node out of its parent', () => {
      const line = build();
      const { registry, locks, id } = world();

      expect(
        applyMutation(line.adapter, registry, locks, {
          kind: 'delete',
          id: id(line.hero),
        }),
      ).toBe(true);

      expect(line.adapter.children(line.world)).toEqual([]);
    });
  },
);
