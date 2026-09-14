/**
 * The skeletons the page has loaded, by the name it has them under.
 *
 * Spine is not PixiJS and the rest of the inspector treats it that way
 * (docs/architecture.md §3.5) — but the **cache** is PixiJS's, and reaching it
 * differs by line, which is what adapters are for. The atlas side of the same
 * job already lives here, in `texture.ts`'s `atlasPageSources`.
 *
 * Why the cache and not the scene: a skeleton is identified by name, and
 * `SkeletonData` has none. `SkeletonJson.readSkeletonData` never fills `name`
 * in and `SkeletonBinary` writes an empty string, so the key the page cached it
 * under is the only readable name a skeleton has.
 */

import type { PixiCandidate, SpineStore } from './types.js';

/** One thing the store holds, under the name it holds it by. */
interface Entry {
  name: string;
  value: unknown;
}

function isArrayAt(value: object, key: string): boolean {
  return Array.isArray((value as Record<string, unknown>)[key]);
}

/**
 * Whether a cached value is a skeleton, in any of the forms one arrives in.
 *
 * Recognised by shape rather than by class, since the runtime is bundled and
 * its names are gone — the same rule `atlasPageSources` goes by. Three shapes,
 * because the two lines load differently and neither leaves only one trace:
 *
 *  1. a parsed `SkeletonData`. `Spine.from` on v8 parses and files it itself,
 *     under a key it builds out of the two aliases it was given;
 *  2. `{ spineData, spineAtlas }` — what `pixi-spine`'s loader returns, so what
 *     the cache holds on v6/v7;
 *  3. the raw export, still JSON. On v8 that is what the alias itself holds,
 *     because the skeleton loader there fetches bytes and parses nothing.
 */
function isSkeleton(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  // 1. Parsed. Four lists together, because any one of them alone is common.
  if (
    isArrayAt(value, 'bones') &&
    isArrayAt(value, 'slots') &&
    isArrayAt(value, 'skins') &&
    isArrayAt(value, 'animations')
  ) {
    return true;
  }

  // 2. Wrapped by the loader.
  if (isSkeletonData((value as { spineData?: unknown }).spineData)) return true;

  // 3. Raw export: the header names the editor version that wrote it.
  const header = (value as { skeleton?: unknown }).skeleton;
  return (
    typeof header === 'object' &&
    header !== null &&
    typeof (header as { spine?: unknown }).spine === 'string' &&
    isArrayAt(value, 'bones')
  );
}

/**
 * Whether a cached value is a texture atlas.
 *
 * By shape, like everything else here: an atlas is the one asset carrying a
 * list of pages, which is what `texture.ts` recognises it by as well. The key
 * is what matters rather than the value — `Spine.from` takes the name the
 * store has it under, not the atlas itself.
 */
function isAtlas(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  return Array.isArray((value as { pages?: unknown }).pages);
}

function isSkeletonData(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  return isArrayAt(value, 'bones') && isArrayAt(value, 'animations');
}

/**
 * The skeleton inside a cached value, as the thing to compare by.
 *
 * One skeleton reaches the cache under several keys: `Assets` files what it
 * loaded under both the alias the application chose and the url it came from,
 * and the loader on v6/v7 wraps the data in an object of its own. Names cannot
 * tell those apart; the parsed data can, because it is one object.
 */
function skeletonOf(value: object): object {
  const wrapped = (value as { spineData?: unknown }).spineData;
  return typeof wrapped === 'object' && wrapped !== null ? wrapped : value;
}

/**
 * Which of several names for one skeleton to show.
 *
 * A url is what the file came from; an alias is what the application decided to
 * call it — and an alias is also what its own `changeSkeleton` is likely to
 * take, so it wins where there is one.
 */
function isAlias(name: string): boolean {
  return !name.includes('/') && !name.includes('.');
}

function fromRecord(resources: unknown, into: Entry[]): boolean {
  if (typeof resources !== 'object' || resources === null) return false;

  for (const [key, value] of Object.entries(resources as Record<string, unknown>)) {
    if (key !== '') into.push({ name: key, value });
  }

  return true;
}

/**
 * Everywhere the page might be keeping what it loaded, as name/value pairs.
 *
 * Every place is read on every version rather than branched on: a v7
 * application is free to use the old loader, and looking in an absent place
 * costs nothing. The same reasoning `atlasHolders` gives.
 *
 */
function entries(candidate: PixiCandidate): { found: Entry[] } {
  const found: Entry[] = [];

  const module = (typeof candidate.pixi === 'object' && candidate.pixi !== null
    ? candidate.pixi
    : {}) as Record<string, unknown>;

  // v7/v8. `Cache` exposes `get` but nothing that enumerates, so its private
  // `_cache` is what there is — as in `cacheValues` on the v8 adapter.
  const cache = (module['Cache'] ?? (module['Assets'] as { cache?: unknown } | undefined)?.cache) as
    | { _cache?: unknown }
    | undefined;

  if (cache?._cache instanceof Map) {
    for (const [key, value] of cache._cache as Map<unknown, unknown>) {
      if (typeof key === 'string' && key !== '') found.push({ name: key, value });
    }
  }

  // v6 has no `Assets` at all and keeps loaded resources on the shared loader.
  fromRecord((module['Loader'] as { shared?: { resources?: unknown } } | undefined)?.shared?.resources, found);

  /*
   * And the application's own loader, which is the only one of these that does
   * **not** live on the module.
   *
   * That is what makes it worth reading: a bundled v6 game publishes no `PIXI`,
   * so every path above is shut, and until this one the skeleton chooser was
   * dead on exactly the games it was asked for. `Application` carried a loader
   * of its own through v5 and v6.
   */
  const app = candidate.app as { loader?: { resources?: unknown } } | undefined;
  fromRecord(app?.loader?.resources, found);

  return { found };
}

/**
 * A key `Spine.from` built for itself, rather than one the application chose.
 *
 * v8 files the parsed skeleton under `` `${skeleton}-${atlas}-${scale}` `` — the
 * two aliases it was handed and a number. That key names the same skeleton the
 * alias already names, and no application would accept it as a skeleton's name,
 * so listing it would put a second, unusable entry beside every real one.
 */
function isDerivedKey(name: string, known: ReadonlySet<string>): boolean {
  const lastDash = name.lastIndexOf('-');
  if (lastDash <= 0) return false;
  if (!Number.isFinite(Number(name.slice(lastDash + 1)))) return false;

  const rest = name.slice(0, lastDash);
  const middleDash = rest.lastIndexOf('-');
  if (middleDash <= 0) return false;

  return known.has(rest.slice(0, middleDash));
}

/**
 * @returns the skeletons the store holds, with the value it holds for each, and
 * the keys its atlases are under.
 *
 * The skeleton's value comes along because a skeleton already parsed is a
 * skeleton that needs no reading: it is the one route to a binary `.skel` on
 * v6/v7, whose `Spine` takes a `SkeletonData` and offers nothing that builds
 * one. The atlas keys come along because on v8 the alias holds the **raw**
 * export, and turning that into a skeleton means handing the runtime an atlas
 * to go with it.
 *
 * Only half the answer: `Assets` lives on the PixiJS module, and a bundled game
 * publishes none — on such a page this is empty however many skeletons are
 * loaded. What the browser recorded fetching fills the gap; see
 * `scene/spine/loaded.ts`.
 */
export function spineStore(candidate: PixiCandidate): SpineStore {
  const { found: all } = entries(candidate);
  const names = new Set(all.map((entry) => entry.name));

  // Keyed by the skeleton rather than by the name, so the several keys one
  // skeleton is filed under collapse into the one worth showing.
  const chosen = new Map<object, string>();

  for (const entry of all) {
    if (typeof entry.value !== 'object' || entry.value === null) continue;
    if (!isSkeleton(entry.value)) continue;
    if (isDerivedKey(entry.name, names)) continue;

    const skeleton = skeletonOf(entry.value);
    const held = chosen.get(skeleton);
    if (held === undefined || (!isAlias(held) && isAlias(entry.name))) {
      chosen.set(skeleton, entry.name);
    }
  }

  // Aliases first: an application's own name is the likelier key, and the
  // first pairing that builds is the one taken.
  const atlases = all
    .filter((entry) => isAtlas(entry.value))
    .map((entry) => entry.name)
    .sort((left, right) => Number(isAlias(right)) - Number(isAlias(left)));

  return {
    skeletons: [...chosen].map(([data, name]) => ({ name, data })),
    atlases: [...new Set(atlases)],
  };
}
