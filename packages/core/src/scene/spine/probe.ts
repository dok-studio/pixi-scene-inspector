import type { Node, SpineStore } from '../../adapters/types.js';
import { buildSpine } from './factory.js';
import { asSpine } from './spine.js';

/**
 * What a skeleton can do, when the node is not carrying it.
 *
 * Choosing a skeleton in the panel is a choice rather than an act — nothing
 * reaches the scene until Apply — so between the two the animations to choose
 * from belong to a skeleton nothing has loaded. There is no `SkeletonData` on
 * the node to read them off, and asking the node anyway is what showed the
 * previous skeleton's animations on a freshly added track.
 *
 * Three ways in, tried in that order, because each covers what the one before it
 * cannot:
 *
 *  1. **the asset store already holds it parsed.** Nothing to do but read. This
 *     is the only route that reads a binary `.skel` on v6/v7, whose `Spine`
 *     takes a `SkeletonData` and offers nothing that builds one;
 *  2. **the runtime builds one, off the scene** (`factory.ts`). It reads
 *     `.skel` and `.json` alike, and needs no PixiJS module — the class comes
 *     from the live node and closes over the bundle's own readers;
 *  3. **the export is read as plain JSON.** No runtime involved at all, so it
 *     works anywhere — and only for `.json`, since a binary export needs the
 *     reader the first two routes have and this one does not.
 *
 * Nothing here touches the node. Route 2 builds a `Spine` and never adds it to
 * anything; dropping the reference is what disposes of it, and `destroy()` is
 * deliberately not called — the atlas textures behind it belong to the game, and
 * a probe has no business tearing them down. (A **test** Spine is built the same
 * way and kept, which is `testSpine.ts`'s business, not this one's.)
 */

export interface Probed {
  animations: Array<{ name: string; duration: number }>;
  skins: string[];
  events: string[];
  /** Nothing to say yet: an answer is being fetched. Ask again shortly. */
  pending: boolean;
}

interface DataLike {
  animations?: Array<{ name?: unknown; duration?: unknown }>;
  skins?: Array<{ name?: unknown }>;
  events?: Array<{ name?: unknown }>;
}

const names = (list: Array<{ name?: unknown }> | undefined): string[] =>
  (list ?? []).map((one) => (typeof one.name === 'string' ? one.name : '')).filter((n) => n !== '');

function fromData(data: DataLike): Probed {
  return {
    animations: (data.animations ?? [])
      .filter((one) => typeof one.name === 'string')
      .map((one) => ({
        name: one.name as string,
        duration: typeof one.duration === 'number' ? one.duration : 0,
      })),
    skins: names(data.skins),
    events: names(data.events),
    pending: false,
  };
}

/** A parsed `SkeletonData`, told from a raw export by its lists being lists. */
function asData(value: unknown): DataLike | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as DataLike;
  return Array.isArray(candidate.animations) && Array.isArray(candidate.skins)
    ? candidate
    : null;
}

/**
 * Route 2: the runtime's own reader, through the class the node is an instance
 * of. The building is `factory.ts`'s; this only reads what came back and lets
 * it go.
 */
function build(node: Node, name: string, store: SpineStore, root: typeof globalThis): Probed | null {
  const made = buildSpine(node, name, store, root);
  const data = made === null ? null : asData((made as { skeleton?: { data?: unknown } }).skeleton?.data);

  return data === null ? null : fromData(data);
}

/**
 * What the runtime route has already answered, and what it has already refused.
 *
 * Both are worth remembering. `spine.info` is asked again on every poll, so
 * without this a skeleton that builds would be built afresh each time — a whole
 * `Skeleton` and `AnimationState` thrown away twice a second — and one that
 * does not would be tried, and would throw, just as often.
 */
const built = new Map<string, Probed>();

/**
 * A refusal, and **when** it was refused.
 *
 * A plain set of names was wrong in the case that matters most: a skeleton
 * whose atlas had not finished loading refuses once and would then never be
 * tried again for the life of the page, however complete it became a second
 * later. The panel is polling, so the cheapest honest answer is to let a
 * refusal go stale — often enough that a page which has finished loading gets a
 * second chance, rarely enough that a skeleton nothing can build is not rebuilt
 * on every poll.
 */
const refusedAt = new Map<string, number>();

const REFUSAL_TTL_MS = 5000;

function isRefused(name: string, now: number): boolean {
  const at = refusedAt.get(name);
  if (at === undefined) return false;

  if (now - at < REFUSAL_TTL_MS) return true;

  refusedAt.delete(name);
  return false;
}

/**
 * @param store what the asset store is holding.
 * @returns null when there is nothing to say and nothing on the way.
 */
export function probeSkeleton(
  node: Node,
  name: string,
  store: SpineStore,
  readExport: (name: string) => Probed | null,
  root: typeof globalThis = globalThis,
): Probed | null {
  if (asSpine(node) === null) return null;

  const held = store.skeletons.find((source) => source.name === name);
  const data = held === undefined ? null : asData(held.data);
  if (data !== null) return fromData(data);

  const remembered = built.get(name);
  if (remembered !== undefined) return remembered;

  if (!isRefused(name, Date.now())) {
    const made = build(node, name, store, root);
    if (made !== null) {
      built.set(name, made);
      return made;
    }

    refusedAt.set(name, Date.now());
  }

  return readExport(name);
}
