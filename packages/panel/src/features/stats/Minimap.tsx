import { useEffect, useRef } from 'react';

import { useT } from '../../i18n/index.js';

import { peaks } from './align.js';
import type { ChartInk } from './useChartColors.js';

/**
 * The whole recording at a glance, and the handle for moving through it.
 *
 * A plain slider said how far along the window was and nothing about what was
 * there, so finding the stutter meant dragging until it appeared. This draws
 * the entire recording — by peak, so a spike survives the squeeze (`peaks`) —
 * and marks the part the charts are showing. The trouble is visible before it
 * is scrolled to, which is the difference between hunting and pointing.
 *
 * One metric, not all of them: this is a map, and a map with twenty layers is
 * not one. Frames a second is the one that says "something went wrong here"
 * for every cause, whatever the cause turns out to have been.
 */

const HEIGHT = 28;

export function Minimap({
  values,
  total,
  from,
  windowSize,
  onScrub,
  ink,
  grid,
}: {
  /** The whole recorded series, oldest first. */
  values: readonly number[];
  /** Ticks in the recording, which may be more than `values` has readings for. */
  total: number;
  /** The first tick the charts are showing. */
  from: number;
  /** How many ticks they show. */
  windowSize: number;
  /** Where the window should start now. Clamped by the caller. */
  onScrub: (start: number) => void;
  ink: ChartInk;
  grid: string;
}) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;

    const paint = (): void => {
      const context = element.getContext('2d');
      if (context === null) return;

      const ratio = globalThis.devicePixelRatio || 1;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width === 0 || height === 0) return;

      const wanted = { width: Math.round(width * ratio), height: Math.round(height * ratio) };
      if (element.width !== wanted.width || element.height !== wanted.height) {
        element.width = wanted.width;
        element.height = wanted.height;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const buckets = peaks(values, Math.max(1, Math.floor(width)));
      let ceiling = 0;
      for (const value of buckets) ceiling = Math.max(ceiling, value);
      if (ceiling <= 0) ceiling = 1;

      context.beginPath();
      context.moveTo(0, height);
      for (const [at, value] of buckets.entries()) {
        context.lineTo(
          (at * width) / Math.max(buckets.length - 1, 1),
          height - (value / ceiling) * height,
        );
      }
      context.lineTo(width, height);
      context.closePath();
      context.fillStyle = ink.fill;
      context.fill();

      // The part the charts are showing. A frame rather than a shade over the
      // rest: shading the rest makes the map darkest where there is most of it
      // to read, which is the wrong way round for something scanned for spikes.
      if (total > 0) {
        const left = Math.round((from / total) * width) + 0.5;
        const right = Math.round(((from + windowSize) / total) * width) - 0.5;

        context.strokeStyle = ink.line;
        context.lineWidth = 1;
        context.strokeRect(left, 0.5, Math.max(2, right - left), height - 1);

        context.fillStyle = ink.fill;
        context.fillRect(left, 0.5, Math.max(2, right - left), height - 1);
      }

      context.strokeStyle = grid;
      context.lineWidth = 1;
      context.strokeRect(0.5, 0.5, width - 1, height - 1);
    };

    paint();

    const observer = new ResizeObserver(paint);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [values, total, from, windowSize, ink, grid]);

  /** Centres the window on where the pointer is, which is what a map implies. */
  const scrubTo = (clientX: number): void => {
    const element = canvas.current;
    if (element === null) return;

    const box = element.getBoundingClientRect();
    if (box.width === 0) return;

    const middle = ((clientX - box.left) / box.width) * total;
    onScrub(Math.round(middle - windowSize / 2));
  };

  return (
    <canvas
      ref={canvas}
      className="w-full cursor-pointer"
      style={{ height: HEIGHT }}
      aria-label={t('stats.minimap')}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        scrubTo(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubTo(event.clientX);
      }}
    />
  );
}
