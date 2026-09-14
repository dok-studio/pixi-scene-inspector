// @vitest-environment happy-dom
import '../adapters/canvasStub.js';

import type { SceneTreePayload } from '@scene-inspector/protocol';
import { NODE_VISIBLE } from '@scene-inspector/protocol';
import * as v6 from 'pixi-v6';
import * as v7 from 'pixi-v7';
import * as v8 from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { createAdapter } from '../adapters/index.js';
import type { PixiAdapter } from '../adapters/types.js';
import { createLocks } from './mutate.js';
import { createRegistry } from './registry.js';
import { readTree } from './tree.js';

/**
 * The tree walk over a **real** PixiJS scene graph, on all three lines.
 *
 * `tree.test.ts` builds the graph out of plain objects, which proves the walk
 * and the revision logic but says nothing about whether real containers can be
 * walked at all — `children` could be a getter that copies, a node could refuse
 * to report a label, a subclass could be typed as 'Unknown'.
 *
 * A renderer still cannot be stood up here (it needs WebGL), so the adapter is
 * given a stub one and the version comes from `PIXI.VERSION`. Nothing in the
 * tree path touches the renderer: the walk goes stage → children, which is
 * exactly what makes the Scene tab work on a frozen, non-rendering scene.
 *
 * The scenes mirror `apps/playground/src/scene-v*.ts` node for node, so a
 * failure here is the same failure the playground would show.
 */

interface Line {
  name: string;
  adapter: PixiAdapter;
  stage: { addChild: (child: never) => void; children: unknown[] };
  hero: { visible: boolean };
  addSprite: () => void;
}

function adapterFor(version: string, stage: object): PixiAdapter {
  const adapter = createAdapter({ stage, renderer: {}, pixi: { VERSION: version } });
  if (adapter === null) throw new Error(`no adapter for PixiJS ${version}`);
  return adapter;
}

/** stage → world → [hero, caption]; the same shape on every line. */
function v8Line(): Line {
  const stage = new v8.Container();
  const world = new v8.Container();
  world.label = 'world';
  const hero = new v8.Sprite();
  hero.label = 'hero';
  const caption = new v8.Text({ text: 'playground' });
  caption.label = 'caption';

  world.addChild(hero, caption);
  stage.addChild(world);

  return {
    name: 'v8',
    adapter: adapterFor(v8.VERSION, stage),
    stage,
    hero,
    addSprite: () => {
      world.addChild(new v8.Sprite());
    },
  };
}

/**
 * v6 and v7 are one builder because the API used here is identical on both.
 * TypeScript treats the two module types as unrelated, hence the cast at the
 * call site — a divergence would still fail this test, just at runtime rather
 * than at compile time.
 */
function legacyLine(name: 'v6' | 'v7', P: typeof v7): Line {
  const stage = new P.Container();
  const world = new P.Container();
  world.name = 'world';
  const hero = new P.Sprite();
  hero.name = 'hero';
  const caption = new P.Text('playground');
  caption.name = 'caption';

  world.addChild(hero, caption);
  stage.addChild(world);

  return {
    name,
    adapter: adapterFor(P.VERSION, stage),
    stage,
    hero,
    addSprite: () => {
      world.addChild(new P.Sprite());
    },
  };
}

const LINES: Array<() => Line> = [
  () => legacyLine('v6', v6 as unknown as typeof v7),
  () => legacyLine('v7', v7),
  v8Line,
];

function payloadOf(result: { data: SceneTreePayload } | { unchanged: true }): SceneTreePayload {
  if ('unchanged' in result) throw new Error('expected data, got unchanged');
  return result.data;
}

describe.each(LINES.map((build) => [build().name, build] as const))(
  'readTree over a real scene — %s',
  (_name, build) => {
    it('walks the whole graph in depth-first order', () => {
      const line = build();
      const nodes = payloadOf(readTree(line.adapter, createRegistry(), createLocks())).nodes;

      expect(nodes.map((node) => node.name)).toEqual(['', 'world', 'hero', 'caption']);
    });

    it('types real nodes', () => {
      const line = build();
      const nodes = payloadOf(readTree(line.adapter, createRegistry(), createLocks())).nodes;

      expect(nodes.map((node) => node.type)).toEqual(['Container', 'Container', 'Sprite', 'Text']);
    });

    it('links children to their parent', () => {
      const line = build();
      const nodes = payloadOf(readTree(line.adapter, createRegistry(), createLocks())).nodes;

      expect(nodes[0]?.parent).toBe(0);
      expect(nodes[2]?.parent).toBe(nodes[1]?.id);
    });

    it('answers unchanged for a scene that has not moved', () => {
      const line = build();
      const registry = createRegistry();
      const first = readTree(line.adapter, registry, createLocks());

      expect(readTree(line.adapter, registry, createLocks(), first.rev)).toEqual({ rev: first.rev, unchanged: true });
    });

    it('notices a node added to the real graph', () => {
      const line = build();
      const registry = createRegistry();
      const first = readTree(line.adapter, registry, createLocks());

      line.addSprite();

      expect(payloadOf(readTree(line.adapter, registry, createLocks(), first.rev)).nodes).toHaveLength(5);
    });

    it('notices a node hidden on the real graph', () => {
      const line = build();
      const registry = createRegistry();
      const first = readTree(line.adapter, registry, createLocks());

      line.hero.visible = false;

      const hero = payloadOf(readTree(line.adapter, registry, createLocks(), first.rev)).nodes[2];
      expect((hero?.flags ?? 0) & NODE_VISIBLE).toBe(0);
    });
  },
);
