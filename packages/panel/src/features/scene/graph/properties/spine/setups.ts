import type { NodeId, SpineLive, SpineSetupTrack, SpineTrack } from '@scene-inspector/protocol';

/**
 * What a track is *going* to do, as opposed to what it is doing.
 *
 * The reason this exists at all: `AnimationState.setAnimation` starts an
 * animation the moment it is called. So a panel with no draft has nowhere to
 * put a choice that has not been made yet — which is why "Add track" used to
 * grab the skeleton's first animation and start it looping, and why picking an
 * animation to look at meant starting it before you had set its speed.
 */
export interface TrackDraft {
  animation: string | null;
  loop: boolean;
  /** Where Resume goes back to, which is why a pause must not overwrite it. */
  timeScale: number;
  alpha: number;
  mixDuration: number;
}

/**
 * What a row starts as.
 *
 * `loop` off, because a track added here is a track being tried: an animation
 * you have not seen yet is one you want to watch once and look at the end of,
 * and a loop takes that away — it also hides the whole question of what happens
 * when it finishes. Turning it on is one click; noticing that it was on by
 * itself takes longer than that.
 */
export const NEW_TRACK: TrackDraft = {
  animation: null,
  loop: false,
  timeScale: 1,
  alpha: 1,
  mixDuration: 0,
};

/**
 * One tab: **a Spine, and what is being done to it**.
 *
 * The first tab is the game's own node. Every other one has a Spine of its own,
 * put into the scene beside it — which is the whole point. Setups used to be
 * arrangements applied in turn to the one node, so trying something meant
 * writing over what the game was doing and getting back meant writing over it
 * again. A node apiece removes that: the original is never touched, and going
 * back to it is a click.
 *
 * The previous project kept its per-track bookkeeping on the container
 * (`container.__devtoolSpineBlocks`). That put the inspector's state into the
 * application's object, initialised it once, and left it disagreeing with the
 * game for ever after. Here it lives in the panel, and the page stays as it was
 * found — bar the test node, which is the one thing that has to be in the scene
 * to draw at all.
 *
 * A module rather than component state, for the same reason `fillMemory` is
 * one: `SpineSection` is keyed on the node and remounts when the selection
 * changes, and setups that vanished on a glance at another node would be
 * useless. Keyed by node, so two skeletons do not share theirs.
 */
export interface Setup {
  /**
   * The node this tab drives.
   *
   * The original for the first tab. `null` for a test tab until a skeleton is
   * chosen — that is what makes one, and until then the tab has nothing to show
   * and nothing to poll.
   */
  node: NodeId | null;
  /** `null` means "whatever the node already carries" — most setups are of one. */
  skeleton: string | null;
  /** What the skeleton wears, or `null` for nothing. */
  skin: string | null;
  timeScale: number;
  tracks: Map<number, TrackDraft>;
  /** Rows added here that the scene knows nothing about yet. */
  pending: Set<number>;
  /**
   * Tracks whose animation was picked here and has not been started.
   *
   * The one thing a draft holds that the scene must not overwrite. Everything
   * else about a running track is read from the scene as it goes, but an
   * animation chosen and not yet applied exists nowhere else — and telling the
   * two apart needs a mark, because "the draft differs from the scene" is
   * equally true when **the game** moved the track.
   */
  chosen: Set<number>;
}

interface Held {
  /** The one on screen. The scene has room for one Spine at a time. */
  applied: number;
  /** The one being looked at, which need not be the one on screen. */
  shown: number;
  setups: Setup[];
  /**
   * Whether the original was visible before the panel first hid it.
   *
   * Showing a test means hiding the original, and going back has to put it
   * exactly as it was — a game that had deliberately hidden its Spine must not
   * find the inspector has switched it on.
   */
  originalVisible: boolean | null;
}

const held = new Map<NodeId, Held>();

/**
 * Skeleton names this session has seen work, however it came by them.
 *
 * A game that publishes no PixiJS module keeps its asset store out of reach, so
 * there is no list to offer and the names only the person at the keyboard knows
 * are the only ones there are. Typing one once has to be enough — and so does
 * having simply been on a node that carried it, or the name you just switched
 * away from would be gone from the list and need typing again to switch back.
 *
 * Not per node: a name one skeleton answers to is very likely one another
 * answers to, and a game has a handful of them in all.
 */
const typedSkeletons = new Set<string>();

export function rememberSkeleton(name: string): void {
  typedSkeletons.add(name);
}

export function rememberedSkeletons(): readonly string[] {
  return [...typedSkeletons];
}

function blank(node: NodeId | null = null): Setup {
  return {
    node,
    skeleton: null,
    skin: null,
    timeScale: 1,
    tracks: new Map(),
    pending: new Set(),
    chosen: new Set(),
  };
}

function forNode(id: NodeId): Held {
  const existing = held.get(id);
  if (existing !== undefined) return existing;

  // The first setup is the node itself: the tab that was here before there were
  // tabs, and the one the game owns.
  const made: Held = { applied: 0, shown: 0, setups: [blank(id)], originalVisible: null };
  held.set(id, made);
  return made;
}

export function setupsOf(id: NodeId): readonly Setup[] {
  return forNode(id).setups;
}

export function shownIndex(id: NodeId): number {
  return forNode(id).shown;
}

export function appliedIndex(id: NodeId): number {
  return forNode(id).applied;
}

export function showSetup(id: NodeId, index: number): void {
  const node = forNode(id);
  if (index >= 0 && index < node.setups.length) node.shown = index;
}

/** The setup being looked at. Edits land here whether or not it is applied. */
export function shownSetup(id: NodeId): Setup {
  const node = forNode(id);
  return node.setups[node.shown] ?? blank();
}

export function isShownApplied(id: NodeId): boolean {
  const node = forNode(id);
  return node.applied === node.shown;
}

/**
 * Adds an empty tab.
 *
 * Empty, and with no Spine behind it yet: a test starts as a question — which
 * skeleton? — and answering it is what builds the node. Copying the current tab
 * was tried while setups were arrangements of one node; now that each has a
 * node of its own there is nothing to copy that would not have to be rebuilt.
 */
export function addSetup(id: NodeId): void {
  const node = forNode(id);

  node.setups.push(blank());
  node.shown = node.setups.length - 1;
}

/**
 * @returns the node to take out of the scene, and which tab is on screen now.
 *
 * The node comes back rather than being removed here: this module knows nothing
 * about the page, and taking a node out of a scene is a command like any other.
 * The first tab is the game's own and cannot be closed.
 */
export function removeSetup(id: NodeId, index: number): { drop: NodeId | null; applied: number } {
  const node = forNode(id);
  if (index === 0 || index >= node.setups.length) return { drop: null, applied: node.applied };

  const [gone] = node.setups.splice(index, 1);

  const shift = (at: number): number => (at > index ? at - 1 : at === index ? 0 : at);
  node.applied = shift(node.applied);
  node.shown = shift(node.shown);

  return { drop: gone?.node ?? null, applied: node.applied };
}

/** The node each tab drives, so the caller can show one and hide the rest. */
export function nodesOf(id: NodeId): Array<NodeId | null> {
  return forNode(id).setups.map((setup) => setup.node);
}

/**
 * What the original's visibility was before the panel hid it.
 *
 * Held only for as long as the panel is holding it back, which is what makes it
 * true for the whole of that time. It is not overwritten while it stands —
 * after the first hide the scene reports what the panel did to the node, not
 * what the game wanted — and it is dropped the moment the node is given back,
 * so a game that hides it later is not answered with what it wanted an hour
 * ago.
 */
export function rememberOriginalVisible(id: NodeId, visible: boolean): void {
  const node = forNode(id);
  node.originalVisible ??= visible;
}

export function originalWasVisible(id: NodeId): boolean {
  return forNode(id).originalVisible ?? true;
}

/** Called once the original is back on screen and nothing is holding it. */
export function forgetOriginalVisible(id: NodeId): void {
  forNode(id).originalVisible = null;
}

export function applySetupAt(id: NodeId, index: number): void {
  const node = forNode(id);
  if (index < 0 || index >= node.setups.length) return;

  node.applied = index;
  node.shown = index;
}

/**
 * Brings the tab being looked at up to date with what its own node holds.
 *
 * The one being looked at rather than the one on screen, because that is the one
 * whose node is being polled — each tab drives a Spine of its own, and looking
 * at a tab that is not showing is how you see what it is doing before you put it
 * on screen.
 */
export function syncShown(id: NodeId, live: SpineLive | null): void {
  if (live === null) return;

  const node = forNode(id);
  const setup = node.setups[node.shown];
  if (setup === undefined) return;

  if (live.skeleton !== '') rememberSkeleton(live.skeleton);

  /*
   * The first tab can stage a skeleton the game has not been asked for yet, and
   * while that is true it has come loose from the scene: the tracks running down
   * there belong to the old skeleton, and following them would overwrite the
   * preparation that Apply is meant to send.
   */
  if (setup.skeleton !== null && setup.skeleton !== live.skeleton) return;

  setup.skin = live.skin === '' ? null : live.skin;
  setup.timeScale = live.timeScale;
  setup.skeleton ??= live.skeleton === '' ? null : live.skeleton;

  /*
   * The scene moves on its own, and the panel has to move with it.
   *
   * A game switches tracks for its own reasons — an orientation change swapping
   * `landscape` for `portrait` on track 1 — and the row must say what is
   * playing, not what was playing when the section was first opened. Seeding a
   * draft and never touching it again is what froze it there.
   *
   * Only what was **picked here** resists: the animation a choice is waiting to
   * start. And it stops resisting the moment the scene agrees with it, so a
   * choice that has landed goes back to following like the rest.
   */
  for (const track of live.tracks) {
    const draft = setup.tracks.get(track.index);
    if (draft === undefined) {
      setup.tracks.set(track.index, fromLive(track));
      continue;
    }

    if (!setup.chosen.has(track.index)) {
      draft.animation = track.animation;
      draft.loop = track.loop;
    } else if (draft.animation === track.animation) {
      setup.chosen.delete(track.index);
    }
  }

  // A track the scene has dropped is no longer part of what this setup is.
  for (const index of [...setup.tracks.keys()]) {
    const known = live.tracks.some((track) => track.index === index);
    if (!known && !setup.pending.has(index)) setup.tracks.delete(index);
  }
}

function fromLive(track: SpineTrack): TrackDraft {
  return {
    animation: track.animation,
    loop: track.loop,
    // A track found on pause would otherwise offer to resume at a standstill.
    timeScale: track.timeScale === 0 ? 1 : track.timeScale,
    alpha: track.alpha,
    mixDuration: track.mixDuration,
  };
}

/**
 * The draft for a track of the setup being looked at.
 *
 * A running track that nothing has been changed on has no draft, and what it is
 * doing is the right thing to show — so the live entry is where an absent one
 * comes from. In a setup that is not applied there is no live entry to fall
 * back to, and the setup is all there is.
 */
export function draftFor(id: NodeId, index: number, live: SpineTrack | undefined): TrackDraft {
  const setup = shownSetup(id);
  const draft = setup.tracks.get(index);
  if (draft !== undefined) return draft;

  return live === undefined ? NEW_TRACK : fromLive(live);
}

export function setDraft(id: NodeId, index: number, draft: TrackDraft): void {
  const setup = shownSetup(id);
  const before = setup.tracks.get(index);

  // Only an animation picked here is held against the scene — see `chosen`.
  // A speed or a flag is written straight through and needs no defending.
  if (before !== undefined && before.animation !== draft.animation) setup.chosen.add(index);

  setup.tracks.set(index, draft);
}

/**
 * The highest track index this panel will ask for.
 *
 * Not a matter of taste. `AnimationState.setAnimation` grows its track array to
 * fit whatever index it is handed — `expandToIndex` pushes `null` until the
 * array is that long — and both `update` and `apply` then walk the whole thing
 * on every frame, as does this panel's own poll. A mistyped `99999999` would
 * therefore wedge the inspected application for good, from a text field, with
 * no way back: the row would be sitting at an index nothing can scroll to.
 *
 * Thirty-two is far past what a skeleton uses — Spine's own examples layer
 * three or four — and far short of what costs anything.
 */
const MAX_TRACK_INDEX = 32;

/**
 * Moves a row to another track index.
 *
 * The index is not decoration: Spine applies tracks in order, so a higher one
 * draws over a lower one — moving a row is how a gesture is put over a walk.
 *
 * @returns false when the number is taken, or is not a track index at all.
 * Refusing beats merging two rows into one, which is what writing over the
 * other one would do — and the row that lost would be the one that was not
 * being edited.
 */
export function moveDraft(id: NodeId, from: number, to: number, draft: TrackDraft): boolean {
  if (from === to || !Number.isInteger(to) || to < 0 || to > MAX_TRACK_INDEX) return false;

  const setup = shownSetup(id);
  if (setup.tracks.has(to) || setup.pending.has(to)) return false;

  setup.tracks.delete(from);
  setup.tracks.set(to, draft);

  if (setup.pending.delete(from)) setup.pending.add(to);
  if (setup.chosen.delete(from)) setup.chosen.add(to);

  return true;
}

export function dropDraft(id: NodeId, index: number): void {
  const setup = shownSetup(id);
  setup.tracks.delete(index);
  setup.pending.delete(index);
  setup.chosen.delete(index);
}

export function pendingTracks(id: NodeId): ReadonlySet<number> {
  return shownSetup(id).pending;
}

export function addPendingTrack(id: NodeId, index: number): void {
  const setup = shownSetup(id);
  setup.pending.add(index);
  setup.chosen.add(index);
  setup.tracks.set(index, { ...NEW_TRACK });
}

/**
 * The lowest index nothing is using — neither a live track nor a row already
 * added. Spine addresses tracks by index, so the panel has to pick one.
 */
export function nextFreeTrack(id: NodeId, live: readonly SpineTrack[]): number {
  const setup = shownSetup(id);
  const used = new Set<number>([
    ...live.map((track) => track.index),
    ...setup.tracks.keys(),
    ...setup.pending,
  ]);

  let index = 0;
  while (used.has(index)) index += 1;

  return index;
}

/** The rows a setup draws when nothing of it is running: its own, in order. */
export function rowsOf(setup: Setup): number[] {
  return [...setup.tracks.keys()].sort((left, right) => left - right);
}

/** A setup as the page takes it. Tracks with no animation have nothing to start. */
export function toCommand(setup: Setup): {
  skeleton: string | null;
  skin: string | null;
  timeScale: number;
  tracks: SpineSetupTrack[];
} {
  const tracks: SpineSetupTrack[] = [];

  for (const index of rowsOf(setup)) {
    const draft = setup.tracks.get(index);
    if (draft === undefined || draft.animation === null) continue;

    tracks.push({
      index,
      animation: draft.animation,
      loop: draft.loop,
      timeScale: draft.timeScale,
      alpha: draft.alpha,
      mixDuration: draft.mixDuration,
    });
  }

  return { skeleton: setup.skeleton, skin: setup.skin, timeScale: setup.timeScale, tracks };
}

/**
 * Forgets everything.
 *
 * Node ids belong to one install of the host: after a reload the same numbers
 * name different objects, so setups held against them would be attached to
 * whatever now happens to be node 12.
 */
export function forgetSetups(): void {
  held.clear();
  typedSkeletons.clear();
}
