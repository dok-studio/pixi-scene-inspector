import { FaEye, FaPlus } from 'react-icons/fa6';
import { LuAxis3D, LuBookmark } from 'react-icons/lu';

import type { T } from '../../../i18n/index.js';
import { Cap, Icon, INK, Plate, Sheet } from './parts.js';

/**
 * One row of the tree, on its own — the picture the "three buttons" paragraph
 * in `Дерево`/`The tree` points at.
 *
 * Its own tiny sheet rather than a crop of `SceneDiagram`, so it can sit right
 * beside the paragraph that names the three buttons without dragging the whole
 * panel along with it. Sized to match a row on that bigger picture rather than
 * the full-width figures elsewhere in the document — a single row blown up to
 * column width would read as something other than what it is.
 */

const W = 320;
const H = 28;

export function TreeRowDiagram({ title }: { title: string; t: T }) {
  const y = 14;

  return (
    <Sheet w={W} h={H} title={title}>
      <Plate x={2} y={2} w={W - 4} h={H - 4} fill={INK.raised} r={2} />
      <Icon glyph={FaPlus} x={10} y={y - 3} size={6} color={INK.text} />
      <Cap x={20} y={y} fill={INK.text}>
        hero
      </Cap>
      {/* A fixed offset rather than `name.length * …`: this row never draws
          another name, so there is nothing to measure. */}
      <Cap x={52} y={y} size={8} fill={INK.faint}>
        (Sprite)
      </Cap>
      <Icon glyph={FaEye} x={W - 76} y={y - 5} size={10} color={INK.text} />
      <Icon glyph={LuBookmark} x={W - 54} y={y - 5} size={10} color={INK.text} />
      <Icon glyph={LuAxis3D} x={W - 32} y={y - 5} size={10} color={INK.text} />
    </Sheet>
  );
}
