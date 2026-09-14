import type { PropertyDescriptor } from '@scene-inspector/protocol';
import { Fragment, useMemo } from 'react';
import { FaAlignCenter, FaAlignJustify, FaAlignLeft, FaAlignRight } from 'react-icons/fa6';

import { Separator } from '../ui/separator.js';
import { cn } from '../../lib/utils.js';
import type { SegmentedOption } from '../ui/segmented.js';
import { Segmented } from '../ui/segmented.js';
import { GroupSwitch } from './boolean-property.js';
import { FillKind } from './fill-property.js';
import { tintOf } from './groupTint.js';
import type { CellGroup, PropertyCell } from './propertyCells.js';
import { groupCells, isSegmented, splitGroupSwitch } from './propertyCells.js';
import { useCopyGesture } from './useCopyGesture.js';
import { FallbackProperty, propertyMap } from './propertyMap.js';
import { propertyData } from './propertyTypes.js';

/**
 * Properties as a single column of cells under plain headings.
 *
 * One column, and not because it could not be two: the panel is often docked
 * to the side, where a second column leaves neither of them wide enough to
 * read, and a control that changes place with the panel's width is a control
 * that has to be looked for every time.
 *
 * What the column does instead of splitting is spend less on everything that
 * is not the editor:
 *
 *  - **a narrow label that wraps rather than shortens.** «Line h.» saves
 *    nothing worth the moment spent working out which property it is, and an
 *    ellipsis saves even less;
 *  - **headings instead of folds.** A heading is a line; a foldable header is a
 *    line, a border and a decision;
 *  - **anything a caller adds after the editor appears on hover** — see
 *    `group/cell` — so a column of fifteen cells is not a column of fifteen
 *    buttons, and nothing moves when the pointer crosses it.
 */

/** The four alignment marks, which need no explaining anywhere. */
const ALIGN_ICONS: Record<string, React.ReactNode> = {
  left: <FaAlignLeft />,
  center: <FaAlignCenter />,
  right: <FaAlignRight />,
  justify: <FaAlignJustify />,
};

/** The slant of the letter, shown as a letter. Two choices; see the schema. */
const FONT_STYLE_ICONS: Record<string, React.ReactNode> = {
  normal: <span className="font-serif not-italic">A</span>,
  italic: <span className="font-serif italic">A</span>,
};

/**
 * An angle, drawn three ways: rounded off, cut off, and left sharp.
 *
 * The corner is **drawn, not produced** — the shapes are hand-written paths
 * rather than one path under three `stroke-linejoin` values. Letting the renderer
 * do it is truthful and illegible: a real join reaches past the corner by the
 * stroke's half-width at most, which at sixteen pixels is a pixel or two of
 * difference between the round one and the cut one. Here the radius and the
 * chamfer are as large as the icon allows, which is the whole point of a picture
 * — the corner that is round has to look round.
 *
 * The angle is acute, and the two legs are the same in all three, so the row
 * shows one bend answered three ways rather than three shapes.
 *
 * The cut is longer than the radius, and not by accident: taken from the arc's
 * own tangent points it parts from it by about a pixel, and the two read as one
 * drawing. Dropped lower, the cut is a flat top and the arc a dome — two
 * silhouettes rather than two sagittas.
 */
const JOIN_PATHS = {
  round: 'M4 21 L8.4 12.2 A4 4 0 0 1 15.6 12.2 L20 21',
  bevel: 'M4 21 L7.1 14.8 L16.9 14.8 L20 21',
  miter: 'M4 21 L12 5 L20 21',
};

function joinIcon(join: keyof typeof JOIN_PATHS): React.ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d={JOIN_PATHS[join]}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

const JOIN_ICONS: Record<string, React.ReactNode> = {
  round: joinIcon('round'),
  bevel: joinIcon('bevel'),
  miter: joinIcon('miter'),
};

/** Nothing draws "against the baseline", so this set stays words. */
const VALIGN_LABELS: Record<string, string> = {
  top: 'Top',
  middle: 'Mid',
  bottom: 'Bot',
  baseline: 'Base',
};

function segmentOptions(descriptor: PropertyDescriptor): SegmentedOption[] {
  const values = Array.isArray(descriptor.options) ? descriptor.options.map(String) : [];

  return values.map((value) => ({
    value,
    label: ALIGN_ICONS[value] ?? FONT_STYLE_ICONS[value] ?? JOIN_ICONS[value] ?? VALIGN_LABELS[value] ?? value,
    title: value,
  }));
}

function Cell({ cell }: { cell: PropertyCell }) {
  const { descriptor } = cell;
  const Editor = propertyMap[descriptor.editor] ?? FallbackProperty;

  // The same gesture the Properties tab's rows offer, on the same half of the
  // row: the name copies the field it labels.
  const { className: nameClass, onDoubleClick } = useCopyGesture(cell.copy);

  return (
    // `gap-4` is `PropertyEntry`'s `mr-2` plus its `pl-2`, so the editors of the
    // two tabs start at the same pixel and not merely after the same count of
    // characters.
    //
    // And no floor under the height, for the same reason: `PropertyEntry` has
    // none, so its rows are as tall as what is in them — twenty pixels for a
    // switch, twenty-four for a field. A `min-h` here made every row of this
    // grid a couple of pixels taller than the same row on the Properties tab,
    // which on a column of fifteen is a different rhythm rather than a rounding.
    <div className="group/cell flex min-w-0 items-center gap-4">
      {/*
        Fixed width and two lines rather than one truncated line: the longest
        single word any of these labels is made of fits, so what wraps is the
        label, not a word cut in half.

        Which puts a burden on the leading, and it was got backwards at first:
        at ordinary leading the two lines of one name sat about as far apart as
        two adjacent names did, so a wrapped label had nothing holding it
        together. Tightened here, a name reads as one thing wherever it wraps.

        How far apart *neighbours* sit is the caller's, because it depends on
        how many of its labels wrap at all. The default is the tight column the
        Text tab wants — one label wraps there, and its rows line up with the
        Properties tab beside it. The settings popover, where Ukrainian wraps
        half the column, opens it up through `className`.
      */}
      {/*
        Full-strength ink, like the labels in the Properties tab: these name
        what is being edited, and a muted name reads as a disabled one.

        Eleven characters **of the same size** as `PropertyEntry` — the two tabs
        are read one after the other, and a field that starts a few pixels
        further left in one of them is a field that has to be found again. `ch`
        alone would not do it: eleven of them at 11px is six pixels short of
        eleven at 12px.
      */}
      <span
        onDoubleClick={onDoubleClick}
        className={cn(
          'text-foreground w-[11ch] flex-none break-words text-xs leading-[1.15]',
          nameClass,
        )}
      >
        {descriptor.label}
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-1">
        {/*
          A select's trigger is a size taller than an input; here they line up.
          Scoped to selects rather than to every button, because a switch is a
          button too and has a height of its own.
        */}
        <span
          className={cn(
            'flex min-w-0 flex-1 items-center',
            descriptor.editor === 'select' && '[&>button]:h-6',
          )}
        >
          {isSegmented(descriptor) ? (
            <Segmented
              value={typeof cell.value === 'string' ? cell.value : ''}
              options={segmentOptions(descriptor)}
              onChange={(next) => {
                cell.onChange(descriptor.key, next);
              }}
            />
          ) : (
            <Editor
              {...propertyData(descriptor, cell.value, cell.onChange, cell.optionLabels)}
            />
          )}
        </span>

        {cell.trailing}
      </span>
    </div>
  );
}

function Group({
  group,
  aside,
  label,
  divided,
}: {
  group: CellGroup;
  aside: GroupAside | undefined;
  label: GroupLabel | undefined;
  divided: boolean;
}) {
  /*
   * A fill is a colour or a gradient, and which of the two it is belongs in the
   * heading rather than in the row: the row is about the value, the heading about
   * what kind of value it is. The group is found by the editor its cells declare
   * rather than by its name, so nothing here depends on the schema calling it
   * `Fill` — see `FillKind` for why it is a choice and not a switch.
   */
  const fill = group.cells.find((cell) => cell.descriptor.editor === 'fill');

  /*
   * And a stroke or a shadow is there or it is not, which belongs in the heading
   * for the same reason: it is a statement about the group rather than one more
   * value in it. Which cell that is comes from the schema — see `splitGroupSwitch`
   * — and the rows it leaves behind are what the switch decides the fate of.
   *
   * The band draws the control and not the cell's `trailing`, which is how a tag's
   * reset button comes off a hoisted switch without anything saying so: there is
   * nothing to reset a group's existence to.
   */
  const { switchCell, rows } = splitGroupSwitch(group);

  return (
    <>
      {group.name !== undefined && (
        // A band rather than a line: the same tinted strip a foldable header
        // has, since it does the same job of dividing the section. `-mx-1`
        // cancels the grid's own padding, so it reaches both edges the way that
        // header does.
        //
        // Each group's band is a slightly different one. Five identical grey
        // strips down a narrow column are told apart by counting; a faint hue
        // turns that into recognition. It comes from the group's **name** rather
        // than from its place in the section, so a group is the same colour on
        // the Text tab and on every tag — see `groupTint.ts`, which is also where
        // the amount of it is argued.
        <div
          style={{ backgroundColor: tintOf(group.name) }}
          className="border-border bg-muted text-foreground -mx-1 mt-2 flex min-w-0 items-center gap-2 border-y px-2 py-0.5 text-xs font-semibold first:mt-0"
        >
          {/*
            The name takes the slack, so everything else in the band gathers at
            the right end of it. On a tag the band carries two things — the
            control and the button that takes the whole group off — and spreading
            them evenly put the control adrift in the middle, nearer the heading
            it is not part of than the button it belongs beside.
          */}
          <span className="mr-auto truncate">
            {label === undefined ? group.name : label(group.name)}
          </span>
          {/*
            Keyed on the cell: `FillKind` and `GroupSwitch` each remember what
            their control is not currently showing, and that memory has to end
            when the selection does. The Text tab's cells carry the node in their
            id, and the tag section is keyed on the node above — so both come out
            right without a lifetime of their own.
          */}
          {fill !== undefined && <FillKind key={fill.id ?? fill.descriptor.key} cell={fill} />}
          {switchCell !== undefined && (
            <GroupSwitch
              key={switchCell.id ?? switchCell.descriptor.key}
              cell={switchCell}
              rows={rows.map((cell) => ({
                key: cell.descriptor.key,
                value: cell.value,
                inherited: cell.inherited,
              }))}
            />
          )}
          {aside?.(group)}
        </div>
      )}

      {rows.map((cell, index) => (
        <Fragment key={cell.id ?? cell.descriptor.key}>
          <Cell cell={cell} />
          {divided && index < rows.length - 1 && (
            <Separator orientation="horizontal" className="opacity-40" />
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Something of the caller's at the end of a group's heading.
 *
 * The grid knows what a group *is* — its name, its cells, which of them owns the
 * heading — and nothing about what a group **means to the thing being edited**.
 * That is where a tag differs from a node: a tag holds only its overrides, so a
 * group there can be taken off, and a group on the Text tab cannot be. So the
 * button that takes it off belongs to the tag section and is handed in.
 */
export type GroupAside = (group: CellGroup) => React.ReactNode;

/**
 * What a group's heading is **called**, where that is not what the group is.
 *
 * The name stays the identity — `tintOf` hashes it for the band's colour and
 * `groupCells` gathers on it — so only the text node changes, and only here.
 * Absent leaves a group naming itself, which is what the property panel wants:
 * its headings arrive from the page beside the property names (§3.14).
 */
export type GroupLabel = (name: string) => string;

export interface PropertyGridProps {
  cells: readonly PropertyCell[];
  className?: string;
  groupAside?: GroupAside;
  groupLabel?: GroupLabel;
  /**
   * A hairline between rows, the one `PropertyEntry` draws.
   *
   * On by default, because the Text tab is read straight after the Properties
   * tab and a column of rows divided in one of them and not the other reads as
   * two different kinds of list. It divides **within** a group only: a heading
   * is already a stronger line, and a rule drawn against it would be a rule
   * beside a rule.
   *
   * Off where the rows are spaced far enough apart to divide themselves — see
   * `SettingsPopover`, where a line as well would be saying it twice.
   */
  divided?: boolean;
}

export function PropertyGrid({
  cells,
  className,
  groupAside,
  groupLabel,
  divided = true,
}: PropertyGridProps) {
  const groups = useMemo(() => groupCells(cells), [cells]);

  return (
    <div className={cn('flex flex-col gap-y-0.5', className)}>
      {groups.map((group, index) => (
        <Group
          key={group.name ?? `#${String(index)}`}
          group={group}
          aside={groupAside}
          label={groupLabel}
          divided={divided}
        />
      ))}
    </div>
  );
}
