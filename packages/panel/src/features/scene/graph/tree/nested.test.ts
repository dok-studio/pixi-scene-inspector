import type { SceneNode } from '@scene-inspector/protocol';
import { NODE_LOCKED, NODE_VISIBLE } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { rowLabel, toNested } from './nested.js';

/**
 * The page sends the graph flat; react-arborist wants it nested. This is the
 * whole of that conversion, and the only part of the tree UI that can be held
 * still in a test.
 */

function node(id: number, parent: number, name: string, type = 'Container'): SceneNode {
  return { id, parent, name, type, flags: NODE_VISIBLE };
}

/**
 * stage
 *   world
 *     hero
 *   hud
 */
const NODES: SceneNode[] = [
  node(1, 0, ''),
  node(2, 1, 'world'),
  node(3, 2, 'hero', 'Sprite'),
  node(4, 1, 'hud'),
];

describe('toNested', () => {
  it('roots the tree at the stage', () => {
    const roots = toNested(NODES);

    expect(roots).toHaveLength(1);
    expect(roots[0]?.nodeId).toBe(1);
  });

  it('nests children under their parent', () => {
    const [stage] = toNested(NODES);

    expect(stage?.children?.map((child) => child.name)).toEqual(['world', 'hud']);
    expect(stage?.children?.[0]?.children?.map((child) => child.name)).toEqual(['hero']);
  });

  it('keeps the order the page sent', () => {
    const [stage] = toNested([node(1, 0, ''), node(2, 1, 'b'), node(3, 1, 'a')]);

    expect(stage?.children?.map((child) => child.name)).toEqual(['b', 'a']);
  });

  /**
   * react-arborist decides a row is a leaf by the **absence** of `children`.
   * An empty array makes every node look like a folder that opens onto nothing.
   */
  it('leaves a childless node with no children array at all', () => {
    const [stage] = toNested(NODES);
    const hero = stage?.children?.[0]?.children?.[0];

    expect(hero?.children).toBeUndefined();
  });

  it('gives arborist the string ids it needs, without losing the real one', () => {
    const [stage] = toNested(NODES);

    expect(stage?.id).toBe('1');
    expect(stage?.nodeId).toBe(1);
  });

  describe('what a row reads as', () => {
    it('shows the name with the type in brackets beside it', () => {
      const [stage] = toNested(NODES);
      const world = stage?.children?.[0];

      expect(world?.name).toBe('world');
      expect(world?.suffix).toBe('(Container)');
    });

    /** An unnamed node is its type, and repeating it in brackets says nothing. */
    it('falls back to the type alone when the application named nothing', () => {
      const [stage] = toNested([node(1, 0, ''), node(2, 1, '', 'Sprite')]);

      expect(stage?.children?.[0]?.name).toBe('Sprite');
      expect(stage?.children?.[0]?.suffix).toBe('');
    });

    /** The root always says it is the stage — "Container (Stage)". */
    it('marks the unnamed root as the Stage, keeping its type as the name', () => {
      const [stage] = toNested(NODES);

      expect(stage?.name).toBe('Container');
      expect(stage?.suffix).toBe('(Stage)');
    });

    it('marks a named root as the Stage alongside its name', () => {
      const [stage] = toNested([node(1, 0, 'main')]);

      expect(stage?.name).toBe('main');
      expect(stage?.suffix).toBe('(Stage)');
    });
  });

  it('carries the flags through, so the row buttons know their state', () => {
    const [stage] = toNested([{ ...node(1, 0, ''), flags: NODE_LOCKED }]);

    expect(stage?.visible).toBe(false);
    expect(stage?.locked).toBe(true);
  });

  describe('pins', () => {
    it('marks the rows the panel has pinned a gizmo to, and only those', () => {
      const [stage] = toNested(NODES, new Set([2]));

      expect(stage?.pinned).toBe(false);
      expect(stage?.children?.map((child) => child.pinned)).toEqual([true, false]);
    });

    it('pins nothing when the panel says nothing', () => {
      const [stage] = toNested(NODES);

      expect(stage?.pinned).toBe(false);
    });
  });

  /**
   * A pinned gizmo is captioned with the `name` half of this, so a node has to
   * read the same on the canvas as it does in the list — see `AxesPin`.
   */
  describe('rowLabel', () => {
    it('splits a named node into its name and its type', () => {
      expect(rowLabel(node(3, 2, 'hero', 'Sprite'), false)).toEqual({
        name: 'hero',
        suffix: '(Sprite)',
      });
    });

    /** So a caption is never empty: an unnamed node is named by its type. */
    it('names an unnamed node by its type, with nothing in brackets', () => {
      expect(rowLabel(node(2, 1, '', 'Sprite'), false)).toEqual({ name: 'Sprite', suffix: '' });
    });

    it('says Stage of the root, as the row does', () => {
      expect(rowLabel(node(1, 0, ''), true)).toEqual({
        name: 'Container',
        suffix: '(Stage)',
      });
    });
  });

  it('returns nothing for an empty tree', () => {
    expect(toNested([])).toEqual([]);
  });

  /**
   * The payload is depth-first, so a parent always arrives first. A node whose
   * parent is missing anyway is a bug in the page, and dropping it would leave
   * a hole in the tree instead of showing the problem.
   */
  it('keeps a node whose parent is unknown, as a root', () => {
    const roots = toNested([node(1, 0, ''), node(9, 42, 'orphan')]);

    expect(roots.map((root) => root.name)).toEqual(['Container', 'orphan']);
  });
});
