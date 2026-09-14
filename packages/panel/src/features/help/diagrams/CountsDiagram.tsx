import { LuX } from 'react-icons/lu';

import type { T } from '../../../i18n/index.js';
import { Cap, Chip, Icon, INK, Plate, Sheet } from './parts.js';

/**
 * The `Counts` strip on its own — the picture the section named after it points
 * at, at the size the strip is in the panel.
 *
 * One row of controls, as `CountsStrip` draws it: the name, the mode switch
 * beside it, and the close button at the far end. Everything a number could say
 * is said in the grid under them.
 */

const W = 340;
const H = 82;

const MODES = ['scene', 'node', 'both'] as const;

const ROWS = [
  { type: 'Total', count: 40, share: 4 },
  { type: 'Sprite', count: 12, share: 2 },
  { type: 'Container', count: 10, share: 1 },
  { type: 'Graphics', count: 8, share: 0 },
  { type: 'Text', count: 6, share: 1 },
  { type: 'Spine', count: 4, share: 0 },
];

export function CountsDiagram({ title, t }: { title: string; t: T }) {
  return (
    <Sheet w={W} h={H} title={title}>
      <Plate x={2} y={2} w={W - 4} h={H - 4} fill={INK.raised} r={2} />
      <Plate x={2} y={2} w={W - 4} h={18} fill={INK.bar} r={2} />
      <Cap x={10} y={11} weight={600}>
        {t('scene.counts.title')}
      </Cap>
      {MODES.map((mode, i) => (
        <g key={mode}>
          <Chip x={76 + i * 41} y={5} w={38} h={12} on={mode === 'both'} />
          <Cap
            x={76 + i * 41 + 19}
            y={11}
            size={7}
            anchor="middle"
            fill={mode === 'both' ? INK.onAccent : INK.text}
          >
            {t(`scene.counts.mode.${mode}.label`)}
          </Cap>
        </g>
      ))}
      <Icon glyph={LuX} x={W - 18} y={6} size={9} color={INK.faint} />

      {ROWS.map((row, i) => {
        const col = i % 2;
        const line = Math.floor(i / 2);
        const x = 12 + col * (W / 2 - 12);
        const y = 34 + line * 16;

        return (
          <g key={row.type}>
            <Cap x={x} y={y} size={8} fill={row.type === 'Total' ? INK.text : INK.faint}>
              {row.type}
            </Cap>
            <Cap x={x + 86} y={y} weight={600}>
              {row.count}
            </Cap>
            <Cap x={x + 102} y={y} fill={INK.faint}>
              /
            </Cap>
            <Cap x={x + 108} y={y} weight={row.share === 0 ? undefined : 600}>
              {row.share}
            </Cap>
          </g>
        );
      })}
    </Sheet>
  );
}
