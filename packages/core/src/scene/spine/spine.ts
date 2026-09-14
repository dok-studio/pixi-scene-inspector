import type { SpineInfo, SpineLive, SpineQueued, SpineTrack } from '@scene-inspector/protocol';

import type { Node, SpineStore } from '../../adapters/types.js';
import { animationsOf, loadedSkeletonNames } from './loaded.js';
import { probeSkeleton } from './probe.js';

/**
 * Spine, which is not PixiJS.
 *
 * The runtime is installed separately — `pixi-spine` for v6/v7, `spine-pixi-v8`
 * for v8 — and may be absent entirely. So this is a module with **its own
 * detection** rather than a branch in `PixiAdapter` (docs/architecture.md
 * §3.5): a skeleton can sit under any Pixi version, or under one the inspector
 * does not recognise at all.
 *
 * There is no version branch inside it either, and that is not optimism: the
 * previous project already read `state.tracks` and `skeleton.data.animations`
 * duck-typed, with the same code serving both runtimes. Where the runtimes do
 * differ, the difference is asked for by name — is this method here? — which is
 * a question about the object in hand rather than about a version number.
 *
 * This file reads fields off a node directly, which everything else in the core
 * is forbidden to do. That is the same licence the adapters have and for the
 * same reason: it is a declared boundary with an outside library, and the
 * knowledge is contained here rather than spread. `tracks.ts`, `skeleton.ts`
 * and `events.ts` write through the shapes declared here.
 */

export interface TrackEntryLike {
  animation?: { name?: unknown; duration?: unknown } | null;
  next?: TrackEntryLike | null;
  mixingFrom?: TrackEntryLike | null;
  loop?: unknown;
  trackTime?: number;
  timeScale?: number;
  alpha?: number;
  mixDuration?: number;
  mixTime?: number;
  /** Read to place a queued entry, and to tell a finished one-shot from a paused one. */
  delay?: number;
  animationStart?: number;
  animationEnd?: number;
  isComplete?: () => boolean;
}

export interface SkinLike {
  name?: unknown;
}

export interface SkeletonLike {
  data?: {
    name?: unknown;
    animations?: Array<{ name?: unknown; duration?: unknown }>;
    skins?: SkinLike[];
    /** What an artist keyed into the skeleton, which the log names as it fires. */
    events?: Array<{ name?: unknown }>;
    /** What the skeleton falls back to while it has been given no skin. */
    defaultSkin?: SkinLike | null;
    findSkin?: (name: string) => SkinLike | null;
  } | null;
  skin?: SkinLike | null;
  setSkin?: (skin: unknown) => void;
  setSlotsToSetupPose?: () => void;
  updateWorldTransform?: (...args: unknown[]) => void;
}

export interface StateListenerLike {
  start?: (entry: TrackEntryLike) => void;
  interrupt?: (entry: TrackEntryLike) => void;
  end?: (entry: TrackEntryLike) => void;
  dispose?: (entry: TrackEntryLike) => void;
  complete?: (entry: TrackEntryLike) => void;
  event?: (entry: TrackEntryLike, event: unknown) => void;
}

export interface StateLike {
  tracks?: Array<TrackEntryLike | null | undefined>;
  timeScale?: number;
  apply?: (skeleton: unknown) => void;
  setAnimation?: (index: number, name: string, loop: boolean) => TrackEntryLike | null;
  setEmptyAnimation?: (index: number, mixDuration: number) => TrackEntryLike | null;
  clearTrack?: (index: number) => void;
  clearTracks?: () => void;
  clearNext?: (entry: TrackEntryLike) => void;
  addListener?: (listener: StateListenerLike) => void;
  removeListener?: (listener: StateListenerLike) => void;
}

export interface SpineLike {
  skeleton: SkeletonLike;
  state: StateLike;
  /**
   * The application's own way of changing which skeleton this node carries.
   *
   * No runtime offers one: on v6/v7 the `Spine` constructor builds a container
   * per slot beside the skeleton, and on v8 `skeletonData` is read once and
   * never again. Only the application knows how to rebuild its own — so this is
   * asked for by name and simply absent on a game that does not offer it.
   *
   * The previous project read exactly these two fields, and checked the result
   * the same way: `false` means it refused.
   */
  changeSkeleton?: (name: string) => unknown;
  currentSkeletonName?: unknown;
  /**
   * The v8 wrapper's own update.
   *
   * It does more than apply the pose: it flags the render pipe so the
   * attachments are transformed again. Without it a paused scene on v8 draws
   * the frame it already had, however correct the skeleton has become.
   */
  _updateAndApplyState?: (delta: number) => void;
}

export const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const nameOf = (value: { name?: unknown } | null | undefined): string | null =>
  typeof value?.name === 'string' ? value.name : null;

/*
 * Both sources, because neither is enough on its own: the asset store knows the
 * alias the application chose but is out of reach on a game that publishes no
 * module, and the browser's own record of what was fetched is always reachable
 * but only knows the file's name.
 */
function merge(...lists: ReadonlyArray<readonly string[]>): string[] {
  const names: string[] = [];
  for (const list of lists) {
    for (const name of list) {
      if (name !== '' && !names.includes(name)) names.push(name);
    }
  }

  return names;
}

/**
 * @returns the node seen as a skeleton, or null.
 *
 * Both marks are required: `skeleton` alone could be anything, and a game
 * object may well carry a `state` of its own that has nothing to do with Spine.
 * The `tracks` array is what makes it an animation state.
 */
export function asSpine(node: Node): SpineLike | null {
  const candidate = node as Partial<SpineLike>;

  const skeleton = candidate.skeleton;
  const state = candidate.state;
  if (typeof skeleton !== 'object' || skeleton === null) return null;
  if (typeof state !== 'object' || state === null) return null;
  if (!Array.isArray(state.tracks)) return null;

  return candidate as SpineLike;
}

/**
 * `Physics.update`.
 *
 * Spine 4.2 made the argument mandatory — `updateWorldTransform` opens with
 * `if (physics === undefined) throw` — while 4.0 and 4.1 take no argument and
 * ignore an extra one. Passing it always is therefore the fix for the newer
 * runtime and a no-op on the older, which is why there is no branch here.
 */
const PHYSICS_UPDATE = 2;

/**
 * Applies the current pose and refreshes the transforms.
 *
 * This is what makes a change visible on a scene that is not rendering: without
 * it the numbers move and nothing on screen does. The caller still has to ask
 * for a frame — that goes through `runtime/frame.ts`, the one place allowed to
 * touch the renderer.
 */
export function refresh(spine: SpineLike): void {
  // Asking the v8 wrapper is not a version check but a question about the
  // object: it alone knows to mark its render pipe, and applying the pose
  // behind its back leaves the drawn attachments a frame stale.
  if (typeof spine._updateAndApplyState === 'function') {
    // Zero, because the pose is already where the caller put it. This applies
    // it and flushes the event queue without advancing any clock.
    spine._updateAndApplyState(0);
    return;
  }

  spine.state.apply?.(spine.skeleton);
  spine.skeleton.updateWorldTransform?.(PHYSICS_UPDATE);
}

/** The skin the skeleton is wearing, or `''` while it wears none of its own. */
export function readSkin(spine: SpineLike): string {
  const skeleton = spine.skeleton;

  /*
   * A skeleton nobody has dressed has no skin at all — `skin` is null and the
   * runtime looks attachments up in `data.defaultSkin` instead. Reporting
   * nothing there would have the panel show a blank next to a skeleton that is
   * plainly wearing something, which is how it read on the stand.
   */
  const worn = skeleton.skin ?? skeleton.data?.defaultSkin;
  if (worn === null || worn === undefined) return '';

  // One of the skeleton's own is named by itself. Identity first, because two
  // skins may share a name; the name after it, because a runtime that hands
  // back a copy is still handing back that skin. Anything else is the
  // application's own doing — a skin it built itself — and naming it after one
  // of the skeleton's would be a guess.
  const skins = skeleton.data?.skins ?? [];
  const known = skins.find((skin) => skin === worn) ?? skins.find((skin) => skin.name === worn.name);

  return known === undefined ? '' : str(known.name, '');
}

/** Almost static: fetched once per selected node rather than polled. */
/**
 * @param store what the PixiJS asset store is holding. It comes from the
 * adapter rather than from here: the store is PixiJS's, and reaching it is the
 * one part of this that differs by version — and on a bundled game it cannot be
 * reached at all, which is why it is only half the answer.
 * @param wanted the skeleton the panel is asking about, when it is not the one
 * the node carries. Its lists come from its own export, because there is no
 * loaded `SkeletonData` to read them off.
 */
export function readInfo(
  node: Node,
  store: SpineStore = { skeletons: [], atlases: [] },
  wanted?: string,
): SpineInfo | null {
  const spine = asSpine(node);
  const data = spine?.skeleton.data;
  if (spine === undefined || spine === null || data === undefined || data === null) return null;

  const skeletons = merge(
    store.skeletons.map((source: { name: string }) => source.name),
    loadedSkeletonNames(),
  );

  /*
   * A skeleton the node is not carrying has no `SkeletonData` here to read, so
   * it is looked up instead — see `probe.ts` for the three ways that can go.
   * Null means none of them worked, and the node's own lists are all there are,
   * wrong though they are for the choice being made.
   */
  const other =
    wanted === undefined || wanted === '' || wanted === readSkeletonName(spine)
      ? null
      : probeSkeleton(node, wanted, store, animationsOf);

  if (other !== null) {
    return {
      skins: [...other.skins],
      animations: [...other.animations],
      events: [...other.events],
      pending: other.pending,
      skeletons,
      canChangeSkeleton: typeof spine.changeSkeleton === 'function',
    };
  }

  return {
    skins: (data.skins ?? []).map((skin) => str(skin.name, '')),
    animations: (data.animations ?? []).map((animation) => ({
      name: str(animation.name, ''),
      duration: num(animation.duration, 0),
    })),
    events: (data.events ?? []).map((event) => str(event.name, '')).filter((name) => name !== ''),
    pending: false,
    skeletons,
    canChangeSkeleton: typeof spine.changeSkeleton === 'function',
  };
}

/**
 * Where the playhead is **inside the animation**.
 *
 * A track's `trackTime` is time since the animation was set, and a looping
 * track keeps counting: an idle animation left running reads as 200 seconds
 * against a duration of 1.67. That is what the runtime means by it, but it is
 * not what a scrub bar shows — the slider would sit pinned at the end forever.
 *
 * Wrapping is only right for a looping track: one that has run past its end
 * stays at its end, and folding that back to zero would show it starting over.
 *
 * A one-shot is therefore clamped rather than wrapped — and clamped it must be,
 * because `trackTime` keeps counting there too. Turn looping off on a track that
 * has been running for three minutes and the raw number reads 171 against a
 * duration of 1, which is the same nonsense wrapping was introduced to stop.
 * The runtime holds such an animation on its last frame; this says so.
 */
export function playhead(entry: TrackEntryLike, duration?: number): number {
  const time = num(entry.trackTime, 0);
  const span = duration ?? num(entry.animation?.duration, 0);
  if (span <= 0) return time;

  return entry.loop === true ? time % span : Math.min(time, span);
}

/**
 * Whether a one-shot track has run out.
 *
 * The runtime answers directly where it can; where it cannot, the answer is the
 * comparison it would have made. It decides what the Play button does, so a
 * track that has finished has to be told apart from one sitting on pause.
 */
function isComplete(entry: TrackEntryLike): boolean {
  if (entry.loop === true) return false;
  if (typeof entry.isComplete === 'function') return entry.isComplete();

  const span = num(entry.animationEnd, 0) - num(entry.animationStart, 0);
  return span > 0 && num(entry.trackTime, 0) >= span;
}

/** The `next` chain, flattened into the order it will play. */
function readQueue(entry: TrackEntryLike): SpineQueued[] {
  const queue: SpineQueued[] = [];

  // Bounded rather than trusted: a queue is short, and a cycle in one should
  // report a strange skeleton rather than hang the poll.
  let next = entry.next;
  for (let depth = 0; next !== null && next !== undefined && depth < 32; depth += 1) {
    queue.push({
      animation: nameOf(next.animation),
      loop: next.loop === true,
      delay: num(next.delay, 0),
    });
    next = next.next;
  }

  return queue;
}

function readTrack(entry: TrackEntryLike, index: number): SpineTrack {
  const duration = num(entry.animation?.duration, 0);

  return {
    index,
    animation: nameOf(entry.animation),
    loop: entry.loop === true,
    time: playhead(entry, duration),
    duration,
    timeScale: num(entry.timeScale, 1),
    alpha: num(entry.alpha, 1),
    mixDuration: num(entry.mixDuration, 0),
    mixTime: num(entry.mixTime, 0),
    mixingFrom: nameOf(entry.mixingFrom?.animation),
    complete: isComplete(entry),
    queue: readQueue(entry),
  };
}

/**
 * Live, and polled fast while the section is open.
 *
 * Empty slots keep their position rather than being compacted away: the index
 * is what every other command addresses, and Spine leaves holes behind when a
 * track is cleared.
 */
export function readTracks(node: Node): SpineTrack[] {
  const spine = asSpine(node);
  if (spine === null) return [];

  const tracks: SpineTrack[] = [];

  (spine.state.tracks ?? []).forEach((entry, index) => {
    if (entry === null || entry === undefined) return;

    tracks.push(readTrack(entry, index));
  });

  return tracks;
}

/**
 * Everything about the skeleton that moves, in the one request the panel polls.
 *
 * The tracks are most of it, but a second poll at the same rate for the two
 * values beside them would cost twice what carrying them here does.
 */
export function readLive(node: Node): SpineLive | null {
  const spine = asSpine(node);
  if (spine === null) return null;

  return {
    tracks: readTracks(node),
    timeScale: num(spine.state.timeScale, 1),
    skin: readSkin(spine),
    skeleton: readSkeletonName(spine),
  };
}

/**
 * Which skeleton the node carries, by the only name it has.
 *
 * The application's own answer first, because it is the one that matches the
 * names `changeSkeleton` takes. `SkeletonData.name` is the fallback and is
 * almost always empty — the JSON reader never fills it in.
 */
export function readSkeletonName(spine: SpineLike): string {
  return str(spine.currentSkeletonName, str(spine.skeleton.data?.name, ''));
}
