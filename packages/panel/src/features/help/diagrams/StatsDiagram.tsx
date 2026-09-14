import { LuChevronDown, LuChevronRight, LuListChecks } from 'react-icons/lu';

import type { T } from '../../../i18n/index.js';
import { Badge, Cap, Icon, INK, Plate, Sheet } from './parts.js';

/**
 * The Stats tab.
 *
 * Drawn with the window scrolled back off the live edge, because that is the
 * state worth showing: the minimap has a frame in it, and the bar carries the
 * badge that says the charts are no longer following the game.
 *
 * The chart and group names are the panel's own and stay English — they are
 * read against the renderer's vocabulary, and the per-type charts are named
 * after PixiJS classes. `Keep` is translated, because that one is the panel
 * telling you what it is about to cost the game (§3.14).
 */

export const STATS_CALLOUTS = [1, 2, 3, 4, 5, 6, 7];

const W = 620;
const H = 300;

/** A plausible trace — a shape, not data. */
const TRACE =
  'M0 34 L14 30 L28 33 L42 22 L56 26 L70 18 L84 24 L98 9 L112 20 L126 16 L140 27 L154 21 ' +
  'L168 30 L182 24 L196 12 L210 19 L224 15 L238 26 L252 20 L266 29 L280 23 L294 31';

/** The shape is drawn 44 tall; `h` is what it has to fit into. */
const TRACE_H = 44;

/**
 * Drawn in the group's ink rather than the accent, which is what the tab does
 * and why: one colour per group says which group a chart is in, while the
 * accent is reserved for "a control, and it is on" (`useChartColors.ts`).
 * Everything drawn here belongs to `Rendering` — the two charts, and the
 * minimap, which plots that group's frames a second.
 */
function Trace({ x, y, w, h = TRACE_H }: { x: number; y: number; w: number; h?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${w / 294} ${h / TRACE_H})`}>
      <path d={`${TRACE} L294 44 L0 44 Z`} fill={INK.chartRenderingFill} />
      <path
        d={TRACE}
        fill="none"
        stroke={INK.chartRendering}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

/** One chart: a title with its reading, then the canvas with its edges on it. */
function Chart({
  y,
  title,
  reading,
  ceiling,
  max,
  min,
}: {
  y: number;
  title: string;
  reading: string;
  ceiling: string;
  max: string;
  min: string;
}) {
  return (
    <g>
      <Cap x={8} y={y} weight={600}>
        {title}
      </Cap>
      <Cap x={604} y={y} size={12} weight={600} anchor="end">
        {reading}
      </Cap>
      <Plate x={8} y={y + 10} w={596} h={46} fill={INK.raised} r={2} />
      {/* the fixed grid the canvas draws under the line */}
      {[68, 128, 188, 248, 308, 368, 428, 488, 548].map((x) => (
        <line key={x} x1={x} y1={y + 10} x2={x} y2={y + 56} stroke={INK.line} strokeWidth={0.5} />
      ))}
      {[y + 21, y + 33, y + 45].map((gy) => (
        <line key={gy} x1={8} y1={gy} x2={604} y2={gy} stroke={INK.line} strokeWidth={0.5} />
      ))}
      <Trace x={12} y={y + 11} w={588} />
      <Cap x={13} y={y + 16} size={7} fill={INK.faint}>
        {ceiling}
      </Cap>
      <Cap x={13} y={y + 44} size={7} fill={INK.faint}>
        {max}
      </Cap>
      <Cap x={13} y={y + 52} size={7} fill={INK.faint}>
        {min}
      </Cap>
    </g>
  );
}

export function StatsDiagram({ title, t }: { title: string; t: T }) {
  return (
    <Sheet w={W} h={H} title={title}>
      {/* ── the bar ──────────────────────────────────────────────────────── */}
      {/* The label's column is measured for the longest translation of it, not
          for the English one: `Зберігати` is twice `Keep`, and the switch used
          to start under it. */}
      <Cap x={8} y={14} size={8} fill={INK.faint}>
        {t('stats.keep')}
      </Cap>
      <Plate x={56} y={6} w={164} h={16} r={2} />
      <Plate x={57} y={7} w={32} h={14} fill={INK.accent} stroke="none" r={2} />
      <Cap x={73} y={14} size={8} anchor="middle" fill={INK.onAccent}>
        Off
      </Cap>
      {['5m', '10m', '15m', '20m'].map((label, i) => (
        <Cap key={label} x={111 + i * 32} y={14} size={8} anchor="middle" fill={INK.faint}>
          {label}
        </Cap>
      ))}

      {/* scrolled back: the badge, and the button that goes forward again */}
      <Plate x={248} y={6} w={46} h={16} fill={INK.bar} r={2} />
      <Cap x={271} y={14} size={8} anchor="middle" fill={INK.faint}>
        Paused
      </Cap>
      <Plate x={300} y={6} w={34} h={16} fill={INK.accent} stroke="none" r={2} />
      <Cap x={317} y={14} size={8} anchor="middle" fill={INK.onAccent}>
        Live
      </Cap>
      <Cap x={366} y={14} size={8} fill={INK.faint}>
        12 missed
      </Cap>

      <Icon glyph={LuListChecks} x={594} y={7} size={13} color={INK.accent} />

      {/* ── the minimap, and the window standing in it ───────────────────── */}
      {/*
        The whole recording fills the strip, and the window is a frame with a
        light wash inside it — the way `Minimap.tsx` paints it, and for the
        reason its comment gives: shading everything *else* would make the map
        darkest where there is most of it to read. The trace is scaled to the
        strip rather than drawn at a chart's height, which used to hang it out
        of the bottom of the box.
      */}
      <Plate x={8} y={30} w={596} h={26} fill={INK.raised} r={2} />
      <Trace x={12} y={30} w={588} h={26} />
      <rect x={352} y={30} width={192} height={26} rx={2} fill={INK.chartRenderingFill} />
      <Plate x={352} y={30} w={192} h={26} fill="none" stroke={INK.chartRendering} r={2} />

      {/* ── the clock both edges are read off ────────────────────────────── */}
      <Cap x={8} y={66} size={7} fill={INK.faint}>
        14:02:10
      </Cap>
      <Cap x={306} y={66} size={7} anchor="middle" weight={600}>
        14:05:38
      </Cap>
      <Cap x={604} y={66} size={7} anchor="end" fill={INK.faint}>
        14:09:44
      </Cap>
      <line x1={8} y1={74} x2={604} y2={74} stroke={INK.line} strokeWidth={1} />

      {/* ── a group, and the charts under it ─────────────────────────────── */}
      <Plate x={8} y={82} w={596} h={16} fill={INK.bar} r={2} />
      <Icon glyph={LuChevronDown} x={12} y={85} size={9} color={INK.faint} />
      <Cap x={26} y={90} weight={600}>
        Rendering
      </Cap>
      <Cap x={598} y={90} size={8} anchor="end" fill={INK.faint}>
        7
      </Cap>

      <Chart y={110} title="FPS" reading="59.8" ceiling="60" max="max 60.0" min="min 58.1" />
      <Chart
        y={182}
        title="Frame time (ms)"
        reading="16.7"
        ceiling="40"
        max="max 38.2"
        min="min 15.9"
      />

      {/* a second group, folded */}
      <Plate x={8} y={254} w={596} h={16} fill={INK.bar} r={2} />
      <Icon glyph={LuChevronRight} x={12} y={257} size={9} color={INK.faint} />
      <Cap x={26} y={262} weight={600}>
        Memory
      </Cap>
      <Cap x={598} y={262} size={8} anchor="end" fill={INK.faint}>
        4
      </Cap>

      {/* ── the badges ───────────────────────────────────────────────────── */}
      {/* All of them sit inside the sheet and in a gap of their own: at `y=2` a
          badge is cut in half by the top edge, and the three along the bar were
          each standing on the control they were pointing at. */}
      <Badge n={1} x={232} y={14} />
      <Badge n={2} x={348} y={14} />
      <Badge n={3} x={578} y={14} />
      <Badge n={4} x={20} y={43} />
      <Badge n={5} x={410} y={66} />
      <Badge n={6} x={570} y={90} />
      <Badge n={7} x={40} y={110} />
    </Sheet>
  );
}
