import type { NodeId, SceneNode } from '@scene-inspector/protocol';
import { useMemo } from 'react';
import { LuX as CloseIcon } from 'react-icons/lu';

import { Button } from '../../../components/ui/button.js';
import { Segmented } from '../../../components/ui/segmented.js';
import { Hint } from '../../../components/ui/tooltip.js';
import type { MessageKey } from '../../../i18n/index.js';
import { useT } from '../../../i18n/index.js';
import { useLocalStorage } from '../../../lib/localStorage.js';
import { countTypes, subtreeOf, type NodeCounts } from '../../../lib/nodeCounts.js';
import { countRows, type CountsMode } from './rows.js';

/**
 * What the scene is made of, under the tree.
 *
 * In the tree's own column, beside the drawers that list bookmarks and picks:
 * these are counts *of the tree*, and the pane that holds the tree is where
 * they answer for. The properties beside it are about one node and have
 * nothing to say to a census.
 *
 * Read only, deliberately. A count is an answer, not a way in — the tree above
 * is already the way in, and a click here would have to mean either "filter the
 * tree" or "select these", neither of which is what the number is asked for.
 *
 * The numbers come off the tree payload the panel is already holding
 * (`lib/nodeCounts.ts`), so this costs no poll of its own and cannot disagree
 * with the rows above it.
 *
 * **It takes the height it needs and no more**, rather than a stored one with a
 * rail to drag. The drawers beside it are lists that run to hundreds of rows, so
 * how much of one to show is a real choice; this is a handful of words that
 * wrap. It still gives way when the column is short — the tree's floor comes
 * first, the same order the drawers keep.
 *
 * That also settles what would otherwise be two states meaning nearly the same
 * thing — the toolbar button opens it, and the cross closes it, so there is no
 * folded-but-open to be in.
 */

/**
 * About six wrapped rows. A ceiling rather than a height: a scene with three
 * types draws three, and only a page with an unusual number of distinct types
 * ever reaches this and scrolls.
 */
const MAX_HEIGHT = 'max-h-28';

const MODE_KEY = 'scene.counts.mode';

/**
 * What the strip opens on the first time.
 *
 * The one that answers both questions at once. It costs nothing to be in it
 * with nothing selected — the scene half is known either way, and the shares
 * simply read nought — so it is the mode with the least reason to be moved out
 * of, and opening in `Scene` only meant finding the other two by accident.
 */
const DEFAULT_MODE: CountsMode = 'both';

/** The three ways of reading the strip: what it is called, and what it means. */
const MODES: readonly { value: CountsMode; labelKey: MessageKey; titleKey: MessageKey }[] = [
  { value: 'scene', labelKey: 'scene.counts.mode.scene.label', titleKey: 'scene.counts.mode.scene' },
  { value: 'node', labelKey: 'scene.counts.mode.node.label', titleKey: 'scene.counts.mode.node' },
  { value: 'both', labelKey: 'scene.counts.mode.both.label', titleKey: 'scene.counts.mode.both' },
];

function isCountsMode(value: string): value is CountsMode {
  return MODES.some((mode) => mode.value === value);
}

/**
 * A count, spelled the same way everywhere in this strip: the number carries
 * the panel's ink and the word beside it recedes.
 *
 * A component rather than a class repeated four times, because the header got
 * it backwards once already — it had the total muted and its label bold, which
 * is the reverse of every row underneath. Whatever a reading is called, the
 * number is the thing being read.
 */
function Reading({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={muted ? 'text-foreground/45 tabular-nums' : 'font-bold tabular-nums'}>
      {children}
    </span>
  );
}

export function CountsStrip({
  nodes,
  selected,
  onClose,
}: {
  nodes: readonly SceneNode[];
  /** What the tree has selected, which is what the `node` mode counts. */
  selected: NodeId | null;
  onClose: () => void;
}) {
  const t = useT();
  const [stored, setMode] = useLocalStorage<string>(MODE_KEY, DEFAULT_MODE);
  const mode: CountsMode = isCountsMode(stored) ? stored : DEFAULT_MODE;

  const scene = useMemo(() => countTypes(nodes), [nodes]);
  const node = useMemo<NodeCounts | null>(
    () => (selected === null ? null : countTypes(subtreeOf(nodes, selected))),
    [nodes, selected],
  );

  const rows = useMemo(() => countRows(mode, scene, node), [mode, scene, node]);

  // The hints resolve here rather than in the table above, so they follow the
  // language rather than whichever one was on when this module was imported.
  const modes = useMemo(
    () => MODES.map((entry) => ({ ...entry, label: t(entry.labelKey), title: t(entry.titleKey) })),
    [t],
  );

  /*
   * Only `node` has nothing to draw without a selection. `both` still knows the
   * whole scene, and a column of noughts beside it is the true answer rather
   * than a missing one — see `countRows`.
   */
  const needsSelection = mode === 'node' && node === null;

  return (
    <div className="border-border flex min-h-0 flex-col overflow-hidden border-t">
      {/*
        Controls only. The name is one word and the rest of the row is the two
        things that can be done here, because everything a number could say is
        said better in the list below — where it is spelled the same way as
        every other number rather than a second way in a second place.
      */}
      <div className="border-border bg-muted flex h-6 min-h-6 items-center gap-2 border-b pl-2 text-xs font-bold">
        <span className="flex-none">{t('scene.counts.title')}</span>

        <Segmented
          value={mode}
          options={modes}
          onChange={setMode}
          // Marked in the panel's own ink rather than in the accent: this
          // control sits on top of the numbers it was opened for, and a
          // saturated chip is the brightest thing on an unlit panel.
          variant="quiet"
          className="flex-none font-normal"
        />

        <Hint text={t('scene.counts.close')}>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto mr-1 h-6 w-6 shrink-0 rounded-sm hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]"
            onClick={onClose}
          >
            <CloseIcon className="h-3 w-3 dark:stroke-white" />
          </Button>
        </Hint>
      </div>

      <div className={`overflow-auto px-2 py-1 ${MAX_HEIGHT}`}>
        {needsSelection ? (
          <p className="text-muted-foreground text-xs">{t('scene.selectNode')}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('scene.counts.empty')}</p>
        ) : (
          /*
           * A grid rather than a wrapped row of words.
           *
           * Run together on one line, the gap between a count and the next type
           * carried the same weight as the gap between a type and its own
           * count, so the pairs did not hold together and the whole thing read
           * as one stream of tokens. Two things fix that, and each answers half
           * of it: a cell gives every pair a boundary that is structural rather
           * than a wider space, and the name recedes to `--muted-foreground`
           * while the number keeps the panel's ink, so within a pair it is
           * obvious which half is which.
           *
           * `auto-fill` rather than a fixed column count: this column is
           * anywhere from a few characters to half the window, and this way the
           * cells stay near their minimum at either extreme.
           *
           * The number sits **next to** its name rather than pushed to the far
           * side of the cell. Right-aligning them would line the counts up in a
           * column, but in a cell this narrow it also puts more space inside a
           * pair than between two of them — which is the very thing that made
           * the single line hard to read. Nothing is lost by it: the list is
           * sorted by count, so which is largest is answered by the order.
           */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-4 gap-y-0.5 text-xs">
            {rows.map((entry) => (
              <div key={entry.type} className="flex items-baseline gap-1.5">
                {/* The panel's own ink at reduced strength, not
                    `--muted-foreground`: that token sits close enough to the
                    light theme's paper that a type name at this size went
                    faint, while the same token is comfortable in the dark one.
                    A fraction of the foreground recedes by the same amount on
                    either side, because it is measured from whatever the text
                    colour already is. */}
                <span className="text-foreground/70 min-w-0 truncate">{entry.type}</span>
                <span className="flex-none">
                  <Reading>{entry.count}</Reading>
                  {entry.share !== null && (
                    <>
                      <span className="text-muted-foreground mx-0.5">/</span>
                      {/* The share is muted where it is zero: a branch holding
                          none of a type is worth seeing without every such row
                          shouting the same nothing. */}
                      <Reading muted={entry.share === 0}>{entry.share}</Reading>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
