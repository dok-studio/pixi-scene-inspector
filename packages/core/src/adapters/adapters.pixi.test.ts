// @vitest-environment happy-dom
import './canvasStub.js';

import * as v6 from 'pixi-v6';
import * as v7 from 'pixi-v7';
import * as v8 from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { createAdapter } from './index.js';
import type { Node, PixiAdapter } from './types.js';

/**
 * The adapters against the real PixiJS — all three lines, installed side by
 * side (`pixi-v6` and `pixi-v7` are npm aliases in the core's devDependencies).
 *
 * Why this exists next to `adapters.test.ts`: those tests run against fakes
 * written by the same hand as the heuristics, so they prove the adapters are
 * internally consistent and nothing more. The markers they rely on —
 * `renderPipeId`, `vertexTrimmedData`, `_isConnectedToTicker` — are library
 * internals nobody promised to keep. This file is what turns their
 * disappearance into a red CI instead of a scene tree full of "Unknown".
 *
 * Every node type the inspector names is built for real on every line, which is
 * the point: the type is the key the property schema is looked up by, so a
 * misidentified node is not a cosmetic problem.
 *
 * A renderer is the one thing that cannot be stood up here — it needs WebGL.
 * The markers that live on it are covered in `version.pixi.test.ts` instead,
 * read off the `Renderer` class registries.
 */

interface Line {
  name: string;
  version: string;
  adapter: PixiAdapter;
  /** The field this line keeps the user-facing name in. */
  labelKey: 'label' | 'name';
  container: () => Node;
  sprite: () => Node;
  /** A real filter of this line, for the effects reads. */
  blur: () => object;
  /** Expected type, and a real node of that type built on this line. */
  types: ReadonlyArray<readonly [expected: string, build: () => Node]>;
}

function adapterFor(version: string, stage: object): PixiAdapter {
  // A version string is enough: with `PIXI.VERSION` present there is nothing to
  // duck-type, so no renderer needs to be stood up for these tests.
  const adapter = createAdapter({ stage, renderer: {}, pixi: { VERSION: version } });
  if (adapter === null) throw new Error(`no adapter for PixiJS ${version}`);
  return adapter;
}

const LINES: Line[] = [
  {
    name: 'v6',
    version: v6.VERSION,
    adapter: adapterFor(v6.VERSION, new v6.Container()),
    labelKey: 'name',
    container: () => new v6.Container(),
    sprite: () => new v6.Sprite(),
    // The base class: this workspace installs v6's core, and the blur filter
    // ships in a package of its own.
    blur: () => new v6.Filter(),
    types: [
      ['Container', () => new v6.Container()],
      ['Sprite', () => new v6.Sprite()],
      ['AnimatedSprite', () => new v6.AnimatedSprite([v6.Texture.EMPTY])],
      ['TilingSprite', () => new v6.TilingSprite(v6.Texture.EMPTY, 10, 10)],
      ['NineSliceSprite', () => new v6.NineSlicePlane(v6.Texture.EMPTY)],
      ['Graphics', () => new v6.Graphics()],
      ['Text', () => new v6.Text('caption')],
      ['Mesh', () => new v6.SimpleMesh(v6.Texture.EMPTY)],
      ['ParticleContainer', () => new v6.ParticleContainer()],
    ],
  },
  {
    name: 'v7',
    version: v7.VERSION,
    adapter: adapterFor(v7.VERSION, new v7.Container()),
    labelKey: 'name',
    container: () => new v7.Container(),
    sprite: () => new v7.Sprite(),
    blur: () => new v7.BlurFilter(),
    types: [
      ['Container', () => new v7.Container()],
      ['Sprite', () => new v7.Sprite()],
      ['AnimatedSprite', () => new v7.AnimatedSprite([v7.Texture.EMPTY])],
      ['TilingSprite', () => new v7.TilingSprite(v7.Texture.EMPTY, 10, 10)],
      ['NineSliceSprite', () => new v7.NineSlicePlane(v7.Texture.EMPTY)],
      ['Graphics', () => new v7.Graphics()],
      ['Text', () => new v7.Text('caption')],
      ['Mesh', () => new v7.SimpleMesh(v7.Texture.EMPTY)],
      ['ParticleContainer', () => new v7.ParticleContainer()],
    ],
  },
  {
    name: 'v8',
    version: v8.VERSION,
    adapter: adapterFor(v8.VERSION, new v8.Container()),
    labelKey: 'label',
    container: () => new v8.Container(),
    sprite: () => new v8.Sprite(),
    blur: () => new v8.BlurFilter(),
    types: [
      ['Container', () => new v8.Container()],
      ['Sprite', () => new v8.Sprite()],
      ['AnimatedSprite', () => new v8.AnimatedSprite([v8.Texture.EMPTY])],
      ['TilingSprite', () => new v8.TilingSprite()],
      ['NineSliceSprite', () => new v8.NineSliceSprite({ texture: v8.Texture.EMPTY })],
      ['Graphics', () => new v8.Graphics()],
      ['Text', () => new v8.Text({ text: 'caption' })],
      ['Mesh', () => new v8.MeshSimple({ texture: v8.Texture.EMPTY })],
      ['ParticleContainer', () => new v8.ParticleContainer()],
    ],
  },
];

/**
 * A guard against silent drift: if an installed line moves to a major the
 * adapters were never written for, it fails here — where the cause is obvious —
 * rather than as a mis-typed node somewhere in the tree.
 */
describe('the installed libraries are the ones being claimed', () => {
  it.each(LINES)('$name', ({ name, version }) => {
    expect(version.startsWith(`${name.slice(1)}.`)).toBe(true);
  });
});

describe.each(LINES)('PixiAdapter against real PixiJS $name', (line) => {
  const { adapter } = line;

  /**
   * Subclasses carry all of their parent's markers, so this is as much a test
   * of the order of the checks as of the checks themselves: an AnimatedSprite
   * that regressed into 'Sprite' would look perfectly reasonable in the panel.
   */
  it.each(line.types)('types a real %s', (expected, build) => {
    expect(adapter.typeOf(build())).toBe(expected);
  });

  it('reads the name out of the field this line actually uses', () => {
    const node = line.container();
    (node as Record<string, unknown>)[line.labelKey] = 'hero';

    expect(adapter.label(node)).toBe('hero');
  });

  it('writes the name into the field this line actually uses', () => {
    const node = line.container();

    adapter.setLabel(node, 'villain');

    expect((node as Record<string, unknown>)[line.labelKey]).toBe('villain');
  });

  it('reads visibility off a real node', () => {
    const node = line.container() as { visible: boolean };

    expect(adapter.visible(node)).toBe(true);
    node.visible = false;
    expect(adapter.visible(node)).toBe(false);
  });

  it('walks the real children array', () => {
    const parent = line.container() as { addChild: (child: unknown) => void };
    const child = line.sprite();
    parent.addChild(child);

    expect(adapter.children(parent)).toEqual([child]);
  });

  /**
   * An anchor is an `ObservablePoint`, not a plain object: reading it means
   * going through getters, and writing it has to leave the point itself in
   * place so the observer that tells the renderer the sprite moved still fires.
   */
  it('reads a real anchor as plain x and y', () => {
    const sprite = line.sprite() as { anchor: { set: (x: number, y: number) => void } };
    sprite.anchor.set(0.5, 0.25);

    expect(adapter.getProp(sprite, 'anchor')).toEqual({ x: 0.5, y: 0.25 });
  });

  it('writes a real anchor without replacing the point', () => {
    const sprite = line.sprite() as { anchor: { x: number; y: number } };
    const point = sprite.anchor;

    adapter.setProp(sprite, 'anchor', { x: 1, y: 0.5 });

    expect(sprite.anchor).toBe(point);
    expect([point.x, point.y]).toEqual([1, 0.5]);
  });

  it('has no anchor to report on a plain container', () => {
    expect(adapter.getProp(line.container(), 'anchor')).toBeUndefined();
  });

  /**
   * The read that looks version-specific and is not. v8 moved filters into an
   * effect object but kept an accessor over it; v6 and v7 hold the array on
   * the display object. Both answer to the same property, which is the claim
   * this makes on real nodes rather than on a fake that agrees by
   * construction.
   */
  it('sees a filter and a mask the same way on every line', () => {
    const plain = line.container();
    expect(adapter.hasFilter(plain)).toBe(false);
    expect(adapter.hasMask(plain)).toBe(false);

    const filtered = line.container() as { filters: unknown };
    filtered.filters = [line.blur()];
    expect(adapter.hasFilter(filtered)).toBe(true);

    const masked = line.container() as { mask: unknown };
    masked.mask = line.sprite();
    expect(adapter.hasMask(masked)).toBe(true);
  });

  it('reads a filter list emptied again as no filter', () => {
    const node = line.container() as { filters: unknown };
    node.filters = [line.blur()];
    node.filters = [];

    expect(adapter.hasFilter(node)).toBe(false);
  });

  it('measures real bounds as plain data', () => {
    const sprite = line.sprite() as { width: number; height: number };
    sprite.width = 40;
    sprite.height = 30;

    expect(adapter.globalBounds(sprite)).toEqual({ x: 0, y: 0, width: 40, height: 30 });
  });
});
