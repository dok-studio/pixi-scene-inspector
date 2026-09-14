import { describe, expect, it } from 'vitest';

import { createAdapter } from '../adapters/index.js';
import type { PixiAdapter } from '../adapters/types.js';
import { createRegistry } from '../scene/registry.js';
import { readTextureUsers } from './users.js';

/**
 * Which nodes draw a given texture — the question the grid beside them cannot
 * answer, since it reports what the renderer holds and not what uses it.
 */

type Fake = Record<string, unknown>;

const sheet: Fake = { uid: 9, label: 'sheet.png', width: 256, height: 256 };
const logo: Fake = { uid: 10, label: 'logo.png', width: 64, height: 64 };

/** A sprite drawing one frame out of a source; the id is the source's. */
function sprite(name: string, source: Fake): Fake {
  return {
    renderPipeId: 'sprite',
    label: name,
    texture: { source, frame: { width: 32, height: 32 } },
    children: [],
  };
}

function adapterOf(children: Fake[]): PixiAdapter {
  const adapter = createAdapter({
    stage: { includeInBuild: true, label: 'stage', children },
    renderer: { renderPipes: {} },
  });

  if (adapter === null) throw new Error('expected an adapter');
  return adapter;
}

const usersOf = (adapter: PixiAdapter, id: number, rev?: number) =>
  readTextureUsers(adapter, createRegistry(), id, rev);

const labels = (answer: ReturnType<typeof usersOf>) =>
  'data' in answer ? answer.data.map((user) => user.label) : null;

describe('readTextureUsers', () => {
  it('finds every node drawing out of the texture, however deep', () => {
    const nested: Fake = {
      includeInBuild: true,
      label: 'group',
      children: [sprite('coin', sheet)],
    };

    const adapter = adapterOf([sprite('hero', sheet), sprite('badge', logo), nested]);

    expect(labels(usersOf(adapter, 9))).toEqual(['hero', 'coin']);
  });

  /** A frame is a texture over a source; the grid lists sources, so this must too. */
  it('answers for the source rather than for the frame cut from it', () => {
    const adapter = adapterOf([sprite('hero', sheet), sprite('coin', sheet)]);

    expect(labels(usersOf(adapter, 9))).toHaveLength(2);
  });

  /** An atlas page nothing draws from is exactly what this is opened to find. */
  it('answers with nothing for a texture the scene is not using', () => {
    expect(labels(usersOf(adapterOf([sprite('badge', logo)]), 9))).toEqual([]);
  });

  it('lists a node with no name of its own by its type', () => {
    const unnamed = sprite('', sheet);

    expect(labels(usersOf(adapterOf([unnamed]), 9))).toEqual(['Sprite']);
  });

  it('hands over the ids the Scene tab selects by', () => {
    const registry = createRegistry();
    const node = sprite('hero', sheet);
    const adapter = adapterOf([node]);

    const answer = readTextureUsers(adapter, registry, 9);
    const first = 'data' in answer ? answer.data[0] : undefined;

    expect(first?.id).toBe(registry.idOf(node));
  });

  it('answers unchanged while the same nodes are drawing it', () => {
    const adapter = adapterOf([sprite('hero', sheet)]);
    const registry = createRegistry();

    const first = readTextureUsers(adapter, registry, 9);
    expect(readTextureUsers(adapter, registry, 9, first.rev)).toEqual({
      rev: first.rev,
      unchanged: true,
    });
  });

  it('moves the revision when another node picks the texture up', () => {
    const registry = createRegistry();
    const before = readTextureUsers(adapterOf([sprite('hero', sheet)]), registry, 9);
    const after = readTextureUsers(
      adapterOf([sprite('hero', sheet), sprite('coin', sheet)]),
      registry,
      9,
    );

    expect(after.rev).not.toBe(before.rev);
  });

  it('survives an application with no stage left', () => {
    const adapter = createAdapter({ stage: undefined, renderer: { renderPipes: {} } });
    if (adapter === null) throw new Error('expected an adapter');

    expect(labels(usersOf(adapter, 9))).toEqual([]);
  });
});
