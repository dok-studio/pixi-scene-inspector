import { createSurface, linear, solid } from './raster.mjs';
import { pointAt, span, TAIL_AT, TAIL_FROM } from './coilGeometry.mjs';
import { COIL, regionOf } from './regions.mjs';

/**
 * The logo's snake: a body coiled into a ring, with the head rising out of it.
 *
 * A separate page and skeleton from the one on the board. The mascot used to be
 * the game's own head wearing the other skin, which made the logo a copy of the
 * thing sitting right underneath it — a logo should say what the game is, not
 * repeat what is already on screen.
 *
 * The coil is built from overlapping discs walked around an ellipse rather than
 * from a ring primitive. That costs nothing the rasteriser does not already do,
 * and it comes out better: the discs read as segments of a body, tapering to the
 * tail, which a smooth torus never would.
 */

const SKIN = {
  rim: '#07231a',
  body: ['#a6f7d2', '#35ad7c', '#0e4d34'],
  head: ['#bdfbe0', '#2f9e6b'],
  iris: '#ffd43b',
};

/**
 * A stretch of the body, drawn as overlapping discs.
 *
 * `origin` is the point of the curve that the middle of the region stands for —
 * which is also where the bone carrying this piece sits, so every attachment
 * can stay at its bone's origin and the two pieces line up by construction
 * rather than by adjustment.
 *
 * Drawn thin end first, so the thicker discs overlap the thinner ones the way a
 * real coil stacks.
 */
function drawBody(surface, region, ts, origin) {
  const midX = region.x + region.w / 2;
  const midY = region.y + region.h / 2;

  for (const t of [...ts].reverse()) {
    const point = pointAt(t);
    // Skeleton space to texture space: shift by the origin, and flip Y.
    const px = midX + (point.x - origin.x);
    const py = midY - (point.y - origin.y);
    const radius = point.radius;

    surface.fillEllipse({ cx: px, cy: py, rx: radius, ry: radius }, solid(SKIN.rim));
    surface.fillEllipse(
      { cx: px, cy: py, rx: radius - 1.6, ry: radius - 1.6 },
      linear({
        from: [px, py - radius],
        to: [px, py + radius],
        stops: [
          [0, SKIN.body[0]],
          [0.5, SKIN.body[1]],
          [1, SKIN.body[2]],
        ],
      }),
    );
    // A highlight along the top of each segment, which is what turns a row of
    // flat discs into something round.
    surface.fillEllipse(
      { cx: px - radius * 0.2, cy: py - radius * 0.34, rx: radius * 0.42, ry: radius * 0.24 },
      solid('#ffffff', 0.16),
    );
  }
}

/**
 * The head, in three-quarter view and facing right.
 *
 * Not the board's top-down wedge: the logo is looked at straight on, so the head
 * is seen from the side and slightly above, which is how a snake is drawn when
 * it is being a symbol rather than a game piece.
 */
function drawHead(surface, region) {
  const { x, y, w, h } = region;
  const cy = y + h * 0.54;

  const outline = (inset) => [
    [x + w - inset, cy - h * 0.06],
    [x + w * 0.62, cy - h * 0.34 + inset],
    [x + w * 0.22, cy - h * 0.3 + inset],
    [x + inset, cy + h * 0.06],
    [x + w * 0.24, cy + h * 0.34 - inset],
    [x + w * 0.72, cy + h * 0.24 - inset],
  ];

  surface.fillPolygon(outline(0), solid(SKIN.rim));
  surface.fillPolygon(
    outline(2.5),
    linear({
      from: [x, cy - h * 0.34],
      to: [x, cy + h * 0.34],
      stops: [
        [0, SKIN.head[0]],
        [1, SKIN.head[1]],
      ],
    }),
  );

  // A brow ridge over where the eye will sit, and a nostril on the snout.
  surface.fillPolygon(
    [
      [x + w * 0.3, cy - h * 0.24],
      [x + w * 0.72, cy - h * 0.18],
      [x + w * 0.66, cy - h * 0.06],
      [x + w * 0.32, cy - h * 0.1],
    ],
    solid(SKIN.body[2], 0.5),
  );
  surface.fillEllipse({ cx: x + w * 0.92, cy: cy - h * 0.04, rx: 1.8, ry: 1.4 }, solid(SKIN.rim));
}

function drawEye(surface, region) {
  const { x, y, w, h } = region;
  const cx = x + w / 2;
  const cy = y + h / 2;

  surface.fillEllipse({ cx, cy, rx: w * 0.5, ry: h * 0.5 }, solid(SKIN.rim));
  surface.fillEllipse({ cx, cy, rx: w * 0.38, ry: h * 0.38 }, solid(SKIN.iris));
  // Upright slit: the head is seen from the side here, unlike the board's.
  surface.fillEllipse({ cx, cy, rx: w * 0.12, ry: h * 0.32 }, solid('#0b0b0b'));
  surface.fillEllipse(
    { cx: cx - w * 0.14, cy: cy - h * 0.18, rx: w * 0.12, ry: h * 0.14 },
    solid('#ffffff', 0.9),
  );
}

function drawTongue(surface, region) {
  const { x, y, w, h } = region;
  const cy = y + h / 2;

  surface.fillPolygon(
    [
      [x, cy - 2.2],
      [x + w * 0.56, cy - 1.6],
      [x + w - 1, cy - h * 0.34],
      [x + w * 0.62, cy],
      [x + w - 1, cy + h * 0.34],
      [x + w * 0.56, cy + 1.6],
      [x, cy + 2.2],
    ],
    linear({
      from: [x, y],
      to: [x + w, y],
      stops: [
        [0, '#c92a2a'],
        [1, '#ff8787'],
      ],
    }),
  );
}

export function drawLogo() {
  const surface = createSurface(COIL.size, COIL.size);

  // The body in two pieces, split where the tail bone takes over.
  drawBody(surface, regionOf(COIL, 'coil'), span(0, TAIL_FROM), { x: 0, y: 0 });
  drawBody(surface, regionOf(COIL, 'coil-tail'), span(TAIL_FROM, 1), TAIL_AT);
  drawHead(surface, regionOf(COIL, 'coil-head'));
  drawEye(surface, regionOf(COIL, 'coil-eye'));
  drawTongue(surface, regionOf(COIL, 'coil-tongue'));

  return surface.toRGBA();
}
