import { useMemo, useRef } from 'react';
import type { MessageKey } from '../../i18n/index.js';
import { useT } from '../../i18n/index.js';

import { ColorInput } from '../ui/color.js';
import { GradientInput } from '../ui/gradient.js';
import { Segmented } from '../ui/segmented.js';
import type { FillMemory } from './fillMemory.js';
import { asColour, asGradient, NO_FILL_MEMORY, swapKind } from './fillMemory.js';
import type { PropertyCell } from './propertyCells.js';
import type { PropertyPanelData } from './propertyTypes.js';

/**
 * A fill: a colour, or a gradient, and the choice between them.
 *
 * Which of the two a fill holds is a fact about the **value** rather than about
 * the property, so the schema cannot settle it — `style.fill` is the same declared
 * row whether the text is filled flat or with a ramp. So the row reads its value
 * and draws whichever it finds, and the choice is made elsewhere: `FillKind` goes
 * into the heading of the group the fill belongs to (`propertyGrid.tsx`).
 *
 * It was a button beside the editor first, and twice wrong for it. A pair of
 * arrows says nothing about what it swaps between — and a button is an action
 * where this is a state, so nothing showed when the action did nothing at all.
 * That happens: a v8 page exposing neither its module nor a gradient cannot make
 * one, and the write is honestly refused. A control that shows which of the two is
 * current answers both — it reads without a tooltip, and a refused write is a
 * segment that does not move.
 *
 * **No state of its own.** An even earlier version opened the gradient editor
 * locally and waited for the first real edit before writing, so as not to promise
 * anything on a page that could not deliver. That was the lie: nothing ever closed
 * that editor again. Writing and letting the next poll answer is what every other
 * control here does.
 */

export const FillProperty: React.FC<PropertyPanelData> = (data) => {
  const gradient = asGradient(data.value);

  if (gradient === null) {
    return <ColorInput value={asColour(data.value)} onChange={data.entry.onChange} />;
  }

  return <GradientInput value={gradient} onChange={data.entry.onChange} />;
};

/**
 * Which of the two this fill is, as a choice rather than as a switch.
 *
 * Words rather than a drawing, and deliberately: two swatches — one solid, one a
 * ramp — would be prettier and would repeat the mistake the arrows made. What went
 * wrong was that nothing said what the control was for, and a second wordless icon
 * would not say it either.
 *
 * Going to a gradient writes a ramp of the colour that was there; coming back
 * writes the first colour of the ramp. Both are ordinary writes to the same key,
 * and the page has the last word on either.
 */
/** The labels stay English — they name kinds of fill, beside property rows
 *  that do too. Only what each kind means is translated. */
const KINDS: readonly { value: string; label: string; titleKey: MessageKey }[] = [
  { value: 'solid', label: 'Solid', titleKey: 'ui.fill.solid' },
  { value: 'gradient', label: 'Gradient', titleKey: 'ui.fill.gradient' },
];

export function FillKind({ cell }: { cell: PropertyCell }) {
  const t = useT();
  const kinds = useMemo(() => KINDS.map((k) => ({ ...k, title: t(k.titleKey) })), [t]);
  const gradient = asGradient(cell.value);

  /**
   * What the fill was in the kind it is not in now, so that going there and back
   * compares two looks rather than rebuilding each from the other — see
   * `fillMemory.ts`. A ref because remembering changes nothing on screen.
   *
   * It lasts exactly as long as this component does, and that is the point: the
   * grid keys it on the cell, whose id carries the node, so choosing another text
   * mounts a fresh one with nothing remembered.
   */
  const memory = useRef<FillMemory>(NO_FILL_MEMORY);

  return (
    <Segmented
      className="flex-none"
      value={gradient === null ? 'solid' : 'gradient'}
      options={kinds}
      onChange={() => {
        // Which kind was asked for is not worth reading: pressing the segment that
        // is already on asks for nothing at all, and `Segmented` drops that — so
        // anything arriving here is the other one. And where the value behind this
        // is a poll behind the click, swapping is what was meant anyway.
        const swapped = swapKind(memory.current, cell.value);
        memory.current = swapped.memory;
        cell.onChange(cell.descriptor.key, swapped.write);
      }}
    />
  );
}
