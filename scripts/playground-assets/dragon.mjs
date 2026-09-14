import { createSurface, linear, solid } from './raster.mjs';
import { DRAGON, regionOf } from './regions.mjs';

/**
 * A snake's head, drawn from above.
 *
 * From above is the whole reason this art exists rather than being borrowed.
 * Every ready-made Spine example is drawn from the side, and a side-on
 * character next to a top-down arena always reads as a sticker. Here the head
 * *is* the snake's head, so it shares the arena's point of view.
 *
 * It faces **right**, along +X, matching PixiJS's own convention — a rotation
 * of zero points right — so the game sets `head.rotation` to the direction of
 * travel with no offset to remember.
 *
 * **The silhouette is the thing.** The first attempt built the head from a
 * round skull and two heavy hinged jaws, and it read as a crocodile. A snake's
 * head is a wedge: widest at the back where the venom glands sit, tapering to a
 * blunt snout, with the eyes high on the sides rather than facing forward. So
 * the skull here is a polygon rather than an ellipse, the jaws are slim
 * tapering wedges rather than slabs, and the horns are gone — replaced by low
 * brow ridges.
 */

const SKINS = {
  default: {
    rim: '#08251b',
    scale: ['#9df5c8', '#34a878', '#0f5137'],
    belly: ['#c8ffe6', '#59c294'],
    jaw: ['#63cf9b', '#14603f'],
    brow: '#0d3f2c',
    iris: '#ffd43b',
  },
  ember: {
    rim: '#2a0c02',
    scale: ['#ffd9a8', '#e8590c', '#7a2708'],
    belly: ['#ffe9cf', '#f08c3a'],
    jaw: ['#f4a261', '#9a3412'],
    brow: '#5a2109',
    iris: '#ff3b30',
  },
};

/**
 * The skull outline: a wedge, running clockwise from the snout.
 *
 * The two rear corners are what make it a snake — pulled well past the width of
 * the neck, they are the shape the eye reads before it has looked at anything
 * else. `inset` walks the same outline inwards, which is how the rim is drawn
 * without any stroke code.
 */
function skullOutline(x, y, w, h, inset = 0) {
  const cy = y + h / 2;
  const i = inset;

  return [
    [x + w - i, cy],
    [x + w * 0.74, cy - h * 0.3 + i * 0.6],
    [x + w * 0.3, cy - h * 0.5 + i],
    [x + w * 0.08 + i, cy - h * 0.34 + i],
    [x + i, cy],
    [x + w * 0.08 + i, cy + h * 0.34 - i],
    [x + w * 0.3, cy + h * 0.5 - i],
    [x + w * 0.74, cy + h * 0.3 - i * 0.6],
  ];
}

function drawHead(surface, region, skin) {
  const { x, y, w, h } = region;
  const cy = y + h / 2;

  surface.fillPolygon(skullOutline(x, y, w, h), solid(skin.rim));
  surface.fillPolygon(
    skullOutline(x, y, w, h, 3),
    linear({
      from: [x, cy - h * 0.5],
      to: [x, cy + h * 0.5],
      stops: [
        [0, skin.scale[0]],
        [0.5, skin.scale[1]],
        [1, skin.scale[2]],
      ],
    }),
  );

  // A pale band down the spine, narrowing towards the snout: it gives the wedge
  // a direction, so the head reads as pointing somewhere even when it is still.
  surface.fillPolygon(
    [
      [x + w * 0.9, cy],
      [x + w * 0.45, cy - h * 0.1],
      [x + w * 0.1, cy - h * 0.16],
      [x + w * 0.1, cy + h * 0.16],
      [x + w * 0.45, cy + h * 0.1],
    ],
    linear({
      from: [x + w * 0.1, y],
      to: [x + w * 0.9, y],
      stops: [
        [0, skin.belly[1]],
        [1, skin.belly[0]],
      ],
    }),
  );

  for (const side of [-1, 1]) {
    surface.fillEllipse(
      { cx: x + w * 0.9, cy: cy + side * h * 0.09, rx: 2.2, ry: 1.7 },
      solid(skin.rim),
    );
  }

  // Scale texture: soft plates across the widest part of the skull.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      surface.fillEllipse(
        {
          cx: x + w * (0.24 + i * 0.16),
          cy: cy + side * h * (0.3 - i * 0.04),
          rx: w * 0.07,
          ry: h * 0.05,
        },
        solid(skin.scale[0], 0.22),
      );
    }
  }
}

/**
 * A jaw: a slim wedge tapering to the snout, with recurved teeth.
 *
 * `side` is -1 for the lower jaw and 1 for the upper, which flips the outline
 * about the middle of the region rather than needing two of everything.
 */
function drawJaw(surface, region, skin, { side }) {
  const { x, y, w, h } = region;
  const base = side < 0 ? y + h : y;
  const tip = side < 0 ? y + h * 0.28 : y + h * 0.72;

  const outline = (inset) => [
    [x + inset, base - side * inset],
    [x + w - inset, tip],
    [x + w - inset, tip + side * h * 0.22],
    [x + inset, base - side * (inset + h * 0.16)],
  ];

  surface.fillPolygon(outline(0), solid(skin.rim));
  surface.fillPolygon(
    outline(2.5),
    linear({
      from: [x, y],
      to: [x, y + h],
      stops: [
        [0, skin.jaw[side < 0 ? 1 : 0]],
        [1, skin.jaw[side < 0 ? 0 : 1]],
      ],
    }),
  );

  // A fang at the front and smaller teeth behind it, all curving back — which
  // is what separates a snake's mouth from a row of pegs.
  const toothY = base - side * 3;

  surface.fillPolygon(
    [
      [x + w * 0.74, toothY],
      [x + w * 0.86, tip + side * h * 0.05],
      [x + w * 0.78, tip + side * h * 0.05],
    ],
    solid('#ffffff', 0.92),
  );

  for (let i = 0; i < 3; i += 1) {
    const tx = x + w * (0.3 + i * 0.14);

    surface.fillPolygon(
      [
        [tx, toothY],
        [tx + 5, toothY],
        [tx + 2.5, toothY - side * h * 0.16],
      ],
      solid('#f1f3f5', 0.8),
    );
  }
}

/** The eye: small, high on the side, with a slit that runs along the snout. */
function drawEye(surface, region, skin) {
  const { x, y, w, h } = region;
  const cx = x + w / 2;
  const cy = y + h / 2;

  surface.fillEllipse({ cx, cy, rx: w * 0.5, ry: h * 0.5 }, solid(skin.rim));
  surface.fillEllipse({ cx, cy, rx: w * 0.4, ry: h * 0.4 }, solid(skin.iris));
  surface.fillEllipse({ cx, cy, rx: w * 0.3, ry: h * 0.12 }, solid('#0b0b0b'));
  surface.fillEllipse(
    { cx: cx - w * 0.14, cy: cy - h * 0.16, rx: w * 0.1, ry: h * 0.12 },
    solid('#ffffff', 0.85),
  );
}

/** A brow ridge: a low plate over the eye, where a dragon would carry a horn. */
function drawBrow(surface, region, skin) {
  const { x, y, w, h } = region;

  surface.fillPolygon(
    [
      [x, y + h],
      [x + w * 0.2, y + h * 0.15],
      [x + w * 0.8, y],
      [x + w, y + h * 0.5],
      [x + w * 0.6, y + h],
    ],
    solid(skin.brow),
  );
  surface.fillPolygon(
    [
      [x + w * 0.24, y + h * 0.5],
      [x + w * 0.78, y + h * 0.28],
      [x + w * 0.9, y + h * 0.52],
      [x + w * 0.5, y + h * 0.8],
    ],
    solid(skin.scale[0], 0.28),
  );
}

/** The forked tongue, flicking forward out of the snout. */
function drawTongue(surface, region) {
  const { x, y, w, h } = region;
  const cx = x + w / 2;

  surface.fillPolygon(
    [
      [cx - 2.4, y],
      [cx + 2.4, y],
      [cx + 1.8, y + h * 0.58],
      [cx + w * 0.42, y + h - 1],
      [cx + 0.6, y + h * 0.72],
      [cx - 0.6, y + h * 0.72],
      [cx - w * 0.42, y + h - 1],
      [cx - 1.8, y + h * 0.58],
    ],
    linear({
      from: [x, y],
      to: [x, y + h],
      stops: [
        [0, '#c92a2a'],
        [1, '#ff8787'],
      ],
    }),
  );
}

export function drawDragon() {
  const surface = createSurface(DRAGON.size, DRAGON.size);

  drawHead(surface, regionOf(DRAGON, 'head'), SKINS.default);
  drawHead(surface, regionOf(DRAGON, 'head-ember'), SKINS.ember);
  drawJaw(surface, regionOf(DRAGON, 'jaw-upper'), SKINS.default, { side: 1 });
  drawJaw(surface, regionOf(DRAGON, 'jaw-lower'), SKINS.default, { side: -1 });
  drawBrow(surface, regionOf(DRAGON, 'brow'), SKINS.default);
  drawTongue(surface, regionOf(DRAGON, 'tongue'));
  drawEye(surface, regionOf(DRAGON, 'eye'), SKINS.default);
  drawEye(surface, regionOf(DRAGON, 'eye-ember'), SKINS.ember);

  return surface.toRGBA();
}
