import type {
  Json,
  PropertyDescriptor,
  TextTagMutation,
  TextTagStyle,
} from '@scene-inspector/protocol';
import { useCallback, useMemo } from 'react';
import { FaPlus, FaXmark } from 'react-icons/fa6';

import type { CellGroup, PropertyCell } from '../../../../components/properties/propertyCells.js';
import { PropertyGrid } from '../../../../components/properties/propertyGrid.js';
import { Button } from '../../../../components/ui/button.js';
import { useT } from '../../../../i18n/index.js';
import { Hint } from '../../../../components/ui/tooltip.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu.js';
import { atomicGroups, startingValue, tagRows } from './tagCells.js';

/**
 * One tag's style, as cells in the panel's shared grid.
 *
 * What is here rather than in the grid is what belongs to a tag: it holds only
 * what it overrides, and what it overrides can be put back.
 *
 * **What can be put back is not always one property.** A fill, a stroke and a
 * shadow are single decisions written down as several fields, and a tag takes
 * each of them on or off whole (`groupAtomic`). Offering to reset a stroke's
 * width on its own produced states nobody meant — a tag overriding a width but
 * not the colour beside it, or a switch left overriding nothing — so for those
 * groups the `+` adds the group, the `✕` in its heading takes the group, and the
 * rows in between carry no reset of their own.
 *
 * Font and Layout are the other kind and keep the per-property behaviour: a
 * family and a size are independent settings that happen to share a heading.
 *
 * A fill used to have markup here too — it can be a gradient, and the colour
 * editor has one swatch — but that was never a fact about tags. It is a fact
 * about fills, and it lives with the `fill` editor now, where the Text tab gets
 * it as well.
 */

/** The one tag that is a whole style rather than an override of one. */
const DEFAULT_TAG = 'default';

/**
 * The button that puts one property, or one whole group, back.
 *
 * `default` is a complete style, so nothing is taken off it. On the other tags
 * the word is "reset" rather than "remove", because that is what it means on
 * both classes: one drops the override, the other copies the default's value
 * back, and the cells disappear either way.
 *
 * On a row it stays in the layout whether it is visible or not, so a grid of
 * fifteen cells is not a grid of fifteen crosses and nothing moves under the
 * pointer. In a heading it is always visible: a band holds one or two controls,
 * not fifteen, and a reset that has to be hunted for by hovering the right strip
 * is a reset nobody finds.
 */
function ClearButton({
  title,
  onClear,
  always = false,
}: {
  title: string;
  onClear: () => void;
  always?: boolean;
}) {
  return (
    <Hint text={title}>
      <Button
        variant="ghost"
        size="xs"
        className={
          always
            ? 'flex-none px-1'
            : 'flex-none px-1 opacity-0 transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 focus-visible:opacity-100'
        }
        onClick={onClear}
      >
        <FaXmark />
      </Button>
    </Hint>
  );
}

export interface TagStyleGridProps {
  tag: TextTagStyle;
  /** What `default` says, which is what an untouched cell is showing. */
  base: Record<string, Json>;
  fields: readonly PropertyDescriptor[];
  /** Properties asked for from the `+` menu but not overridden yet. */
  revealed: ReadonlySet<string>;
  onMutate: (mutation: TextTagMutation) => void;
  onReveal: (keys: readonly string[]) => void;
  onHide: (keys: readonly string[]) => void;
}

export function TagStyleGrid({
  tag,
  base,
  fields,
  revealed,
  onMutate,
  onReveal,
  onHide,
}: TagStyleGridProps) {
  const t = useT();
  const isDefault = tag.name === DEFAULT_TAG;
  const atomic = useMemo(() => atomicGroups(fields), [fields]);

  const rows = useMemo(() => tagRows(tag, fields, revealed), [tag, fields, revealed]);

  const cells = useMemo((): PropertyCell[] => {
    return rows.map((descriptor) => {
      // Whether the tag says this itself, or the row is only showing what it
      // inherits. The group's switch needs the difference: what it snapshots on
      // the way off is written back as this tag's own on the way on.
      const own = Object.hasOwn(tag.style, descriptor.key);
      const value = tag.style[descriptor.key] ?? startingValue(descriptor, base);

      const onChange = (key: string, next: Json): void => {
        onMutate({ kind: 'set', tag: tag.name, key, value: next });
      };

      // A group that is one thing is reset from its heading, so its rows carry
      // nothing: two ways to undo the same override, one of them leaving half a
      // stroke behind, is one way too many.
      const inAtomic = descriptor.group !== undefined && atomic.has(descriptor.group);
      const clearable = !isDefault && descriptor.readOnly !== true && !inAtomic;

      return {
        descriptor,
        value,
        inherited: !own,
        onChange,
        trailing: clearable ? (
          <ClearButton
            title={t.fill('scene.prop.resetOnTag', { field: descriptor.label, tag: tag.name })}
            onClear={() => {
              onMutate({ kind: 'clear', tag: tag.name, key: descriptor.key });
              if (revealed.has(descriptor.key)) onHide([descriptor.key]);
            }}
          />
        ) : undefined,
      };
    });
  }, [rows, tag, base, atomic, isDefault, revealed, onMutate, onHide]);

  const keysOfGroup = useCallback(
    (group: string): string[] =>
      fields.filter((field) => field.group === group).map((field) => field.key),
    [fields],
  );

  /** The reset that belongs to a whole group, drawn at the end of its heading. */
  const groupAside = useCallback(
    (group: CellGroup) => {
      if (isDefault || group.name === undefined || !atomic.has(group.name)) return null;

      return (
        <ClearButton
          always
          title={t.fill('scene.prop.resetOnTag', { field: group.name, tag: tag.name })}
          onClear={() => {
            onMutate({ kind: 'clearGroup', tag: tag.name, group: group.name ?? '' });
            onHide(keysOfGroup(group.name ?? ''));
          }}
        />
      );
    },
    [isDefault, atomic, tag.name, onMutate, onHide, keysOfGroup],
  );

  /**
   * What the `+` menu offers: the groups that are one thing and are not on show,
   * and the individual properties of every other group that are not.
   *
   * A group is named once. Offering `Colour`, `Width` and `Join` separately for a
   * stroke asked which third of a stroke was wanted, which is not a question a
   * stroke has an answer to.
   */
  const missing = useMemo((): Array<{ label: string; keys: string[] }> => {
    const drawn = new Set(rows.map((row) => row.key));
    const offered: Array<{ label: string; keys: string[] }> = [];
    const named = new Set<string>();

    for (const field of fields) {
      const group = field.group;

      if (group !== undefined && atomic.has(group)) {
        if (named.has(group) || drawn.has(field.key)) continue;

        named.add(group);
        offered.push({ label: group, keys: keysOfGroup(group) });
        continue;
      }

      if (!drawn.has(field.key)) offered.push({ label: field.label, keys: [field.key] });
    }

    return offered;
  }, [rows, fields, atomic, keysOfGroup]);

  return (
    <div className="px-1 py-1">
      <PropertyGrid cells={cells} groupAside={groupAside} />

      <div className="flex items-center gap-1 pt-2">
        <DropdownMenu>
          <Hint text={t('scene.prop.addTagProperty')}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                className="gap-1 px-1"
                disabled={missing.length === 0}
              >
                <FaPlus /> Property
              </Button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            {missing.map((entry) => (
              <DropdownMenuItem
                key={entry.label}
                onSelect={() => {
                  onReveal(entry.keys);
                }}
              >
                {entry.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {tag.name !== DEFAULT_TAG && (
          <Hint text={t.fill('scene.prop.deleteTag', { tag: tag.name })}>
            <Button
              variant="outline"
              size="xs"
              className="gap-1 px-1"
              onClick={() => {
                onMutate({ kind: 'remove', tag: tag.name });
              }}
            >
              <FaXmark /> Tag
            </Button>
          </Hint>
        )}
      </div>
    </div>
  );
}
