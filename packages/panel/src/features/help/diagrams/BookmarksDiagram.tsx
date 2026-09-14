import { FaAngleDown } from 'react-icons/fa6';
import { LuBookmarkX, LuX } from 'react-icons/lu';

import type { T } from '../../../i18n/index.js';
import { Cap, Icon, INK, Plate, Sheet } from './parts.js';

/**
 * The `Bookmarks` drawer on its own — the picture the section named after it
 * points at, at the size the drawer is in the panel.
 *
 * The header is `CollapsibleSection`'s: the title on the left, and on the right
 * the count, the button that clears every bookmark, and the fold arrow. The
 * `✕` on a row takes that one bookmark off.
 */

const W = 340;
const H = 84;

const ROWS = [
  { name: 'hero', type: 'Sprite' },
  { name: 'score', type: 'Text' },
  { name: 'background', type: 'Container' },
];

/** Wide enough a guess to clear any of the names above without measuring text. */
const typeX = (name: string): number => 12 + name.length * 6.2 + 8;

export function BookmarksDiagram({ title, t }: { title: string; t: T }) {
  return (
    <Sheet w={W} h={H} title={title}>
      <Plate x={2} y={2} w={W - 4} h={H - 4} fill={INK.raised} r={2} />
      <Plate x={2} y={2} w={W - 4} h={18} fill={INK.bar} r={2} />
      <Cap x={10} y={11} weight={600}>
        {t('scene.bookmarks.title')}
      </Cap>
      <Cap x={W - 40} y={11} size={8} anchor="end" fill={INK.faint}>
        3
      </Cap>
      <Icon glyph={LuBookmarkX} x={W - 34} y={6} size={9} color={INK.faint} />
      <Icon glyph={FaAngleDown} x={W - 17} y={7} size={8} color={INK.faint} />

      {ROWS.map((row, i) => (
        <g key={row.name}>
          <Cap x={12} y={36 + i * 16} fill={INK.text}>
            {row.name}
          </Cap>
          <Cap x={typeX(row.name)} y={36 + i * 16} size={8} fill={INK.faint}>
            ({row.type})
          </Cap>
          <Icon glyph={LuX} x={W - 20} y={32 + i * 16} size={9} color={INK.faint} />
        </g>
      ))}
    </Sheet>
  );
}
