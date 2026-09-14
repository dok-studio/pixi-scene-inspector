import type { SceneNode } from '@scene-inspector/protocol';
import { NODE_VISIBLE } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { offered } from './stack.js';

/**
 * stage → hud → promo
 *       → world → platforms → platform
 *               → props → orb
 *               → hero (Spine) → head (Mesh)
 */
const NODES: SceneNode[] = [
  { id: 1, parent: 0, name: '', type: 'Container', flags: NODE_VISIBLE },
  { id: 2, parent: 1, name: 'hud', type: 'Container', flags: NODE_VISIBLE },
  { id: 3, parent: 2, name: 'promo', type: 'Text', flags: NODE_VISIBLE },
  { id: 4, parent: 1, name: 'world', type: 'Container', flags: NODE_VISIBLE },
  { id: 5, parent: 4, name: 'platforms', type: 'Container', flags: NODE_VISIBLE },
  { id: 6, parent: 5, name: 'platform', type: 'Graphics', flags: NODE_VISIBLE },
  { id: 7, parent: 4, name: 'props', type: 'Container', flags: NODE_VISIBLE },
  { id: 8, parent: 7, name: 'orb', type: 'Sprite', flags: NODE_VISIBLE },
  { id: 9, parent: 4, name: 'hero', type: 'Spine', flags: NODE_VISIBLE },
  { id: 10, parent: 9, name: 'head', type: 'Mesh', flags: NODE_VISIBLE },
];

describe('offered', () => {
  /**
   * What the v6 interaction plugin answers with: the node, then the containers
   * it sits in, then what is actually drawn underneath it.
   */
  it('keeps what is drawn under the point and drops the containers it sits in', () => {
    expect(offered(NODES, [8, 7, 5, 4, 1, 6])).toEqual([8, 6]);
  });

  /** What v8 answers with, which has nothing to drop. */
  it('leaves a stack of unrelated nodes as it is', () => {
    expect(offered(NODES, [3, 6])).toEqual([3, 6]);
  });

  /** The node the picker selects is never dropped: nothing found later is inside it. */
  it('keeps the topmost node even when everything else goes', () => {
    expect(offered(NODES, [3, 2, 1])).toEqual([3]);
  });

  it('leaves a single node alone, whatever it is', () => {
    expect(offered(NODES, [2])).toEqual([2]);
    expect(offered(NODES, [])).toEqual([]);
  });

  /** An id the tree has not caught up with has no parent to look up, and stays. */
  it('keeps an id the tree does not have yet', () => {
    expect(offered(NODES, [99, 8])).toEqual([99, 8]);
  });

  /**
   * A click on a character on v6/v7 lands on one of the meshes the runtime
   * built. The node anyone means by it is the skeleton above.
   */
  describe('a skeleton over the node that was hit', () => {
    it('keeps the skeleton the page reported, rather than dropping it as an ancestor', () => {
      expect(offered(NODES, [10, 9, 4, 1])).toEqual([10, 9]);
    });

    it('offers the skeleton even when the page never reported it', () => {
      expect(offered(NODES, [10, 6])).toEqual([10, 9, 6]);
    });

    /** The skeleton itself is what v8 hits, and there is nothing to add to it. */
    it('adds nothing when the skeleton is what was hit', () => {
      expect(offered(NODES, [9, 6])).toEqual([9, 6]);
    });

    it('names it once, however many of its meshes were found', () => {
      expect(offered(NODES, [10, 9, 6])).toEqual([10, 9, 6]);
    });
  });
});
