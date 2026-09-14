import { SegmentedMulti } from '../../components/ui/segmented.js';
import type { MessageKey } from '../../i18n/index.js';
import type { T } from '../../i18n/index.js';
import { useT } from '../../i18n/index.js';
import { ColumnGroup } from './ColumnGroup.js';
import type { ChipAction } from './chips.js';
import { chipFor } from './chips.js';
import type { Column } from './columns.js';
import { chooseColumn, COLUMNS } from './columns.js';
import { fits, narrowToFit } from './columnFloor.js';

/**
 * The Custom tab: the panels somebody put side by side, and the chips that say
 * which.
 *
 * **The chips are in the tab, not in the navbar.** A control that lives in the
 * thing it configures needs no explaining; the same three words in the bar
 * above would have turned the tab strip into two kinds of control at once — a
 * radio group that is sometimes a set — and nobody would guess which click did
 * which.
 *
 * The tab holds no panel of its own. What each column *is* comes from the shell
 * as `panelFor`, so this component knows how to divide a panel and nothing
 * about what Spine or a texture atlas might be.
 */

/** What each chip is **called**, where that is not what it **is** (§3.14). */
const COLUMN_LABEL_KEYS: Record<Column, MessageKey> = {
  Scene: 'tab.scene',
  Assets: 'tab.assets',
  Stats: 'tab.stats',
};

/**
 * What a chip says about itself, which is not always what it is called.
 *
 * A table rather than the words, because the words are translated and a module
 * constant holding one would be frozen at the language it was imported in
 * (§3.14).
 */
function titleFor(t: T, action: ChipAction, label: string): string {
  switch (action.kind) {
    case 'anchor':
      return t('custom.anchor');
    case 'only':
      return t('custom.only');
    case 'show':
      return t.fill('custom.show', { panel: label });
    case 'hide':
      return t.fill('custom.hide', { panel: label });
    case 'swap':
      return t.fill('custom.swap', { panel: label, other: t(COLUMN_LABEL_KEYS[action.other]) });
  }
}

export function CustomPanel({
  chosen,
  onChoose,
  panelFor,
  width,
  digitPx,
}: {
  /** What was asked for, which is not always what there is room for. */
  chosen: readonly Column[];
  onChoose: (columns: readonly Column[]) => void;
  panelFor: (column: Column) => React.ReactNode;
  /** Measured by the shell, which is the one element that is the whole panel. */
  width: number;
  digitPx: number;
}) {
  const t = useT();

  /*
   * What is actually drawn.
   *
   * Derived rather than stored, and that is the whole of how the tab survives a
   * window being dragged about: narrowing drops columns from the right, and
   * widening brings them back, because the choice itself was never touched.
   *
   * The chips answer to **this** rather than to the choice, so a lit chip
   * always means a column on screen. Which also settles what a click does while
   * narrowed: it edits what is in front of you, and the column that had been
   * set aside for want of room is not quietly voted on.
   */
  const shown = narrowToFit(chosen, width, digitPx);

  const roomFor = (columns: readonly Column[]): boolean => fits(columns, width, digitPx);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/*
        The chips sit on the content's own surface, running on from the seam
        under the open tab, and they are marked `quiet` for the reason the
        counts strip is: this row stands directly over the thing the tab was
        opened to read, and three saturated chips would be the brightest object
        on the panel.
      */}
      <div className="border-border flex h-7 flex-none items-center gap-2 border-b px-2">
        <SegmentedMulti
          values={shown}
          variant="quiet"
          options={COLUMNS.map((column) => {
            const label = t(COLUMN_LABEL_KEYS[column]);

            /* What the click would do and what the chip may therefore say
               about itself — one answer, so the two cannot drift apart. */
            const { action } = chipFor(shown, column, roomFor);

            return {
              value: column,
              label,
              title: titleFor(t, action, label),
            };
          })}
          onToggle={(value) => {
            const next = chooseColumn(shown, value as Column, roomFor);
            if (next !== shown) onChoose(next);
          }}
        />
      </div>

      <ColumnGroup columns={shown} panelFor={panelFor} width={width} digitPx={digitPx} />
    </div>
  );
}
