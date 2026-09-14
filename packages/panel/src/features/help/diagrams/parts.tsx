import type { IconType } from 'react-icons';

/**
 * The pieces every schematic is drawn from.
 *
 * Drawn rather than screenshot, and drawn in the panel's own tokens: a picture
 * of the panel goes stale the day a button moves, weighs more than the page
 * around it, and is wrong in one of the two themes. These are `hsl(var(--…))`
 * straight out of `globals.css`, so a schematic follows the reader's theme and
 * their accent without knowing either exists.
 *
 * Nothing here draws real text at readable size. A schematic is a map of where
 * things are — the words belong in the legend beside it, where they can be
 * translated, searched and read out.
 */

/** The tokens, named once so a diagram never spells a colour. */
export const INK = {
  page: 'hsl(var(--background))',
  bar: 'hsl(var(--muted))',
  raised: 'hsl(var(--raised))',
  line: 'hsl(var(--border))',
  accent: 'hsl(var(--primary))',
  onAccent: 'hsl(var(--primary-foreground))',
  text: 'hsl(var(--foreground))',
  faint: 'hsl(var(--muted-foreground))',
  /**
   * A chart's ink, by the group it belongs to — the same three tokens
   * `useChartColors.ts` reads, and deliberately **not** the accent: there the
   * accent means "a control, and it is on", and a picture that drew the charts
   * in it would be teaching the wrong thing about the one colour that carries
   * meaning in the Stats tab.
   */
  chartRendering: 'hsl(var(--chart-rendering))',
  chartRenderingFill: 'hsl(var(--chart-rendering) / 0.18)',
} as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A filled rectangle with the panel's corner radius. */
export function Plate({
  x,
  y,
  w,
  h,
  fill = INK.page,
  stroke = INK.line,
  r = 2,
  dash,
}: Box & { fill?: string; stroke?: string; r?: number; dash?: string }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={r}
      fill={fill}
      stroke={stroke}
      strokeWidth={1}
      strokeDasharray={dash}
    />
  );
}

/**
 * A stand-in for a line of text: a bar, not lettering.
 *
 * Real words at this scale are unreadable in one language and clipped in the
 * other, and they would have to be translated to be either.
 */
export function Ghost({
  x,
  y,
  w,
  h = 3,
  fill = INK.faint,
  opacity = 0.5,
}: Omit<Box, 'h'> & { h?: number; fill?: string; opacity?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={1.5} fill={fill} opacity={opacity} />;
}

/** A small control: a button, a toggle, a chip. */
export function Chip({
  x,
  y,
  w = 12,
  h = 10,
  on = false,
}: Omit<Box, 'w' | 'h'> & { w?: number; h?: number; on?: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={2}
      fill={on ? INK.accent : 'transparent'}
      stroke={on ? INK.accent : INK.line}
      strokeWidth={1}
      opacity={on ? 0.9 : 1}
    />
  );
}

/**
 * A word the schematic actually says.
 *
 * Used for what the panel itself puts in words — a tab's name, a section
 * heading, a node in the tree — so that the picture can be matched against the
 * screen without counting rectangles. Everything else stays a `Ghost`: a
 * schematic that spelled out every value would be a screenshot, and would go
 * stale like one.
 */
export function Cap({
  x,
  y,
  size = 9,
  fill = INK.text,
  weight,
  anchor = 'start',
  children,
}: {
  x: number;
  y: number;
  size?: number;
  fill?: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  children: React.ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={fill}
      fontWeight={weight}
      textAnchor={anchor}
      dominantBaseline="central"
    >
      {children}
    </text>
  );
}

/**
 * The panel's own glyph, at schematic scale.
 *
 * The real icon component, imported from where the panel imports it — so the
 * eye on this page is the eye on that row, and stays so when one of them is
 * swapped. `react-icons` spreads `x`/`y`/`color` onto its `<svg>`, and a nested
 * `<svg>` is its own little viewport, which is exactly what is wanted here.
 */
export function Icon({
  glyph: Glyph,
  x,
  y,
  size = 11,
  color = INK.faint,
}: {
  glyph: IconType;
  x: number;
  y: number;
  size?: number;
  color?: string;
}) {
  return <Glyph x={x} y={y} size={size} color={color} />;
}

/**
 * A numbered marker, and the one thing on a schematic that is meant to be read.
 *
 * The number is the join between the picture and the legend under it — which is
 * why `DIAGRAM_CALLOUTS` lists what each diagram draws, and a test holds the
 * two together.
 */
export function Badge({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={7.5} fill={INK.accent} />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight={600}
        fill={INK.onAccent}
      >
        {n}
      </text>
    </g>
  );
}

/**
 * The frame every schematic sits in.
 *
 * `viewBox` with no fixed width: the page is one column and the picture takes
 * whatever the column is, at whatever the reader's zoom is.
 */
export function Sheet({
  w,
  h,
  title,
  children,
}: {
  w: number;
  h: number;
  /** Read out instead of the picture, for anyone who is not looking at it. */
  title: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={title}
      className="border-border bg-background w-full rounded border"
    >
      {children}
    </svg>
  );
}
