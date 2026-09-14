import type { Spritesheet, Texture } from 'pixi.js';
import { Assets } from 'pixi.js';

/**
 * Everything the game loads, over HTTP, from `public/`.
 *
 * Over HTTP on purpose rather than inlined or drawn into a canvas at runtime.
 * The inspector finds Spine skeletons by watching the browser's own record of
 * what the page fetched, keyed on the `.atlas` extension — a skeleton that
 * never crosses the network is a skeleton its chooser cannot offer. Real files
 * also give every texture a `sourceKind` of `image` and a url, which is what
 * fills in the Assets tab: a preview, a weight, a list of frames.
 */

export interface GameAssets {
  sheet: Spritesheet;
  tile: Texture;
  frame: Texture;
}

export interface SpineAssets {
  skeleton: string;
  atlas: string;
}

/** The aliases the snake's head is built from. Named here so nothing repeats them. */
export const SPINE_ALIASES: SpineAssets = {
  skeleton: 'dragonSkeleton',
  atlas: 'dragonAtlas',
};

/**
 * The logo's own skeleton.
 *
 * A second one on purpose: it is what gives the panel's skeleton chooser more
 * than a single entry, and the tree two Spine nodes that keep different time.
 */
export const LOGO_ALIASES: SpineAssets = {
  skeleton: 'coilSkeleton',
  atlas: 'coilAtlas',
};

export async function loadGameAssets(): Promise<GameAssets> {
  const [sheet, tile, frame] = await Promise.all([
    Assets.load<Spritesheet>('/game/sheet.json'),
    Assets.load<Texture>('/game/tile.png'),
    Assets.load<Texture>('/game/frame.png'),
  ]);

  // The floor repeats, and a texture can only wrap if its source says so.
  tile.source.addressMode = 'repeat';

  return { sheet, tile, frame };
}

/**
 * The skeleton and its atlas.
 *
 * Kept apart from the rest because it is the one load allowed to fail without
 * taking the stand with it: the Spine runtime is a separate dependency, and a
 * playground that shows nothing because a skeleton is missing is harder to
 * diagnose than one that shows a game with no head on it.
 */
export async function loadSpineAssets(): Promise<boolean> {
  try {
    await Assets.load([
      { alias: SPINE_ALIASES.skeleton, src: '/dragon/dragon.json' },
      { alias: SPINE_ALIASES.atlas, src: '/dragon/dragon.atlas' },
      { alias: LOGO_ALIASES.skeleton, src: '/logo/coil.json' },
      { alias: LOGO_ALIASES.atlas, src: '/logo/coil.atlas' },
    ]);

    return true;
  } catch (error) {
    console.error('[playground] the dragon skeleton failed to load', error);
    return false;
  }
}
