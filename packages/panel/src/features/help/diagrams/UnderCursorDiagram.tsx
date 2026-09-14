import { FaAngleDown } from 'react-icons/fa6';
import { LuFilter, LuX } from 'react-icons/lu';

import type { T } from '../../../i18n/index.js';
import { Cap, Chip, Icon, INK, Plate, Sheet } from './parts.js';

/**
 * The `Under cursor` drawer on its own, past the picker's shared reading of it
 * in `SceneDiagram` — this is the picture the section named after it points at.
 *
 * Drawn at the size the drawer is in the panel, and no taller than the row it
 * actually holds. The header follows `CollapsibleSection`: the title on the
 * left, and on the right the count, the close button and the fold arrow, in
 * that order.
 */

const W = 340;
const H = 116;

const CHIPS = [
  { label: 'Container', on: false },
  { label: 'Sprite', on: true },
  { label: 'Graphics', on: false },
  { label: 'Spine', on: false },
  { label: 'Text', on: false },
];

const ROWS = [
  { name: 'hero', type: 'Sprite', selected: true },
  { name: 'shadow', type: 'Sprite', selected: false },
  { name: 'panel', type: 'Graphics', selected: false },
  { name: 'background', type: 'Container', selected: false },
];

/** Wide enough a guess to clear any of the names above without measuring text. */
const typeX = (name: string): number => 12 + name.length * 6.2 + 8;

export function UnderCursorDiagram({ title, t }: { title: string; t: T }) {
  return (
    <Sheet w={W} h={H} title={title}>
      <Plate x={2} y={2} w={W - 4} h={H - 4} fill={INK.raised} r={2} />
      <Plate x={2} y={2} w={W - 4} h={18} fill={INK.bar} r={2} />
      <Cap x={10} y={11} weight={600}>
        {t('scene.picked.title')}
      </Cap>
      <Cap x={W - 40} y={11} size={8} anchor="end" fill={INK.faint}>
        1/4
      </Cap>
      <Icon glyph={LuX} x={W - 34} y={6} size={9} color={INK.faint} />
      <Icon glyph={FaAngleDown} x={W - 17} y={7} size={8} color={INK.faint} />

      <Icon glyph={LuFilter} x={10} y={29} size={8} color={INK.faint} />
      {CHIPS.map((chip, i) => (
        <g key={chip.label}>
          <Chip x={22 + i * 63} y={25} w={57} h={12} on={chip.on} />
          <Cap x={22 + i * 63 + 5} y={31} size={6.5} fill={chip.on ? INK.onAccent : INK.text}>
            {chip.label}
          </Cap>
        </g>
      ))}

      {ROWS.map((row, i) => (
        <g key={row.name}>
          {row.selected && (
            <Plate x={4} y={52 + i * 16 - 7} w={W - 8} h={14} fill={INK.accent} stroke="none" r={2} />
          )}
          <Cap x={12} y={52 + i * 16} fill={row.selected ? INK.onAccent : INK.text}>
            {row.name}
          </Cap>
          <Cap x={typeX(row.name)} y={52 + i * 16} size={8} fill={row.selected ? INK.onAccent : INK.faint}>
            ({row.type})
          </Cap>
        </g>
      ))}
    </Sheet>
  );
}
