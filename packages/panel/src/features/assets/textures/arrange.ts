import type { TextureInfo } from '@scene-inspector/protocol';

import { baseName } from '../../../lib/textureName.js';

/**
 * What the toolbar above the grid actually does: filter by GPU state and by
 * whether the texture has a name at all, narrow by a search, and sort by one
 * column at a time.
 *
 * All of it is pure and lives here rather than in the component, for the same
 * reason the property filter does — this is the part with rules in it, and the
 * markup around it is what the stand verifies.
 */

export type Channel = 'both' | 'loaded' | 'unloaded';

/**
 * Whether a texture has a name worth showing.
 *
 * Both directions are worth asking for, which is why this is a choice of three
 * rather than one switch. `unnamed` finds what the page never labelled — render
 * targets, generated canvases, the things that turn up as a wall of "Unnamed"
 * and are the ones nobody can account for. `named` is the other half of the
 * same question: the assets the game actually loaded, with that wall out of the
 * way.
 */
export type Naming = 'all' | 'named' | 'unnamed';
export type Direction = 'asc' | 'desc';
export type SortKey = 'latest' | 'name' | 'size';

/**
 * How the grid is ordered. Always one of these, never nothing.
 *
 * The toolbar used to have an "off" as well, reached by clicking a column a
 * third time — and off was `latest` ascending in disguise: both hand back the
 * list in the order the renderer keeps it. A third state that changes nothing
 * is a third state to explain, so it is gone.
 */
export interface Sort {
  key: SortKey;
  direction: Direction;
}

/**
 * Every choice the toolbar can be in, which is what the grid hands over.
 *
 * There is no filter by format, and there was one for an afternoon. A format is
 * a bare GL constant on v6/v7 (`6408`), and the one thing worth finding on v8 —
 * a compressed texture, whose bytes the size tables cannot count — already
 * announces itself as a GPU size of "unknown". The row stays in the pane on the
 * right, where an occasional question can be answered without a control in the
 * toolbar standing by for it.
 */
export interface Arrangement {
  search: string;
  channel: Channel;
  naming: Naming;
  sort: Sort;
}

/**
 * The name a texture is shown under.
 *
 * An unnamed texture still needs something to be sorted and searched by, hence
 * the fallback; the shortening itself is `baseName`, which the Sprite picker
 * shares.
 */
export function textureName(texture: TextureInfo): string {
  const last = baseName(texture.label);
  return last === '' ? 'Unnamed' : last;
}

/** What the grid captions "Unnamed", asked as a question rather than compared. */
function isUnnamed(texture: TextureInfo): boolean {
  return baseName(texture.label) === '';
}

/**
 * Case-insensitive, over the full label so a folder name finds its atlas, and
 * **every word has to match**.
 *
 * One `includes` could not find `hero` in `ui/` — the words of a name arrive in
 * whatever order the path puts them, so a search for two of them was a search
 * for one exact substring containing both. Splitting on spaces makes the query
 * a set of conditions instead of a phrase, which is how "atlas png" finds
 * `sprites/atlas/hero.png` without knowing what lies between the two.
 */
function matches(texture: TextureInfo, search: string): boolean {
  const terms = search.toLowerCase().split(/\s+/).filter((term) => term !== '');
  if (terms.length === 0) return true;

  const haystack = `${texture.label} ${textureName(texture)}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function inChannel(texture: TextureInfo, channel: Channel): boolean {
  if (channel === 'both') return true;
  return channel === 'loaded' ? texture.isLoaded : !texture.isLoaded;
}

function inNaming(texture: TextureInfo, naming: Naming): boolean {
  if (naming === 'all') return true;
  return naming === 'unnamed' ? isUnnamed(texture) : !isUnnamed(texture);
}

/**
 * An unknown size sorts as the smallest.
 *
 * `gpuSize` is null when the format is not in the tables — compressed data,
 * mostly — and a null that sorted as "huge" would push exactly the textures
 * nothing is known about to the top of a size-ordered list.
 */
function sizeOf(texture: TextureInfo): number {
  return texture.gpuSize ?? -1;
}

function compare(a: TextureInfo, b: TextureInfo, key: SortKey): number {
  switch (key) {
    case 'name':
      return textureName(a).localeCompare(textureName(b));
    case 'size':
      return sizeOf(a) - sizeOf(b);
    // The renderer appends, so its own order is oldest-first.
    case 'latest':
      return 0;
  }
}

/**
 * What settles two textures the chosen column cannot tell apart.
 *
 * Without it a page of same-sized tiles was in a different order every second:
 * `Array.prototype.sort` is stable, but the list it sorts is rebuilt by each
 * poll, and the renderer is free to hand its textures over in another order.
 * The id is the last word because two textures can genuinely share a name.
 *
 * Deliberately **not** reversed along with the column: a descending sort is a
 * statement about size, and answering it with names running backwards makes
 * the tie look like part of the ordering rather than the absence of one.
 */
function tieBreak(a: TextureInfo, b: TextureInfo): number {
  return textureName(a).localeCompare(textureName(b)) || a.id - b.id;
}

export function arrangeTextures(
  textures: readonly TextureInfo[],
  options: Arrangement,
): TextureInfo[] {
  const { search, channel, naming, sort } = options;

  const result = textures.filter(
    (texture) =>
      inChannel(texture, channel) && inNaming(texture, naming) && matches(texture, search),
  );

  // `latest` has no comparison of its own — the list arrives in the order the
  // renderer holds it, and newest-first is that order reversed. Sorting by a
  // comparator that returns 0 would be a no-op, so it is spelled out.
  if (sort.key === 'latest') {
    return sort.direction === 'desc' ? result.reverse() : result;
  }

  const sign = sort.direction === 'desc' ? -1 : 1;
  result.sort((a, b) => compare(a, b, sort.key) * sign || tieBreak(a, b));
  return result;
}
