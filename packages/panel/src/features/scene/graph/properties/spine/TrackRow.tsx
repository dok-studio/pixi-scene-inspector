import type { SpineTrack, SpineTrackParam } from '@scene-inspector/protocol';
import { FaAngleRight, FaPause, FaPlay, FaXmark } from 'react-icons/fa6';
import { useRef } from 'react';

import { Button } from '../../../../../components/ui/button.js';
import { useT } from '../../../../../i18n/index.js';
import { CopyButton } from '../../../../../components/ui/copy-button.js';
import { Slider } from '../../../../../components/ui/slider.js';
import { Toggle } from '../../../../../components/ui/toggle.js';
import { Hint } from '../../../../../components/ui/tooltip.js';
import { formatNumber } from '../../../../../lib/formatNumber.js';
import { cn } from '../../../../../lib/utils.js';
import { NamePicker } from './NamePicker.js';
import type { TrackDraft } from './setups.js';
import { TrackIndex } from './TrackIndex.js';
import { TrackNumber } from './TrackNumber.js';

/**
 * One track: what it is doing, and what it is going to do.
 *
 * The rule this row is built around — **the animation is chosen here and
 * started by Play**. Nothing else in Spine works that way, because
 * `AnimationState.setAnimation` starts an animation the moment it is called,
 * which is why the old row had to pick one for you and run it. Here the choice
 * lands in the draft, the row marks itself as having something unapplied, and
 * one press turns it into a call.
 *
 * Everything else is written straight onto the live entry, because it can be:
 * `loop`, `alpha`, the mix and the playhead all take effect without building a
 * new entry. Going through `setAnimation` to change `loop` — which is what this
 * row used to do — restarted the animation from zero.
 *
 * **A row of a setup that is not applied is `offline`.** Its fields still edit,
 * because preparing an alternative is the point of having one, but there is
 * nothing running to play, pause or scrub — so those go quiet rather than
 * pretending, and the way to see it is to put the setup on the skeleton.
 */

export interface TrackActions {
  play: (track: number, draft: TrackDraft) => void;
  setParam: (track: number, key: SpineTrackParam, value: number) => void;
  setLoop: (track: number, loop: boolean) => void;
  setTime: (track: number, time: number) => void;
  clearQueue: (track: number) => void;
  remove: (track: number, live: boolean) => void;
  /**
   * Puts this row on another track index.
   *
   * The live entry rather than a flag saying there is one: moving a running
   * track means restarting **what is running**, and only the entry knows what
   * that is — the draft may be holding an animation that was merely chosen.
   *
   * @returns false when that index is taken, which the field reads as "stay".
   */
  renumber: (from: number, to: number, draft: TrackDraft, live: SpineTrack | undefined) => boolean;
}

export function TrackRow({
  index,
  live,
  draft,
  animations,
  actions,
  offline = false,
  onDraft,
}: {
  index: number;
  /** Absent on a row that has been added but never started. */
  live: SpineTrack | undefined;
  draft: TrackDraft;
  animations: ReadonlyArray<{ name: string; duration: number }>;
  actions: TrackActions;
  /** The setup this row belongs to is not the one on the skeleton. */
  offline?: boolean;
  onDraft: (next: TrackDraft) => void;
}) {
  const t = useT();
  /**
   * Whether pressing the button would start something rather than resume it.
   *
   * Three ways in: there is no entry yet, the entry has run out (a one-shot at
   * its end resumes into nothing), or the choice has moved on from what is
   * playing.
   */
  const needsApply =
    live === undefined ||
    live.complete ||
    live.animation !== draft.animation ||
    live.loop !== draft.loop;

  const playing = live !== undefined && !live.complete && live.timeScale !== 0;
  const canPlay = !offline && (draft.animation !== null || live !== undefined);

  /** What the one button under the row is for right now — its hint and its name. */
  const playLabel = offline
    ? t('spine.playOffline')
    : needsApply
      ? t('spine.play')
      : playing
        ? t('spine.pause')
        : t('spine.resume');

  /**
   * A paused track reads zero, and zero is not what Resume should offer to go
   * back to — so the speed shown while it is stopped is the one held for it.
   */
  const speed = live === undefined || live.timeScale === 0 ? draft.timeScale : live.timeScale;
  const alpha = live?.alpha ?? draft.alpha;
  const mix = live?.mixDuration ?? draft.mixDuration;

  const edit = (patch: Partial<TrackDraft>): void => {
    onDraft({ ...draft, ...patch });
  };

  /**
   * Whether this drag has already stopped the track.
   *
   * The core writes the playhead and nothing else, so a track that is moving
   * carries on from wherever the bar is dropped — and dragging is a way of
   * looking at a pose, not a way of playing one. Pausing is therefore the
   * panel's, and it happens **once, at the start of the gesture**: the slider
   * fires on every pointer move, and deciding again on each of them would read
   * a `live` that the drag itself has since changed.
   */
  const scrubbing = useRef(false);

  /**
   * Stops the track for the length of the scrub, keeping the speed to resume
   * at — the same trade the Pause button makes, and for the same reason: a
   * pause is a speed of zero, so the number has to be held before it is lost.
   */
  const beginScrub = (): void => {
    if (scrubbing.current) return;
    scrubbing.current = true;

    if (offline || live === undefined || live.timeScale === 0) return;

    edit({ timeScale: live.timeScale });
    actions.setParam(index, 'timeScale', 0);
  };

  /** Writes onto the live entry as well, when there is one to write onto. */
  const number = (key: SpineTrackParam & keyof TrackDraft, value: number): void => {
    edit({ [key]: value } as Partial<TrackDraft>);

    // A paused track keeps its speed in the draft until Resume, or setting it
    // would start the animation moving again as a side effect of typing.
    if (offline || live === undefined) return;
    if (key === 'timeScale' && live.timeScale === 0) return;

    actions.setParam(index, key, value);
  };

  return (
    <div
      className={cn(
        'border-border border-b px-2 py-1.5 text-xs',
        (offline || live === undefined) && 'bg-muted/30',
      )}
    >
      <div className="flex items-center gap-2">
        <TrackIndex
          index={index}
          onCommit={(next) => actions.renumber(index, next, draft, live)}
        />

        <NamePicker
          options={animations.map((animation) => ({
            name: animation.name,
            detail: animation.duration,
          }))}
          value={draft.animation}
          pending={!offline && needsApply && draft.animation !== null}
          title={t('spine.chooseAnimation')}
          onChange={(animation) => edit({ animation })}
        />

        {/*
         * An animation's name is the one string that has to travel out of this
         * panel — into a call the game makes, into a message, into a search of
         * the codebase — and it is the one string here that is nowhere else on
         * screen to select with a mouse.
         */}
        <CopyButton value={draft.animation ?? ''} title={t('spine.copyAnimation')} />

        <Hint text={t('spine.repeat')}>
          <Toggle
            variant="outline"
            size="xs"
            pressed={live?.loop ?? draft.loop}
            onPressedChange={(value) => {
              edit({ loop: value });
              if (!offline && live !== undefined) actions.setLoop(index, value);
            }}
            className="px-1"
          >
            loop
          </Toggle>
        </Hint>

        {/* On a span, because the reason it gives is most wanted exactly when
            the button is disabled and taking no pointer events of its own —
            so the button is named again for itself, the hint having landed on
            the span rather than on it. */}
        <Hint text={playLabel}>
          <span className="flex">
            <Button
              variant="outline"
              size="xs"
              aria-label={playLabel}
              disabled={!canPlay}
              className={cn('px-1', needsApply && canPlay && 'text-primary border-primary')}
              onClick={() => {
                if (needsApply) {
                  actions.play(index, draft);
                  return;
                }

                if (playing) {
                  // Held before it is overwritten: a pause is a speed of zero,
                  // and the next poll would report that as the track's speed.
                  // Resume would then offer to carry on at a standstill.
                  edit({ timeScale: speed });
                  actions.setParam(index, 'timeScale', 0);
                  return;
                }

                actions.setParam(index, 'timeScale', draft.timeScale);
              }}
            >
              {playing && !needsApply ? <FaPause /> : <FaPlay />}
            </Button>
          </span>
        </Hint>

        <Hint text={t('spine.removeTrack')}>
          <Button
            variant="outline"
            size="xs"
            className="px-1"
            onClick={() => actions.remove(index, live !== undefined)}
          >
            <FaXmark />
          </Button>
        </Hint>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <Slider
          min={0}
          max={live === undefined || live.duration === 0 ? 1 : live.duration}
          step={0.001}
          disabled={offline || live === undefined}
          value={[live === undefined ? 0 : Math.min(live.time, live.duration)]}
          onValueChange={([next]) => {
            if (next === undefined) return;

            beginScrub();
            actions.setTime(index, next);
          }}
          onValueCommit={() => {
            scrubbing.current = false;
          }}
          className="flex-1"
        />
        <span className="text-muted-foreground w-24 text-right tabular-nums">
          {formatNumber(live?.time ?? 0, 2)} / {formatNumber(live?.duration ?? 0, 2)}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <TrackNumber
          label="speed"
          value={speed}
          title="TrackEntry.timeScale"
          onCommit={(next) => number('timeScale', next)}
        />
        <TrackNumber
          label="alpha"
          value={alpha}
          title="TrackEntry.alpha"
          onCommit={(next) => number('alpha', next)}
        />
        <TrackNumber
          label="mix"
          value={mix}
          title="TrackEntry.mixDuration"
          onCommit={(next) => number('mixDuration', next)}
        />
      </div>

      {/* What is crossfading right now, while it is. Nothing to say otherwise. */}
      {live?.mixingFrom !== null && live?.mixingFrom !== undefined && (
        <p className="text-muted-foreground mt-1">
          mixing from {live.mixingFrom} · {formatNumber(live.mixTime, 2)} /{' '}
          {formatNumber(live.mixDuration, 2)}
        </p>
      )}

      {/*
       * The queue is the application's, not the panel's: nothing here adds to
       * it, and it is drawn because what a game lines up behind an animation is
       * worth seeing.
       */}
      {live !== undefined && live.queue.length > 0 && (
        <div className="mt-1">
          {live.queue.map((queued, at) => (
            <div key={at} className="text-muted-foreground flex items-center gap-2">
              <FaAngleRight className="shrink-0 opacity-60" />
              <span className="flex-1 truncate">{queued.animation ?? 'empty'}</span>
              {queued.loop && <span>loop</span>}
              <span className="tabular-nums">delay {formatNumber(queued.delay, 2)}</span>
            </div>
          ))}
          <Hint text={t('spine.clearQueue')}>
            <Button
              variant="outline"
              size="xs"
              className="mt-1 px-1"
              onClick={() => actions.clearQueue(index)}
            >
              Clear queue
            </Button>
          </Hint>
        </div>
      )}
    </div>
  );
}
