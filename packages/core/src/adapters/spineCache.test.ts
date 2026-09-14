import { describe, expect, it } from 'vitest';

import { spineStore } from './spineCache.js';

/**
 * The skeletons a page has loaded, by the name it has them under.
 *
 * The fixture is a cache rather than a scene, because that is where the
 * question is decided: `SkeletonData` carries no name of its own — the JSON
 * reader never fills one in — so the key is the only readable name a skeleton
 * has, and everything here is about telling the useful keys from the rest.
 */

type Fake = Record<string, unknown>;

const names = (pixi: unknown): string[] =>
  spineStore({ pixi }).skeletons.map((one) => one.name);

/** As `Spine.from` files it: parsed, four lists. */
const parsed = (): Fake => ({ bones: [], slots: [], skins: [], animations: [] });

/** As `pixi-spine`'s loader returns it. */
const wrapped = (): Fake => ({ spineData: { bones: [], animations: [] }, spineAtlas: {} });

/** As the alias itself holds it on v8, where the loader parses nothing. */
const raw = (): Fake => ({ skeleton: { spine: '4.1.24', hash: 'abc' }, bones: [], animations: {} });

const withCache = (entries: Array<[unknown, unknown]>): Fake => ({
  Assets: { cache: { _cache: new Map(entries) } },
});

/** As `Assets` holds one on v8: the one asset with a list of pages. */
const atlas = (): Fake => ({ pages: [{ name: 'hero.png' }], regions: [] });

describe('the atlases the store holds', () => {
  /**
   * Not decoration: on v8 the alias holds the export as it was fetched, and
   * turning that into a skeleton means handing the runtime an atlas as well.
   * Nothing in the store says which atlas goes with which skeleton, so what is
   * offered is every key one is under.
   */
  it('names them, and nothing that is not one', () => {
    const store = spineStore({
      pixi: withCache([
        ['heroAtlas', atlas()],
        ['hero', raw()],
      ]),
    });

    expect(store.atlases).toEqual(['heroAtlas']);
  });

  /** The application's own name is the likelier key, so it is tried first. */
  it('puts an alias before a url', () => {
    const store = spineStore({
      pixi: withCache([
        ['/assets/hero.atlas', atlas()],
        ['heroAtlas', atlas()],
      ]),
    });

    expect(store.atlases).toEqual(['heroAtlas', '/assets/hero.atlas']);
  });
});

describe('spineSkeletonNames', () => {
  it('finds a parsed skeleton', () => {
    expect(names(withCache([['hero', parsed()]]))).toEqual(['hero']);
  });

  it("finds one still wrapped by pixi-spine's loader", () => {
    expect(names(withCache([['hero.json', wrapped()]]))).toEqual(['hero.json']);
  });

  /** On v8 the alias holds the export as it was fetched; nothing parses it. */
  it('finds one that is still the raw export', () => {
    expect(names(withCache([['hero', raw()]]))).toEqual(['hero']);
  });

  it('ignores everything else the cache is holding', () => {
    const cache = withCache([
      ['sheet.png', { source: {}, frame: {} }],
      ['circle.atlas', { pages: [] }],
      ['settings', { volume: 1 }],
      ['bones-only', { bones: [] }],
      ['nothing', null],
    ]);

    expect(names(cache)).toEqual([]);
  });

  /**
   * v8 files the parsed skeleton under a key it builds itself out of the two
   * aliases it was handed. That key names the skeleton the alias already names,
   * and no application would take it as a name — listing it would put a second,
   * unusable entry beside every real one.
   */
  it('drops the key Spine.from builds for itself', () => {
    const cache = withCache([
      ['heroSkeleton', raw()],
      ['heroAtlas', { pages: [] }],
      ['heroSkeleton-heroAtlas-1', parsed()],
    ]);

    expect(names(cache)).toEqual(['heroSkeleton']);
  });

  /** Only when the front of it is a key the page actually has. */
  it('keeps a name that merely looks derived', () => {
    expect(names(withCache([['boss-stage-2', parsed()]]))).toEqual(['boss-stage-2']);
  });

  /**
   * `Assets` files what it loaded under both the alias the application chose
   * and the url it came from, and the v6/v7 loader wraps the data besides.
   * Names cannot tell those apart; the parsed skeleton can, because it is one
   * object.
   */
  it('reports one skeleton once, however many keys it is under', () => {
    const wrapper = wrapped();

    expect(
      names(
        withCache([
          ['/assets/hero.json', wrapper],
          ['hero', wrapper],
        ]),
      ),
    ).toEqual(['hero']);
  });

  /**
   * The skeleton comes along with its name: one already parsed needs no reading,
   * which is the only route to a binary export on v6/v7.
   */
  it('hands over the skeleton it found, not only the name', () => {
    const data = parsed();

    expect(spineStore({ pixi: withCache([['hero', data]]) }).skeletons).toEqual([
      { name: 'hero', data },
    ]);
  });

  /** The alias is what the application chose to call it, and what it answers to. */
  it('prefers the alias over the url it was loaded from', () => {
    const wrapper = wrapped();

    expect(
      names(
        withCache([
          ['hero', wrapper],
          ['/assets/hero.json', wrapper],
        ]),
      ),
    ).toEqual(['hero']);
  });

  it('keeps a url when that is the only name there is', () => {
    expect(names(withCache([['/assets/hero.json', wrapped()]]))).toEqual([
      '/assets/hero.json',
    ]);
  });

  it('keeps two skeletons apart', () => {
    const cache = withCache([
      ['hero', wrapped()],
      ['boss', wrapped()],
    ]);

    expect(names(cache)).toEqual(['hero', 'boss']);
  });

  /** v6 has no `Assets` at all and keeps what it loaded on the shared loader. */
  it('reads the old loader as well as the cache', () => {
    const pixi = {
      Loader: { shared: { resources: { 'hero.json': wrapped(), 'music.ogg': { data: null } } } },
    };

    expect(names(pixi)).toEqual(['hero.json']);
  });

  /**
   * The cache lives on the module, so a build that publishes none has nothing
   * to offer — the same limit `pickableTextureNames` states for textures.
   */
  it('reports nothing for a page that publishes no module', () => {
    expect(names(undefined)).toEqual([]);
    expect(names({})).toEqual([]);
  });

  /**
   * The one store that does not live on the module. A bundled v6 game publishes
   * no `PIXI`, so without this the chooser is dead on exactly the games it was
   * asked for.
   */
  it("reads the application's own loader, which needs no module", () => {
    const app = { loader: { resources: { hero: wrapped(), 'music.ogg': { data: null } } } };

    expect(spineStore({ app }).skeletons.map((one) => one.name)).toEqual(['hero']);
  });

  it('survives a build that renamed the private cache', () => {
    expect(names({ Assets: { cache: {} } })).toEqual([]);
  });
});
