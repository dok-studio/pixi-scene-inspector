import { useEffect, useState } from 'react';

import { GROUPS, type Group } from './metrics.js';

/**
 * The colours the charts are drawn in.
 *
 * Everything else in this panel is drawn by the browser and takes its colour
 * from a CSS variable without anybody reading one. A canvas cannot: it wants a
 * string. So the tokens are read once and re-read when the root element says
 * they have changed — the panel switches the light/dark class at runtime, and a
 * chart that kept its old ink would be the one thing on screen still wearing
 * the previous theme.
 *
 * **One colour per group, and none of them the accent.** The accent means "this
 * is a control, and it is on"; twenty charts wearing it made the tab read as a
 * screen of switches, and it also meant the charts changed colour when somebody
 * picked a different accent for reasons that had nothing to do with them. What
 * the colour says now is which group a chart is in — see `globals.css`.
 *
 * Read once for the whole tab rather than once per chart: twenty charts each
 * running their own `getComputedStyle` and their own observer is twenty layout
 * reads to answer one question.
 *
 * A `MutationObserver` rather than a poll, because the change is an attribute
 * write and there is nothing to poll for in between.
 */

export interface ChartInk {
  /** The plotted line. */
  line: string;
  /** The same colour, laid under it. */
  fill: string;
}

export interface ChartColors {
  grid: string;
  group: Record<Group, ChartInk>;
}

const TOKENS: Record<Group, string> = {
  Rendering: '--chart-rendering',
  Memory: '--chart-memory',
  'Scene nodes': '--chart-nodes',
};

const FALLBACK: Record<Group, string> = {
  Rendering: '190 75% 38%',
  Memory: '265 55% 52%',
  'Scene nodes': '28 85% 42%',
};

function read(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const of = (group: Group): string =>
    style.getPropertyValue(TOKENS[group]).trim() || FALLBACK[group];

  const group = {} as Record<Group, ChartInk>;
  for (const name of GROUPS) {
    const hsl = of(name);
    group[name] = {
      line: `hsl(${hsl})`,
      // Enough to read as a body under the line, little enough that the grid
      // still shows through it.
      fill: `hsl(${hsl} / 0.18)`,
    };
  }

  return { grid: `hsl(${style.getPropertyValue('--border').trim() || '240 6% 83%'})`, group };
}

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(read);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setColors(read());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-accent'],
    });

    // The theme may already have been applied between the first render and
    // this effect — Shell writes the root's attributes in an effect of its own.
    setColors(read());

    return () => {
      observer.disconnect();
    };
  }, []);

  return colors;
}
