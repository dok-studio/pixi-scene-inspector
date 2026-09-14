import type { SpineTrackParam } from '@scene-inspector/protocol';

import type { Node } from '../../adapters/types.js';
import { asSpine, refresh, type SpineLike, type TrackEntryLike } from './spine.js';

/**
 * Writing to an animation state.
 *
 * One rule shapes the whole file: **`setAnimation` is called from exactly one
 * place**, `setTrack`. Every other change is written onto the entry that is
 * already there.
 *
 * That is not tidiness. `AnimationState.setAnimation` builds a new `TrackEntry`
 * every time, which drops the playhead back to zero — so a panel that reached
 * for it to change `loop` restarted the animation, and the previous version of
 * this section did exactly that. Turning looping on is not a reason for the
 * character to start walking again.
 *
 * The queue is read but not written: what an application lines up behind an
 * animation is worth seeing, and `clearQueue` is worth having to take it back
 * off, but there is no control here that adds to it.
 */

function entryAt(spine: SpineLike, track: number): TrackEntryLike | null {
  return spine.state.tracks?.[track] ?? null;
}

/** Whether the skeleton has an animation by that name. See `setTrack`. */
export function hasAnimation(spine: SpineLike, name: string): boolean {
  return (spine.skeleton.data?.animations ?? []).some((animation) => animation.name === name);
}

/**
 * The numbers a track can be started with.
 *
 * They arrive with `setTrack` because there is nowhere else to put them: a
 * track being started for the first time has no entry to write onto until
 * `setAnimation` has made one, and a round trip later is a round trip during
 * which the animation already ran at the wrong speed.
 */
export type TrackParams = Partial<Record<SpineTrackParam, number>>;

/**
 * The one rule every number written onto an entry goes by.
 *
 * A `NaN` in `timeScale` or `alpha` does not fail loudly — it spreads through
 * the pose on the next update and the skeleton disappears, with nothing on
 * screen to say why. Refusing it is cheaper than explaining it.
 */
function isWritableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function applyParams(entry: TrackEntryLike | null, params: TrackParams | undefined): void {
  if (entry === null || params === undefined) return;

  for (const [key, value] of Object.entries(params)) {
    if (!isWritableNumber(value)) continue;

    (entry as Record<string, number>)[key] = value;
  }
}

/**
 * Starts an animation on a track — the one call to `setAnimation`.
 *
 * A `null` animation mixes the track out through Spine's empty animation rather
 * than dropping it where it stands. Dropping it is `clearTrack`, and the two
 * look quite different on screen: one fades back to the setup pose, the other
 * snaps.
 *
 * **The name is checked first.** `AnimationState.setAnimation` throws
 * `Animation not found` rather than returning null, and the caller that hits
 * that is not a typo but a setup built for one skeleton being applied to
 * another — which is an ordinary thing to do and must not throw across the
 * bridge.
 *
 * @returns false when there was nothing to change.
 */
export function setTrack(
  node: Node,
  track: number,
  animation: string | null,
  loop: boolean,
  params?: TrackParams,
): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;
  if (animation !== null && !hasAnimation(spine, animation)) return false;

  const entry =
    animation === null
      ? (spine.state.setEmptyAnimation?.(track, params?.mixDuration ?? 0) ?? null)
      : (spine.state.setAnimation?.(track, animation, loop) ?? null);

  applyParams(entry, params);
  refresh(spine);

  return true;
}

/**
 * Drops everything queued behind the current animation.
 *
 * `clearNext` is not in every runtime this module serves, and there is no way
 * to do it by hand that is worth the risk of getting wrong — so where it is
 * missing, nothing happens and the panel's button is drawn disabled.
 */
export function clearQueue(node: Node, track: number): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  const entry = entryAt(spine, track);
  if (entry === null || typeof spine.state.clearNext !== 'function') return false;

  spine.state.clearNext(entry);
  return true;
}

export function clearTrack(node: Node, track: number): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  spine.state.clearTrack?.(track);
  refresh(spine);

  return true;
}

export function clearTracks(node: Node): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  spine.state.clearTracks?.();
  refresh(spine);

  return true;
}

/**
 * Moves the playhead, and moves nothing else.
 *
 * Writing an earlier `trackTime` puts an entry back inside its own span and the
 * next update carries on from there, so dragging the bar plays out the rest of
 * the animation unless something stops it. Stopping it is the **panel's**: it
 * pauses the track for the length of the gesture, exactly as its own Pause
 * button does — and that is the one place able to keep the speed to resume at.
 *
 * This zeroed `timeScale` here instead, and it cost three things that nothing
 * gave back: the entry's real speed, with nowhere holding it; a track paused
 * part way through a drag, because the runtime happened to finish it between
 * two of the slider's events; and the entry's queue, which Spine advances off
 * `trackTime` and therefore never hands over while the speed is zero.
 *
 * @returns whether the pose moved, so the caller knows to ask for a frame.
 */
export function setTrackTime(node: Node, track: number, time: number): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  const entry = entryAt(spine, track);
  if (entry === null) return false;

  entry.trackTime = time;
  refresh(spine);

  return true;
}

/**
 * One number on a live entry.
 *
 * The pose is refreshed afterwards for the same reason scrubbing refreshes it:
 * `alpha` changed on a scene that is not rendering has to show, and the numbers
 * moving while the picture does not is worse than no control at all.
 */
export function setTrackParam(
  node: Node,
  track: number,
  key: SpineTrackParam,
  value: number,
): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  const entry = entryAt(spine, track);
  if (entry === null || !isWritableNumber(value)) return false;

  (entry as Record<string, number>)[key] = value;
  refresh(spine);

  return true;
}

/** Looping, written onto the live entry rather than through `setAnimation`. */
export function setLoop(node: Node, track: number, loop: boolean): boolean {
  const spine = asSpine(node);
  if (spine === null) return false;

  const entry = entryAt(spine, track);
  if (entry === null) return false;

  entry.loop = loop;
  refresh(spine);

  return true;
}

/** `AnimationState.timeScale` — every track at once. */
export function setTimeScale(node: Node, value: number): boolean {
  const spine = asSpine(node);
  if (spine === null || !isWritableNumber(value)) return false;

  spine.state.timeScale = value;
  return true;
}
