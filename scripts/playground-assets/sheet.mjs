import { createSurface, linear, solid } from './raster.mjs';
import { FRAME, regionOf, SHEET, TILE } from './regions.mjs';

/**
 * The game's own art: the snake's body, the berry it eats, the spark it throws
 * off, the floor it runs on and the frame the score sits in.
 *
 * Two of these are pages of their own rather than regions on the sheet, and for
 * different reasons. The tile has to repeat, which needs a texture whose
 * `addressMode` can be `repeat` — a frame cut out of a sheet cannot do that,
 * the wrap would pull in its neighbours. The frame is nine-sliced, and slicing
 * reads the texture's own edges, so it needs edges of its own.
 */

/** A body segment: a rounded square lit from the top left, with a rim. */
function drawSegment(surface, region, { core, rim, size }) {
  const { x, y, w } = region;
  const inset = (w - size) / 2;

  surface.fillRoundRect(
    { x: x + inset, y: y + inset, w: size, h: size, r: size * 0.34 },
    solid(rim),
  );
  surface.fillRoundRect(
    { x: x + inset + 2, y: y + inset + 2, w: size - 4, h: size - 4, r: size * 0.3 },
    linear({
      from: [x + inset, y + inset],
      to: [x + inset + size, y + inset + size],
      stops: [
        [0, core[0]],
        [1, core[1]],
      ],
    }),
  );
}

/** The berry, at four sizes: an `AnimatedSprite` pulsing on the floor. */
function drawBerry(surface, region, scale) {
  const { x, y, w, h } = region;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = (w / 2 - 3) * scale;

  surface.fillEllipse({ cx, cy, rx: r, ry: r }, solid('#7a1020'));
  surface.fillEllipse(
    { cx, cy, rx: r - 1.5, ry: r - 1.5 },
    linear({
      from: [cx - r, cy - r],
      to: [cx + r, cy + r],
      stops: [
        [0, '#ff8787'],
        [0.55, '#f03e3e'],
        [1, '#a61e28'],
      ],
    }),
  );
  // The highlight is what makes it read as round rather than as a disc.
  surface.fillEllipse(
    { cx: cx - r * 0.32, cy: cy - r * 0.36, rx: r * 0.26, ry: r * 0.2 },
    solid('#ffffff', 0.72),
  );
}

export function drawSheet() {
  const surface = createSurface(SHEET.size, SHEET.size);

  drawSegment(surface, regionOf(SHEET, 'segment'), {
    core: ['#6ee7a8', '#1c7f52'],
    rim: '#0d3b26',
    size: 28,
  });
  drawSegment(surface, regionOf(SHEET, 'segment-tail'), {
    core: ['#4fd18b', '#155f3d'],
    rim: '#0d3b26',
    size: 20,
  });

  drawBerry(surface, regionOf(SHEET, 'berry-0'), 1);
  drawBerry(surface, regionOf(SHEET, 'berry-1'), 0.92);
  drawBerry(surface, regionOf(SHEET, 'berry-2'), 0.84);
  drawBerry(surface, regionOf(SHEET, 'berry-3'), 0.92);

  const spark = regionOf(SHEET, 'spark');
  surface.fillEllipse(
    { cx: spark.x + spark.w / 2, cy: spark.y + spark.h / 2, rx: 6, ry: 6 },
    linear({
      from: [spark.x, spark.y],
      to: [spark.x + spark.w, spark.y + spark.h],
      stops: [
        [0, '#fff3bf'],
        [1, '#f59f00'],
      ],
    }),
  );

  return surface.toRGBA();
}

/**
 * The floor tile.
 *
 * Drawn so that it repeats without a seam: the grid lines sit on two edges
 * only, so a tile's right edge meets its neighbour's left without doubling.
 */
export function drawTile() {
  const surface = createSurface(TILE.size, TILE.size);
  const size = TILE.size;

  surface.fillRoundRect({ x: 0, y: 0, w: size, h: size, r: 0 }, solid('#141a23'));
  surface.fillRoundRect({ x: 0, y: 0, w: size, h: 1, r: 0 }, solid('#1e2733'));
  surface.fillRoundRect({ x: 0, y: 0, w: 1, h: size, r: 0 }, solid('#1e2733'));
  // A faint centre mark, so the grid reads as cells rather than as a texture.
  surface.fillRoundRect(
    { x: size / 2 - 1, y: size / 2 - 1, w: 2, h: 2, r: 1 },
    solid('#243040'),
  );

  return surface.toRGBA();
}

/**
 * The HUD frame, for a `NineSliceSprite`.
 *
 * Corners are the rounded border; the middle of every edge is a single flat
 * column or row, which is what nine-slicing stretches. Keeping those bands
 * plain is what stops the frame smearing when it is stretched.
 */
export function drawFrame() {
  const surface = createSurface(FRAME.size, FRAME.size);
  const size = FRAME.size;

  surface.fillRoundRect({ x: 0, y: 0, w: size, h: size, r: 12 }, solid('#2b3a4a'));
  surface.fillRoundRect({ x: 1.5, y: 1.5, w: size - 3, h: size - 3, r: 10.5 }, solid('#111721', 0.94));

  return surface.toRGBA();
}
