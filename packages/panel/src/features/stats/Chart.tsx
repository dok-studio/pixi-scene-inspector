import { useEffect, useRef, useState } from 'react';

import { Hint } from '../../components/ui/tooltip.js';
import { nextCeiling, peakOf } from './chartScale.js';
import type { ChartInk } from './useChartColors.js';

/**
 * One metric, drawn the way the task manager draws one: a name and a large
 * current reading above a box, a grid that stays put while the data slides left
 * under it, and the area below the line filled in.
 *
 * Only the grid, the line and the fill are on the canvas. Every piece of text —
 * the title, the reading, the ceiling, the axis captions — is ordinary markup,
 * which is what keeps it in the panel's font and in the panel's colours without
 * this component knowing what either of those is.
 *
 * The history is the `values` array the caller holds (`series.ts`), so a resize
 * redraws rather than restarts. In the previous project the graph *was* the
 * canvas pixels and changing the width threw it away.
 */

/** Columns and rows of the grid. Fixed, so the data moves and the grid does not. */
const COLUMNS = 10;
const ROWS = 4;

export interface ChartProps {
  title: string;
  /** null while nothing has been read yet — the reading shows a dash. */
  value: number | null;
  values: readonly number[];
  /**
   * Pixels per sample, and it does not change with the width.
   *
   * A wider panel shows **more history**, not the same history drawn further
   * apart. Stretching would mean the shape of a minute depended on how wide the
   * drawer happened to be, and two charts read side by side at different widths
   * would not be comparable at all.
   */
  step: number;
  /**
   * Which sample the pointer is over, shared by every chart on the tab.
   *
   * One index rather than one per chart: the charts are one picture of one
   * moment, and the question asked by hovering is "what was everything doing
   * here", not "what was this doing".
   */
  hover?: number | null;
  onHover?: (at: number | null) => void;
  /**
   * What the chart is, for the names that do not say.
   *
   * On the title rather than on the whole chart: the box is a thing to point
   * at, and a tip that appeared over it would cover the readings while it was
   * being read.
   */
  about?: string;
  /** The lowest the ceiling may fall to. 60 for frames a second. */
  floor?: number;
  format?: (value: number) => string;
  unit?: string;
  /**
   * Bumped when `values` gained something without changing identity.
   *
   * A live series hands over a fresh copy each render, so it needs none. A
   * recorded one is appended to in place — cheaper than copying half an hour of
   * samples twice a second — and this is what says it moved.
   */
  revision?: number;
  /**
   * The line and the body under it — the colour of the group this chart is in.
   *
   * Handed in rather than read here: every chart on the tab wants the same
   * answer, and twenty components each running their own `getComputedStyle`
   * and their own observer is twenty layout reads for one question.
   */
  ink: ChartInk;
  grid: string;
  /**
   * The lowest and highest this metric has reached since the panel opened —
   * not since the part on screen.
   *
   * The page keeps them past eviction, which is the only way the figure
   * survives what it is wanted for: by the time anyone looks for the peak of a
   * stutter, the samples that held it have usually scrolled off.
   */
  extremes?: { min: number; max: number };
}

function draw(
  canvas: HTMLCanvasElement,
  values: readonly number[],
  step: number,
  ceiling: number,
  colors: { line: string; fill: string; grid: string },
  hover: number | null,
): void {
  const context = canvas.getContext('2d');
  if (context === null) return;

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;

  // Sized in device pixels and scaled back, or the line is soft on a HiDPI
  // screen — which is how every chart in the previous project looked.
  const wanted = { width: Math.round(width * ratio), height: Math.round(height * ratio) };
  if (canvas.width !== wanted.width || canvas.height !== wanted.height) {
    canvas.width = wanted.width;
    canvas.height = wanted.height;
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  context.strokeStyle = colors.grid;
  context.lineWidth = 1;
  context.beginPath();
  for (let column = 1; column < COLUMNS; column += 1) {
    // The half-pixel is what keeps a one-pixel rule one pixel wide.
    const x = Math.round((column * width) / COLUMNS) + 0.5;
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let row = 1; row < ROWS; row += 1) {
    const y = Math.round((row * height) / ROWS) + 0.5;
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();

  if (values.length < 2 || ceiling <= 0) return;

  // Anchored to the right edge: the newest sample is the one at the live edge,
  // and a series that has not filled the width yet grows leftwards from there.
  const xOf = (at: number): number => width - (values.length - 1 - at) * step;
  const yOf = (value: number): number =>
    height - Math.max(0, Math.min(1, value / ceiling)) * height;

  const trace = (): void => {
    context.moveTo(xOf(0), yOf(values[0] ?? 0));
    for (let at = 1; at < values.length; at += 1) context.lineTo(xOf(at), yOf(values[at] ?? 0));
  };

  // The body first, closed down to the floor, then the line over its top edge.
  // Two passes rather than one filled-and-stroked path: filling a closed shape
  // would put a stroke along the bottom and both sides as well.
  context.beginPath();
  trace();
  context.lineTo(xOf(values.length - 1), height);
  context.lineTo(xOf(0), height);
  context.closePath();
  context.fillStyle = colors.fill;
  context.fill();

  context.beginPath();
  trace();
  context.strokeStyle = colors.line;
  context.lineWidth = 1.5;
  context.lineJoin = 'round';
  context.stroke();

  if (hover === null || hover < 0 || hover >= values.length) return;

  // Drawn over the line rather than under it: it is the thing being read.
  const x = Math.round(xOf(hover)) + 0.5;
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, height);
  context.strokeStyle = colors.line;
  context.lineWidth = 1;
  context.stroke();

  context.beginPath();
  context.arc(xOf(hover), yOf(values[hover] ?? 0), 2.5, 0, Math.PI * 2);
  context.fillStyle = colors.line;
  context.fill();
}

export function Chart({
  title,
  value,
  values,
  step,
  floor = 0,
  format = (given: number) => String(Math.round(given)),
  unit,
  revision = 0,
  ink,
  grid,
  extremes,
  hover = null,
  onHover,
  about,
}: ChartProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  /*
   * The ceiling is state rather than a value worked out on each draw, because
   * it is deliberately sticky: it may only come down once the data has been
   * clear of it for a while (`chartScale.ts`), and that is a fact about the
   * chart's past, not about the samples in hand.
   */
  const [ceiling, setCeiling] = useState(() => Math.max(floor, 1));

  useEffect(() => {
    setCeiling((current) => nextCeiling(current, peakOf(values), floor));
  }, [values, floor, revision]);

  /*
   * The current draw, held so that the observer below can be installed once.
   *
   * Everything the chart draws with changes several times a second — `values`
   * is a fresh slice of the recording on every render of the tab — so an
   * observer built in the same effect as the draw was built and torn down at
   * that rate, times every chart on the Stats tab. Building a `ResizeObserver`
   * a couple of hundred times a second is not what a panel that exists to
   * measure the page's frame should be doing with it.
   */
  const redraw = useRef<() => void>(() => undefined);

  useEffect(() => {
    redraw.current = () => {
      const element = canvas.current;
      if (element === null) return;

      draw(element, values, step, ceiling, { ...ink, grid }, hover);
    };

    redraw.current();
  }, [values, step, ceiling, ink, grid, revision, hover]);

  // The canvas has no intrinsic size, so a width change is not a redraw unless
  // something says so. Nothing is lost by it: the history is the array, not the
  // pixels.
  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;

    const observer = new ResizeObserver(() => {
      redraw.current();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  /** Which sample the pointer is over, from where it is over the canvas. */
  const at = (event: React.PointerEvent<HTMLCanvasElement>): number | null => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || values.length === 0) return null;

    // The series is drawn anchored to the right edge, so the reading under the
    // pointer is counted back from there rather than forward from the left.
    const fromRight = Math.round((box.right - event.clientX) / step);
    const index = values.length - 1 - fromRight;

    return index < 0 || index >= values.length ? null : index;
  };

  // Hovering replaces the reading rather than adding one beside it: the number
  // in this row is "what it is at the moment being looked at", and while
  // nothing is hovered that moment is now.
  const reading = hover === null ? value : (values[hover] ?? value);

  return (
    <div className="flex flex-col gap-1 px-2 pt-2">
      <div className="flex items-baseline justify-between gap-2">
        {/* The panel's own ink, not muted: this is the name of the thing being
            read, and the whole column of them is how a chart is found while
            scrolling. Weight and size already separate it from the reading. */}
        {about === undefined ? (
          <span className="min-w-0 truncate text-xs">{title}</span>
        ) : (
          <Hint text={about} side="top">
            <span className="min-w-0 cursor-help truncate text-xs">{title}</span>
          </Hint>
        )}
        <span className="flex-none text-sm font-bold tabular-nums">
          {reading === null ? '—' : format(reading)}
          {unit !== undefined && reading !== null && (
            <span className="text-muted-foreground ml-1 text-xs font-normal">{unit}</span>
          )}
        </span>
      </div>

      <div className="border-border relative h-14 border">
        <canvas
          ref={canvas}
          className="h-full w-full"
          onPointerMove={(event) => {
            onHover?.(at(event));
          }}
          onPointerLeave={() => {
            onHover?.(null);
          }}
        />
        <span className="text-muted-foreground pointer-events-none absolute left-1 top-0 text-[10px] leading-tight">
          {format(ceiling)}
        </span>
        {/* Inside the box rather than in a row under it: that row cost every
            chart fourteen pixels to repeat what the shared axis above the list
            now says once.

            A column, with the high above the low, because that is where they
            are — read against the chart behind them the two lines point at the
            top and the bottom of it. Side by side they were a sentence about
            the chart; stacked they are a scale beside it.

            At `--foreground/70` rather than muted: these are readings, and the
            muted token is for the words around a reading. */}
        {extremes !== undefined && (
          <span className="text-foreground/70 pointer-events-none absolute bottom-0 left-1 flex flex-col text-[10px] leading-tight tabular-nums">
            <span>max {format(extremes.max)}</span>
            <span>min {format(extremes.min)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
