import Fuse from 'fuse.js';
import { useMemo, useState } from 'react';
import { FaAngleDown, FaMagnifyingGlass, FaPlus } from 'react-icons/fa6';

import { Input } from '../../../../../components/ui/input.js';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../../components/ui/popover.js';
import { Hint } from '../../../../../components/ui/tooltip.js';
import { useT } from '../../../../../i18n/index.js';
import { formatNumber } from '../../../../../lib/formatNumber.js';
import { cn } from '../../../../../lib/utils.js';

/**
 * Choosing one name out of a list, with a search.
 *
 * A plain `Select` is fine for the stand's three animations and useless on a
 * real game, where a skeleton with a hundred of them is ordinary and the one
 * being looked for is `attack_heavy_02`. The architecture asked for the search
 * from the start (§3.5); this is it.
 *
 * Fuzzy rather than a prefix match, because the names are compounds and the
 * memorable part is rarely the beginning: `heavy` should find
 * `attack_heavy_02`.
 *
 * The same control serves the animations of a track and the skeletons a page
 * has loaded. Those lists are alike in every way that matters here — many
 * names, one chosen — and the only difference, a duration to show beside an
 * animation, is one optional field.
 *
 * With `onCreate` the search box is also an entry field: a name that matches
 * nothing can be committed with Enter. That is not a nicety. A game that
 * publishes no PixiJS module keeps its asset store out of reach, so there is no
 * list to offer — and its `changeSkeleton` still takes names, which only the
 * person looking at the game knows. Typing one is then the only way through,
 * and it is what the previous project's plain text field did.
 */

export const NONE = '—';

export interface PickerOption {
  name: string;
  /** Drawn at the end of the row where there is one. Animations have it. */
  detail?: number;
}

export function NamePicker({
  options,
  value,
  pending,
  allowNone = true,
  placeholder,
  title,
  disabled = false,
  onCreate,
  onChange,
}: {
  options: readonly PickerOption[];
  value: string | null;
  /** Chosen but not yet in force: the row says so, so Play has something to mean. */
  pending?: boolean;
  /** A track can have no animation; a skeleton is whatever it already is. */
  allowNone?: boolean;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  /** Set where a name the list does not have is still worth accepting. */
  onCreate?: (name: string) => void;
  onChange: (name: string | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const fuse = useMemo(
    () => new Fuse(options, { keys: ['name'], threshold: 0.4, ignoreLocation: true }),
    [options],
  );

  const shown = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '') return options;

    return fuse.search(trimmed).map((hit) => hit.item);
  }, [options, fuse, query]);

  const choose = (name: string | null): void => {
    onChange(name);
    setOpen(false);
    setQuery('');
  };

  const typed = query.trim();
  const isNew =
    onCreate !== undefined &&
    typed !== '' &&
    !options.some((option) => option.name === typed);

  const create = (): void => {
    if (!isNew) return;

    onCreate?.(typed);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Hint text={pending === true ? t('spine.chosen') : (title ?? '')}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'border-border hover:border-secondary flex h-6 min-w-0 flex-1 items-center justify-between gap-1 rounded border px-2 text-xs outline-none',
              pending === true && 'border-primary text-primary',
              disabled && 'opacity-50',
            )}
          >
            <span className={cn('truncate', value === null && 'text-muted-foreground')}>
              {value ?? placeholder ?? NONE}
            </span>
            <FaAngleDown className="shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
      </Hint>

      <PopoverContent align="start" side="bottom" className="w-56 p-1">
        <div className="border-border mb-1 flex items-center gap-1 border-b px-1 pb-1">
          <FaMagnifyingGlass className="text-muted-foreground shrink-0 text-[10px]" />
          <Input
            autoFocus
            value={query}
            placeholder={onCreate === undefined ? 'Search' : 'Search, or type a name'}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create();
            }}
            className="h-6 w-full border-none px-0 text-xs outline-none focus-visible:ring-0"
          />
        </div>

        <div className="max-h-56 overflow-y-auto">
          {allowNone && (
            <button
              type="button"
              className="hover:bg-muted flex w-full items-center rounded px-2 py-1 text-left text-xs"
              onClick={() => choose(null)}
            >
              {NONE}
            </button>
          )}

          {shown.map((option) => (
            <button
              key={option.name}
              type="button"
              className={cn(
                'hover:bg-muted flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs',
                option.name === value && 'text-primary',
              )}
              onClick={() => choose(option.name)}
            >
              <span className="truncate">{option.name}</span>
              {option.detail !== undefined && (
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {formatNumber(option.detail, 2)}
                </span>
              )}
            </button>
          ))}

          {isNew && (
            <button
              type="button"
              className="hover:bg-muted flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs"
              onClick={create}
            >
              <FaPlus className="shrink-0 text-[10px] opacity-60" />
              <span className="truncate">Use “{typed}”</span>
            </button>
          )}

          {shown.length === 0 && !isNew && (
            <p className="text-muted-foreground px-2 py-1 text-xs">Nothing matches.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
