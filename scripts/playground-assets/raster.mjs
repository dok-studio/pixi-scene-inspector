/**
 * A small analytic rasteriser: ellipses, polygons, rounded rectangles.
 *
 * Everything is drawn into a buffer `SCALE` times larger in each direction and
 * averaged down at the end, which is where the antialiasing comes from — there
 * is no edge-coverage code anywhere below, and none is needed. The vocabulary
 * is kept deliberately narrow: these three shapes plus a linear gradient cover
 * every asset the stand needs, and each addition is hand-written work.
 */

const SCALE = 4;

/** `#rgb`, `#rrggbb` or `#rrggbbaa` to a four-channel tuple. */
export function color(hex, alpha = 1) {
  let body = hex.replace('#', '');
  if (body.length === 3) body = [...body].map((c) => c + c).join('');

  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  const a = body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1;

  return [r, g, b, a * alpha];
}

/** A flat colour. */
export function solid(hex, alpha = 1) {
  const rgba = color(hex, alpha);
  return () => rgba;
}

/**
 * A linear gradient between two points, in logical coordinates.
 *
 * This is what gives the art its volume: a sphere is an ellipse with a gradient
 * running across it, and a bevel is two rounded rectangles with opposite ramps.
 * Cheaper in code than any shading model, and enough at this size.
 */
export function linear({ from, to, stops }) {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy || 1;
  const ramp = stops.map(([at, hex, alpha]) => [at, color(hex, alpha ?? 1)]);

  return (x, y) => {
    const t = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) / lengthSq));

    let lower = ramp[0];
    let upper = ramp[ramp.length - 1];
    for (let i = 0; i < ramp.length - 1; i += 1) {
      if (t >= ramp[i][0] && t <= ramp[i + 1][0]) {
        lower = ramp[i];
        upper = ramp[i + 1];
        break;
      }
    }

    const span = upper[0] - lower[0] || 1;
    const k = (t - lower[0]) / span;

    return [
      lower[1][0] + (upper[1][0] - lower[1][0]) * k,
      lower[1][1] + (upper[1][1] - lower[1][1]) * k,
      lower[1][2] + (upper[1][2] - lower[1][2]) * k,
      lower[1][3] + (upper[1][3] - lower[1][3]) * k,
    ];
  };
}

function insidePolygon(points, x, y) {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }

  return inside;
}

export function createSurface(width, height) {
  const w = width * SCALE;
  const h = height * SCALE;
  // Premultiplied, so that averaging down does not drag the colour of fully
  // transparent pixels into the edges.
  const data = new Float32Array(w * h * 4);

  const blend = (px, py, [r, g, b, a]) => {
    if (a <= 0) return;

    const at = (py * w + px) * 4;
    const inv = 1 - a;

    data[at] = r * a + data[at] * inv;
    data[at + 1] = g * a + data[at + 1] * inv;
    data[at + 2] = b * a + data[at + 2] * inv;
    data[at + 3] = a + data[at + 3] * inv;
  };

  /** Walks a bounding box in device space and blends where `inside` says so. */
  const paintRegion = (box, inside, paint) => {
    const minX = Math.max(0, Math.floor(box[0] * SCALE));
    const minY = Math.max(0, Math.floor(box[1] * SCALE));
    const maxX = Math.min(w - 1, Math.ceil(box[2] * SCALE));
    const maxY = Math.min(h - 1, Math.ceil(box[3] * SCALE));

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        // Sample at the pixel centre, in logical coordinates.
        const x = (px + 0.5) / SCALE;
        const y = (py + 0.5) / SCALE;

        if (inside(x, y)) blend(px, py, paint(x, y));
      }
    }
  };

  return {
    width,
    height,

    fillEllipse({ cx, cy, rx, ry }, paint) {
      paintRegion(
        [cx - rx, cy - ry, cx + rx, cy + ry],
        (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
        paint,
      );
      return this;
    },

    fillPolygon(points, paint) {
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);

      paintRegion(
        [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        (x, y) => insidePolygon(points, x, y),
        paint,
      );
      return this;
    },

    fillRoundRect({ x: rx0, y: ry0, w: rw, h: rh, r }, paint) {
      const radius = Math.min(r, rw / 2, rh / 2);
      const x1 = rx0 + rw;
      const y1 = ry0 + rh;

      paintRegion(
        [rx0, ry0, x1, y1],
        (x, y) => {
          if (x < rx0 || x > x1 || y < ry0 || y > y1) return false;

          const cx = Math.min(Math.max(x, rx0 + radius), x1 - radius);
          const cy = Math.min(Math.max(y, ry0 + radius), y1 - radius);

          return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
        },
        paint,
      );
      return this;
    },

    /** Averages the supersampled buffer down and un-premultiplies it. */
    toRGBA() {
      const out = new Uint8Array(width * height * 4);
      const samples = SCALE * SCALE;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;

          for (let sy = 0; sy < SCALE; sy += 1) {
            for (let sx = 0; sx < SCALE; sx += 1) {
              const at = ((y * SCALE + sy) * w + (x * SCALE + sx)) * 4;
              r += data[at];
              g += data[at + 1];
              b += data[at + 2];
              a += data[at + 3];
            }
          }

          r /= samples;
          g /= samples;
          b /= samples;
          a /= samples;

          const to = (y * width + x) * 4;
          out[to] = a > 0 ? Math.round(Math.min(255, r / a)) : 0;
          out[to + 1] = a > 0 ? Math.round(Math.min(255, g / a)) : 0;
          out[to + 2] = a > 0 ? Math.round(Math.min(255, b / a)) : 0;
          out[to + 3] = Math.round(Math.min(255, a * 255));
        }
      }

      return out;
    },
  };
}
