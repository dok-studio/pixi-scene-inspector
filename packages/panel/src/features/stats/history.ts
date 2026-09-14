/**
 * What the Stats tab remembers between being closed and opened again.
 *
 * Outside React, deliberately, and for the reason the Spine setups are
 * (`scene/graph/properties/spine/setups.ts`): the navbar mounts one tab at a
 * time, so everything the tab held in a ref went with it the moment somebody
 * looked at the scene — and the charts started from an empty screen on the way
 * back, as if the last five minutes had not happened.
 *
 * **Nothing here outlives the page it is about.** It is memory for the session
 * and only that: no storage, no restoring. A reload is a different application
 * with different numbers, and carrying anything across would be carrying a lie.
 *
 * Only what cannot be fetched again lives here. The figures the page records
 * are the page's, and the charts are re-seeded from those on the way back in;
 * what this holds is the two things nothing else can answer for — which node
 * types the scene has shown, and what their counts were, because the page does
 * not walk the scene and only this tab was ever asking.
 */

export interface Range {
  min: number;
  max: number;
}

interface History {
  /** Node types the scene has shown, in the order they are drawn. */
  seen: string[];
  /** Chart key to its readings along the recording's timeline. */
  nodes: Map<string, number[]>;
  /** Chart key to its lowest and highest, over the whole time the tab has run. */
  extremes: Map<string, Range>;
}

function empty(): History {
  return { seen: [], nodes: new Map(), extremes: new Map() };
}

let history = empty();
let of = -1;

/**
 * The store for this page load, thrown away if the last one was another.
 *
 * Keyed rather than cleared from outside, and that is the point: the tab reads
 * this while it renders, and a clear that lived in an effect somewhere else ran
 * **after** — React runs a child's effects before its parent's, so the first
 * render after a reload had already copied the previous page's node types into
 * state and seeded its charts from the previous page's numbers. Asking for the
 * store by generation cannot be got in the wrong order.
 */
export function openStatsHistory(generation: number): History {
  if (generation !== of) {
    history = empty();
    of = generation;
  }

  return history;
}

export function statsHistory(): History {
  return history;
}

/**
 * Widens a chart's remembered range, or starts one.
 *
 * **The low takes the smallest reading that is not nought.** A zero here is
 * almost never a measurement: frames a second, frame time and draw calls all
 * read nought while the scene is not drawing — at start-up, on a paused game,
 * between screens — and a low of nought is what every one of those charts
 * reported for ever after, which answers nothing. What is worth knowing is how
 * bad it got *while it was running*. A zero still stands where nothing else
 * ever arrives, so a chart that is honestly always nought says so.
 *
 * The page keeps its own by the same rule (`stats/record.ts`), and has to: the
 * two are merged, so a nought from either side would win.
 */
export function noteExtreme(key: string, value: number): void {
  const seen = history.extremes.get(key);
  if (seen === undefined) {
    history.extremes.set(key, { min: value, max: value });
    return;
  }

  const min = value === 0 ? seen.min : seen.min === 0 ? value : Math.min(seen.min, value);

  history.extremes.set(key, { min, max: Math.max(seen.max, value) });
}
