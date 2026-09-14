import type { Json, PropertyDescriptor } from '@scene-inspector/protocol';

/**
 * How a property grid is arranged — the arithmetic of it, with no markup.
 *
 * Two questions, and both are about the descriptor alone, which is why they are
 * testable without rendering anything: which group a control belongs to, and
 * whether its choices are the kind that get drawn rather than listed.
 */

/** One control in a grid: what to draw, what it holds, and where it goes. */
export interface PropertyCell {
  descriptor: PropertyDescriptor;
  value: Json | undefined;
  onChange: (key: string, value: Json) => void;
  /** Drawn after the editor — a tag's reset button, and nothing else so far. */
  trailing?: React.ReactNode;
  /**
   * What the editor's options are **called**, where that is not what they are
   * — see `optionLabels` in `propertyTypes.ts`. Only the panel's own settings
   * ever set it; a node's property is written back by value.
   */
  optionLabels?: Readonly<Record<string, string>>;
  /**
   * The field as source, copied when the cell's **name** is double-clicked
   * (`useCopyGesture`). Absent leaves the name inert.
   */
  copy?: string;
  /** React identity. Defaults to the descriptor's key; the scene panel keys on
   *  the node as well, so a half-typed draft cannot survive a new selection. */
  id?: string;
  /**
   * The value is the default's, shown because this grid has nothing of its
   * own to show — a tag draws every field of its group, and fills the gaps
   * from the tag it inherits from. Nothing may write such a value back: it
   * was never this tag's to begin with.
   */
  inherited?: boolean;
}

/**
 * The choices drawn as a row of joined buttons rather than as a select.
 *
 * Each is a set that cannot grow and has a drawing everyone already knows: the
 * alignment marks, the slant of a letter, the corner of a stroke. A select
 * would hide all but one of them behind a click and take the same room.
 *
 * Matched on the **last** step of the key, because the same property is spelled
 * `align` on a tag and `style.align` on a node, and `stroke.join` on one
 * PixiJS line against `lineJoin` on the other.
 */
const SEGMENTED = new Set(['align', 'valign', 'fontStyle', 'join', 'lineJoin']);

export function isSegmented(descriptor: PropertyDescriptor): boolean {
  if (descriptor.editor !== 'select') return false;

  const steps = descriptor.key.split('.');
  return SEGMENTED.has(steps[steps.length - 1] ?? '');
}

export interface CellGroup {
  /** Absent for the controls a section draws before its first heading. */
  name: string | undefined;
  cells: PropertyCell[];
}

/** Groups keyed by name, with one key left for the ones that have none. */
const UNGROUPED = Symbol('ungrouped');

/**
 * The cells of a section, gathered into groups in the order the groups first
 * appear — which is the order the descriptors are declared in, so related
 * properties stay together without a list saying so here.
 *
 * Nothing is reordered inside a group either. A switch used to be lifted to the
 * front of its group, on the grounds that a shadow's settings mean nothing with
 * the shadow off; but that put the control somewhere other than where the schema
 * says it is, and the schema can just as easily declare it first. Where a switch
 * belongs is a question about that one property, and the file that names the
 * property is where it gets answered — which is now also how a switch says it is
 * drawn in the heading rather than in the rows: `groupSwitch`, a flag, not a
 * position. See `splitGroupSwitch`.
 *
 * A group nothing landed in does not appear at all, which is what keeps a tag
 * that overrides two things two lines long.
 */
export function groupCells(cells: readonly PropertyCell[]): CellGroup[] {
  const groups: CellGroup[] = [];
  const byName = new Map<string | typeof UNGROUPED, CellGroup>();

  for (const cell of cells) {
    const name = cell.descriptor.group;

    let group = byName.get(name ?? UNGROUPED);
    if (group === undefined) {
      group = { name, cells: [] };
      byName.set(name ?? UNGROUPED, group);
      groups.push(group);
    }

    group.cells.push(cell);
  }

  return groups;
}

/**
 * The one cell of a group that is drawn in its heading, taken out of the rows.
 *
 * A switch of this kind decides whether the rest of the group means anything at
 * all, which is a statement about the group rather than a value beside the
 * others — and the heading is where a group's own statements go, next to what a
 * fill says about its kind.
 *
 * Only a named group has one. A section's first cells are drawn before any
 * heading, and a control hoisted into a band that is not there would simply
 * disappear.
 *
 * The first marked cell wins if a schema ever declares two, which no test can
 * make right — but one control in a heading is what the heading has room for,
 * and dropping the second is at least visible.
 */
export function splitGroupSwitch(group: CellGroup): {
  switchCell: PropertyCell | undefined;
  rows: PropertyCell[];
} {
  if (group.name === undefined) return { switchCell: undefined, rows: group.cells };

  const switchCell = group.cells.find((cell) => cell.descriptor.groupSwitch === true);
  if (switchCell === undefined) return { switchCell: undefined, rows: group.cells };

  return { switchCell, rows: group.cells.filter((cell) => cell !== switchCell) };
}
