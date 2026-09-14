import type { SpineInfo, SpineLive } from '@scene-inspector/protocol';
import { useMemo } from 'react';
import { FaCheck } from 'react-icons/fa6';

import { Button } from '../../../../../components/ui/button.js';
import { useT } from '../../../../../i18n/index.js';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../../components/ui/popover.js';
import { Hint } from '../../../../../components/ui/tooltip.js';
import { cn } from '../../../../../lib/utils.js';
import { NamePicker } from './NamePicker.js';
import { rememberedSkeletons, rememberSkeleton, type Setup } from './setups.js';
import { TrackNumber } from './TrackNumber.js';

/**
 * The skeleton itself: what it wears, how fast it all runs, what pose it falls
 * back to.
 */

const NONE = '—';

/**
 * Which skin the skeleton wears — one of them, or none.
 *
 * A skeleton wears one skin: that is what `Skeleton.setSkin` takes and what it
 * reports back. The panel offered a set for a while, building a combined skin
 * out of what was ticked — which is a thing the runtime allows, but it made the
 * commonest question ("what is it wearing?") answerable only by reading a list,
 * and left the panel maintaining a memory of what it had combined.
 */
function SkinChooser({
  available,
  worn,
  onChange,
}: {
  available: readonly string[];
  worn: string | null;
  onChange: (skin: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="border-border hover:border-secondary flex h-6 min-w-0 flex-1 items-center rounded border px-2 text-xs outline-none"
        >
          <span className="truncate">{worn ?? NONE}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" side="bottom" className="w-56 p-1">
        <div className="max-h-56 overflow-y-auto">
          {[null, ...available].map((name) => (
            <button
              key={name ?? NONE}
              type="button"
              className="hover:bg-muted flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs"
              onClick={() => onChange(name)}
            >
              <FaCheck
                className={cn('shrink-0 text-[10px]', worn === name ? 'opacity-100' : 'opacity-0')}
              />
              <span className={cn('truncate', name === null && 'text-muted-foreground')}>
                {name ?? NONE}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SkeletonRow({
  info,
  live,
  setup,
  onScene,
  own = false,
  onlyChoose = false,
  problem = null,
  onTimeScale,
  onSkin,
  onSkeleton,
  unapplied,
  onApply,
}: {
  info: SpineInfo;
  /** What the node is doing, or null while a setup that is not applied is open. */
  live: SpineLive | null;
  setup: Setup;
  /** Whether the setup being looked at is the one on the skeleton. */
  onScene: boolean;
  /**
   * Whether the node this row describes is the panel's own test Spine.
   *
   * It settles two things. The name to show is the one this tab chose, because
   * a skeleton built here reports none of its own — `SkeletonJson` never fills
   * `SkeletonData.name` in. And choosing another is always on offer: it asks
   * nothing of the application, since the answer is a new Spine of ours rather
   * than a swap inside the game's.
   */
  own?: boolean;
  /**
   * Nothing here but the chooser.
   *
   * A test tab has no Spine until a skeleton is picked — picking one is what
   * builds it — so skins, speed and the setup pose have no node to act on and
   * are not drawn at all rather than drawn dead.
   */
  onlyChoose?: boolean;
  /** What went wrong last time this was asked, if anything did. */
  problem?: string | null;
  onTimeScale: (value: number) => void;
  onSkin: (skin: string | null) => void;
  onSkeleton: (name: string) => void;
  /** What the scene is missing: set while the setup has not been applied. */
  unapplied: boolean;
  onApply: () => void;
}) {
  const t = useT();
  /*
   * The scene answers for the setup that is on it; the setup answers for
   * itself otherwise. There is nothing running to read a skin or a speed off
   * when what is open is an alternative.
   */
  const skeleton = own || !onScene ? (setup.skeleton ?? '') : (live?.skeleton ?? '');

  /*
   * What was found, plus what has been typed. A game whose asset store is out
   * of reach offers nothing to list, so the names it answers to can only come
   * from the person looking at it — and having typed one once is reason enough
   * not to have to type it again.
   */
  const known = useMemo(() => {
    const names = [...info.skeletons];
    for (const name of [...rememberedSkeletons(), skeleton]) {
      if (name !== '' && !names.includes(name)) names.push(name);
    }

    return names;
  }, [info.skeletons, skeleton]);
  const skin = onScene ? (live?.skin === undefined || live.skin === '' ? null : live.skin) : setup.skin;
  const timeScale = onScene ? (live?.timeScale ?? 1) : setup.timeScale;
  /*
   * What stops this control working, in the order that matters.
   *
   * A game that cannot change skeleton at all makes the list moot, so that is
   * asked first — no Spine runtime offers a way, and only the application's own
   * method will do. An empty list is the lesser trouble: the names offered are
   * a guess either way, and typing one is always open.
   */
  const canChoose = own || info.canChangeSkeleton;

  const reason =
    problem ??
    (!canChoose
      ? 'This application offers no way to change the skeleton.'
      : known.length === 0
        ? 'No skeleton was found to list — type the name the game knows it by.'
        : null);

  return (
    <div className="space-y-1 px-2 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-16 shrink-0">skeleton</span>
        {canChoose ? (
          <NamePicker
            options={known.map((name) => ({ name }))}
            value={skeleton === '' ? null : skeleton}
            allowNone={false}
            placeholder="Type a name"
            title={t('spine.changeSkeleton')}
            onCreate={(name) => {
              rememberSkeleton(name);
              onSkeleton(name);
            }}
            onChange={(name) => {
              if (name !== null) onSkeleton(name);
            }}
          />
        ) : (
          <Hint text={reason ?? ''}>
            <span className="text-muted-foreground flex-1">
              {skeleton === '' ? NONE : skeleton}
            </span>
          </Hint>
        )}
      </div>

      {reason !== null && <p className="text-muted-foreground pl-[4.5rem]">{reason}</p>}

      {/*
       * Choosing a skeleton is a choice, not an act. Nothing reaches the scene
       * until this is pressed — the same rule the track rows keep, and for the
       * same reason: a skeleton swap rebuilds the animation state, so applying
       * one on its own leaves the node carrying nothing and drawing nothing.
       * Apply puts the whole setup down at once, skeleton first.
       */}
      {unapplied && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16 shrink-0" />
          <Hint text={t('spine.applySetup')}>
            <Button
              variant="outline"
              size="xs"
              className="text-primary border-primary px-2"
              onClick={onApply}
            >
              Apply
            </Button>
          </Hint>
          <span className="text-muted-foreground">not on the scene yet</span>
        </div>
      )}

      {!onlyChoose && info.skins.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16 shrink-0">skin</span>
          <SkinChooser available={info.skins} worn={skin} onChange={onSkin} />
        </div>
      )}

      {!onlyChoose && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16 shrink-0">speed</span>
          <TrackNumber
            label=""
            value={timeScale}
            title={t('spine.stateTimeScale')}
            onCommit={onTimeScale}
          />
        </div>
      )}
    </div>
  );
}
