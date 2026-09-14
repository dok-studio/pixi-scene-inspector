/**
 * The samples behind one chart.
 *
 * The history lives here, in numbers, and **not in the canvas pixels** — which
 * is the one thing this had to do differently from the previous project. There
 * a tick blitted the canvas onto itself shifted left, so the graph *was* the
 * pixels: resizing the panel, switching the theme or renaming the series threw
 * the whole history away, along with the running min and max. Keeping the
 * samples means a redraw is free to be a redraw, and it is also what lets a
 * recorded stretch be shown in the same chart as the live window.
 *
 * A fixed capacity, filled and then rotated, so a chart left open all afternoon
 * costs what it costs on the first minute.
 */

export interface Series {
  push(value: number): void;
  /** Oldest first. A copy, because the caller draws from it while more arrive. */
  values(): number[];
  readonly capacity: number;
  readonly length: number;
  clear(): void;
}

export function createSeries(capacity: number): Series {
  const ring = new Float64Array(capacity);
  let start = 0;
  let length = 0;

  return {
    capacity,

    get length() {
      return length;
    },

    push(value) {
      if (length < capacity) {
        ring[(start + length) % capacity] = value;
        length += 1;
        return;
      }

      ring[start] = value;
      start = (start + 1) % capacity;
    },

    values() {
      const out: number[] = [];
      for (let at = 0; at < length; at += 1) out.push(ring[(start + at) % capacity] ?? 0);

      return out;
    },

    clear() {
      start = 0;
      length = 0;
    },
  };
}
