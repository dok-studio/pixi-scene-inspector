import { describe, expect, it } from 'vitest';

import type { AnimationNode } from './animationTree.js';
import { animationTree } from './animationTree.js';

/** The tree as labels, with an entry's detail after a colon. */
function outline(nodes: readonly AnimationNode[]): unknown[] {
  return nodes.map((node) => {
    const own = node.entry === undefined ? node.label : `${node.label}:${String(node.entry.detail)}`;
    return node.children.length === 0 ? own : { [own]: outline(node.children) };
  });
}

const entry = (name: string, detail = 1) => ({ name, detail });

describe('animationTree', () => {
  it('leaves names without a slash as a flat list, in order', () => {
    expect(outline(animationTree([entry('walk'), entry('idle', 2)]))).toEqual(['walk:1', 'idle:2']);
  });

  it('folds names by their folders and merges a chain that branches nowhere', () => {
    const tree = animationTree([
      entry('collector/collect/lvl_3/idle'),
      entry('collector/collect/lvl_4/win/in'),
      entry('collector/collect/lvl_4/win/loop'),
      entry('collector/collect/lvl_4/idle'),
      entry('idle'),
    ]);

    expect(outline(tree)).toEqual([
      {
        'collector/collect': [
          { lvl_3: ['idle:1'] },
          { lvl_4: [{ win: ['in:1', 'loop:1'] }, 'idle:1'] },
        ],
      },
      'idle:1',
    ]);
  });

  it('keeps an animation that is also a folder', () => {
    const tree = animationTree([entry('run', 3), entry('run/fast', 1)]);

    expect(outline(tree)).toEqual([{ 'run:3': ['fast:1'] }]);
  });

  it('keys every row by its full path', () => {
    const [folder] = animationTree([entry('a/b/c'), entry('a/b/d')]);

    expect(folder?.path).toBe('a/b');
    expect(folder?.children.map((child) => child.path)).toEqual(['a/b/c', 'a/b/d']);
  });
});
