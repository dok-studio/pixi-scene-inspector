import type { TextureId, TextureInfo } from '@scene-inspector/protocol';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FaArrowsRotate as RefreshIcon, FaFilter as FilterIcon } from 'react-icons/fa6';
import { LuSearch as SearchIcon } from 'react-icons/lu';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu.js';
import { RadioGroup, RadioGroupItem } from '../../../components/ui/radio-group.js';
import { Segmented } from '../../../components/ui/segmented.js';
import { Separator } from '../../../components/ui/separator.js';
import { Hint } from '../../../components/ui/tooltip.js';
import type { MessageKey } from '../../../i18n/index.js';
import { useT } from '../../../i18n/index.js';
import { cn } from '../../../lib/utils.js';
import type { Client } from '../../../transport/client.js';
import type { Channel, Naming, Sort, SortKey } from './arrange.js';
import { arrangeTextures } from './arrange.js';
import { megabytes } from './bytes.js';
import {
  contentHeight,
  GRID_PADDING,
  layoutFor,
  moveIndex,
  rowTop,
  scrollToRow,
  windowFor,
} from './columns.js';
import { summarise } from './summary.js';
import { TextureTile } from './TextureTile.js';
import { usePreviews } from './usePreviews.js';

/**
 * The texture grid and the two strips above it: what is shown, and in what
 * order.
 *
 * The order used to be three columns that each cycled desc → asc → off, the way
 * a table header behaves — except a table header sits over the column it sorts,
 * and these sat over nothing. Three identical marks, one of them faintly
 * different, and no way to read the current order off any of them. So the two
 * questions are asked separately: **what** the grid is ordered by, as a segment
 * where exactly one is lit, and **which way**, as a button that says the answer
 * in words — "Newest first", "A to Z", "Largest first". Nothing is left to work
 * out from the direction an arrow points on a column called Latest.
 *
 * They also moved to a strip of their own. Filtering and searching decide which
 * textures exist; ordering is about the shape of what is left. Sharing one line
 * put five controls in a row narrow enough that the search field had nowhere to
 * go.
 *
 * What is not ported is how the images get here. There the list arrived with
 * every texture already encoded at full size, once a second; here the list is
 * metadata, and the tiles fetch their own thumbnails as they come into view
 * (`usePreviews`).
 *
 * Nor is the grid itself the same any more. Every tile used to be in the
 * document, which on a page holding several hundred textures is several
 * thousand elements to lay out on every poll; now only the rows the box can
 * show are drawn, off the geometry in `columns.ts`. That geometry is also what
 * the arrow keys move by, which is why the two arrived together — and what
 * divides the width between the tiles, so a row ends where the box does instead
 * of leaving a ragged strip of nothing beside it.
 */

/**
 * Rows kept either side of the fold.
 *
 * Two rather than one because these tiles are also what asks for a thumbnail:
 * a row that appeared only as it crossed the edge would ask only then, and the
 * image would land after the scroll had gone past it. Two rows is about the
 * `rootMargin` `usePreviews` already reaches ahead by.
 */
const OVERSCAN = 2;

type Arrow = 'left' | 'right' | 'up' | 'down' | 'home' | 'end';

const ARROWS: Record<string, Arrow> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
};

/** What the grid is ordered by: the name of the column, and what it means. */
const SORT_OPTIONS: readonly { value: SortKey; labelKey: MessageKey; titleKey: MessageKey }[] = [
  { value: 'latest', labelKey: 'assets.sort.latest.label', titleKey: 'assets.sort.latest' },
  { value: 'name', labelKey: 'assets.sort.name.label', titleKey: 'assets.sort.name' },
  { value: 'size', labelKey: 'assets.sort.size.label', titleKey: 'assets.sort.size' },
];

/**
 * What each direction means, said in the terms of the column it applies to.
 *
 * An arrow is ambiguous over anything that is not a number — "up" on a column
 * called Latest could as easily mean newest or oldest — and that was the whole
 * of what was unreadable about the old controls. The words leave nothing to
 * work out.
 */
const ORDER_LABEL_KEYS: Record<SortKey, Record<'asc' | 'desc', MessageKey>> = {
  latest: { desc: 'assets.order.latest.desc', asc: 'assets.order.latest.asc' },
  name: { asc: 'assets.order.name.asc', desc: 'assets.order.name.desc' },
  size: { desc: 'assets.order.size.desc', asc: 'assets.order.size.asc' },
};

/**
 * Which end of a column is worth landing on when it is picked.
 *
 * The newest textures, the largest ones, names from A — rather than whichever
 * end the column before it happened to be at. Only the button beside it
 * reverses the order.
 */
const NATURAL: Record<SortKey, Sort['direction']> = {
  latest: 'desc',
  name: 'asc',
  size: 'desc',
};

/**
 * The size of the scroll box, watched.
 *
 * A `ResizeObserver` **and** the window's own `resize`, for the reason
 * `CollapsibleSplit` gives: the observer reports through the frame loop, and a
 * window that is not being painted delivers nothing — which here would mean a
 * column count of one and a grid drawn one tile wide.
 */
function useViewport(ref: React.RefObject<HTMLElement>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const measure = (): void => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref]);

  return size;
}

export function TextureGrid({
  client,
  textures,
  selected,
  onSelect,
  onRefresh,
}: {
  client: Client;
  textures: readonly TextureInfo[];
  selected: TextureId | null;
  onSelect: (id: TextureId | null) => void;
  /** Throw away the held revision so the page answers with the whole list. */
  onRefresh: () => void;
}) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState<Channel>('both');
  const [naming, setNaming] = useState<Naming>('all');
  // Newest first, as the previous project opened.
  const [sort, setSort] = useState<Sort>({ key: 'latest', direction: 'desc' });

  const visible = useMemo(
    () => arrangeTextures(textures, { search, channel, naming, sort }),
    [textures, search, channel, naming, sort],
  );

  const summary = useMemo(() => summarise(textures, visible), [textures, visible]);

  // The hints resolve here rather than in the table above, so they follow the
  // language rather than whichever one was on at import.
  const sortOptions = useMemo(
    () => SORT_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey), title: t(option.titleKey) })),
    [t],
  );

  const filtering = channel !== 'both' || naming !== 'all';

  // The whole list rather than the ids: the store keeps a picture per texture
  // and has to be told when a texture stops matching the picture it holds.
  const previews = usePreviews(client, textures);

  const scrollRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport(scrollRef);
  const [scrollTop, setScrollTop] = useState(0);

  const layout = layoutFor(viewport.width);
  const { columns } = layout;
  const rowCount = Math.ceil(visible.length / columns);
  const { first, last } = windowFor(layout, scrollTop, viewport.height, rowCount, OVERSCAN);

  /**
   * The arrows move the selection itself rather than a cursor of their own.
   *
   * A second highlight that had to be committed with Enter would mean the pane
   * on the right shows one texture while the grid points at another, and the
   * tree next door already settles the question the same way.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      if (selected === null) return;
      event.preventDefault();
      onSelect(null);
      return;
    }

    const direction = ARROWS[event.key];
    if (direction === undefined || visible.length === 0) return;
    event.preventDefault();

    // With nothing selected the first key lands on an end rather than stepping
    // from one: there is no "here" for a relative move to start from.
    const current = visible.findIndex((texture) => texture.id === selected);
    const next =
      current === -1
        ? moveIndex(0, visible.length, columns, direction === 'end' ? 'end' : 'home')
        : moveIndex(current, visible.length, columns, direction);

    const texture = visible[next];
    if (texture === undefined) return;
    onSelect(texture.id);

    const box = scrollRef.current;
    if (box === null) return;

    const target = scrollToRow(layout, Math.floor(next / columns), box.scrollTop, box.clientHeight);
    if (target !== null) box.scrollTop = target;
  };

  const rows: React.ReactNode[] = [];
  for (let rowIndex = first; rowIndex <= last; rowIndex += 1) {
    const start = rowIndex * columns;

    rows.push(
      <div
        key={rowIndex}
        role="row"
        className="flex gap-1"
        style={{
          position: 'absolute',
          top: rowTop(layout, rowIndex),
          left: GRID_PADDING,
          right: GRID_PADDING,
        }}
      >
        {visible.slice(start, start + columns).map((texture) => (
          <TextureTile
            key={texture.id}
            texture={texture}
            preview={previews.get(texture.id)}
            selected={selected === texture.id}
            tileRef={previews.observe(texture.id)}
            onSelect={onSelect}
            width={layout.tileWidth}
            height={layout.tileHeight}
            imageHeight={layout.imageHeight}
          />
        ))}
      </div>,
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="border-border flex h-8 max-h-8 items-center border-b">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="ml-1 flex h-6 cursor-pointer items-center space-x-2 rounded-sm px-2 hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]">
              {/* The mark says the grid is being narrowed. Without it a page
                  with no textures and a filter that hides them all look alike. */}
              <FilterIcon className={cn(filtering ? 'fill-primary' : 'dark:fill-white')} />
              <p className="pointer-events-none text-sm">{t('assets.filter')}</p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="w-52 space-y-2 py-2 pl-2">
              <div>
                <p className="text-muted-foreground pb-1 text-xs">{t('assets.filter.gpu')}</p>
                <RadioGroup
                  value={channel}
                  onValueChange={(value) => {
                    setChannel(value as Channel);
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="both" id="all" />
                    <div>{t('assets.filter.gpu.all')}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="loaded" id="loaded" />
                    <div>{t('assets.filter.gpu.loaded')}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unloaded" id="unloaded" />
                    <div>{t('assets.filter.gpu.unloaded')}</div>
                  </div>
                </RadioGroup>
              </div>

              <Separator orientation="horizontal" className="opacity-40" />

              <div className="pb-1">
                {/* Both directions, because both are asked: what the page never
                    named is what nobody can account for, and hiding it is how
                    the assets the game actually loaded become readable. */}
                <p className="text-muted-foreground pb-1 text-xs">{t('assets.filter.name')}</p>
                <RadioGroup
                  value={naming}
                  onValueChange={(value) => {
                    setNaming(value as Naming);
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="naming-all" />
                    <div>{t('assets.filter.name.all')}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="named" id="naming-named" />
                    <div>{t('assets.filter.name.named')}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unnamed" id="naming-unnamed" />
                    <div>{t('assets.filter.name.unnamed')}</div>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-4" />

        <label className="flex h-8 min-w-0 flex-1 cursor-text items-center pl-2">
          <SearchIcon className="text-muted-foreground h-3 w-3 shrink-0" aria-hidden="true" />
          <input
            type="text"
            placeholder={t('assets.search')}
            className="h-8 w-full min-w-0 border-none bg-transparent px-2 outline-none"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </label>

        {/*
          At the far end, and not beside `Filter`, where it sat first: the
          navbar already carries a round arrow for reloading the whole panel,
          and two of those a centimetre apart meaning different things is a
          misclick waiting to happen. Two arrows rather than one, and the width
          of the search field between them.

          What it is for is what neither the list nor `updates` can report: a
          game is free to paint into a canvas without telling PixiJS, and then
          every thumbnail of it is of something that is no longer there and
          nothing knows. It drops what the panel holds — the list's revision and
          every picture — and asks again for the tiles in the document.
        */}
        <Hint text={t('assets.refresh')}>
          <button
            type="button"
            className="mr-1 flex h-6 shrink-0 cursor-pointer items-center rounded-sm px-2 outline-none hover:bg-foreground/10 dark:hover:bg-foreground/[0.16]"
            onClick={() => {
              previews.refresh();
              onRefresh();
            }}
          >
            <RefreshIcon className="dark:fill-white" />
          </button>
        </Hint>
      </div>

      {/* The order, on a strip of its own: what by, and which way. */}
      <div className="border-border flex h-8 max-h-8 shrink-0 items-center gap-2 border-b px-2">
        <span className="text-muted-foreground shrink-0 text-xs">{t('assets.sort')}</span>

        <Segmented
          className="shrink-0"
          variant="quiet"
          value={sort.key}
          options={sortOptions}
          onChange={(value) => {
            const key = value as SortKey;
            setSort({ key, direction: NATURAL[key] });
          }}
        />

        <Hint text={t('assets.sort.reverse')}>
          <button
            type="button"
            className="border-border bg-field hover:bg-accent focus-visible:ring-ring min-w-0 shrink truncate rounded border px-1.5 py-0.5 text-[11px] outline-none transition-colors focus-visible:ring-1"
            onClick={() => {
              setSort((current) => ({
                key: current.key,
                direction: current.direction === 'asc' ? 'desc' : 'asc',
              }));
            }}
          >
            {t(ORDER_LABEL_KEYS[sort.key][sort.direction])}
          </button>
        </Hint>
      </div>

      <div
        ref={scrollRef}
        role="grid"
        aria-label={t('assets.grid')}
        tabIndex={0}
        aria-activedescendant={selected === null ? undefined : `texture-tile-${String(selected)}`}
        className="flex-1 overflow-auto outline-none"
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
        }}
      >
        {visible.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-xs">
            {textures.length === 0 ? 'The renderer holds no textures.' : 'Nothing matches.'}
          </p>
        ) : (
          <div style={{ position: 'relative', height: contentHeight(layout, rowCount) }}>{rows}</div>
        )}
      </div>

      <div className="border-border text-muted-foreground flex h-6 shrink-0 items-center gap-1 border-t px-2 text-xs">
        <span>
          {summary.total} {summary.total === 1 ? 'texture' : 'textures'}
        </span>
        <span aria-hidden="true">·</span>
        <span>{summary.onGpu} on GPU</span>
        <span aria-hidden="true">·</span>
        {/* The plus is the honest half of the figure: a compressed format is not
            in the tables, so its bytes are missing from this rather than guessed. */}
        <span title={summary.gpuBytesPartial ? 'Some formats cannot be measured' : undefined}>
          {megabytes(summary.gpuBytes)}
          {summary.gpuBytesPartial && '+'}
        </span>
        {summary.shown !== summary.total && <span className="ml-auto">showing {summary.shown}</span>}
      </div>
    </div>
  );
}
