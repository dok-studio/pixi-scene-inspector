import type { SceneNode } from '@scene-inspector/protocol';
import { NODE_FILTERED, NODE_MASKED, NODE_VISIBLE } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { countTypes, subtreeOf } from './nodeCounts.js';

function nodes(types: string[]): SceneNode[] {
  return types.map((type, at) => ({ id: at, parent: at - 1, name: '', type, flags: 0 }));
}

describe('countTypes', () => {
  it('counts each type and totals the tree', () => {
    const counts = countTypes(nodes(['Container', 'Sprite', 'Sprite', 'Text']));

    expect(counts.total).toBe(4);
    expect(counts.types).toEqual([
      { type: 'Sprite', count: 2 },
      { type: 'Container', count: 1 },
      { type: 'Text', count: 1 },
    ]);
  });

  it('puts the most numerous first', () => {
    const counts = countTypes(nodes(['Text', 'Sprite', 'Sprite', 'Sprite', 'Container', 'Container']));

    expect(counts.types.map((entry) => entry.type)).toEqual(['Sprite', 'Container', 'Text']);
  });

  it('breaks a tie by name, so a row does not swap places with its neighbour', () => {
    const counts = countTypes(nodes(['Sprite', 'Graphics', 'Text']));

    expect(counts.types.map((entry) => entry.type)).toEqual(['Graphics', 'Sprite', 'Text']);
  });

  it('says nothing about an empty scene rather than inventing rows', () => {
    expect(countTypes([])).toEqual({ types: [], total: 0, filtered: 0, masked: 0 });
  });
});

describe('countTypes, the effects', () => {
  /**
   * Neither is a type, so nothing in the list above would mention them: a
   * filtered Container is a Container. They are counted on the same pass
   * because they arrive in the same payload.
   */
  it('counts the nodes carrying a filter or a mask', () => {
    const counts = countTypes([
      { id: 1, parent: 0, name: '', type: 'Container', flags: NODE_VISIBLE },
      { id: 2, parent: 1, name: '', type: 'Container', flags: NODE_VISIBLE | NODE_FILTERED },
      { id: 3, parent: 1, name: '', type: 'Sprite', flags: NODE_MASKED },
      { id: 4, parent: 1, name: '', type: 'Sprite', flags: NODE_FILTERED | NODE_MASKED },
    ]);

    expect(counts.filtered).toBe(2);
    expect(counts.masked).toBe(2);
    // And they change nothing about the counts they sit beside.
    expect(counts.total).toBe(4);
  });

  it('is nought where the scene carries neither', () => {
    const counts = countTypes(nodes(['Container', 'Sprite']));

    expect(counts).toEqual(expect.objectContaining({ filtered: 0, masked: 0 }));
  });
});

describe('subtreeOf', () => {
  /** A tree written parent-first, the way the payload guarantees it arrives. */
  const NODES: SceneNode[] = [
    { id: 1, parent: 0, name: 'stage', type: 'Container', flags: 0 },
    { id: 2, parent: 1, name: 'world', type: 'Container', flags: 0 },
    { id: 3, parent: 2, name: 'hero', type: 'Sprite', flags: 0 },
    { id: 4, parent: 2, name: 'sword', type: 'Sprite', flags: 0 },
    { id: 5, parent: 1, name: 'hud', type: 'Container', flags: 0 },
    { id: 6, parent: 5, name: 'score', type: 'Text', flags: 0 },
  ];

  it('takes the node and everything under it', () => {
    expect(subtreeOf(NODES, 2).map((node) => node.name)).toEqual(['world', 'hero', 'sword']);
  });

  it('reaches through more than one level', () => {
    expect(subtreeOf(NODES, 1)).toHaveLength(NODES.length);
  });

  it('answers a leaf with itself alone, rather than with nothing', () => {
    expect(subtreeOf(NODES, 3).map((node) => node.name)).toEqual(['hero']);
  });

  it('leaves out a sibling branch', () => {
    expect(subtreeOf(NODES, 5).map((node) => node.name)).toEqual(['hud', 'score']);
  });

  it('takes the whole scene when nothing is selected', () => {
    expect(subtreeOf(NODES, null)).toEqual(NODES);
  });

  it('answers nothing for an id the tree no longer holds', () => {
    expect(subtreeOf(NODES, 99)).toEqual([]);
  });

  /**
   * The property the whole mode rests on: the stage's subtree and the scene are
   * the same reading, so the two modes cannot disagree where they should not.
   */
  it('counts the stage exactly as it counts the scene', () => {
    expect(countTypes(subtreeOf(NODES, 1))).toEqual(countTypes(NODES));
  });
});
