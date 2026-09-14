import { describe, expect, it, vi } from 'vitest';

import type { Node, PixiAdapter } from '../adapters/types.js';
import { logNode } from './logNode.js';

/**
 * The caption in front of the object, and the object still in the same entry.
 *
 * Both halves are worth pinning. The caption is what makes one of these
 * findable in a console that is already busy; the object's place at the end of
 * the same call is what keeps it beside the words describing it.
 */

function fakeAdapter(type: string, label: string): PixiAdapter {
  return { typeOf: () => type, label: () => label } as unknown as PixiAdapter;
}

/** The arguments of the one call, with a spy that keeps them out of the run's output. */
function loggedArgs(adapter: PixiAdapter | null, node: Node): unknown[] {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  try {
    logNode(adapter, node);
    return spy.mock.calls[0] ?? [];
  } finally {
    spy.mockRestore();
  }
}

describe('logNode', () => {
  it('names the node by type and label', () => {
    const node = {} as Node;
    const args = loggedArgs(fakeAdapter('Sprite', 'hero'), node);

    expect(args[0]).toBe('%cScene Inspector%c Sprite “hero”');
    expect(args[args.length - 1]).toBe(node);
  });

  // Empty quotes describe nothing; the type on its own describes what there is.
  it('falls back to the type alone for a node with no name', () => {
    const args = loggedArgs(fakeAdapter('Container', ''), {} as Node);

    expect(args[0]).toBe('%cScene Inspector%c Container');
  });

  /**
   * One style per `%c`, in order, or the console reads the object as the next
   * style string and prints `[object Object]` where the caption should be.
   */
  it('hands the console a style for each mark, and the node last', () => {
    const node = {} as Node;
    const args = loggedArgs(fakeAdapter('Text', 'score'), node);

    expect(args).toHaveLength(4);
    expect(args[1]).toContain('background:#1f78bd');
    expect(args[2]).toBe('font-weight:600');
    expect(args[3]).toBe(node);
  });

  /**
   * A destroyed application leaves nothing to ask what the node is, and the
   * object is still worth handing over — with the badge, so it is findable,
   * and with no trailing `%c` left unfilled.
   */
  it('logs the object under the badge alone when there is no adapter', () => {
    const node = {} as Node;
    const args = loggedArgs(null, node);

    expect(args[0]).toBe('%cScene Inspector');
    expect(args).toHaveLength(3);
    expect(args[2]).toBe(node);
  });
});
