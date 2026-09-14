import type { SceneNode } from '@scene-inspector/protocol';
import { NODE_VISIBLE } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { pathOf, resolveAll, resolvePath, samePath } from './path.js';

/**
 * The point of a path is that it is the same string of decisions on two loads
 * of the same game, where every id is different. So the fixture is built twice,
 * from a different base, and the two share no id at all.
 *
 *   stage
 *     world
 *       hero, coin, coin
 *     hud
 *       (unnamed Text)
 */
function scene(from: number): SceneNode[] {
  const node = (offset: number, parent: number | null, name: string, type: string): SceneNode => ({
    id: from + offset,
    parent: parent === null ? 0 : from + parent,
    name,
    type,
    flags: NODE_VISIBLE,
  });

  return [
    node(0, null, 'stage', 'Container'),
    node(1, 0, 'world', 'Container'),
    node(2, 1, 'hero', 'Sprite'),
    node(3, 1, 'coin', 'Sprite'),
    node(4, 1, 'coin', 'Sprite'),
    node(5, 0, 'hud', 'Container'),
    node(6, 5, '', 'Text'),
  ];
}

const FIRST = scene(1);

/** The same scene after a reload: the same names, none of the same ids. */
const AGAIN = scene(500);

const idOf = (nodes: readonly SceneNode[], name: string, nth = 0): number => {
  const node = nodes.filter((candidate) => candidate.name === name)[nth];
  if (node === undefined) throw new Error(`no node called ${name}`);
  return node.id;
};

const pathTo = (nodes: readonly SceneNode[], name: string, nth = 0) =>
  pathOf(nodes, idOf(nodes, name, nth)) ?? [];

describe('pathOf', () => {
  it('walks from the root down to the node', () => {
    expect(pathOf(FIRST, idOf(FIRST, 'hero'))).toEqual([
      { name: 'stage', type: 'Container', index: 0, siblings: 1 },
      { name: 'world', type: 'Container', index: 0, siblings: 2 },
      { name: 'hero', type: 'Sprite', index: 0, siblings: 3 },
    ]);
  });

  it('gives the root a path of one step', () => {
    expect(pathOf(FIRST, idOf(FIRST, 'stage'))).toEqual([
      { name: 'stage', type: 'Container', index: 0, siblings: 1 },
    ]);
  });

  it('counts a node among all of its siblings, not only the ones like it', () => {
    const path = pathTo(FIRST, 'coin', 1);
    expect(path[path.length - 1]).toEqual({
      name: 'coin',
      type: 'Sprite',
      index: 2,
      siblings: 3,
    });
  });

  it('has no path for a node the payload does not hold', () => {
    expect(pathOf(FIRST, 9999)).toBeNull();
  });
});

describe('resolvePath', () => {
  it('finds the same node after a reload has reissued every id', () => {
    expect(resolvePath(AGAIN, pathTo(FIRST, 'hero'))).toBe(idOf(AGAIN, 'hero'));
  });

  it('tells two children with the same name apart by where they sit', () => {
    expect(resolvePath(AGAIN, pathTo(FIRST, 'coin', 1))).toBe(idOf(AGAIN, 'coin', 1));
  });

  it('follows a node that a new sibling has pushed along', () => {
    const world = idOf(AGAIN, 'world');
    const shifted: SceneNode[] = [
      ...AGAIN.slice(0, 2),
      { id: 900, parent: world, name: 'shield', type: 'Sprite', flags: NODE_VISIBLE },
      ...AGAIN.slice(2),
    ];

    expect(resolvePath(shifted, pathTo(FIRST, 'hero'))).toBe(idOf(AGAIN, 'hero'));
  });

  it('follows a node the game renamed between two loads', () => {
    const renamed = AGAIN.map((node) => (node.name === 'hero' ? { ...node, name: 'player' } : node));

    expect(resolvePath(renamed, pathTo(FIRST, 'hero'))).toBe(idOf(AGAIN, 'hero'));
  });

  it('finds an unnamed node by its type and its place', () => {
    expect(resolvePath(AGAIN, pathTo(FIRST, ''))).toBe(idOf(AGAIN, ''));
  });

  /**
   * The fence on the rename rule, and the reason a step carries a sibling
   * count at all. A deleted node whose neighbour happens to be of the same type
   * must come back as "not found", never as the neighbour: a star pointing
   * confidently at the wrong object is worse than a row that says it is lost.
   */
  it('refuses to answer with a neighbour when the node itself is gone', () => {
    const without = AGAIN.filter((node) => node.name !== 'hero');

    expect(resolvePath(without, pathTo(FIRST, 'hero'))).toBeNull();
  });

  it('has no answer for a scene that never had the node', () => {
    expect(resolvePath([], pathTo(FIRST, 'hero'))).toBeNull();
  });

  it('names nothing for an empty path', () => {
    expect(resolvePath(FIRST, [])).toBeNull();
  });
});

describe('samePath', () => {
  it('is true for the same walk and false for a different node', () => {
    const path = pathTo(FIRST, 'hero');

    expect(samePath(path, pathTo(AGAIN, 'hero'))).toBe(true);
    expect(samePath(path, path.slice(1))).toBe(false);
    expect(samePath(path, pathTo(FIRST, 'coin'))).toBe(false);
  });

  /** The count is a fence, not part of who the node is — see the function. */
  it('ignores a changed sibling count', () => {
    const path = pathTo(FIRST, 'hero');
    const wider = path.map((step) => ({ ...step, siblings: step.siblings + 4 }));

    expect(samePath(path, wider)).toBe(true);
  });
});

describe('resolveAll', () => {
  it('reports the live path so a stale one can be written back', () => {
    const renamed = AGAIN.map((node) => (node.name === 'hero' ? { ...node, name: 'player' } : node));

    const [found] = resolveAll(renamed, [pathTo(FIRST, 'hero')]);

    expect(found?.id).toBe(idOf(AGAIN, 'hero'));
    expect(found?.livePath?.[2]).toEqual({
      name: 'player',
      type: 'Sprite',
      index: 0,
      siblings: 3,
    });
  });

  it('has nothing to say about a path that matches nothing', () => {
    expect(resolveAll(FIRST, [[{ name: 'ghost', type: 'Sprite', index: 0, siblings: 1 }]])).toEqual([
      { id: null, livePath: null },
    ]);
  });
});
