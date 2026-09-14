import { FaRedoAlt } from 'react-icons/fa';
import { FaCircleQuestion } from 'react-icons/fa6';
import { LuMoon, LuSettings } from 'react-icons/lu';

import type { T } from '../../../i18n/index.js';
import { Badge, Cap, Ghost, Icon, INK, Plate, Sheet } from './parts.js';

/**
 * The Custom tab, drawn wide — with all three panels standing side by side,
 * which is the state the tab exists for.
 *
 * The narrow half of the story is not drawn, and deliberately: on a panel with
 * room for two columns a chip takes the other's place rather than joining it,
 * and a picture wide enough to show three columns is by definition the wrong
 * width to show that happening. The legend says it in words instead.
 *
 * The tab names are the panel's own and are translated, exactly as the strip
 * translates them (§3.14). Everything else is a `Ghost`: what is inside each
 * column is whatever that tab draws, and is explained where that tab is.
 */

export const CUSTOM_CALLOUTS = [1, 2, 3, 4];

const W = 620;
const H = 250;

/** The bar, the seam under it, and the row of chips. */
const BAR_H = 20;
const SEAM_H = 6;
const CHIPS_Y = BAR_H + SEAM_H;
const CHIPS_H = 18;
const BODY_Y = CHIPS_Y + CHIPS_H;

/** The bar's own buttons, which keep the far end to themselves. */
const BUTTONS_W = 96;

/** One tab's share of what is left between the logo and those buttons. */
const TAB_W = (W - 28 - BUTTONS_W) / 4;

/**
 * The gutter between two columns, as wide here as it is in the panel.
 *
 * The columns are laid out **around** it rather than the bar being drawn over
 * the gap between them, which is how it came to overlap them by four units: a
 * gap of two with a bar of six has nowhere else to go.
 */
const GUTTER = 6;

/** Where each column starts and ends, with that gutter between them. */
const COLUMNS = [
  { x: 0, w: 230 },
  { x: 236, w: 180 },
  { x: 422, w: W - 422 },
] as const;

/** The left edge of the gutter before a column, for the ones that have one. */
const gutterBefore = (index: 1 | 2): number => COLUMNS[index].x - GUTTER;

/**
 * How wide a word comes out at the size the chips are set in.
 *
 * Estimated rather than measured, because this is an `svg` built in one pass
 * with no layout to ask: at 7px the face runs a shade over four units to the
 * character. Generously enough that a longer translation has somewhere to go —
 * `Статистика` is the word that made a fixed width untenable, sitting hard
 * against both borders at 44.
 */
const CHIP_PAD = 12;
const CHAR_W = 4.2;

function chipWidth(label: string): number {
  return Math.round(label.length * CHAR_W) + CHIP_PAD;
}

/** A chip in the row, at the size the row draws it. */
function ChipWithName({ x, w, on, children }: { x: number; w: number; on: boolean; children: string }) {
  return (
    <g>
      <rect
        x={x}
        y={CHIPS_Y + 4}
        width={w}
        height={10}
        rx={2}
        fill={on ? INK.text : 'transparent'}
        fillOpacity={on ? 0.1 : 1}
        stroke={on ? INK.text : INK.line}
        strokeOpacity={on ? 0.25 : 1}
        strokeWidth={1}
      />
      <Cap
        x={x + w / 2}
        y={CHIPS_Y + 9}
        size={7}
        anchor="middle"
        weight={on ? 700 : undefined}
        fill={on ? INK.text : INK.faint}
      >
        {children}
      </Cap>
    </g>
  );
}

/** A toolbar row inside a column, and some lines of whatever it holds. */
function Filling({ x, w, lines }: { x: number; w: number; lines: number }) {
  return (
    <g>
      <Plate x={x + 4} y={BODY_Y + 6} w={w - 8} h={12} fill={INK.bar} r={2} />
      {Array.from({ length: lines }, (_, i) => (
        <Ghost key={i} x={x + 10} y={BODY_Y + 28 + i * 12} w={(w - 28) * (i % 3 === 2 ? 0.55 : 0.8)} />
      ))}
    </g>
  );
}

export function CustomDiagram({ title, t }: { title: string; t: T }) {
  const tabs = [t('tab.scene'), t('tab.assets'), t('tab.stats'), t('tab.custom')];
  const open = tabs.length - 1;

  /* The chips, laid out left to right, each as wide as its own word. */
  const chips = tabs.slice(0, 3).reduce<{ name: string; x: number; w: number }[]>((row, name) => {
    const last = row.at(-1);
    const x = last === undefined ? 8 : last.x + last.w + 2;

    return [...row, { name, x, w: chipWidth(name) }];
  }, []);

  const afterChips = (chips.at(-1)?.x ?? 8) + (chips.at(-1)?.w ?? 0);

  return (
    <Sheet w={W} h={H} title={title}>
      {/* The bar. The open tab takes the content's own colour, which is the
          whole of how the strip marks it — see `ui/tab.tsx`. */}
      <Plate x={0} y={0} w={W} h={BAR_H} fill={INK.bar} r={0} stroke="transparent" />
      <Plate x={4} y={4} w={12} h={12} fill={INK.accent} stroke="transparent" r={2} />
      {tabs.map((name, i) => {
        const w = TAB_W;
        const x = 28 + i * w;

        return (
          <g key={name}>
            {i === open && <Plate x={x} y={0} w={w} h={BAR_H} fill={INK.page} r={0} stroke="transparent" />}
            <Cap
              x={x + w / 2}
              y={BAR_H / 2}
              size={8}
              anchor="middle"
              weight={i === open ? 700 : undefined}
              fill={i === open ? INK.text : INK.faint}
            >
              {name}
            </Cap>
          </g>
        );
      })}

      {[FaRedoAlt, LuMoon, LuSettings, FaCircleQuestion].map((glyph, i) => (
        <Icon key={i} glyph={glyph} x={W - BUTTONS_W + 14 + i * 20} y={5} size={10} />
      ))}

      {/* The seam the open tab runs into, and then the tab's own first row. */}
      <Plate x={0} y={BAR_H} w={W} h={SEAM_H} fill={INK.page} r={0} stroke="transparent" />
      <line x1={0} y1={BODY_Y} x2={W} y2={BODY_Y} stroke={INK.line} strokeWidth={1} />

      {chips.map(({ name, x, w }) => (
        <ChipWithName key={name} x={x} w={w} on>
          {name}
        </ChipWithName>
      ))}

      {/* The columns. Each is a whole tab, with the split it has of its own. */}
      <Filling x={COLUMNS[0].x} w={124} lines={9} />
      <line x1={126} y1={BODY_Y} x2={126} y2={H} stroke={INK.line} strokeWidth={1} />
      <Filling x={126} w={COLUMNS[0].w - 126} lines={9} />

      {/* Assets is split too, only at a fixed width and with no handle to
          drag — so its rule is drawn like the tree's and not like the ones
          between columns. */}
      <Filling x={COLUMNS[1].x} w={110} lines={9} />
      <line
        x1={COLUMNS[1].x + 110}
        y1={BODY_Y}
        x2={COLUMNS[1].x + 110}
        y2={H}
        stroke={INK.line}
        strokeWidth={1}
      />
      <Filling x={COLUMNS[1].x + 110} w={COLUMNS[1].w - 110} lines={9} />
      <Filling x={COLUMNS[2].x} w={COLUMNS[2].w} lines={9} />

      {/* The gutters between the columns. Drawn wider than the rules inside a
          column and in the same ink, because that is exactly the difference
          the panel makes: a hairline divides halves of one panel, a bar
          divides two whole ones. Not the accent — that colour means "a
          control, and it is on" everywhere else in this panel. */}
      {[gutterBefore(1), gutterBefore(2)].map((x) => (
        <rect key={x} x={x} y={BODY_Y} width={GUTTER} height={H - BODY_Y} fill={INK.line} />
      ))}

      <Badge n={1} x={28 + (open + 1) * TAB_W - 12} y={10} />
      <Badge n={2} x={afterChips + 12} y={CHIPS_Y + 9} />
      <Badge n={3} x={gutterBefore(1) + GUTTER / 2} y={BODY_Y + 74} />
      <Badge n={4} x={COLUMNS[2].x + 40} y={BODY_Y + 12} />
    </Sheet>
  );
}
