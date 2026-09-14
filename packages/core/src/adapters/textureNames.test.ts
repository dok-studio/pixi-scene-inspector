import { describe, expect, it } from 'vitest';

import { createV6Adapter, createV7Adapter, createV8Adapter } from './index.js';
import type { PixiAdapter, PixiCandidate } from './types.js';

/**
 * The names a sprite can be pointed at, on all three lines.
 *
 * The fixtures are a page's caches rather than a scene, because that is where
 * the question is decided: an atlas page and a standalone texture are the same
 * object with the same fields, and only what else is cached on top of them says
 * which is which. Every case that rule has to get right is in one cache here —
 * a sheet with frames cut out of it, a texture under two aliases, a Spine atlas
 * whose regions are cached nowhere, and entries that are not textures at all.
 */

type Fake = Record<string, unknown>;

const SHEET_FRAMES = ['hero_idle_01', 'hero_idle_02'];
const STANDALONE = ['logo', 'assets/img/logo.png'];

/** Everything the fixture below should yield, and nothing besides. */
const OFFERED = [...SHEET_FRAMES, ...STANDALONE];

interface Fixture {
  candidate: PixiCandidate;
  /** The sprite drawing one frame out of the sheet. */
  hero: Fake;
  /** A sprite drawing a whole texture that nobody cut a frame from. */
  banner: Fake;
}

function v8Fixture(): Fixture {
  const sheet: Fake = { uid: 9, label: 'sheet.png', width: 256, height: 256 };
  const logo: Fake = { uid: 10, label: 'logo', width: 64, height: 64 };
  const spinePage: Fake = { uid: 11, label: 'circle.png', width: 128, height: 128 };

  const whole = (source: Fake, label: string): Fake => ({
    source,
    frame: { width: source['width'], height: source['height'] },
    label,
  });
  const frame = (source: Fake, label: string): Fake => ({
    source,
    frame: { width: 32, height: 32 },
    label,
  });

  const hero: Fake = { renderPipeId: 'sprite', texture: frame(sheet, 'hero_idle_01') };
  const skeleton: Fake = { renderPipeId: 'spine', texture: whole(spinePage, 'circle.png') };
  // `Texture.from(image)` leaves the name on the source and the frame unnamed.
  const banner: Fake = { renderPipeId: 'sprite', texture: { ...whole(logo, ''), label: '' } };
  const stage: Fake = { includeInBuild: true, children: [hero, skeleton, banner] };

  const cache = new Map<unknown, unknown>([
    // `Texture.from(canvas)` files a texture under the canvas itself. Keyed by
    // an object, it has no name a `textureId` could be.
    [{ nodeName: 'CANVAS' }, whole(logo, 'logo.png')],
    ['sheet.png', whole(sheet, 'sheet.png')],
    ['hero_idle_01', frame(sheet, 'hero_idle_01')],
    ['hero_idle_02', frame(sheet, 'hero_idle_02')],
    ['logo', whole(logo, 'logo.png')],
    ['assets/img/logo.png', whole(logo, 'logo.png')],
    ['circle.png', whole(spinePage, 'circle.png')],
    // A Spine atlas: pages holding the runtime's own wrapper around a texture.
    ['circle.atlas', { pages: [{ texture: { texture: whole(spinePage, 'circle.png') } }] }],
    // Loaded beside the textures, and not one: the sheet's own description.
    ['sheet.json', { frames: { hero_idle_01: {} } }],
  ]);

  return {
    candidate: { stage, renderer: { renderPipes: {} }, pixi: { Cache: { _cache: cache } } },
    hero,
    banner,
  };
}

function legacyFixture(major: 6 | 7): Fixture {
  const sheet: Fake = { uid: 9, textureCacheIds: ['sheet.png'], width: 256, height: 256 };
  const logo: Fake = { uid: 10, textureCacheIds: ['logo'], width: 64, height: 64 };
  const spinePage: Fake = { uid: 11, textureCacheIds: ['circle.png'], width: 128, height: 128 };

  const whole = (base: Fake, ...ids: string[]): Fake => ({
    baseTexture: base,
    frame: { width: base['width'], height: base['height'] },
    textureCacheIds: ids,
  });
  const frame = (base: Fake, ...ids: string[]): Fake => ({
    baseTexture: base,
    frame: { width: 32, height: 32 },
    textureCacheIds: ids,
  });

  const hero: Fake = {
    vertexTrimmedData: new Float32Array(0),
    indices: [],
    texture: frame(sheet, 'hero_idle_01'),
  };
  const skeleton: Fake = { spineData: {}, texture: whole(spinePage, 'circle.png') };
  // On these lines the frame carries its own keys whether or not it was cut.
  const banner: Fake = {
    vertexTrimmedData: new Float32Array(0),
    indices: [],
    texture: whole(logo, 'logo'),
  };
  const stage: Fake = { _maskRefCount: 0, _render: () => {}, children: [hero, skeleton, banner] };

  const TextureCache: Fake = {
    'sheet.png': whole(sheet, 'sheet.png'),
    hero_idle_01: frame(sheet, 'hero_idle_01'),
    hero_idle_02: frame(sheet, 'hero_idle_02'),
    logo: whole(logo, 'logo'),
    'assets/img/logo.png': whole(logo, 'logo'),
    'circle.png': whole(spinePage, 'circle.png'),
    // Pixi's own id for a texture nobody named, and never worth a menu line.
    pixiid_31: whole(logo, 'pixiid_31'),
    // Not a texture; the cache is a plain object a page can put anything in.
    broken: 'not a texture',
  };

  // v7 loads through `Assets`, v6 through the shared `Loader` — the Spine atlas
  // ends up in a different place on each, which is why both are looked in.
  const atlas = { pages: [{ baseTexture: spinePage }] };
  const pixi: Fake =
    major === 7
      ? {
          utils: { TextureCache },
          Cache: { _cache: new Map<string, unknown>([['circle.atlas', atlas]]) },
        }
      : {
          utils: { TextureCache },
          Loader: { shared: { resources: { circle: { spineAtlas: atlas } } } },
        };

  return { candidate: { stage, renderer: {}, pixi }, hero, banner };
}

const LINES: ReadonlyArray<
  [label: string, build: () => Fixture, make: (candidate: PixiCandidate) => PixiAdapter]
> = [
  ['v8', v8Fixture, createV8Adapter],
  ['v7', () => legacyFixture(7), createV7Adapter],
  ['v6', () => legacyFixture(6), createV6Adapter],
];

describe.each(LINES)('%s texture names', (_line, build, make) => {
  const namesOf = (fixture: Fixture) => make(fixture.candidate).pickableTextureNames();

  it('offers every frame cut out of a sheet', () => {
    expect(namesOf(build())).toEqual(expect.arrayContaining(SHEET_FRAMES));
  });

  it('offers a standalone texture under each of its aliases', () => {
    expect(namesOf(build())).toEqual(expect.arrayContaining([...STANDALONE]));
  });

  /** Pointing a sprite at a page draws the whole sheet, which nobody wants. */
  it('leaves out the page the frames were cut from', () => {
    expect(namesOf(build())).not.toContain('sheet.png');
  });

  /**
   * Spine keeps its regions to itself, so its page is cached alone and looks
   * exactly like a standalone texture. Only the atlas object tells them apart.
   */
  it('leaves out a Spine atlas page, which nothing else marks', () => {
    expect(namesOf(build())).not.toContain('circle.png');
  });

  it('leaves out what is cached but is not a texture', () => {
    const names = namesOf(build());

    expect(names).not.toContain('circle.atlas');
    expect(names).not.toContain('sheet.json');
    expect(names).not.toContain('broken');
    expect(names).not.toContain('pixiid_31');
  });

  it('has nothing to offer when the page publishes no module', () => {
    const fixture = build();
    const adapter = make({ ...fixture.candidate, pixi: undefined });

    expect(adapter.pickableTextureNames()).toEqual([]);
  });

  /** The one source left on a bundle that exposes nothing. */
  it('reads the frame a sprite is drawing off the sprite itself', () => {
    const fixture = build();

    expect(make(fixture.candidate).nodeTextureNames(fixture.hero)).toEqual(['hero_idle_01']);
  });

  /**
   * `Texture.from(image)` names the source and leaves the frame unnamed, so a
   * sprite drawing a whole texture had nothing to answer with — and on a page
   * that publishes no module the scene is the only source there is.
   */
  it('reads a whole texture off the sprite by the name of its source', () => {
    const fixture = build();

    expect(make(fixture.candidate).nodeTextureNames(fixture.banner)).toEqual(['logo']);
  });

  it('reads nothing off a node that draws no texture', () => {
    expect(make(build().candidate).nodeTextureNames({})).toEqual([]);
  });

  /**
   * The exact set, because every way of getting this wrong adds a line rather
   * than losing one: a cache keyed by the canvas a texture was made from
   * offered `[object HTMLCanvasElement]` until the key was required to be a
   * name in the first place.
   */
  it('offers those and nothing else', () => {
    expect([...namesOf(build())].sort()).toEqual([...OFFERED].sort());
  });
});

/**
 * The renderer as a source of names, which is v8 only.
 *
 * A `Texture` subscribes to its source's `resize` with itself as the listener's
 * context, so the listeners of a source are the textures cut from it. That is
 * the only way to see a spritesheet's frames on a page that publishes no
 * module — and it is what makes `managedTextures` usable at all, since telling
 * an atlas page from a standalone texture is exactly the question those frames
 * answer.
 *
 * v6/v7 have no equivalent: there the subscription is conditional on the
 * texture covering the whole base, so an atlas frame never registers one.
 */

/** How eventemitter3 files a listener: one alone, several as an array. */
function subscribe(source: Fake, texture: Fake): void {
  const events = (source['_events'] ??= {}) as Record<string, unknown>;
  const entry = { fn: () => {}, context: texture, once: false };
  const held = events['resize'];

  events['resize'] =
    held === undefined ? entry : Array.isArray(held) ? [...held, entry] : [held, entry];
}

interface RendererFixture {
  candidate: PixiCandidate;
  sheet: Fake;
}

/**
 * A page with no module at all: every name below has to come off the renderer.
 * The sheet carries four frames nothing is drawing, which is the whole point.
 */
function rendererFixture(): RendererFixture {
  const source = (label: string, width: number, height: number): Fake => ({
    uid: 1,
    label,
    width,
    height,
  });

  const texture = (from: Fake, label: unknown, width: number, height: number): Fake => {
    const made: Fake = { isTexture: true, source: from, frame: { width, height }, label };
    subscribe(from, made);
    return made;
  };

  const sheet = source('sprites/hero_sheet.png', 256, 256);
  // `Assets` hands back one texture covering the whole page, unnamed, and the
  // `Spritesheet` cuts the named frames out of it.
  texture(sheet, undefined, 256, 256);
  for (const name of ['hero_idle_01', 'hero_idle_02', 'hero_idle_03', 'hero_idle_04']) {
    texture(sheet, name, 32, 32);
  }

  // A standalone texture: the name is on the source, the frame carries none.
  const logo = source('ui/logo.png', 64, 64);
  texture(logo, undefined, 64, 64);

  // Pixi's own, and never worth a menu line: the render-texture pool names its
  // entries, and `Texture.EMPTY`/`WHITE` are the library's stand-ins.
  const pooled = source('', 64, 32);
  texture(pooled, 'texturePool_0', 35, 17);
  const empty = source('EMPTY', 1, 1);
  texture(empty, 'EMPTY', 1, 1);

  // Destroyed, and still subscribed: `Texture.destroy()` clears its own
  // listeners but never unsubscribes from its source.
  const dropped = source('', 128, 128);
  const gone = texture(dropped, 'was_here.png', 32, 32);
  gone['destroyed'] = true;

  const stage: Fake = { includeInBuild: true, children: [] };
  const managedTextures = [sheet, logo, pooled, empty, dropped];

  return {
    candidate: { stage, renderer: { renderPipes: {}, texture: { managedTextures } }, pixi: undefined },
    sheet,
  };
}

describe('v8 texture names off the renderer', () => {
  const namesOf = () => createV8Adapter(rendererFixture().candidate).pickableTextureNames();

  it('offers every frame of a sheet nothing is drawing', () => {
    expect(namesOf()).toEqual(
      expect.arrayContaining(['hero_idle_01', 'hero_idle_02', 'hero_idle_03', 'hero_idle_04']),
    );
  });

  it('leaves out the page those frames were cut from', () => {
    expect(namesOf()).not.toContain('sprites/hero_sheet.png');
  });

  /** Nothing cut a frame from it, so the source's own name is what it goes by. */
  it('offers a standalone texture by the name of its source', () => {
    expect(namesOf()).toContain('ui/logo.png');
  });

  it('leaves out the names PixiJS made up for itself', () => {
    const names = namesOf();

    expect(names).not.toContain('texturePool_0');
    expect(names).not.toContain('EMPTY');
  });

  it('leaves out a texture that has been destroyed', () => {
    expect(namesOf()).not.toContain('was_here.png');
  });

  it('reads a source that has a single listener as well as many', () => {
    expect(namesOf()).toContain('ui/logo.png');
  });

  it('has nothing to say when the renderer keeps no list', () => {
    const { candidate } = rendererFixture();
    const adapter = createV8Adapter({ ...candidate, renderer: { renderPipes: {} } });

    expect(adapter.pickableTextureNames()).toEqual([]);
  });

  /** A build that renames the private field costs the names, not the panel. */
  it('has nothing to say when the listeners cannot be reached', () => {
    const { candidate, sheet } = rendererFixture();
    delete sheet['_events'];

    expect(createV8Adapter(candidate).pickableTextureNames()).not.toContain('hero_idle_01');
  });
});

describe('v8 texture names off the scene', () => {
  /**
   * `Texture.EMPTY` is what a sprite holds before it is given anything, and it
   * carries a label like any other texture. A real page had it as the only
   * name the scene could offer.
   */
  it('leaves out the names PixiJS made up for itself', () => {
    const source: Fake = { label: 'EMPTY', width: 1, height: 1 };
    const node: Fake = {
      renderPipeId: 'sprite',
      texture: { isTexture: true, source, frame: { width: 1, height: 1 }, label: 'EMPTY' },
    };
    const adapter = createV8Adapter({ stage: { includeInBuild: true, children: [node] } });

    expect(adapter.nodeTextureNames(node)).toEqual([]);
  });
});

/**
 * Spine pages, on a page that publishes no module.
 *
 * The atlas objects that normally mark them live in the asset cache, so without
 * the module the only thing left is the skeleton itself. A multi-region atlas
 * would mark its own page anyway — its regions are partial textures of it — but
 * a skeleton whose single region covers the whole page looks exactly like a
 * standalone texture, and that is the case these cover.
 */
describe('v8 Spine pages off the scene', () => {
  const page: Fake = { uid: 7, label: 'circle.png', width: 128, height: 128 };
  const region: Fake = { isTexture: true, source: page, frame: { width: 128, height: 128 } };

  function fixture(skeletonNode: Fake): PixiCandidate {
    subscribe(page, region);

    return {
      stage: { includeInBuild: true, children: [skeletonNode] },
      renderer: { renderPipes: {}, texture: { managedTextures: [page] } },
    };
  }

  /** What each slot is showing: filled before the skeleton is ever drawn. */
  it('leaves out a page reached through the skeleton slots', () => {
    const node: Fake = {
      renderPipeId: 'spine',
      skeleton: { slots: [{ attachment: { region: { texture: { texture: region } } } }] },
    };

    expect(createV8Adapter(fixture(node)).pickableTextureNames()).not.toContain('circle.png');
  });

  /** What the runtime has cached to draw: by slot, then by attachment name. */
  it('leaves out a page reached through the attachment cache', () => {
    const node: Fake = {
      renderPipeId: 'spine',
      attachmentCacheData: [{ circle: { texture: region } }],
    };

    expect(createV8Adapter(fixture(node)).pickableTextureNames()).not.toContain('circle.png');
  });

  /** Nothing but a Spine node marks it, so a page nobody animates is offered. */
  it('offers the same texture when no skeleton claims it', () => {
    const node: Fake = { renderPipeId: 'sprite' };

    expect(createV8Adapter(fixture(node)).pickableTextureNames()).toContain('circle.png');
  });
});

/**
 * The other direction: given a page, what was cut out of it.
 *
 * The name list flattens that — it says which strings a sprite may be pointed
 * at and nothing about which sheet each came from — so a sheet's own regions
 * are found separately, and by a different route on each line.
 */
describe('the frames cut out of a texture', () => {
  it('v8 finds them on the source itself, needing no module', () => {
    const { candidate, sheet } = rendererFixture();
    const frames = createV8Adapter(candidate).framesOf(sheet);

    expect(frames.map((frame) => frame.name)).toEqual([
      'hero_idle_01',
      'hero_idle_02',
      'hero_idle_03',
      'hero_idle_04',
    ]);
    expect(frames[0]).toMatchObject({ x: 0, y: 0, width: 32, height: 32 });
  });

  /** The region covering the whole page is the page, not a frame of it. */
  it('v8 leaves out the region that covers the whole source', () => {
    const { candidate, sheet } = rendererFixture();

    expect(createV8Adapter(candidate).framesOf(sheet)).toHaveLength(4);
  });

  it('v8 reports nothing for a texture nobody cut', () => {
    const { candidate } = rendererFixture();
    const managed = (candidate.renderer as { texture: { managedTextures: Fake[] } }).texture
      .managedTextures;
    const logo = managed[1] as Fake;

    expect(createV8Adapter(candidate).framesOf(logo)).toEqual([]);
  });

  /**
   * v6/v7 have no listener to read: the subscription is conditional on the
   * texture covering the whole base, so a frame never registers one. The cache
   * is the only route, and it lives on the module.
   */
  it('v6/v7 find them in the texture cache, in reading order', () => {
    const sheet: Fake = { uid: 9, textureCacheIds: ['sheet.png'], width: 256, height: 256 };
    const cut = (x: number, y: number): Fake => ({
      baseTexture: sheet,
      frame: { x, y, width: 32, height: 32 },
    });

    const candidate: PixiCandidate = {
      stage: { children: [] },
      renderer: {},
      pixi: {
        utils: {
          TextureCache: {
            'sheet.png': { baseTexture: sheet, frame: { x: 0, y: 0, width: 256, height: 256 } },
            hero_idle_02: cut(32, 0),
            hero_idle_01: cut(0, 0),
            pixiid_31: cut(0, 32),
          },
        },
      },
    };

    const frames = createV7Adapter(candidate).framesOf(sheet);
    expect(frames.map((frame) => frame.name)).toEqual(['hero_idle_01', 'hero_idle_02', '']);
  });

  /** A known limit, and the same one the name list has on these lines. */
  it('v6/v7 have no way to them at all without the module', () => {
    const sheet: Fake = { uid: 9, width: 256, height: 256 };
    const candidate: PixiCandidate = { stage: { children: [] }, renderer: {}, pixi: undefined };

    expect(createV6Adapter(candidate).framesOf(sheet)).toEqual([]);
  });
});

/**
 * The pixels of a texture that has none on this side of the bus.
 *
 * Two kinds between them make up most of what a v8 page reports as unnamed: a
 * `Text`, whose canvas PixiJS empties into a pool the moment it is uploaded,
 * and a render target, which never had a resource at all.
 */
describe('reading a texture back from the GPU', () => {
  it('v8 asks the renderer, through the texture cut from the source', () => {
    const { candidate, sheet } = rendererFixture();
    const canvas = { width: 40, height: 20, getContext: () => null };
    let askedFor: unknown = null;

    (candidate.renderer as Fake)['extract'] = {
      canvas: (target: unknown) => {
        askedFor = target;
        return canvas;
      },
    };

    const readback = createV8Adapter(candidate).readback(sheet);

    expect(readback).toEqual({ image: canvas, width: 40, height: 20 });
    // Not the source: `extract` wants a texture, and the source's own listeners
    // are where the textures over it are found.
    expect(askedFor).not.toBe(sheet);
  });

  /** A build without the system, a backend that answers with a promise, a throw. */
  it('v8 answers with nothing rather than failing when it cannot', () => {
    const { candidate, sheet } = rendererFixture();
    const adapter = () => createV8Adapter(candidate).readback(sheet);

    expect(adapter()).toBeNull();

    (candidate.renderer as Fake)['extract'] = {};
    expect(adapter()).toBeNull();

    (candidate.renderer as Fake)['extract'] = { canvas: () => Promise.resolve(null) };
    expect(adapter()).toBeNull();

    (candidate.renderer as Fake)['extract'] = {
      canvas: () => {
        throw new Error('texture is gone');
      },
    };
    expect(adapter()).toBeNull();
  });

  /**
   * Not needed there and not reachable either: a `Text` keeps its canvas after
   * upload on these lines, and there is no route from a `BaseTexture` to the
   * `RenderTexture` over it.
   */
  it('v6/v7 have nothing to read back', () => {
    const candidate: PixiCandidate = { stage: { children: [] }, renderer: {} };

    expect(createV7Adapter(candidate).readback({ uid: 1 })).toBeNull();
    expect(createV6Adapter(candidate).readback({ uid: 1 })).toBeNull();
  });
});
