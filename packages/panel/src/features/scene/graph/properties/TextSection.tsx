import type { Json, SectionSchema } from '@scene-inspector/protocol';
import { useMemo } from 'react';

import type { PropertyCell } from '../../../../components/properties/propertyCells.js';
import { PropertyGrid } from '../../../../components/properties/propertyGrid.js';
import type { Condition } from './filter.js';
import { visibleFields } from './filter.js';
import { fieldSnippet } from './objectSnippet.js';

/**
 * The Text section: `layout: 'custom:text'`.
 *
 * What makes this worth a component of its own is only the **markup** — the
 * same grid a tag's style is drawn as, because it is the same kind of thing:
 * mostly short values, read in groups. Every field is still a declared
 * descriptor, read and written through the same commands as any other property
 * (docs/architecture.md §3.4). That is what keeps get/set single across these
 * fields.
 *
 * The groups are **headings, not folds**. Folding them away was the previous
 * shape and it cost more than it saved: a foldable header is a line, a border
 * and a decision, where a heading is a line — and in a drawer this narrow the
 * space goes to the fields.
 *
 * The conditions live here rather than in the protocol, exactly as the
 * architecture asks: a shadow's settings are pointless with the shadow off, and
 * a wrap width is pointless without wrapping — but saying so in the schema
 * would mean inventing an expression language for it.
 *
 * Every **grouped** field's name copies that field as source, the way General's
 * rows do under Properties. Grouped is the whole rule and it is the right one by
 * accident of what the schema already says: the rows above the first heading are
 * the classes a framework put on the node, where the caption sits, and the words
 * themselves — none of which is a line anyone pastes into a style. From Font
 * down, every row is.
 */

export interface TextSectionProps {
  section: SectionSchema;
  /** What the editors show. Between two selections these are the previous node's. */
  values: Record<string, Json> | null;
  /** What decides that a field does not exist on this node at all. */
  presence: Record<string, Json>;
  conditions: Record<string, Condition>;
  onChange: (key: string, value: Json) => void;
  /**
   * The rows survive a change of selection — that is the point of not
   * remounting the panel — but the editors inside them must not: a half-typed
   * draft belongs to the node it was typed on.
   */
  nodeId: number;
}

export function TextSection({
  section,
  values,
  presence,
  conditions,
  onChange,
  nodeId,
}: TextSectionProps) {
  const shown = useMemo(
    () => visibleFields(section.fields, presence, conditions),
    [section, presence, conditions],
  );

  // The switch that used to sit under the wrap fields is in the tab's own bar
  // now (`OverlaySwitches.tsx`): it is about the overlay rather than about the
  // node, and here it existed only while a caption happened to be selected.
  const cells = useMemo(
    (): PropertyCell[] =>
      shown.map((descriptor) => {
        const value = values?.[descriptor.key];
        // The trailing comma is the row's, not the printer's: a field copied on
        // its own is going into a style beside other fields, and the one it is
        // pasted after is almost never the last.
        const printed = descriptor.group === undefined ? null : fieldSnippet(descriptor, value);

        return {
          descriptor,
          value,
          onChange,
          id: `${String(nodeId)}:${descriptor.key}`,
          copy: printed === null ? undefined : `${printed},`,
        };
      }),
    [shown, values, onChange, nodeId],
  );

  if (cells.length === 0) return null;

  // The same padding the generic sections have, and no indent of its own: the
  // fields reach as close to the panel's edges here as they do under Properties.
  return <PropertyGrid cells={cells} className="px-1 py-1" />;
}
