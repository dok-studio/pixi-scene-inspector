import { describe, expect, it } from 'vitest';

import type { Node, PixiAdapter } from '../adapters/types.js';
import { onStage } from './onStage.js';

/**
 * A scene as a parent map, which is all this asks about. `null` for a node the
 * map has no entry for — the stage itself, and anything taken out of it.
 */
function fakeAdapter(stage: Node | null, parents: Map<Node, Node>) {
  return {
    stage: () => stage,
    parentOf: (node: Node) => parents.get(node) ?? null,
  } as unknown as PixiAdapter;
}

describe('onStage', () => {
  const stage = {};
  const world = {};
  const hero = {};

  it('follows the chain up to the stage', () => {
    const adapter = fakeAdapter(stage, new Map([[hero, world], [world, stage]]));

    expect(onStage(adapter, hero)).toBe(true);
  });

  it('counts the stage itself', () => {
    expect(onStage(fakeAdapter(stage, new Map()), stage)).toBe(true);
  });

  it('says no for a node the game has taken out', () => {
    const adapter = fakeAdapter(stage, new Map([[world, stage]]));

    expect(onStage(adapter, hero)).toBe(false);
  });

  /**
   * The case a `parentOf(node) === null` test would miss: the node still hangs
   * off the parent it always had, and that parent is what left the scene.
   */
  it('says no for a node whose ancestor was taken out', () => {
    const adapter = fakeAdapter(stage, new Map([[hero, world]]));

    expect(onStage(adapter, hero)).toBe(false);
  });

  /** An application that has been destroyed has no scene to be part of. */
  it('says no when there is no stage at all', () => {
    expect(onStage(fakeAdapter(null, new Map([[hero, world]])), hero)).toBe(false);
  });
});
