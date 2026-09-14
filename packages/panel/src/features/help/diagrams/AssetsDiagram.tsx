import { FaAngleDown, FaArrowsRotate, FaFilter } from 'react-icons/fa6';
import { LuChevronRight, LuSearch } from 'react-icons/lu';

import type { T } from '../../../i18n/index.js';
import { Badge, Cap, Icon, INK, Plate, Sheet } from './parts.js';

/**
 * The Assets tab: the grid on the left, one texture's answer on the right.
 *
 * The two toolbar rows are drawn as two rows because that is what they are —
 * what to show, then in what order — and reading them as one strip is the
 * mistake the picture is here to prevent.
 *
 * The metadata rows keep their English names, as they do on screen: that table
 * is the renderer's own vocabulary and is deliberately left untranslated
 * (§3.14). What *is* translated here is what the toolbar says, because the
 * toolbar is the panel speaking.
 */

export const ASSETS_CALLOUTS = [1, 2, 3, 4, 5, 6, 7, 8];

const W = 620;
const H = 330;

/** One thumbnail: a chequered picture over the three lines of caption. */
function Tile({ x, y, name, on = false }: { x: number; y: number; name: string; on?: boolean }) {
  const ink = on ? INK.onAccent : INK.page;

  return (
    <g>
      <Plate x={x} y={y} w={88} h={92} fill={INK.raised} r={3} stroke={on ? INK.accent : INK.line} />
      <Plate x={x + 8} y={y + 6} w={72} h={54} fill={INK.bar} r={2} />
      <Plate
        x={x}
        y={y + 66}
        w={88}
        h={26}
        fill={on ? INK.accent : INK.line}
        stroke="none"
        r={2}
      />
      <Cap x={x + 6} y={y + 72} size={7} fill={ink}>
        {name}
      </Cap>
      <Cap x={x + 6} y={y + 80} size={7} fill={ink}>
        Size: 512 x 512
      </Cap>
      <Cap x={x + 6} y={y + 88} size={7} fill={ink}>
        GPU: 1.000 MB
      </Cap>
    </g>
  );
}

/** One read-only row of the metadata table. */
function MetaRow({ y, name, value }: { y: number; name: string; value: string }) {
  return (
    <g>
      <Cap x={342} y={y} size={8} fill={INK.faint}>
        {name}
      </Cap>
      <Cap x={454} y={y} size={8}>
        {value}
      </Cap>
    </g>
  );
}

export function AssetsDiagram({ title, t }: { title: string; t: T }) {
  return (
    <Sheet w={W} h={H} title={title}>
      {/* ── what to show ─────────────────────────────────────────────────── */}
      <Plate x={6} y={6} w={62} h={16} r={2} />
      <Icon glyph={FaFilter} x={12} y={9} size={9} color={INK.accent} />
      <Cap x={26} y={14} size={8}>
        {t('assets.filter')}
      </Cap>
      <Plate x={74} y={6} w={180} h={16} r={2} />
      <Icon glyph={LuSearch} x={80} y={9} size={9} color={INK.faint} />
      <Cap x={94} y={14} size={8} fill={INK.faint}>
        {t('assets.search')}
      </Cap>
      <Icon glyph={FaArrowsRotate} x={272} y={9} size={10} color={INK.text} />

      {/* ── in what order ────────────────────────────────────────────────── */}
      {/* The label's own column is wide enough for the longest translation of
          it, not for the English one: `Порядок` is half again as wide as
          `Order`, and the switch beside it used to start under its last two
          letters. What paid for the room is the preview pane, which had more
          than the picture it holds needs. */}
      <Cap x={8} y={36} size={8} fill={INK.faint}>
        {t('assets.sort')}
      </Cap>
      <Plate x={48} y={28} w={140} h={16} r={2} />
      <Plate x={49} y={29} w={46} h={14} fill={INK.accent} stroke="none" r={2} />
      <Cap x={72} y={36} size={8} anchor="middle" fill={INK.onAccent}>
        {t('assets.sort.latest.label')}
      </Cap>
      <Cap x={118} y={36} size={8} anchor="middle" fill={INK.faint}>
        {t('assets.sort.name.label')}
      </Cap>
      <Cap x={164} y={36} size={8} anchor="middle" fill={INK.faint}>
        {t('assets.sort.size.label')}
      </Cap>
      <Plate x={194} y={28} w={84} h={16} r={2} />
      <Cap x={236} y={36} size={8} anchor="middle">
        {t('assets.order.latest.desc')}
      </Cap>

      {/* ── the grid ─────────────────────────────────────────────────────── */}
      <Tile x={6} y={52} name="hero.png" />
      <Tile x={104} y={52} name="atlas.png" on />
      <Tile x={202} y={52} name="tiles.png" />
      <Tile x={6} y={152} name="ui.png" />
      <Tile x={104} y={152} name="font.png" />
      <Tile x={202} y={152} name="Unnamed" />

      {/* ── the summary strip ────────────────────────────────────────────── */}
      <line x1={6} y1={254} x2={310} y2={254} stroke={INK.line} strokeWidth={1} />
      <Cap x={8} y={264} size={8} fill={INK.faint}>
        24 textures · 19 on GPU · 41.508 MB +
      </Cap>

      {/* ── one texture, right ───────────────────────────────────────────── */}
      <line x1={324} y1={6} x2={324} y2={324} stroke={INK.line} strokeWidth={1} />

      <Cap x={338} y={14} weight={600}>
        atlas.png
      </Cap>
      <Plate x={540} y={6} w={72} h={16} r={2} />
      <Plate x={541} y={7} w={22} h={14} fill={INK.accent} stroke="none" r={2} />
      <Cap x={552} y={14} size={9} anchor="middle" fill={INK.onAccent}>
        ▨
      </Cap>
      <Cap x={575} y={14} size={9} anchor="middle" fill={INK.faint}>
        ■
      </Cap>
      <Cap x={598} y={14} size={9} anchor="middle" fill={INK.faint}>
        □
      </Cap>

      <Plate x={338} y={30} w={124} h={124} fill={INK.bar} r={2} />
      {/* the frame outline a hovered row draws over the picture */}
      <Plate x={364} y={58} w={54} h={40} fill="none" stroke={INK.accent} r={0} dash="3 2" />

      {/* `Info` folds, and that is the point of it: eighteen rows of metadata
          push the two lists below out of sight of the preview they answer
          about. Drawn open, which is how it arrives. */}
      <Plate x={338} y={160} w={274} h={16} fill={INK.bar} r={2} />
      <Icon glyph={FaAngleDown} x={342} y={164} size={8} color={INK.faint} />
      <Cap x={356} y={168} weight={600}>
        {t('assets.info')}
      </Cap>

      <MetaRow y={190} name="Format" value="rgba8unorm" />
      <MetaRow y={204} name="GPU size" value="4.000 MB" />
      <MetaRow y={218} name="On GPU" value="yes" />
      <MetaRow y={232} name="Source" value="image" />
      <MetaRow y={246} name="File size" value="212 KB" />
      <MetaRow y={260} name="Antialias" value="unknown" />

      {/* the two sections that open folded */}
      <Plate x={338} y={272} w={274} h={16} fill={INK.bar} r={2} />
      <Icon glyph={LuChevronRight} x={342} y={275} size={9} color={INK.faint} />
      <Cap x={356} y={280} weight={600}>
        {t('assets.frames')}
      </Cap>
      <Cap x={604} y={280} size={8} anchor="end" fill={INK.faint}>
        86
      </Cap>
      <Plate x={338} y={294} w={274} h={16} fill={INK.bar} r={2} />
      <Icon glyph={LuChevronRight} x={342} y={297} size={9} color={INK.faint} />
      <Cap x={356} y={302} weight={600}>
        {t('assets.usedBy')}
      </Cap>
      <Cap x={604} y={302} size={8} anchor="end" fill={INK.faint}>
        3
      </Cap>

      {/* ── the badges ───────────────────────────────────────────────────── */}
      <Badge n={1} x={300} y={14} />
      <Badge n={2} x={294} y={36} />
      <Badge n={3} x={148} y={98} />
      <Badge n={4} x={300} y={264} />
      <Badge n={5} x={330} y={30} />
      <Badge n={6} x={330} y={168} />
      {/* One badge each: the two folded sections answer different questions,
          and the legend is where each is answered. */}
      <Badge n={7} x={330} y={280} />
      <Badge n={8} x={330} y={302} />
    </Sheet>
  );
}
