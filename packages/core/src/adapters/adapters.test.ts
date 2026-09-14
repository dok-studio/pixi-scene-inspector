import type { PixiMajor } from '@scene-inspector/protocol';
import { DEFAULT_PICK_DEPTH } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import { createAdapter, createV6Adapter, createV7Adapter, createV8Adapter } from './index.js';
import type { Node, PixiAdapter, PixiCandidate } from './types.js';

/**
 * The adapters are tested against fake trees rather than a real PixiJS
 * (docs/architecture.md §3.10). Not for convenience: it is the only way to have
 * all three versions in one test run, and it forces every version difference to
 * be spelled out as data instead of hiding inside a library.
 *
 * The fakes mirror the shapes the adapters actually read — `label` vs `name`,
 * `TextureSource` vs `BaseTexture`, `events` vs `plugins.interaction` — so a
 * test failing here means a real read would have failed too.
 *
 * The risk of the approach is known and covered elsewhere: fakes written by the
 * same hand as the heuristic prove only internal consistency, so the markers
 * are additionally checked against the real library in `*.pixi.test.ts`.
 */

type Fake = Record<string, unknown>;

interface World {
  major: PixiMajor;
  candidate: PixiCandidate;
  stage: Fake;
  /** A named Sprite two levels down: stage → world → hero. */
  hero: Fake;
  /** The container the hero sits in, and the second node under the same point. */
  world: Fake;
  /** The field this version keeps the user-facing name in. */
  labelKey: 'label' | 'name';
  renderer: Fake;
}

/**
 * A drawable source: recognised by having numeric dimensions, and carrying the
 * `src` an `<img>` would so the adapters have a URL to report.
 */
const image = { width: 1024, height: 1024, src: 'https://example.test/atlas.png' };

function bounds(x: number, y: number, width: number, height: number) {
  return { x, y, width, height };
}

/**
 * Whether the picker has this node switched on, decided the way the adapter
 * decides it: `eventMode` where the node has one, `interactive` where it does
 * not — early v7 builds predate `eventMode`, and the fake worlds below are
 * built that way on purpose.
 */
function pickable(node: Fake): boolean {
  return node['eventMode'] === undefined
    ? node['interactive'] === true
    : node['eventMode'] !== 'none';
}

/**
 * A hit test with something to dig through: the point is over the hero and
 * over the container it sits in, so the topmost answer changes as the picker
 * switches off what it has already found.
 */
function probeStack(nodes: Fake[]): () => Fake | null {
  return () => nodes.find(pickable) ?? null;
}

function v8World(): World {
  const hero: Fake = {
    renderPipeId: 'sprite',
    label: 'hero',
    children: [],
    destroyed: false,
    visible: true,
    eventMode: 'none',
    getBounds: () => bounds(10, 20, 30, 40),
  };
  const world: Fake = {
    includeInBuild: true,
    measurable: true,
    _didLocalTransformChangeId: 0,
    label: 'world',
    children: [hero],
    destroyed: false,
    eventMode: 'none',
    getBounds: () => bounds(0, 0, 100, 100),
  };
  const stage: Fake = {
    includeInBuild: true,
    measurable: true,
    _didLocalTransformChangeId: 0,
    label: '',
    children: [world],
    destroyed: false,
    eventMode: 'none',
    getBounds: () => bounds(0, 0, 800, 600),
  };

  const atlas: Fake = {
    uid: 7,
    label: 'atlas',
    width: 512,
    height: 512,
    pixelWidth: 1024,
    pixelHeight: 1024,
    format: 'bgra8unorm',
    resource: image,
    resolution: 2,
    mipLevelCount: 4,
    alphaMode: 'premultiply-alpha-on-upload',
    dimension: '2d',
    antialias: true,
    autoGarbageCollect: true,
  };
  const buffer: Fake = {
    uid: 8,
    label: 'buffer',
    width: 4,
    height: 4,
    pixelWidth: 4,
    pixelHeight: 4,
    format: 'rgba8unorm',
    resource: [new Uint8Array(64)],
  };

  const renderer: Fake = {
    renderPipes: {},
    resolution: 2,
    texture: {
      managedTextures: [atlas, buffer],
      // Only the atlas has made it to the GPU.
      _glTextures: { 7: {} },
    },
    events: {
      mapPositionToPoint: (point: { x: number; y: number }, x: number, y: number) => {
        point.x = x;
        point.y = y;
      },
      rootBoundary: { hitTest: probeStack([hero, world]) },
    },
  };

  return {
    major: 8,
    candidate: { stage, renderer },
    stage,
    hero,
    world,
    labelKey: 'label',
    renderer,
  };
}

function legacyWorld(major: 6 | 7): World {
  const hero: Fake = {
    vertexTrimmedData: new Float32Array(0),
    indices: [],
    name: 'hero',
    children: [],
    destroyed: false,
    visible: true,
    interactive: false,
    getBounds: () => bounds(10, 20, 30, 40),
  };
  if (major === 7) hero['eventMode'] = 'none';

  const world: Fake = {
    _maskRefCount: 0,
    _render: () => {},
    _tempDisplayObjectParent: null,
    name: 'world',
    children: [hero],
    destroyed: false,
    interactive: false,
    getBounds: () => bounds(0, 0, 100, 100),
  };
  const stage: Fake = {
    _maskRefCount: 0,
    _render: () => {},
    _tempDisplayObjectParent: null,
    name: '',
    children: [world],
    destroyed: false,
    interactive: false,
    getBounds: () => bounds(0, 0, 800, 600),
  };

  const atlas: Fake = {
    uid: 7,
    textureCacheIds: ['atlas'],
    width: 512,
    height: 512,
    realWidth: 1024,
    realHeight: 1024,
    format: 6408,
    // The resource wraps the drawable on these lines and carries the URL itself.
    resource: { url: 'https://example.test/atlas.png', source: image },
    resolution: 2,
    mipmap: 1,
    alphaMode: 1,
    isPowerOfTwo: true,
  };
  const buffer: Fake = {
    uid: 8,
    textureCacheIds: [],
    width: 4,
    height: 4,
    realWidth: 4,
    realHeight: 4,
    format: 6408,
    resource: { source: undefined },
  };

  // A picker click only finds a node once interactivity has been switched on.
  const probe = probeStack([hero, world]);

  const picking: Fake =
    major === 7
      ? {
          events: {
            mapPositionToPoint: (point: { x: number; y: number }, x: number, y: number) => {
              point.x = x;
              point.y = y;
            },
            rootBoundary: { hitTest: probe },
          },
        }
      : {
          plugins: {
            interaction: {
              mapPositionToPoint: (point: { x: number; y: number }, x: number, y: number) => {
                point.x = x;
                point.y = y;
              },
              hitTest: probe,
            },
          },
        };

  const renderer: Fake = {
    resolution: 2,
    texture: { managedTextures: [atlas, buffer] },
    ...picking,
  };

  return { major, candidate: { stage, renderer }, stage, hero, world, labelKey: 'name', renderer };
}

const WORLDS: ReadonlyArray<[label: string, build: () => World]> = [
  ['v8', v8World],
  ['v7', () => legacyWorld(7)],
  ['v6', () => legacyWorld(6)],
];

function adapterFor(world: World): PixiAdapter {
  const adapter = createAdapter(world.candidate);
  if (adapter === null) throw new Error('expected an adapter for this candidate');
  return adapter;
}

describe.each(WORLDS)('PixiAdapter — %s', (_label, build) => {
  it('reports the major version it was built for', () => {
    const world = build();

    expect(adapterFor(world).major).toBe(world.major);
  });

  it('returns the stage', () => {
    const world = build();

    expect(adapterFor(world).stage()).toBe(world.stage);
  });

  it('returns null for a destroyed stage', () => {
    const world = build();
    world.stage['destroyed'] = true;

    expect(adapterFor(world).stage()).toBeNull();
  });

  it('walks children one level at a time', () => {
    const world = build();
    const adapter = adapterFor(world);

    const [child] = adapter.children(world.stage);

    expect(child).toBeDefined();
    expect(adapter.children(child as Node)).toEqual([world.hero]);
  });

  it('returns an empty list for a node with no children', () => {
    const world = build();

    expect(adapterFor(world).children(world.hero)).toEqual([]);
  });

  it('reports whether a node is visible', () => {
    const world = build();
    const adapter = adapterFor(world);

    expect(adapter.visible(world.hero)).toBe(true);

    world.hero['visible'] = false;
    expect(adapter.visible(world.hero)).toBe(false);
  });

  /** Nothing in Pixi leaves `visible` unset, but a foreign node in the tree might. */
  it('treats a node with no visible field as visible', () => {
    const world = build();
    delete world.hero['visible'];

    expect(adapterFor(world).visible(world.hero)).toBe(true);
  });

  describe('property access by path', () => {
    it('reads a plain value', () => {
      const world = build();
      world.hero['alpha'] = 0.5;

      expect(adapterFor(world).getProp(world.hero, 'alpha')).toBe(0.5);
    });

    it('reads through a path', () => {
      const world = build();
      world.hero['position'] = { x: 10, y: 20 };

      expect(adapterFor(world).getProp(world.hero, 'position.x')).toBe(10);
    });

    /**
     * Pixi hands back a `Point` — an object with methods and, on v8, private
     * observer fields. Only x and y may cross the bridge, so the projection
     * happens here rather than being left for the caller to get wrong.
     */
    it('projects a point down to plain x and y', () => {
      const world = build();
      world.hero['position'] = { x: 10, y: 20, set: () => {}, _observer: {} };

      expect(adapterFor(world).getProp(world.hero, 'position')).toEqual({ x: 10, y: 20 });
    });

    it('reports a missing property as undefined rather than throwing', () => {
      const world = build();

      expect(adapterFor(world).getProp(world.hero, 'nothing.here.at.all')).toBeUndefined();
    });

    /** Functions, symbols and class instances cannot be serialized. */
    it('reports a value that cannot cross the bridge as undefined', () => {
      const world = build();
      world.hero['weird'] = () => 'not json';

      expect(adapterFor(world).getProp(world.hero, 'weird')).toBeUndefined();
    });

    it('writes a plain value', () => {
      const world = build();

      adapterFor(world).setProp(world.hero, 'alpha', 0.25);

      expect(world.hero['alpha']).toBe(0.25);
    });

    it('writes through a path', () => {
      const world = build();
      world.hero['position'] = { x: 0, y: 0 };

      adapterFor(world).setProp(world.hero, 'position.y', 42);

      expect((world.hero['position'] as { y: number }).y).toBe(42);
    });

    /**
     * Assigning a fresh object over `position` would replace a live Point that
     * the renderer holds a reference to. The components are written instead.
     */
    it('writes a point component by component, keeping the object', () => {
      const world = build();
      const point = { x: 0, y: 0 };
      world.hero['position'] = point;

      adapterFor(world).setProp(world.hero, 'position', { x: 3, y: 4 });

      expect(world.hero['position']).toBe(point);
      expect(point).toEqual({ x: 3, y: 4 });
    });

    it('ignores a write to a path that does not exist', () => {
      const world = build();

      expect(() => {
        adapterFor(world).setProp(world.hero, 'missing.deeply.nested', 1);
      }).not.toThrow();
    });

    /**
     * The schema is the real gate on what may be written, but a path walk that
     * can step through `__proto__` is a hole worth closing where it is, not
     * only where it is currently guarded.
     */
    it('refuses to walk through the prototype chain', () => {
      const world = build();
      const adapter = adapterFor(world);

      adapter.setProp(world.hero, '__proto__.polluted', true);
      adapter.setProp(world.hero, 'constructor.prototype.polluted', true);

      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
      expect(adapter.getProp(world.hero, '__proto__.toString')).toBeUndefined();
    });

    it('ignores a write to a destroyed node', () => {
      const world = build();
      world.hero['destroyed'] = true;

      adapterFor(world).setProp(world.hero, 'alpha', 0.25);

      expect(world.hero['alpha']).toBeUndefined();
    });
  });

  it('reports the node type', () => {
    const world = build();
    const adapter = adapterFor(world);

    expect(adapter.typeOf(world.stage)).toBe('Container');
    expect(adapter.typeOf(world.hero)).toBe('Sprite');
  });

  it('reads the label out of the field this version uses', () => {
    const world = build();

    expect(adapterFor(world).label(world.hero)).toBe('hero');
  });

  /**
   * Frameworks built on v6/v7 commonly name nodes through their own `id`
   * rather than Pixi's `name` — the previous project read `id` outright on
   * those lines. Preferring it, with `name` behind it, covers both without
   * having to know which framework is in play.
   */
  it('prefers an application’s own id over the Pixi field', () => {
    const world = build();
    world.hero['id'] = 'HeroSprite';

    expect(adapterFor(world).label(world.hero)).toBe('HeroSprite');
  });

  it('ignores an id that is not a name', () => {
    const world = build();
    world.hero['id'] = 42;

    expect(adapterFor(world).label(world.hero)).toBe('hero');
  });

  it('ignores an empty id', () => {
    const world = build();
    world.hero['id'] = '';

    expect(adapterFor(world).label(world.hero)).toBe('hero');
  });

  /** Renaming has to land where the name was read from, or it does nothing. */
  it('renames through the id when that is what the node is named by', () => {
    const world = build();
    world.hero['id'] = 'HeroSprite';

    adapterFor(world).setLabel(world.hero, 'Villain');

    expect(world.hero['id']).toBe('Villain');
    expect(adapterFor(world).label(world.hero)).toBe('Villain');
  });

  it('reports an empty label rather than undefined when none is set', () => {
    const world = build();
    delete world.hero[world.labelKey];

    expect(adapterFor(world).label(world.hero)).toBe('');
  });

  it('writes the label into the field this version uses', () => {
    const world = build();

    adapterFor(world).setLabel(world.hero, 'villain');

    expect(world.hero[world.labelKey]).toBe('villain');
  });

  it('returns global bounds as plain data', () => {
    const world = build();

    expect(adapterFor(world).globalBounds(world.hero)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  /**
   * v6/v7 `getBounds()` hands back a shared, reused Rectangle, so anything that
   * passed it through would start changing under the caller.
   */
  it('copies the bounds instead of passing the renderer’s own object through', () => {
    const world = build();
    const shared = bounds(10, 20, 30, 40);
    world.hero['getBounds'] = () => shared;

    const result = adapterFor(world).globalBounds(world.hero);
    shared.x = 999;

    expect(result.x).toBe(10);
  });

  it('reports zero bounds for a destroyed node instead of asking it', () => {
    const world = build();
    world.hero['destroyed'] = true;
    world.hero['getBounds'] = () => {
      throw new Error('a destroyed node must not be measured');
    };

    expect(adapterFor(world).globalBounds(world.hero)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('finds the node under a point', () => {
    const world = build();

    expect(adapterFor(world).hitStack(15, 25, DEFAULT_PICK_DEPTH)[0]).toBe(world.hero);
  });

  /**
   * The whole reason the stack is taken rather than the top of it: a node with
   * something drawn over it cannot be clicked on at all, and the panel offers
   * what was underneath as a list.
   */
  it('finds everything under a point, topmost first', () => {
    const scene = build();

    expect(adapterFor(scene).hitStack(15, 25, DEFAULT_PICK_DEPTH)).toEqual([scene.hero, scene.world]);
  });

  /**
   * Hit testing only sees interactive nodes, and an application marks almost
   * nothing as interactive. So the adapter switches the whole tree on for the
   * duration of the test — and has to put every node back exactly as it was,
   * or the picker would silently rewire the page's input handling.
   */
  it('restores interactivity after picking', () => {
    const scene = build();
    const before = { ...scene.hero };
    const beforeWorld = { ...scene.world };

    adapterFor(scene).hitStack(15, 25, DEFAULT_PICK_DEPTH);

    expect(scene.hero['interactive']).toBe(before['interactive']);
    expect(scene.hero['eventMode']).toBe(before['eventMode']);
    // Including the nodes the stack itself switched off on its way down, which
    // it leaves holding `none` until this restore puts the original back.
    expect(scene.world['interactive']).toBe(beforeWorld['interactive']);
    expect(scene.world['eventMode']).toBe(beforeWorld['eventMode']);
  });

  it('reports the renderer’s size, for the overlay to match', () => {
    const world = build();
    world.renderer['width'] = 1600;
    world.renderer['height'] = 1200;

    expect(adapterFor(world).rendererSize()).toEqual({ width: 1600, height: 1200 });
  });

  it('reports a zero size when the renderer has none yet', () => {
    const world = build();

    expect(adapterFor(world).rendererSize()).toEqual({ width: 0, height: 0 });
  });

  it('returns null for a canvas the renderer does not have', () => {
    const world = build();

    expect(adapterFor(world).canvas()).toBeNull();
  });

  it('lists the textures the renderer is tracking', () => {
    const world = build();

    expect(adapterFor(world).textures()).toHaveLength(2);
  });

  it('describes a texture', () => {
    const world = build();
    const adapter = adapterFor(world);
    const [atlas] = adapter.textures();

    expect(adapter.textureInfo(atlas as Node)).toMatchObject({
      id: 7,
      label: 'atlas',
      width: 512,
      height: 512,
      pixelWidth: 1024,
      pixelHeight: 1024,
      // 1024 × 1024 × 4 bytes per pixel, RGBA either way.
      gpuSize: 4194304,
      isLoaded: true,
    });
  });

  it('describes how a texture is stored, in the same words on every line', () => {
    const world = build();
    const adapter = adapterFor(world);
    const [atlas] = adapter.textures();

    expect(adapter.textureInfo(atlas as Node)).toMatchObject({
      resolution: 2,
      mipmap: true,
      // A number on v6/v7 and a name on v8; the adapter answers with the name.
      alphaMode: 'premultiply-alpha-on-upload',
      dimension: '2d',
      isPowerOfTwo: true,
      destroyed: false,
      sourceKind: 'image',
      url: 'https://example.test/atlas.png',
    });
  });

  /** A source with no image behind it is not an image, and says which it is. */
  it('names what is behind a texture that cannot be drawn', () => {
    const world = build();
    const adapter = adapterFor(world);
    const [, buffer] = adapter.textures();

    const info = adapter.textureInfo(buffer as Node);
    expect(info.url).toBeNull();
    expect(['compressed', 'none']).toContain(info.sourceKind);
  });

  /**
   * Nothing on a texture moves when its content is replaced — not `_resourceId`,
   * which looks like it should and does not, measured on the stand. What PixiJS
   * does is emit, and both lines emit the same `'update'`.
   */
  it('counts the times a texture has had its pixels replaced', () => {
    const world = build();
    const adapter = adapterFor(world);
    const [atlas] = adapter.textures();
    const listeners: (() => void)[] = [];
    (atlas as Fake)['on'] = (event: string, fn: () => void) => {
      if (event === 'update') listeners.push(fn);
    };

    // Nothing that happened before anyone was looking can have made a cached
    // picture stale, so the count starts where the looking does.
    expect(adapter.textureInfo(atlas as Node).updates).toBe(0);

    listeners.forEach((fn) => { fn(); });
    expect(adapter.textureInfo(atlas as Node).updates).toBe(1);

    listeners.forEach((fn) => { fn(); });
    expect(adapter.textureInfo(atlas as Node).updates).toBe(2);
  });

  /** One listener per texture, however many times it is described. */
  it('subscribes to a texture once and not once per poll', () => {
    const world = build();
    const adapter = adapterFor(world);
    const [atlas] = adapter.textures();
    let subscribed = 0;
    (atlas as Fake)['on'] = () => { subscribed += 1; };

    adapter.textureInfo(atlas as Node);
    adapter.textureInfo(atlas as Node);
    adapter.textureInfo(atlas as Node);

    expect(subscribed).toBe(1);
  });

  it('returns the drawable behind a texture', () => {
    const world = build();
    const adapter = adapterFor(world);
    const [atlas] = adapter.textures();

    expect(adapter.drawable(atlas as Node)).toBe(image);
  });

  it('returns null for a texture with no drawable source', () => {
    const world = build();
    const adapter = adapterFor(world);
    const [, buffer] = adapter.textures();

    expect(adapter.drawable(buffer as Node)).toBeNull();
  });

  it('survives a renderer with no textures at all', () => {
    const world = build();
    world.renderer['texture'] = undefined;

    expect(adapterFor(world).textures()).toEqual([]);
  });
});

/**
 * The differences worth stating outright. Everything above proves the adapters
 * behave the same; these prove they get there differently.
 */
describe('what actually differs between the versions', () => {
  it('v8 keeps the name in `label`, v6/v7 in `name`', () => {
    const eight = v8World();
    const seven = legacyWorld(7);

    adapterFor(eight).setLabel(eight.hero, 'renamed');
    adapterFor(seven).setLabel(seven.hero, 'renamed');

    expect(eight.hero['label']).toBe('renamed');
    expect(eight.hero['name']).toBeUndefined();
    expect(seven.hero['name']).toBe('renamed');
    expect(seven.hero['label']).toBeUndefined();
  });

  /**
   * v8 reports renderer dimensions in CSS pixels, v6/v7 in device pixels — so
   * the overlay has to divide by the resolution on the older lines only.
   */
  /** v8 renamed the canvas; before it, the renderer called it a view. */
  it('v8 finds the canvas on `canvas`, v6/v7 on `view`', () => {
    const eight = v8World();
    const seven = legacyWorld(7);
    const canvas = { getContext: () => null };

    eight.renderer['canvas'] = canvas;
    seven.renderer['view'] = canvas;

    expect(adapterFor(eight).canvas()).toBe(canvas);
    expect(adapterFor(seven).canvas()).toBe(canvas);
  });

  it('v8 needs no resolution divisor for the overlay, v6/v7 do', () => {
    expect(adapterFor(v8World()).overlayResolution()).toBe(1);
    expect(adapterFor(legacyWorld(7)).overlayResolution()).toBe(2);
    expect(adapterFor(legacyWorld(6)).overlayResolution()).toBe(2);
  });

  it('falls back to a resolution of 1 when the renderer does not report one', () => {
    const world = legacyWorld(7);
    world.renderer['resolution'] = undefined;

    expect(adapterFor(world).overlayResolution()).toBe(1);
  });

  it('v8 reports a WebGPU format name, v6/v7 a GL format constant', () => {
    const eight = v8World();
    const six = legacyWorld(6);
    const eightAdapter = adapterFor(eight);
    const sixAdapter = adapterFor(six);

    expect(eightAdapter.textureInfo(eightAdapter.textures()[0] as Node).format).toBe('bgra8unorm');
    expect(sixAdapter.textureInfo(sixAdapter.textures()[0] as Node).format).toBe('6408');
  });

  it('v8 knows which textures reached the GPU; on v6/v7 being managed means uploaded', () => {
    const eight = v8World();
    const eightAdapter = adapterFor(eight);
    const six = legacyWorld(6);
    const sixAdapter = adapterFor(six);

    expect(eightAdapter.textureInfo(eightAdapter.textures()[1] as Node).isLoaded).toBe(false);
    expect(sixAdapter.textureInfo(sixAdapter.textures()[1] as Node).isLoaded).toBe(true);
  });

  /**
   * Both settings arrived with v8. A `false` would be an answer — "this texture
   * is not antialiased" — and there is none to give, so the row reads as
   * unknown rather than as a setting nobody chose.
   */
  it('v8 answers for antialias and garbage collection, v6/v7 have neither', () => {
    const eight = adapterFor(v8World());
    const seven = adapterFor(legacyWorld(7));

    expect(eight.textureInfo(eight.textures()[0] as Node)).toMatchObject({
      antialias: true,
      autoGarbageCollect: true,
    });
    expect(seven.textureInfo(seven.textures()[0] as Node)).toMatchObject({
      antialias: null,
      autoGarbageCollect: null,
    });
  });

  /** The whole of one is the image again, and this list is polled every second. */
  it('reports a data URL as its media type and no more', () => {
    const world = v8World();
    const textures = (world.renderer['texture'] as { managedTextures: Fake[] }).managedTextures;
    textures[0]!['resource'] = { src: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAA' };
    const adapter = adapterFor(world);

    expect(adapter.textureInfo(adapter.textures()[0] as Node).url).toBe('data:image/png');
  });

  /**
   * The case that made this necessary: `Assets` hands v8 an `ImageBitmap`,
   * which has no `src` at all, and writes the address it loaded from into the
   * source's label instead. Without the fallback the row was empty on almost
   * every texture a real game holds.
   */
  it('reads the address off the label when the resource carries none', () => {
    const world = v8World();
    const textures = (world.renderer['texture'] as { managedTextures: Fake[] }).managedTextures;
    const bitmap = { width: 8, height: 8, close: () => undefined };
    textures[0]!['resource'] = bitmap;
    textures[0]!['label'] = 'sprites/hero_sheet.png';
    const adapter = adapterFor(world);

    const info = adapter.textureInfo(adapter.textures()[0] as Node);
    expect(info.sourceKind).toBe('bitmap');
    expect(info.url).toBe('sprites/hero_sheet.png');
  });

  /** v6/v7 file a loaded texture under the URL it came from, so the key serves. */
  it('reads the address off a legacy cache key that names a file', () => {
    const world = legacyWorld(7);
    const textures = (world.renderer['texture'] as { managedTextures: Fake[] }).managedTextures;
    textures[0]!['resource'] = { source: { width: 8, height: 8 } };
    textures[0]!['textureCacheIds'] = ['assets/ui/panel.png'];
    const adapter = adapterFor(world);

    expect(adapter.textureInfo(adapter.textures()[0] as Node).url).toBe('assets/ui/panel.png');
  });

  /**
   * A game naming a generated canvas after a file is not unusual, and that
   * canvas was drawn rather than downloaded — there is nowhere for the link to
   * go. The source's kind is what settles it.
   */
  it('does not invent an address for a canvas that is merely named like a file', () => {
    const world = v8World();
    const textures = (world.renderer['texture'] as { managedTextures: Fake[] }).managedTextures;
    textures[0]!['resource'] = { width: 8, height: 8, getContext: () => null };
    textures[0]!['label'] = 'sprites/checker.png';
    const adapter = adapterFor(world);

    expect(adapter.textureInfo(adapter.textures()[0] as Node).url).toBeNull();
  });

  /**
   * A frame of a sheet is cached under names like `ui/button` — a slash and no
   * extension — and a 404 behind a double click is worse than no link.
   */
  it('does not mistake a name for an address', () => {
    const world = v8World();
    const textures = (world.renderer['texture'] as { managedTextures: Fake[] }).managedTextures;
    textures[0]!['resource'] = { width: 8, height: 8, close: () => undefined };
    const adapter = adapterFor(world);

    for (const label of ['ui/button', 'hero_idle_01', 'EMPTY', '']) {
      textures[0]!['label'] = label;
      expect(adapter.textureInfo(adapter.textures()[0] as Node).url).toBeNull();
    }
  });

  it('tells a canvas from an image without asking what class it is', () => {
    const world = v8World();
    const textures = (world.renderer['texture'] as { managedTextures: Fake[] }).managedTextures;
    textures[0]!['resource'] = { width: 8, height: 8, getContext: () => null };
    const adapter = adapterFor(world);

    const info = adapter.textureInfo(adapter.textures()[0] as Node);
    expect(info.sourceKind).toBe('canvas');
    expect(info.url).toBeNull();
  });

  /**
   * On v6/v7 a texture built from a canvas is cached under a generated id
   * before the application can add a name of its own, and the name it did add
   * is the one worth showing.
   */
  it('names a legacy texture by its first key that Pixi did not generate', () => {
    const world = legacyWorld(7);
    const textures = world.renderer['texture'] as { managedTextures: Fake[] };
    textures.managedTextures[0]!['textureCacheIds'] = ['pixiid_31', 'sprites/hero.png'];
    const adapter = adapterFor(world);

    expect(adapter.textureInfo(adapter.textures()[0] as Node).label).toBe('sprites/hero.png');
  });

  it('falls back to the generated key when a legacy texture has no other name', () => {
    const world = legacyWorld(7);
    const textures = world.renderer['texture'] as { managedTextures: Fake[] };
    textures.managedTextures[0]!['textureCacheIds'] = ['pixiid_31'];
    const adapter = adapterFor(world);

    expect(adapter.textureInfo(adapter.textures()[0] as Node).label).toBe('pixiid_31');
  });

  /**
   * Current v8 builds (8.14 was checked on the stand) no longer keep that map:
   * the GPU data sits on the source, and a source is only listed once it has
   * been initialised. Reading the missing map as "nothing is uploaded" marked
   * every texture on the page as unloaded.
   */
  it('treats a managed texture as uploaded when the renderer keeps no map of them', () => {
    const world = v8World();
    delete (world.renderer['texture'] as Fake)['_glTextures'];
    const adapter = adapterFor(world);

    expect(adapter.textureInfo(adapter.textures()[1] as Node).isLoaded).toBe(true);
  });

  it('reports no GPU size for a format outside the tables', () => {
    const world = v8World();
    const adapter = adapterFor(world);
    const [atlas] = adapter.textures();
    (atlas as Fake)['format'] = 'astc-12x12-unorm';

    expect(adapter.textureInfo(atlas as Node).gpuSize).toBeNull();
  });
});

describe('createAdapter', () => {
  it('returns null when there is no renderer to work with', () => {
    expect(createAdapter({ stage: {} })).toBeNull();
  });

  it('returns null for a version outside the supported range', () => {
    expect(createAdapter({ pixi: { VERSION: '5.3.0' }, renderer: {}, stage: {} })).toBeNull();
  });

  it('trusts the version PixiJS reports over the shape of the objects', () => {
    // A v7 renderer plus an explicit v7 version string: nothing to duck-type.
    const world = legacyWorld(7);
    const candidate: PixiCandidate = { ...world.candidate, pixi: { VERSION: '7.4.3' } };

    expect(createAdapter(candidate)?.major).toBe(7);
  });
});

/**
 * Where a gradient comes from on PixiJS 8, which is the one version difference that
 * cannot be answered by reading a field.
 *
 * A gradient there has to be an **instance** of `FillGradient` — the conversion that
 * turns a fill into something the renderer can draw checks with `instanceof`, and an
 * object that merely looks like one is taken for a solid colour. So the class itself
 * has to be found, and a bundled application exposes nothing to find it by name.
 */
/**
 * The picker on a renderer that has no event system: a v6 application built
 * from @pixi/* without @pixi/interaction has no plugin, and v7's system can be
 * absent too. The answer is "nothing was hit", not an exception thrown into the
 * inspected page's own console from inside a click listener.
 */
describe('hit testing without an event system', () => {
  const stage = { children: [] };

  it('answers with nothing on v6 with no interaction plugin', () => {
    const adapter = createV6Adapter({ stage, renderer: { plugins: {} } });

    expect(adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([]);
  });

  it('answers with nothing on v7 with no event system', () => {
    const adapter = createV7Adapter({ stage, renderer: {} });

    expect(adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([]);
  });

  it('answers with nothing on v8 with no event system', () => {
    const adapter = createV8Adapter({ stage, renderer: { renderPipes: {} } });

    expect(adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([]);
  });
});

/**
 * The stack is taken by switching off what was just found and asking again, so
 * a node that cannot be switched off — a getter over `eventMode`, a `hitArea`
 * belonging to something the adapter never reaches — would answer the same hit
 * test for as long as the loop runs. It has to stop on the repeat instead: this
 * runs inside a click handler on the page, and a click that never returns takes
 * the game down with it.
 */
describe('picking a node that refuses to be switched off', () => {
  it('stops at the repeated answer rather than asking forever', () => {
    const hero: Record<string, unknown> = { children: [] };
    Object.defineProperty(hero, 'eventMode', { get: () => 'static', set: () => undefined });

    const stage = { children: [hero], eventMode: 'none' };
    const adapter = createV8Adapter({
      stage,
      renderer: {
        renderPipes: {},
        events: {
          mapPositionToPoint: (point: { x: number; y: number }, x: number, y: number) => {
            point.x = x;
            point.y = y;
          },
          rootBoundary: { hitTest: () => hero },
        },
      },
    });

    expect(adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([hero]);
  });
});

describe('gradientSupport', () => {
  class FakeGradient {
    colorStops: unknown[] = [];
    buildGradient(): void {}
  }

  const gradient = (): FakeGradient => new FakeGradient();

  const sceneWith = (style: unknown): PixiCandidate => ({
    renderer: { renderPipes: {} },
    stage: { children: [{ children: [{ children: [], style }] }] },
  });

  it('needs no class on the versions that spell a gradient as a list', () => {
    expect(createV6Adapter({ renderer: {} }).gradientSupport()).toEqual({ shape: 'list' });
    expect(createV7Adapter({ renderer: {} }).gradientSupport()).toEqual({ shape: 'list' });
  });

  it('takes the class from the module where the application exposes one', () => {
    const support = createV8Adapter({
      renderer: {},
      pixi: { FillGradient: FakeGradient },
    }).gradientSupport();

    expect(support.shape === 'object' && support.make()).toBeInstanceOf(FakeGradient);
  });

  /**
   * The hiding places, each of which is somewhere a real application actually keeps
   * one — and all but the first were missed by the version of this that only looked
   * at `style.fill`.
   */
  it.each([
    ['assigned outright', (g: FakeGradient) => ({ fill: g })],
    ['inside a fill style object', (g: FakeGradient) => ({ fill: { fill: g } })],
    ['in the converted fill a clone carries', (g: FakeGradient) => ({ _fill: { fill: g } })],
    ['on the stroke instead', (g: FakeGradient) => ({ stroke: { fill: g } })],
    ['in a multi-style tag', (g: FakeGradient) => ({ fill: 'black', subStyles: { score: { fill: g } } })],
  ])('finds the class in the scene when it is %s', (_, place) => {
    const support = createV8Adapter(sceneWith(place(gradient()))).gradientSupport();

    expect(support.shape === 'object' && support.make()).toBeInstanceOf(FakeGradient);
  });

  /** Nothing to copy and nothing exposed: a gradient cannot be made, and says so. */
  it('answers null where the page has neither a module nor a gradient', () => {
    const support = createV8Adapter(sceneWith({ fill: 'black' })).gradientSupport();

    expect(support.shape === 'object' && support.make()).toBeNull();
  });

  /**
   * The negative answer is the expensive one — it is the only one that walks the
   * whole scene — and it is also the one a page hits on every click of the
   * Gradient segment. A fresh adapter per call is what the session really does.
   */
  it('remembers that there was nothing to find, rather than walking again', () => {
    let walks = 0;
    const stage = {
      get children() {
        walks += 1;
        return [{ children: [], style: { fill: 'black' } }];
      },
    };
    const candidate: PixiCandidate = { renderer: { renderPipes: {} }, stage };

    const first = createV8Adapter(candidate).gradientSupport();
    expect(first.shape === 'object' && first.make()).toBeNull();

    const walked = walks;
    expect(walked).toBeGreaterThan(0);

    const second = createV8Adapter(candidate).gradientSupport();
    expect(second.shape === 'object' && second.make()).toBeNull();
    expect(walks).toBe(walked);
  });
});

/**
 * A hit test answers about geometry, not about what can be seen. A hidden
 * popup, a layer left at `alpha = 0`, a node switched off with `renderable`:
 * all of them still occupy their pixels and still come back from it, and on a
 * screen built over a few of those the picker never reached anything anyone
 * could point at.
 */
describe('picking past what is not drawn', () => {
  /**
   * A stage over `layers`, hit-tested in the order given — the first that is
   * still switched on, which is what makes the dig walk down the list.
   */
  function pickerFor(layers: Fake[]): PixiAdapter {
    const stage: Fake = { children: layers, eventMode: 'none' };
    for (const layer of layers) {
      layer['children'] ??= [];
      layer['parent'] ??= stage;
    }

    return createV8Adapter({
      stage,
      renderer: {
        renderPipes: {},
        events: {
          mapPositionToPoint: (point: { x: number; y: number }, x: number, y: number) => {
            point.x = x;
            point.y = y;
          },
          rootBoundary: { hitTest: probeStack(layers) },
        },
      },
    });
  }

  const hidden = { label: 'hidden', visible: false, eventMode: 'none' };
  const unrendered = { label: 'unrendered', renderable: false, eventMode: 'none' };
  const invisible = { label: 'invisible', alpha: 0, eventMode: 'none' };
  const drawn = { label: 'drawn', eventMode: 'none' };

  it('leaves out a node that is not visible, and digs past it', () => {
    expect(pickerFor([{ ...hidden }, { ...drawn }]).hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([
      expect.objectContaining({ label: 'drawn' }),
    ]);
  });

  it('leaves out a node that is not renderable', () => {
    expect(pickerFor([{ ...unrendered }, { ...drawn }]).hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([
      expect.objectContaining({ label: 'drawn' }),
    ]);
  });

  it('leaves out a node at zero alpha', () => {
    expect(pickerFor([{ ...invisible }, { ...drawn }]).hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([
      expect.objectContaining({ label: 'drawn' }),
    ]);
  });

  /**
   * The ancestors count for the same reason they count when the frame is
   * drawn: a node inside a container at `alpha = 0` is not on screen, whatever
   * it says about itself.
   */
  it('leaves out a node whose container is not on screen', () => {
    const child: Fake = { label: 'child', children: [], eventMode: 'none' };
    const layer: Fake = { label: 'layer', alpha: 0, children: [child], eventMode: 'none' };
    child['parent'] = layer;

    const adapter = pickerFor([layer, { ...drawn }]);
    // The child is what the hit test finds first; the layer over it is not.
    expect(adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([expect.objectContaining({ label: 'drawn' })]);
  });

  /**
   * The budget is on questions asked, not on nodes kept. Counting kept nodes
   * meant a screen under a stack of hidden layers ran out of dig before it
   * reached anything on screen — which is the case this whole skip is for.
   */
  it('digs through more hidden layers than a list would ever hold', () => {
    const layers: Fake[] = [];
    for (let at = 0; at < 40; at++) {
      layers.push({ label: `hidden-${String(at)}`, visible: false, eventMode: 'none' });
    }
    layers.push({ ...drawn });

    expect(pickerFor(layers).hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([
      expect.objectContaining({ label: 'drawn' }),
    ]);
  });

  /**
   * A game's own `containsPoint` meeting a tree that is half switched off —
   * a state nothing put itself in but the picker. Whatever it makes of that
   * must not come out of a click on the page as an exception.
   */
  it('keeps what it has when a later ask throws', () => {
    const layers = [{ ...drawn, label: 'top' }, { ...drawn, label: 'under' }];
    const adapter = pickerFor(layers);
    const first = layers[0] as Fake;

    // The second ask is the one that blows up: by then the top node has been
    // switched off, which is what a fussy `containsPoint` would trip over.
    Object.defineProperty(first, 'eventMode', {
      get: () => 'none',
      set: () => {
        throw new Error('a game that dislikes being switched off');
      },
    });

    expect(() => adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH)).not.toThrow();
  });

  /** The setting is what stops the dig, and it stops it where it says. */
  it('asks no more times than the depth it was given', () => {
    const layers = [{ ...hidden }, { ...hidden }, { ...drawn }];

    expect(pickerFor(layers).hitStack(10, 10, 2)).toEqual([]);
    expect(pickerFor(layers).hitStack(10, 10, 3)).toEqual([
      expect.objectContaining({ label: 'drawn' }),
    ]);
  });

  /**
   * The number comes across the bridge, and what it buys is a loop inside the
   * page's own click handler. Nonsense is put back inside the ceiling rather
   * than run.
   */
  it('puts a depth from anywhere inside what the page will run', () => {
    const layers = [{ ...hidden }, { ...drawn }];

    for (const depth of [0, -5, Number.NaN, 1e9]) {
      expect(pickerFor(layers).hitStack(10, 10, depth).length).toBeLessThanOrEqual(1);
    }

    // Zero and below still ask once: a picker that answers nothing at all is
    // not a setting anyone meant to choose.
    expect(pickerFor([{ ...drawn }]).hitStack(10, 10, 0)).toEqual([
      expect.objectContaining({ label: 'drawn' }),
    ]);
  });
});

/**
 * The picker switches a game's whole tree on and has to put every node back.
 * One node that objects to being written to must not be the reason the rest of
 * the page spends the session with its input handling rewired.
 */
describe('putting a tree back that objects to it', () => {
  it('restores every other node when one of them throws on the way back', () => {
    const stubborn: Record<string, unknown> = { children: [] };
    let put = 0;
    Object.defineProperty(stubborn, 'eventMode', {
      get: () => 'none',
      set: () => {
        put += 1;
        throw new Error('a node with an opinion');
      },
    });

    const after: Record<string, unknown> = { children: [], eventMode: 'none' };
    const stage = { children: [stubborn, after], eventMode: 'none' };

    const adapter = createV8Adapter({
      stage,
      renderer: {
        renderPipes: {},
        events: {
          mapPositionToPoint: (point: { x: number; y: number }, x: number, y: number) => {
            point.x = x;
            point.y = y;
          },
          rootBoundary: { hitTest: () => null },
        },
      },
    });

    adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH);

    // It was written to — and the nodes after it in the walk still went back.
    expect(put).toBeGreaterThan(0);
    expect(after['eventMode']).toBe('none');
    expect(stage.eventMode).toBe('none');
  });
});

/**
 * The boundary's root, which v7 only ever sets from inside the handler for a
 * native pointer event on the canvas. While the picker is armed the overlay
 * covers that canvas and takes those events, and the panel doing the picking is
 * a different window — so a game nobody has moused over has no root, and its
 * `hitTest` throws rather than answering null. The picker was dead there until
 * something else happened to touch the canvas first.
 */
describe('a v7 boundary that has never been given its root', () => {
  function boundaryScene() {
    const hero: Fake = { name: 'hero', children: [], eventMode: 'none', interactive: false };
    const stage = { name: '', children: [hero], eventMode: 'none', interactive: false };

    const boundary: Record<string, unknown> = {
      rootTarget: null,
      hitTest(this: { rootTarget?: unknown }) {
        // v7's own behaviour, in one line: the root is read straight off, so a
        // boundary without one throws instead of answering.
        return (this.rootTarget as { children: Fake[] }).children[0] ?? null;
      },
    };

    return { hero, boundary, stage };
  }

  it('lends it one for the question, and takes it back after', () => {
    const { hero, boundary, stage } = boundaryScene();
    const adapter = createV7Adapter({
      stage,
      renderer: {
        events: {
          mapPositionToPoint: (point: { x: number; y: number }, x: number, y: number) => {
            point.x = x;
            point.y = y;
          },
          rootBoundary: boundary,
        },
      },
    });

    expect(adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([hero]);
    // Lent, not given: v7 writes this itself on the next pointer event.
    expect(boundary['rootTarget']).toBeNull();
  });
});

/**
 * The page's own event system, which is a class instance and reads `this`:
 * `mapPositionToPoint` wants the canvas and the resolution off it, `hitTest`
 * wants the root. Taking either off the object and calling it plainly throws —
 * and inside a click handler that reads, from the outside, exactly like a
 * point with nothing under it.
 */
describe('an event system whose methods use their own object', () => {
  it('asks it through itself, rather than detaching what it borrows', () => {
    const hero: Fake = { name: 'hero', children: [], eventMode: 'none' };
    const stage = { name: '', children: [hero], eventMode: 'none' };

    class Boundary {
      rootTarget: unknown = stage;
      hitTest(): unknown {
        // Whatever it looks for on itself, it must be there when it looks.
        return (this.rootTarget as { children: Fake[] }).children[0] ?? null;
      }
    }

    class Events {
      readonly resolution = 2;
      readonly rootBoundary = new Boundary();
      mapPositionToPoint(point: { x: number; y: number }, x: number, y: number): void {
        point.x = x * this.resolution;
        point.y = y * this.resolution;
      }
    }

    const adapter = createV8Adapter({
      stage,
      renderer: { renderPipes: {}, events: new Events() },
    });

    expect(adapter.hitStack(10, 10, DEFAULT_PICK_DEPTH)).toEqual([hero]);
  });
});
