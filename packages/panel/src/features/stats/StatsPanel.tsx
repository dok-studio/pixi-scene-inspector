import type { SceneNode } from '@scene-inspector/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CollapsibleSection } from '../../components/collapsible/collapsible-section.js';
import { useT } from '../../i18n/index.js';
import { Button } from '../../components/ui/button.js';
import { Segmented } from '../../components/ui/segmented.js';
import { Hint } from '../../components/ui/tooltip.js';
import { countTypes } from '../../lib/nodeCounts.js';
import { useLocalStorage } from '../../lib/localStorage.js';
import type { Client } from '../../transport/client.js';
import { scaleInterval, usePollRate } from '../../transport/pollRate.js';
import { useResource } from '../../transport/useResource.js';
import { useRevisioned } from '../../transport/useRevisioned.js';
import { carryForward, windowOf } from './align.js';
import { Chart } from './Chart.js';
import { Minimap } from './Minimap.js';
import { TimeAxis } from './TimeAxis.js';
import { ChartPicker } from './ChartPicker.js';
import { noteExtreme, openStatsHistory } from './history.js';
import { allMetrics, GROUPS, type Group, type Metric, typeKey } from './metrics.js';
import { createSeries, type Series } from './series.js';
import { useChartColors } from './useChartColors.js';
import { KEEP_CHOICES } from './keep.js';
import type { Recording } from './useRecording.js';

/**
 * The Stats tab: one chart per metric, stacked, in the shape a task manager
 * uses — a name and a large reading over a box the data slides through.
 *
 * The metrics are the ones the previous project showed, less its "rebuild
 * frequency" (which was a zero or a one, and always a zero below v8) and plus
 * two it collected and never drew: the frame time, which catches the stutters a
 * rate averaged over a second smooths away, and the JS heap.
 *
 * **Every chart is drawn against one clock.** The readings do not arrive at one
 * rate — frames ten times a second, textures and the tree once — so the slower
 * ones repeat their last value on the ticks they have nothing new for
 * (`align.ts`). Without that a stutter and the texture load that caused it sat
 * at different places along two charts that both claimed to show a minute.
 *
 * Nothing here is armed by hand. Polling `stats.frame` is what puts the render
 * hook on in the page, and the navbar mounts one tab at a time, so closing this
 * one stops the polls and the hook comes off.
 *
 * The recording runs the whole time the panel is open, and it lives in the
 * shell so that it survives this tab being closed (`useRecording.ts`). What is
 * chosen here is only how far back to keep — while the window sits at the live
 * edge the charts are drawn from the live series anyway, because the recording
 * is drained in batches and a chart fed from it steps rather than flows.
 */

/** Fast enough to show a stutter; the page counts frames either way. */
const FRAME_MS = 100;
/** Textures appear when something loads, not while the game runs. */
const SLOW_MS = 1_000;

/**
 * Pixels per sample. A wider panel shows more history, not a wider minute.
 *
 * One CSS pixel is what the charts already were at the width this panel usually
 * gets, so the span a person is used to does not move; what changes is that it
 * now grows with the drawer instead of stretching.
 */
const STEP_PX = 1;

/**
 * How much the live ring keeps.
 *
 * More than any window will ask for, because the window is now as wide as the
 * panel and a docked drawer can be most of the screen. Four minutes of the fast
 * tick, which is a few hundred kilobytes across every chart on the tab.
 */
const LIVE_CAPACITY = 2_400;

const HIDDEN_KEY = 'stats.hiddenCharts';
const COLLAPSED_KEY = 'stats.collapsedGroups';

const NOTHING: SceneNode[] = [];

/** One array, so a recording with no readings yet is not a new prop each render. */
const EMPTY: number[] = [];

function useSeriesMap() {
  const map = useRef(new Map<string, Series>());

  return useRef((key: string): Series => {
    const found = map.current.get(key);
    if (found !== undefined) return found;

    const fresh = createSeries(LIVE_CAPACITY);
    map.current.set(key, fresh);

    return fresh;
  }).current;
}

export function StatsPanel({
  client,
  recording,
  generation,
}: {
  client: Client;
  recording: Recording;
  /** Which page load this is. What the remembered history is keyed by. */
  generation: number;
}) {
  const t = useT();

  /*
   * Asked for by generation rather than cleared from outside: this is read
   * during the render below, and a clear living in an effect would run after
   * it — see `openStatsHistory`.
   */
  const history = useMemo(() => openStatsHistory(generation), [generation]);

  /*
   * Which groups are folded away.
   *
   * Read before the polls below rather than left to each section, because a
   * folded group is not only hidden: its poll is switched off, which is the
   * same bargain a collapsed property section already makes (§3.4). One key
   * for the three of them — they are one setting about one list.
   */
  const [collapsed, setCollapsed] = useLocalStorage<Record<string, boolean>>(COLLAPSED_KEY, {});
  const folded = (group: Group): boolean => collapsed[group] === true;

  /*
   * The tree feeds two groups, not one: the node counts, and the filter and
   * mask charts that sit under Rendering because that is where their cost
   * lands. So folding `Scene nodes` no longer stops the poll on its own —
   * named here rather than discovered later as two charts that stopped moving.
   */
  const needsTree = !folded('Scene nodes') || !folded('Rendering');

  const rate = usePollRate();
  const seriesFor = useSeriesMap();

  const { data: frame } = useResource(() => client.call('stats.frame', {}), {
    intervalMs: FRAME_MS,
  });
  const { data: textures } = useResource(() => client.call('stats.textures', {}), {
    intervalMs: SLOW_MS,
    enabled: !folded('Memory'),
  });
  const { data: tree } = useRevisioned(
    (rev) => client.call('scene.tree', rev === undefined ? {} : { rev }),
    { intervalMs: SLOW_MS, enabled: needsTree },
  );

  const counts = useMemo(() => countTypes(tree?.nodes ?? NOTHING), [tree]);

  /*
   * The most recent reading of everything that is not polled on the fast tick.
   *
   * A ref rather than state: it is read when the fast tick fires, and a render
   * on every slow poll would be a render for a value nothing draws until the
   * next tick anyway.
   */
  const latest = useRef(new Map<string, number>());


  /*
   * Which node types have ever been seen.
   *
   * Sticky, as it was in the previous project and for its reason: a type whose
   * last node has just left the scene is precisely the one worth still looking
   * at, and dropping its row would unmount the chart and take its history with
   * it at that exact moment.
   */
  const [seen, setSeen] = useState<readonly string[]>(() => [...history.seen]);

  /*
   * A series gained a sample.
   *
   * Only the setter is wanted: the series live in a ref and are read during the
   * render, so all this has to do is cause one. Holding the samples in state
   * instead would rebuild a 600-element array ten times a second to say the
   * same thing.
   */
  const [, sampled] = useState(0);

  useEffect(() => {
    if (textures === null) return;

    latest.current.set('gpuMB', textures.gpuBytes / (1024 * 1024));
    latest.current.set('textures', textures.count);
    latest.current.set('texturesOnGpu', textures.onGpu);
  }, [textures]);

  useEffect(() => {
    if (tree === null) return;

    latest.current.set('nodes', counts.total);
    latest.current.set('filters', counts.filtered);
    latest.current.set('masks', counts.masked);
    // A type whose last node has gone reads nought rather than keeping the
    // count it had: it is still in the scene's vocabulary, and its chart should
    // show it falling to the floor rather than holding a stale figure.
    for (const type of seen) latest.current.set(typeKey(type), 0);
    for (const entry of counts.types) latest.current.set(typeKey(entry.type), entry.count);

    const fresh = counts.types.filter((entry) => !seen.includes(entry.type));
    if (fresh.length > 0) {
      const next = [...seen, ...fresh.map((entry) => entry.type)].sort((a, b) => a.localeCompare(b));
      history.seen = next;
      setSeen(next);
    }
  }, [tree, counts, seen]);

  /*
   * The one tick. Everything is written on it, whether or not it was measured
   * on it, so the charts share an x axis by construction rather than by two
   * rates happening to cover the same minute.
   */
  /*
   * The live rings are filled from the recording before the first sample of a
   * new mount is written to them.
   *
   * The tab is unmounted every time somebody looks at the scene, and its rings
   * go with it — so on the way back the charts began from an empty screen, as
   * if the minutes just spent working the tree had not happened. Everything
   * needed to redraw them was already in hand: the page recorded its own
   * figures throughout, and the node counts are kept outside React for exactly
   * this (`history.ts`).
   *
   * Seeded rather than drawn from the recording directly, because the recording
   * is drained in batches and a chart fed from it steps instead of flowing —
   * see the note on `scrolled` below. With history off there is nothing to seed
   * from, and the charts start empty, which is what off means.
   */
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;

    const fill = (key: string, values: readonly number[]): void => {
      const series = seriesFor(key);
      for (const value of values.slice(-LIVE_CAPACITY)) series.push(value);
    };

    for (const [key, values] of recording.series) fill(key, values);

    /*
     * The node columns are brought up to the recording's length on the way in.
     *
     * They are only written while this tab is mounted, and the recording runs
     * whether it is or not — so after a few minutes on the scene a node column
     * is short by exactly the time spent there. Seeded as they stand, their
     * charts came back shorter than every chart beside them: a line that starts
     * partway across, drawn against a right-hand edge it shares with the
     * others, which reads as the count having restarted and fallen behind.
     *
     * The padding is the rule every chart here already follows for a tick it
     * has no reading for — what stood when the tab left, held across the gap.
     * The column itself is padded on the next tree poll (below); this is the
     * same figure, and the seed cannot wait for it.
     */
    for (const [key, values] of history.nodes) {
      fill(key, carryForward(values, recording.times.length));
    }
  }, [recording.series, recording.times, seriesFor]);

  useEffect(() => {
    if (frame === null) return;

    /*
     * Written to the series and noted as a low or a high, for every chart.
     *
     * Noted here rather than only for the charts the page does not record: with
     * the recording off there is no page-side figure to fall back on, and the
     * two readings a chart is worth having — how bad did it get, how good — were
     * simply absent. They are worth having whether or not anybody asked for
     * history; what history buys is that they survive the samples scrolling
     * away, which `extremesFor` still prefers where it can.
     */
    const note = (key: string, value: number): void => {
      seriesFor(key).push(value);
      noteExtreme(key, value);
    };

    note('fps', frame.fps);
    note('frameMs', frame.frameMs);
    note('renderMs', frame.renderMs);
    note('worstFrameMs', frame.worstFrameMs);
    // Both of these are null where the page has no reading at all — a renderer
    // whose draw path it could not find, a browser with no heap figure. Nothing
    // is written for them, so the chart stays blank and its reading a dash,
    // which is a different statement from a line along the floor.
    if (frame.drawCalls !== null) note('drawCalls', frame.drawCalls);
    if (frame.heapMB !== null) note('heapMB', frame.heapMB);

    for (const [key, value] of latest.current) note(key, value);

    sampled((at) => at + 1);
  }, [frame, seriesFor]);

  /*
   * The node counts as they stood at each tick of a running recording.
   *
   * The page records what it measures itself, and it does not walk the scene —
   * the counts come off the tree payload, which is the panel's (§3.13). So the
   * panel keeps its own column beside the recording, padded up to the
   * recording's length before each new reading: the stretch where this tab was
   * not on screen is filled with what stood when it left, which is the same
   * rule every other chart follows for a tick it has no reading for.
   */

  useEffect(() => {
    if (tree === null) return;

    const upTo = Math.max(0, recording.times.length - 1);
    for (const [key, value] of latest.current) {
      const kept = carryForward(history.nodes.get(key) ?? [], upTo);
      kept.push(value);
      history.nodes.set(key, kept);
    }
  }, [recording.times, tree]);

  const [hiddenList, setHidden] = useLocalStorage<string[]>(HIDDEN_KEY, []);
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);

  const metrics = useMemo(() => allMetrics(seen), [seen]);

  const toggle = useCallback(
    (key: string, shown: boolean) => {
      setHidden(shown ? hiddenList.filter((one) => one !== key) : [...hiddenList, key]);
    },
    [hiddenList, setHidden],
  );

  const showAll = useCallback(
    (shown: boolean) => {
      setHidden(shown ? [] : metrics.map((metric) => metric.key));
    },
    [metrics, setHidden],
  );

  const colors = useChartColors();

  /*
   * How many samples fit across a chart, which is a fact about the panel's
   * width rather than a constant.
   *
   * Measured here rather than in each chart: they are all the same width, and
   * the slice a chart is handed has to be worked out before it is drawn — a
   * chart that measured itself would need a render to find out and another to
   * use the answer.
   */
  const column = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = column.current;
    if (element === null) return;

    const measure = (): void => {
      setWidth(element.clientWidth);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  // The charts carry `px-2` a side; two of anything is the least that can be
  // called a line.
  const visible = Math.max(2, Math.floor((width - 16) / STEP_PX));

  const tickMs = scaleInterval(FRAME_MS, rate);

  /*
   * Where the window sits along a recording, in ticks. Null is pinned to the
   * live edge, which is where it stays until somebody drags it back and where
   * it returns the moment they drag it to the end again.
   *
   * The step never changes: a longer recording is a longer strip to move along,
   * not a denser chart. Squeezing ten minutes into six hundred pixels averages
   * away every stutter worth finding, and does so more the longer it runs.
   */
  const [start, setStart] = useState<number | null>(null);

  const total = recording.times.length;
  const furthest = Math.max(0, total - visible);
  const from = start === null ? furthest : Math.min(start, furthest);
  const scrollable = furthest > 0;

  /**
   * Whether the charts are showing the recording rather than the live feed.
   *
   * Only once the window has actually been moved back. Pinned to the live edge
   * they draw from the live series even while a recording runs, and that is not
   * a shortcut — the recording is drained in batches every half second, so a
   * chart fed from it advanced five samples at a time and stepped rather than
   * moved. The live series is written on every tick, so it flows; the recording
   * is for the part that has scrolled off, which does not move at all.
   */
  const scrolled = scrollable && from < furthest;

  /** Which sample the pointer is over. One index for every chart at once. */
  const [hover, setHover] = useState<number | null>(null);

  /*
   * The wall clock at both ends of what is on screen, and under the pointer.
   *
   * Scrolled back it comes off the recording's own timestamps, which is the
   * only honest source: the panel may not have been running for some of those
   * ticks. At the live edge the recording has not necessarily caught up with
   * the last tick or two, so the right-hand end is simply now and the left is
   * counted back from it at the tick rate.
   */
  const window = useMemo(() => {
    const end = scrolled
      ? recording.startedAt + (recording.times[from + visible - 1] ?? 0)
      : Date.now();
    const begin = scrolled
      ? recording.startedAt + (recording.times[from] ?? 0)
      : end - visible * tickMs;

    return { from: begin, to: end };
    // `revision` is in the list because the timestamps are appended to in place:
    // nothing about `times` changes identity when the recording advances.
  }, [scrolled, from, visible, tickMs, recording.startedAt, recording.times, recording.revision]);

  const hoveredAt =
    hover === null ? null : window.from + (hover / Math.max(visible - 1, 1)) * (window.to - window.from);

  /**
   * The lowest and highest a chart has reached, from whichever sources have an
   * opinion — widened, not chosen between.
   *
   * The page's cover the whole recording and survive its eviction, but exist
   * only while there is a recording; the panel's cover every tick this tab has
   * drawn, and are all there is with the window off. Neither is a superset of
   * the other — the page saw the minutes this tab was closed, the panel saw the
   * ones before the recording was turned on — so the honest answer is the wider
   * of the two.
   */
  const extremesFor = (metric: Metric): { min: number; max: number } | undefined => {
    const mine = history.extremes.get(metric.key);
    const page = metric.recorded === undefined ? undefined : recording.extremes.get(metric.recorded);

    if (mine === undefined) return page;
    if (page === undefined) return mine;

    return { min: Math.min(mine.min, page.min), max: Math.max(mine.max, page.max) };
  };

  const chartFor = (metric: Metric) => {
    const fromPage =
      metric.recorded === undefined ? undefined : recording.series.get(metric.recorded);
    const fromPanel = history.nodes.get(metric.key);

    const values = scrolled
      ? windowOf(fromPage ?? fromPanel ?? [], total, from, visible)
      : seriesFor(metric.key).values().slice(-visible);

    return (
      <Chart
        key={metric.key}
        title={metric.title}
        value={values[values.length - 1] ?? null}
        values={values}
        step={STEP_PX}
        hover={hover}
        onHover={setHover}
        revision={scrolled ? recording.revision : 0}
        {...(extremesFor(metric) === undefined ? {} : { extremes: extremesFor(metric) })}
        ink={colors.group[metric.group]}
        grid={colors.grid}
        {...(metric.floor === undefined ? {} : { floor: metric.floor })}
        {...(metric.format === undefined ? {} : { format: metric.format })}
        {...(metric.unit === undefined ? {} : { unit: metric.unit })}
        {...(metric.aboutKey === undefined ? {} : { about: t(metric.aboutKey) })}
      />
    );
  };

  const shown = metrics.filter(
    (metric) =>
      !hidden.has(metric.key) &&
      // The heap is a Chromium reading. Where the browser has none, the chart is
      // absent rather than flat at zero, which would read as "no memory used".
      (metric.key !== 'heapMB' || (frame !== null && frame.heapMB !== null)),
  );

  return (
    <div className="flex flex-grow flex-col overflow-hidden">
      <div className="border-border flex h-8 max-h-8 shrink-0 items-center gap-2 border-b px-2">
        {/*
          There is no switch any more, only how far back to keep.

          A recording that has to be armed is one that was always off at the
          moment something interesting happened — and the cost of leaving it on
          is a wrapper around `renderer.render` and a few numbers a second. So
          the panel records the whole time it is open, and the only question
          left is the one thing that actually costs anything, which is how much
          of it to hold on to.
        */}
        <Hint text={t('stats.keep.tip')}>
          <span className="text-muted-foreground flex-none text-xs">{t('stats.keep')}</span>
        </Hint>
        <Segmented
          value={String(recording.keepMinutes)}
          options={KEEP_CHOICES.map((minutes) => ({
            value: String(minutes),
            label: minutes === 0 ? 'Off' : `${String(minutes)}m`,
            title:
              minutes === 0
                ? t('stats.keep.off')
                : t.fill('stats.keep.some', { n: minutes }),
          }))}
          onChange={(next) => {
            recording.setKeepMinutes(Number(next));
          }}
          variant="quiet"
          className="flex-none"
        />

        {/*
          Whether the charts are following the game or standing still.

          Said in the bar rather than as a caption in the corner of each chart:
          it is a fact about the whole tab, and a tab whose numbers have stopped
          moving without saying so is a tab that gets believed about the wrong
          moment. The way back is a button, because that is the thing wanted
          next.
        */}
        {scrolled ? (
          <>
            <span className="bg-foreground/10 text-foreground flex-none rounded px-1.5 py-0.5 text-[11px] font-bold">
              Paused
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 flex-none px-1.5 text-[11px]"
              onClick={() => {
                setStart(null);
              }}
            >
              Live
            </Button>
          </>
        ) : (
          recording.dropped > 0 && (
            <Hint text={t('stats.dropped')}>
              <span className="text-muted-foreground min-w-0 truncate text-xs tabular-nums">
                {recording.dropped} missed
              </span>
            </Hint>
          )
        )}

        <span className="ml-auto flex-none">
          <ChartPicker metrics={metrics} hidden={hidden} onToggle={toggle} onAll={showAll} />
        </span>
      </div>

      {/* Only while there is more history than one screenful. A control that is
          there but can do nothing is a control that has to be tried to find
          that out. */}
      {scrollable && (
        <div className="border-border shrink-0 border-b px-2 py-1">
          <Minimap
            values={recording.series.get('fps') ?? EMPTY}
            total={total}
            from={from}
            windowSize={visible}
            onScrub={(next) => {
              // Scrubbed to the end means "follow the recording again", not "sit
              // at this index" — otherwise the window would fall behind the
              // moment the next sample arrived.
              setStart(next >= furthest ? null : Math.max(0, next));
            }}
            ink={colors.group.Rendering}
            grid={colors.grid}
          />
        </div>
      )}

      <div ref={column} className="flex-1 overflow-auto pb-2">
        {frame !== null && shown.length > 0 && (
          <TimeAxis from={window.from} to={window.to} at={hoveredAt} />
        )}
        {frame === null ? (
          <p className="text-muted-foreground p-2 text-xs">Waiting for a rendered frame…</p>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground p-2 text-xs">Every chart is switched off.</p>
        ) : (
          GROUPS.map((group) => {
            const inGroup = shown.filter((metric) => metric.group === group);
            if (inGroup.length === 0) return null;

            return (
              <div key={group}>
                {/* The same band a section header carries elsewhere in the
                    panel, and the same fold. It earns its place at the third
                    one especially: without it the per-type charts ran straight
                    on from the renderer's, and a column of names like `Sprite`
                    and `Text` beneath `Textures on GPU` gave no sign that the
                    subject had changed from the renderer to the scene.

                    Folding a group is not only a way of getting it off the
                    screen: a folded `Memory` stops the texture poll and a
                    folded `Scene nodes` stops the tree poll, the same bargain
                    a collapsed property section already makes. */}
                <CollapsibleSection
                  title={group}
                  defaultCollapsed={folded(group)}
                  className="px-2 text-xs"
                  aside={
                    <span className="text-muted-foreground text-[10px] tabular-nums">
                      {inGroup.length}
                    </span>
                  }
                  onCollapse={(next) => {
                    setCollapsed({ ...collapsed, [group]: next });
                  }}
                >
                  {inGroup.map((metric) => chartFor(metric))}
                </CollapsibleSection>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
