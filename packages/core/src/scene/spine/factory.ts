import type { Node, SpineStore } from '../../adapters/types.js';
import { atlasUrlFor, exportUrlFor } from './loaded.js';
import { asSpine } from './spine.js';

/**
 * Building a Spine, using the runtime the page already has.
 *
 * There is no import to reach for: the runtime belongs to the game, not to the
 * inspector, and a bundled game publishes nothing. What it does have is a live
 * `Spine` on the scene, and **its class is reachable as that node's
 * `constructor`** — which matters more than it sounds, because the class closes
 * over the *bundle's* own `Assets` and readers. So a skeleton built this way is
 * read by the same code the game reads its own with: `.skel` and `.json` alike,
 * with no module published anywhere.
 *
 * The same doctrine the gradient goes by on v8 (`adapters/v8.ts`): find the
 * constructor honestly or answer `null`, never fake something that would look
 * right and behave wrong.
 *
 * Two callers, two fates for what comes back. `probe.ts` reads the skeleton's
 * lists off it and drops it; `testSpine.ts` puts it in the scene and keeps it. That
 * is the whole reason this is a module of its own.
 *
 * Which of the three routes below applies depends on what the page will admit
 * to. A game that publishes its PixiJS module has its asset store readable, and
 * a skeleton in there is already parsed — nothing to build but the `Spine`
 * around it, and it works on every line. A bundled game admits to nothing, and
 * then the runtime's own factory is tried against the urls the browser
 * recorded. And when even that fails, there is one party left who certainly
 * knows how to load this skeleton: **the game itself**, through the same
 * `changeSkeleton` the first tab already uses.
 *
 * They go in that order because the first two are pure. Asking the application
 * runs the application's code, which may do anything at all, so it is the last
 * thing tried rather than the first.
 */

interface SpineClass {
  new (options: unknown): object;
  from?: (options: object) => unknown;
}

/** Nothing to read: a page that publishes no module admits to none of this. */
const NOTHING: SpineStore = { skeletons: [], atlases: [] };

/**
 * The spellings a page might have filed an asset under.
 *
 * `Assets` keys by what the application handed it, and the browser's record
 * hands back an absolute url — so an application that loaded
 * `spine/hero.json` has nothing under `https://host/spine/hero.json`, and
 * asking with the wrong one gets an undefined asset and a throw from inside the
 * runtime. There is no way to read the keys back on a bundled game, so every
 * spelling one plausibly took is tried:
 *
 *  - the plain name (`hero`), which is what an alias usually is;
 *  - the file's own name with its extension (`hero.skel`), which is what a game
 *    that loaded the file by its name has it under;
 *  - the path (`/spine/hero.skel`), and the same without its leading slash,
 *    which is what a relative `src` looks like before the browser resolves it;
 *  - the whole url.
 *
 * Cheap to be wrong: a key the store does not have throws inside the runtime,
 * which is caught, and the next spelling is tried.
 */
function keysFor(url: string, name: string): string[] {
  const keys = [name];

  try {
    const parsed = new URL(url, 'http://x');
    const path = parsed.pathname + parsed.search;

    keys.push(path.slice(path.lastIndexOf('/') + 1));
    keys.push(path);
    keys.push(path.startsWith('/') ? path.slice(1) : path);
  } catch {
    // Not a url after all; the raw string below is the only other spelling.
  }

  keys.push(url);

  return [...new Set(keys)];
}

function classOf(node: Node): SpineClass | null {
  const found = (node as { constructor?: unknown }).constructor;
  return typeof found === 'function' ? (found as SpineClass) : null;
}

/**
 * A parsed `SkeletonData`, built into a Spine.
 *
 * The one route that works on every line: `pixi-spine`'s constructor takes a
 * `SkeletonData` outright, and v8's takes one too (it checks for it before
 * reading its options object). Nothing has to be parsed, because the data is
 * parsed already — which is what makes this the route for a binary `.skel` as
 * well, on runtimes that have no reader to offer.
 *
 * The data may be the node's own or another skeleton's out of the asset store;
 * neither is treated differently, because to the constructor they are the same
 * kind of thing.
 */
/**
 * The `SkeletonData` inside what the store holds.
 *
 * `pixi-spine`'s loader files `{ spineData, spineAtlas }` rather than the data
 * itself, and the constructor wants the data. On v8 the value is already what
 * it is and this changes nothing.
 */
function wrapped(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;

  const inside = (value as { spineData?: unknown }).spineData;
  return inside ?? value;
}

function fromParsed(node: Node, data: unknown): object | null {
  if (data === null || data === undefined) return null;

  const Spine = classOf(node);
  if (Spine === null) return null;

  try {
    return new Spine(data);
  } catch {
    // Not a `SkeletonData` after all, or a constructor that wants more than
    // this one knows about.
    return null;
  }
}

/**
 * Another skeleton entirely, built by the runtime's own factory.
 *
 * `Spine.from` is a static on the v8 class and has no counterpart in
 * `pixi-spine`, whose `Spine` takes a `SkeletonData` and offers nothing that
 * makes one. So on v6/v7 this is where a different skeleton stops being
 * possible — reported as `null` rather than papered over.
 *
 * It also files what it parses in the page's asset cache under a key it builds
 * itself. That is the one mark this leaves behind, and it is the same one the
 * game would leave if it built this skeleton itself; the chooser already hides
 * such keys (`isDerivedKey`).
 */
function fromAssets(
  node: Node,
  name: string,
  store: SpineStore,
  root: typeof globalThis,
): object | null {
  const Spine = classOf(node);
  if (typeof Spine?.from !== 'function') return null;

  for (const [skeleton, atlas] of pairings(name, store, root)) {
    try {
      const made = Spine.from({ skeleton, atlas });
      if (typeof made === 'object' && made !== null) return made;
    } catch {
      // Not that pairing. The next one, or nothing at all.
    }
  }

  return null;
}

/**
 * Every skeleton/atlas pair worth trying, best first.
 *
 * Nothing in either source says which atlas belongs to which skeleton — the
 * store keys them separately and the browser's record only knows what was
 * fetched — so the pairing is tried rather than known. A wrong atlas is not
 * silent: the reader throws on the first region it cannot find, which is what
 * makes trying safe enough to do.
 *
 * The store goes first because its keys are the application's own, which is
 * what `Assets` answers to; the browser's record is what is left when the page
 * publishes no module to have a store in.
 */
function* pairings(
  name: string,
  store: SpineStore,
  root: typeof globalThis,
): Generator<[string, string]> {
  for (const atlas of store.atlases) yield [name, atlas];

  const exportUrl = exportUrlFor(name, root);
  const atlasUrl = atlasUrlFor(name, root);
  if (exportUrl === undefined || atlasUrl === undefined) return;

  for (const skeleton of keysFor(exportUrl, name)) {
    for (const atlas of keysFor(atlasUrl, name)) yield [skeleton, atlas];
  }
}

/**
 * The game's own `changeSkeleton`, run on a copy rather than on its node.
 *
 * The route that needs nothing readable at all. A game that can put this
 * skeleton on its own Spine can put it on ours: the method's contract is a swap
 * **in place**, so a clone of the original — built from the `SkeletonData` it is
 * already carrying — is a node it can act on.
 *
 * Two ways it can fail, and both end in `null` rather than in a node:
 *
 *  - the method is on the instance rather than the class, so a clone does not
 *    have it. Nothing to do about that from here;
 *  - it answers `true` and changes nothing — an implementation that loads
 *    asynchronously, say. Handing back a clone still wearing the original's
 *    skeleton, under the name of another, would be worse than refusing, so what
 *    it actually did is checked rather than what it said.
 */
function fromApplication(node: Node, name: string): object | null {
  const made = fromParsed(node, asSpine(node)?.skeleton.data);
  const spine = made === null ? null : asSpine(made);
  if (made === null || spine === null || typeof spine.changeSkeleton !== 'function') return null;

  const before = spine.skeleton.data;

  try {
    if (spine.changeSkeleton(name) === false) return null;
  } catch {
    // A name the application does not know, answered with a throw.
    return null;
  }

  return asSpine(made)?.skeleton.data === before ? null : made;
}

/**
 * @param skeleton the name to build, or null for the one the node carries.
 * @param store what the page's asset store is holding. Empty is the honest
 * answer for a game that publishes no module, and then the browser's own record
 * of what it fetched is all there is to go on.
 * @returns the built Spine, or null when nothing here could build that one.
 */
export function buildSpine(
  node: Node,
  skeleton: string | null,
  store: SpineStore = NOTHING,
  root: typeof globalThis = globalThis,
): object | null {
  if (skeleton === null) return fromParsed(node, asSpine(node)?.skeleton.data);

  const held = store.skeletons.find((source) => source.name === skeleton);
  const parsed = held === undefined ? null : fromParsed(node, wrapped(held.data));

  return parsed ?? fromAssets(node, skeleton, store, root) ?? fromApplication(node, skeleton);
}
