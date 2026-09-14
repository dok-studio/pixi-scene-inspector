import { useRef } from 'react';

import { Switch } from '../ui/switch.js';
import type { PropertyCell } from './propertyCells.js';
import type { PropertyPanelData } from './propertyTypes.js';
import type { SwitchRow, SwitchSettings } from './switchMemory.js';
import { flipSwitch, NO_SWITCH_MEMORY } from './switchMemory.js';

/** Ported from the previous project unchanged. */
export const BooleanProperty: React.FC<PropertyPanelData> = ({ value, entry }) => (
  <Switch
    className="bg-border h-5"
    checked={value === true}
    onCheckedChange={(checked) => {
      entry.onChange(checked);
    }}
  />
);

/**
 * The switch that owns its group, drawn in the group's heading.
 *
 * The same control as any other boolean — what is different is where it sits and
 * what it writes. Where: a switch deciding whether the rows below it mean
 * anything is not one of those rows, and the heading is where a group's own
 * statements go, beside what a fill says about its kind. What: it carries the
 * group back to what it was, which no plain boolean has to.
 *
 * **No state of its own** beyond that memory, as everywhere else here: it writes
 * and lets the next poll answer, so a value the page clamps or refuses shows up
 * as a switch that did not move.
 */
export function GroupSwitch({ cell, rows }: { cell: PropertyCell; rows: readonly SwitchRow[] }) {
  const on = cell.value === true;

  /**
   * What the group held the last time it was switched off, so that going off and
   * back on compares two looks rather than retyping one of them — see
   * `switchMemory.ts`. A ref because remembering changes nothing on screen.
   *
   * It lasts exactly as long as this component does, and that is the point: the
   * grid keys it on the cell, whose id carries the node, so choosing another text
   * mounts a fresh one with nothing remembered.
   */
  const memory = useRef<SwitchSettings | null>(NO_SWITCH_MEMORY);

  return (
    <Switch
      className="bg-border h-5 flex-none"
      checked={on}
      onCheckedChange={() => {
        // Which way it was asked to go is not worth reading: a switch reports the
        // side it is not on, which is the side it is being taken to anyway.
        const flipped = flipSwitch(memory.current, on, rows);
        memory.current = flipped.memory;
        cell.onChange(cell.descriptor.key, flipped.write);
      }}
    />
  );
}
