import type { StatsRecord } from '@scene-inspector/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLocalStorage } from '../../lib/localStorage.js';
import type { Client } from '../../transport/client.js';
import { useResource } from '../../transport/useResource.js';
import { appendSamples, emptyDecoded, type Extremes, trimOlderThan } from './decode.js';
import { keepFrom, type StoredKeep, today } from './keep.js';

/**
 * The recording, held by the shell rather than by the Stats tab.
 *
 * Here for the same reason the bookmarks are: **it has to outlive the tab.**
 * The navbar mounts one tab at a time, so a recording owned by Stats would stop
 * the moment the user looked at the scene — which is exactly when a recording
 * is worth having, since watching the tree is how you make the game do the
 * thing you are trying to measure.
 *
 * **It runs the whole time the panel is open.** There is no switch any more,
 * only how far back to keep: a recording that has to be armed is one that was
 * always off at the moment something interesting happened, and the cost of
 * leaving it on is a wrapper around `renderer.render` and a few numbers a
 * second.
 *
 * The drain is also what keeps the page's buffer alive: the page takes a
 * recording off by itself after a minute with no reader, a check that exists
 * for closed DevTools, and a drain that only ran on one tab would have tripped
 * it.
 */

/** Often enough that the count moves, rarely enough to be a background cost. */
const DRAIN_MS = 500;

const KEEP_KEY = 'stats.keep';

export interface Recording {
  /** How many minutes of history the page is holding. */
  keepMinutes: number;
  setKeepMinutes: (minutes: number) => void;
  /** Field name to the values recorded for it, oldest first. */
  series: ReadonlyMap<string, number[]>;
  /** The lowest and highest each field has reached since the panel opened. */
  extremes: ReadonlyMap<string, Extremes>;
  /** Milliseconds from the start of the recording, one per sample. */
  times: readonly number[];
  /** `Date.now()` at that start, so a tick can be put on a wall clock. */
  startedAt: number;
  /** Samples the panel was too slow to collect. Nonzero means a hole. */
  dropped: number;
  /**
   * Bumped whenever a drain brought something.
   *
   * The series arrays are appended to rather than replaced, so nothing about
   * them changes identity and a consumer watching for that would never redraw.
   */
  revision: number;
}

export function useRecording(client: Client, generation: number): Recording {
  const [stored, setStored] = useLocalStorage<StoredKeep | null>(KEEP_KEY, null);

  /*
   * The stored choice, but only if it was made today — see `keep.ts`.
   *
   * Worked out **once, when the panel opens**, and not watched afterwards. A
   * panel left running across midnight therefore keeps yesterday's window until
   * it is next opened, and that is fine: what this is for is the morning
   * somebody starts work having forgotten they switched it on last week, not
   * the minute after midnight of a session already in progress. Watching the
   * clock to catch that minute would be a timer, or a comparison on every
   * render, for a case nobody is in.
   */
  const [keepMinutes, setMinutes] = useState(() => keepFrom(stored, today()));
  const keepMs = keepMinutes * 60_000;

  /*
   * The decoded samples, in a ref rather than in state.
   *
   * They are appended to several times a second and read only when a chart
   * draws, so putting them in state would re-render the whole tab on every
   * drain for the sake of a value the render already reads. `version` is what
   * tells React something arrived, and it is what the charts get as their
   * `revision` — the arrays themselves never change identity.
   */
  const decoded = useRef(emptyDecoded());
  const cursor = useRef(0);
  const dropped = useRef(0);
  const [version, setVersion] = useState(0);

  /*
   * Sent when the panel opens, whenever the window changes, and — the part
   * that was missing — whenever the page reloads.
   *
   * Without the generation this was asked for exactly once. A reloaded page
   * has a fresh host with no recorder in it and nothing to tell it to start
   * one, so the recording quietly never came back; and the cursor still
   * pointed past the end of a sequence that had started again from nothing, so
   * even a recorder that did exist would have answered every drain with no
   * samples at all.
   *
   * A running recording is retuned rather than restarted, so nothing already
   * collected is thrown away by asking to keep more of it.
   */
  useEffect(() => {
    decoded.current = emptyDecoded();
    cursor.current = 0;
    dropped.current = 0;
    setVersion((step) => step + 1);
  }, [generation]);

  useEffect(() => {
    client.send('stats.setRecording', { keepMs });
  }, [client, keepMs, generation]);

  const setKeepMinutes = useCallback(
    (minutes: number) => {
      setMinutes(minutes);
      // Stamped with the day it was chosen on, which is what makes it expire.
      setStored({ minutes, day: today() });
    },
    [setStored],
  );

  // Nothing is asked for while it is off, so a panel that is not keeping any
  // history costs the page nothing at all.
  const { data } = useResource(() => client.call('stats.record', { since: cursor.current }), {
    intervalMs: DRAIN_MS,
    enabled: keepMs > 0,
    key: String(generation),
  });

  /*
   * The batch this effect last folded in, so that re-running it cannot fold the
   * same one in twice.
   *
   * Appending is not idempotent — it pushes onto the series and adds to the
   * dropped count — while an effect re-runs whenever *any* of its dependencies
   * changes. `keepMs` is one of them, so switching Keep 5m → 10m used to run
   * the body again on the batch that was already applied: a duplicated segment
   * in every chart and a timeline that jumped forward by the length of that
   * batch. `data` is a fresh object per drain, so its identity is the cursor.
   */
  const applied = useRef<StatsRecord | null>(null);

  useEffect(() => {
    if (data === null || data === applied.current) return;
    applied.current = data;

    // The page stopped on its own — the only way that happens is the idle
    // check — so the next drain starts a fresh recording, and the samples this
    // one collected belong to a timeline that has ended.
    if (!data.recording) {
      decoded.current = emptyDecoded();
      cursor.current = 0;
      dropped.current = 0;
      setVersion((step) => step + 1);
      return;
    }

    if (data.samples.length === 0 && data.dropped === 0) return;

    dropped.current += data.dropped;
    appendSamples(decoded.current, data, keepMs);
    cursor.current = data.cursor;
    setVersion((step) => step + 1);
  }, [data, keepMs]);

  /*
   * Shortening the window takes effect at once rather than at the next drain,
   * which is the half of retuning that the drain no longer does.
   */
  useEffect(() => {
    trimOlderThan(decoded.current, keepMs);
    setVersion((step) => step + 1);
  }, [keepMs]);

  return useMemo<Recording>(
    () => ({
      keepMinutes,
      setKeepMinutes,
      series: decoded.current.series,
      extremes: decoded.current.extremes,
      times: decoded.current.times,
      startedAt: decoded.current.startedAt,
      dropped: dropped.current,
      revision: version,
    }),
    // `version` is the dependency that matters: the arrays above are appended
    // to in place, so their identity says nothing about whether a drain
    // brought anything. It is also what `revision` is handed to the charts as.
    [keepMinutes, setKeepMinutes, version],
  );
}
