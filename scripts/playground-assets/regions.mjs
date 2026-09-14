/**
 * Where every piece of art sits on its page.
 *
 * **This table is the single source of truth**, and that is the point of the
 * file. The dragon's page is written from it, the `.atlas` beside it is written
 * from it, and the skeleton's attachments take their `path`, `width` and
 * `height` from it too. The most common way to break a hand-written Spine
 * export is for a region's name or size to drift from what the skeleton claims,
 * and here there is nowhere for it to drift to.
 */

/** The game's sheet: the snake's body, the berry's frames, a spark. */
export const SHEET = {
  file: 'sheet.png',
  size: 256,
  regions: [
    { name: 'segment', x: 0, y: 0, w: 32, h: 32 },
    { name: 'segment-tail', x: 32, y: 0, w: 32, h: 32 },
    { name: 'berry-0', x: 64, y: 0, w: 32, h: 32 },
    { name: 'berry-1', x: 96, y: 0, w: 32, h: 32 },
    { name: 'berry-2', x: 128, y: 0, w: 32, h: 32 },
    { name: 'berry-3', x: 160, y: 0, w: 32, h: 32 },
    { name: 'spark', x: 192, y: 0, w: 16, h: 16 },
  ],
};

/**
 * The dragon's page.
 *
 * Two skins share it: `default` and `ember` differ only in which regions their
 * attachments point at, so both sets live on one sheet and switching skin costs
 * no texture at all.
 */
export const DRAGON = {
  file: 'dragon.png',
  size: 256,
  regions: [
    { name: 'head', x: 0, y: 0, w: 96, h: 72 },
    { name: 'head-ember', x: 96, y: 0, w: 96, h: 72 },
    { name: 'jaw-upper', x: 0, y: 72, w: 52, h: 30 },
    { name: 'jaw-lower', x: 52, y: 72, w: 52, h: 30 },
    { name: 'brow', x: 104, y: 72, w: 34, h: 18 },
    { name: 'tongue', x: 140, y: 72, w: 22, h: 34 },
    { name: 'eye', x: 164, y: 72, w: 18, h: 14 },
    { name: 'eye-ember', x: 184, y: 72, w: 18, h: 14 },
  ],
};

/**
 * The logo's snake, coiled.
 *
 * A page and a skeleton of its own rather than another skin on the dragon: the
 * mascot used to be the same head in a different colour, which made the logo a
 * copy of the thing already on the board. A second skeleton also gives the
 * panel something it otherwise has none of — a skeleton chooser with more than
 * one entry in it, and a second Spine node keeping its own time.
 */
export const COIL = {
  file: 'coil.png',
  size: 192,
  regions: [
    { name: 'coil', x: 0, y: 0, w: 96, h: 72 },
    // The tail is a region of its own so that a bone can own it — see the
    // second track in `logoSkeleton.mjs`. Left as part of the coil's image, it
    // could only be waved by moving the whole body.
    { name: 'coil-tail', x: 96, y: 0, w: 64, h: 48 },
    { name: 'coil-head', x: 0, y: 72, w: 48, h: 40 },
    { name: 'coil-eye', x: 48, y: 72, w: 14, h: 12 },
    { name: 'coil-tongue', x: 62, y: 72, w: 16, h: 22 },
  ],
};

/** The two textures that may not live on a sheet — see `sheet.mjs`. */
export const TILE = { file: 'tile.png', size: 64 };
export const FRAME = { file: 'frame.png', size: 48 };

export function regionOf(page, name) {
  const found = page.regions.find((region) => region.name === name);
  if (found === undefined) throw new Error(`${page.file} has no region "${name}"`);

  return found;
}

/** Writes the libgdx-style atlas a Spine runtime reads. */
export function atlasText(page) {
  const lines = [
    page.file,
    `size: ${page.size},${page.size}`,
    'format: RGBA8888',
    'filter: Linear,Linear',
    'repeat: none',
  ];

  for (const { name, x, y, w, h } of page.regions) {
    lines.push(
      name,
      '  rotate: false',
      `  xy: ${x}, ${y}`,
      `  size: ${w}, ${h}`,
      `  orig: ${w}, ${h}`,
      '  offset: 0, 0',
      '  index: -1',
    );
  }

  return `${lines.join('\n')}\n`;
}

/** The spritesheet manifest PixiJS reads, from the same table. */
export function sheetManifest(page) {
  const frames = {};

  for (const { name, x, y, w, h } of page.regions) {
    frames[name] = {
      frame: { x, y, w, h },
      sourceSize: { w, h },
      spriteSourceSize: { x: 0, y: 0, w, h },
    };
  }

  return {
    frames,
    meta: {
      image: page.file,
      format: 'RGBA8888',
      size: { w: page.size, h: page.size },
      scale: '1',
    },
  };
}
