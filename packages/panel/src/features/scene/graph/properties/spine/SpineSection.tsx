import type { NodeId, SpineLive, SpineTrackParam } from '@scene-inspector/protocol';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FaPlus } from 'react-icons/fa6';

import { CollapsibleSection } from '../../../../../components/collapsible/collapsible-section.js';
import { useT } from '../../../../../i18n/index.js';
import { Button } from '../../../../../components/ui/button.js';
import { Hint } from '../../../../../components/ui/tooltip.js';
import type { Client } from '../../../../../transport/client.js';
import { useResource } from '../../../../../transport/useResource.js';
import { EventLog } from './EventLog.js';
import { InfoRows } from './InfoRows.js';
import {
  addPendingTrack,
  addSetup,
  appliedIndex,
  applySetupAt,
  draftFor,
  forgetOriginalVisible,
  dropDraft,
  nextFreeTrack,
  moveDraft,
  nodesOf,
  originalWasVisible,
  pendingTracks,
  rememberOriginalVisible,
  removeSetup,
  rowsOf,
  setDraft,
  setupsOf,
  showSetup,
  shownIndex,
  shownSetup,
  syncShown,
  toCommand,
  type TrackDraft,
} from './setups.js';
import { SetupTabs } from './SetupTabs.js';
import { SkeletonRow } from './SkeletonRow.js';
import { TrackRow, type TrackActions } from './TrackRow.js';

/**
 * Spine: `layout: 'custom:spine'`.
 *
 * Unlike every other section this one draws no descriptors, because Spine has
 * none. Its data is a live list of tracks with a clock running through them, so
 * it travels through commands of its own (docs/architecture.md §3.5).
 *
 * Four things are deliberate:
 *
 *  - the **live state polls fast, and only while this tab is open**. It is an
 *    honest progress indicator read 25 times a second, not a frame-accurate
 *    timeline, and it costs nothing while another tab is being looked at;
 *  - **scrubbing works on a paused scene**. The page applies the pose and asks
 *    for one frame, which is why dragging the bar moves a scene that is not
 *    rendering on its own;
 *  - **nothing starts an animation except Play.** An animation chosen here is a
 *    choice, not a command — see `setups.ts` for why that needs saying;
 *  - **a test gets a Spine of its own.** The first tab is the game's node and is
 *    never written to for the sake of an experiment; every other tab builds a
 *    Spine beside it and works there. One of them is on screen at a time.
 */

/**
 * What the host actually sent, made safe to draw.
 *
 * The host lives in the inspected page, and it is installed there once: rebuild
 * the extension without reloading the page and the panel is talking to the
 * host from **before** the rebuild. It then answers the shape it knew, and a
 * field added since is simply missing.
 *
 * Types cannot help across that gap — they describe the build that is compiled,
 * not the one that replies — so the arrays are checked where they arrive. A
 * panel that goes blank because the page has not been reloaded is the worst of
 * the answers available; degrading to "this host does not offer that" is the
 * best.
 */
function asArray<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function received(live: SpineLive | null): SpineLive | null {
  if (live === null) return null;

  return {
    ...live,
    tracks: asArray(live.tracks).map((track) => ({ ...track, queue: [...asArray(track.queue)] })),
    skin: live.skin ?? '',
    skeleton: live.skeleton ?? '',
  };
}

/** Fast enough to read as motion, slow enough to leave the page alone. */
const LIVE_INTERVAL_MS = 40;

/** The skeleton's animations and skins do not change under us. */
const INFO_INTERVAL_MS = 30_000;

/**
 * While the answer is still being worked out.
 *
 * Only ever the case for a skeleton the node is not carrying: its lists are read
 * out of its own export, and reading is asynchronous. A brief spell of asking
 * often beats half a minute of showing the wrong list.
 */
const PENDING_INTERVAL_MS = 250;

export function SpineSection({
  client,
  id,
  visible,
}: {
  client: Client;
  id: NodeId;
  /** Whether the game's own node draws. Read before the panel ever hides it. */
  visible: boolean;
}) {
  const t = useT();
  /**
   * The live state, and **which node it was read from**.
   *
   * The two travel together because the tabs drive different nodes and the poll
   * is a round trip behind the click: opening a tab that has no Spine yet, with
   * the previous tab's answer still in hand, wrote that answer into the new tab
   * — which is how an empty test arrived already named after the original's
   * skeleton. Carrying the node makes an answer meant for someone else
   * recognisable instead of plausible.
   */
  const [reading, setReading] = useState<{ node: NodeId; live: SpineLive } | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Bumped whenever a setup is written, because the setups live outside React.
   * They have to: this section is keyed on the node and remounts when the
   * selection moves, and a half-built test that vanished on a glance at another
   * node would be worse than not having any.
   */
  const [revision, setRevision] = useState(0);
  const touched = (): void => setRevision((at) => at + 1);

  const [eventsOpen, setEventsOpen] = useState(false);

  /**
   * What the page said when it could not build the skeleton asked for.
   *
   * Three routes are tried and any of them may be shut — the asset store out of
   * reach, the urls unrecorded, the game's own method on the instance rather
   * than the class. Which one it was is not something the panel can tell, and
   * guessing at it in the message was worse than not naming one: it said "on v6
   * and v7" to somebody on v8. Saying that it could not, plainly, beats a click
   * that appears to do nothing.
   */
  const [refused, setRefused] = useState<string | null>(null);

  const shown = shownIndex(id);
  const applied = appliedIndex(id);
  const setups = setupsOf(id);
  const setup = shownSetup(id);
  const isOriginal = shown === 0;

  /**
   * The node this tab drives.
   *
   * The game's own for the first tab, a Spine of this tab's own for the rest,
   * and nothing at all for a test that has not been given a skeleton yet. Every
   * poll and every command below addresses it rather than the selection.
   */
  const target = setup.node;

  /*
   * Which skeleton the lists should describe.
   *
   * The one chosen here, not the one the node is carrying — on the first tab
   * those differ between a choice and Apply, and offering the node's animations
   * then is offering the wrong list. A test tab never differs: its node *is*
   * the skeleton it chose.
   */
  const wanted = isOriginal ? (setup.skeleton ?? '') : '';

  /*
   * A test with no Spine yet still needs one answer — which skeletons the page
   * has — and that is a property of the page rather than of any node, so the
   * game's own node is asked for it.
   */
  const asking = target ?? id;

  const { data: info, loading } = useResource(
    () =>
      client.call('spine.info', {
        id: asking,
        ...(wanted === '' ? {} : { skeleton: wanted }),
      }),
    {
      // Asking about another node, or another skeleton, is a different question
      // — so the key carries both and the answer arrives at once.
      key: `${String(asking)}:${wanted}`,
      intervalMs: pending ? PENDING_INTERVAL_MS : INFO_INTERVAL_MS,
    },
  );

  useEffect(() => {
    setPending(info?.pending === true);
  }, [info]);

  // Its own loop rather than `useResource`: this one runs far faster than
  // anything else in the panel, and only while the section is mounted.
  const targetRef = useRef<NodeId | null>(target);
  targetRef.current = target;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async (): Promise<void> => {
      if (cancelled) return;

      const node = targetRef.current;

      // 25 times a second is worth skipping while nobody is looking at it —
      // the rule `useResource` keeps, and this loop is the faster of the two.
      if (document.hidden || node === null) {
        if (node === null && !cancelled) setReading(null);
        timer = setTimeout(() => void tick(), LIVE_INTERVAL_MS);
        return;
      }

      try {
        const next = received(await client.call('spine.live', { id: node }));
        if (!cancelled) setReading(next === null ? null : { node, live: next });
      } catch {
        // The node may have gone. The next tick finds out.
      }

      if (!cancelled) timer = setTimeout(() => void tick(), LIVE_INTERVAL_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client]);

  // Only what was read from **this** tab's node is this tab's to follow.
  const live = reading !== null && reading.node === target ? reading.live : null;

  /*
   * The tab being looked at follows its own node, because that node is what it
   * describes: a track nobody touched here has no draft of its own, and the
   * game moves tracks for its own reasons.
   */
  syncShown(id, live);

  /**
   * Puts one tab on screen and takes the rest off.
   *
   * The scene has room for one Spine in that place, so this is a choice of one:
   * the tab picked draws, every other node these tabs own does not. The game's
   * own node goes back to what it *was* rather than to `true` — a Spine the game
   * had deliberately hidden must not come back on because the inspector looked
   * at it.
   */
  const show = (index: number): void => {
    // Asked before anything moves, and only while something is about to be
    // held back: what the scene reports afterwards is the panel's own doing.
    if (index !== 0) rememberOriginalVisible(id, visible);

    applySetupAt(id, index);

    nodesOf(id).forEach((node, at) => {
      if (node === null) return;

      const wants = at === index && (at !== 0 || originalWasVisible(id));
      client.send('scene.setProp', { id: node, key: 'visible', value: wants });
    });

    // Given back, so there is nothing left to remember — and remembering it
    // anyway is how a node the game hid afterwards came back on.
    if (index === 0) forgetOriginalVisible(id);

    touched();
  };

  /** The first tab's own Apply: its skeleton is the game's to change, not ours. */
  const applyOriginal = (): void => {
    client.send('spine.applySetup', { id, ...toCommand(shownSetup(id)) });
    touched();
  };

  /**
   * Choosing a skeleton in a test tab **builds** it.
   *
   * There is nothing to stage: this tab's Spine is ours, so the answer to "show
   * me that skeleton instead" is a new one of those. The old one leaves the
   * scene afterwards — swapping a skeleton in place is what no runtime allows,
   * and a build that fails must not have thrown the old one away first.
   */
  const buildTest = (name: string): void => {
    const previous = shownSetup(id).node;
    setRefused(null);

    void client.call('spine.createTest', { id, skeleton: name }).then((made) => {
      if (made === null) {
        setRefused(
          `Could not build “${name}” here — the page keeps it somewhere this cannot reach.`,
        );
        return;
      }

      if (previous !== null) client.send('scene.mutate', { kind: 'delete', id: previous });

      const current = shownSetup(id);
      current.node = made.id;
      current.skeleton = name;
      current.tracks.clear();
      current.pending.clear();
      current.chosen.clear();

      show(shownIndex(id));
    });
  };

  const actions = useRef<TrackActions>({
    play: (track, draft) => {
      const node = targetRef.current;
      if (node === null) return;

      client.send('spine.setTrack', {
        id: node,
        track,
        animation: draft.animation,
        loop: draft.loop,
        // The numbers travel with the call because the entry they belong to
        // does not exist yet: a round trip later is a round trip the animation
        // has already spent running at the wrong speed.
        params: {
          timeScale: draft.timeScale,
          alpha: draft.alpha,
          mixDuration: draft.mixDuration,
        },
      });
    },
    setParam: (track, key: SpineTrackParam, value) => {
      const node = targetRef.current;
      if (node !== null) client.send('spine.setTrackParam', { id: node, track, key, value });
    },
    setLoop: (track, loop) => {
      const node = targetRef.current;
      if (node !== null) client.send('spine.setLoop', { id: node, track, loop });
    },
    setTime: (track, time) => {
      const node = targetRef.current;
      if (node !== null) client.send('spine.setTrackTime', { id: node, track, time });
    },
    clearQueue: (track) => {
      const node = targetRef.current;
      if (node !== null) client.send('spine.clearQueue', { id: node, track });
    },
    remove: (track, running) => {
      const node = targetRef.current;
      if (running && node !== null) client.send('spine.clearTrack', { id: node, track });

      dropDraft(id, track);
      touched();
    },

    /*
     * A running track is **moved**, not renamed: nothing in Spine changes an
     * entry's index, so the old one is cleared and the animation is started on
     * the new one. That restarts it from zero, which is the honest cost of the
     * move and the reason it is not offered as a nudge — it is a field you
     * commit.
     *
     * What is restarted is what the entry **is playing**, never the draft. The
     * draft may be holding an animation that was only chosen, and starting it
     * here would break the one rule this section is built on: nothing plays
     * until Play. Its speed is the entry's too, so a track moved while paused
     * arrives paused rather than running.
     */
    renumber: (from, to, draft, live) => {
      if (!moveDraft(id, from, to, draft)) return false;

      // The row exists at the new index in the panel before it exists in the
      // scene — the commands below have not landed, and a `setTrack` may yet be
      // refused. Marked either way, or the next poll sweeps the draft away and
      // the row goes with it.
      addPendingTrack(id, to);
      setDraft(id, to, draft);

      const node = targetRef.current;
      if (live !== undefined && node !== null) {
        client.send('spine.clearTrack', { id: node, track: from });

        // A track running Spine's empty animation has a name of `null`, and
        // there is nothing to start on the new index — clearing the old one is
        // the whole of the move.
        if (live.animation !== null) {
          client.send('spine.setTrack', {
            id: node,
            track: to,
            animation: live.animation,
            loop: live.loop,
            params: {
              timeScale: live.timeScale,
              alpha: live.alpha,
              mixDuration: live.mixDuration,
            },
          });
        }
      }

      touched();
      return true;
    },
  }).current;

  /*
   * Only the first tab stages a skeleton. A test tab's node **is** the skeleton
   * it chose, so there is never anything of it waiting to be applied.
   */
  const staged = isOriginal && wanted !== '' && live !== null && wanted !== live.skeleton;
  const onScene = target !== null && !staged;

  /**
   * The rows to draw: every track this tab's node is running, plus every row
   * added here — a row with no entry behind it exists only in the panel. A tab
   * whose skeleton is staged has no scene to consult, so its setup is all there
   * is.
   */
  const rows = useMemo(() => {
    if (!onScene) return rowsOf(shownSetup(id)).map((index) => ({ index, live: undefined }));

    const tracks = live?.tracks ?? [];
    const indices = new Set<number>([...tracks.map((track) => track.index), ...pendingTracks(id)]);

    return [...indices]
      .sort((left, right) => left - right)
      .map((index) => ({ index, live: tracks.find((track) => track.index === index) }));
    // `revision` is what a setup change is seen through; the setups themselves
    // are not React state.
  }, [live, id, revision, onScene]);

  const strip = (
    <>
      <div className="border-border flex items-center border-b px-2 py-1.5">
        <Hint text={t('spine.addTest')}>
          <Button
            variant="outline"
            size="xs"
            className="gap-1 px-2"
            onClick={() => {
              addSetup(id);
              touched();
            }}
          >
            <FaPlus /> Add test Spine
          </Button>
        </Hint>
      </div>

      {/* Only once there is a choice to make. One tab is just the node. */}
      {setups.length > 1 && (
        <SetupTabs
          setups={setups}
          shown={shown}
          applied={applied}
          onShow={(index) => {
            showSetup(id, index);
            setRefused(null);
            touched();
          }}
          onApply={show}
          onRemove={(index) => {
            const { drop, applied: now } = removeSetup(id, index);
            if (drop !== null) client.send('scene.mutate', { kind: 'delete', id: drop });

            show(now);
          }}
        />
      )}
    </>
  );

  // `null` while the first request is in flight means exactly what it means
  // afterwards, so the two are told apart before either is drawn — otherwise
  // every Spine node claims to have no skeleton for one round trip.
  if (info === null) {
    return (
      <div className="text-xs">
        {strip}
        <p className="text-muted-foreground p-3">
          {loading ? 'Reading the skeleton…' : 'No skeleton here.'}
        </p>
      </div>
    );
  }

  const shape = {
    ...info,
    skins: [...asArray(info.skins)],
    animations: [...asArray(info.animations)],
    skeletons: [...asArray(info.skeletons)],
    events: [...asArray(info.events)],
    canChangeSkeleton: info.canChangeSkeleton ?? false,
  };

  /*
   * A test with no Spine yet is one question and nothing else. Drawing tracks,
   * events and contents of the node it borrowed the skeleton list from would be
   * drawing another tab's node under this tab's name.
   */
  const empty = target === null;

  return (
    <div className="text-xs">
      {strip}

      <CollapsibleSection title="Skeleton" className="border-x">
        <SkeletonRow
          info={shape}
          live={onScene ? live : null}
          setup={setup}
          onScene={onScene}
          own={!isOriginal}
          // A test tab builds its Spine from the choice, so until it has one
          // there is nothing else on this row to show.
          onlyChoose={empty}
          problem={isOriginal ? null : refused}
          onTimeScale={(value) => {
            setup.timeScale = value;
            if (onScene && target !== null) {
              client.send('spine.setTimeScale', { id: target, value });
            }
            touched();
          }}
          onSkin={(skin) => {
            setup.skin = skin;
            if (onScene && target !== null) client.send('spine.setSkin', { id: target, skin });
            touched();
          }}
          /*
           * On the first tab a skeleton is a choice the game has to be asked to
           * make, and Apply asks it. On a test tab it is ours to build.
           */
          onSkeleton={(name) => {
            if (!isOriginal) {
              buildTest(name);
              return;
            }

            setup.skeleton = name;
            touched();
          }}
          unapplied={isOriginal && !onScene}
          onApply={applyOriginal}
        />
      </CollapsibleSection>

      {!empty && (
        <>
          <CollapsibleSection title="Tracks" className="border-x">
            {rows.map((row) => (
              <TrackRow
                key={row.index}
                index={row.index}
                live={row.live}
                draft={draftFor(id, row.index, row.live)}
                animations={shape.animations}
                actions={actions}
                offline={!onScene}
                onDraft={(next: TrackDraft) => {
                  setDraft(id, row.index, next);
                  touched();
                }}
              />
            ))}

            <div className="flex items-center gap-1 px-2 py-1.5">
              <Hint text={t('spine.addTrack')}>
                <Button
                  variant="outline"
                  size="xs"
                  className="gap-1 px-2"
                  onClick={() => {
                    addPendingTrack(id, nextFreeTrack(id, live?.tracks ?? []));
                    touched();
                  }}
                >
                  <FaPlus /> Add track
                </Button>
              </Hint>

              <Hint text={t('spine.clearTracks')}>
                <Button
                  variant="outline"
                  size="xs"
                  className="px-2"
                  disabled={!onScene || (live?.tracks.length ?? 0) === 0}
                  onClick={() => {
                    if (target !== null) client.send('spine.clearTracks', { id: target });
                  }}
                >
                  Clear all
                </Button>
              </Hint>
            </div>
          </CollapsibleSection>

          {/*
           * Mounted only while it is open, and that is the whole arrangement:
           * the listener in the page goes on when this appears and comes off
           * when it goes away, so a skeleton nobody is watching costs nothing.
           */}
          <CollapsibleSection
            title="Events"
            className="border-x"
            defaultCollapsed
            onCollapse={(collapsed) => setEventsOpen(!collapsed)}
          >
            {eventsOpen && target !== null && <EventLog client={client} id={target} />}
          </CollapsibleSection>

          {/*
           * Last, because it is the one part that is only read. It describes the
           * skeleton being **chosen**, which on the first tab between a choice
           * and Apply is not the one running — and seeing what you are about to
           * get is the point.
           */}
          <CollapsibleSection title="Info" className="border-x">
            <InfoRows info={shape} />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
