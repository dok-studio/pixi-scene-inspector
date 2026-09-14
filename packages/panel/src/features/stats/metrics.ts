import type { MessageKey } from '../../i18n/index.js';

/**
 * Which charts the tab has, and what each one is called.
 *
 * A list rather than markup because two things read it: the tab that draws the
 * charts, and the popover that chooses which of them to draw. A second list
 * would be a second place to forget a metric.
 *
 * The groups are the panel's answer to "where do the scene's own numbers
 * start": rendering and memory are measured off the renderer and hold whatever
 * the game is doing to it, while the node counts are a census of the tree and
 * are read for entirely different reasons.
 */

export const GROUPS = ['Rendering', 'Memory', 'Scene nodes'] as const;

export type Group = (typeof GROUPS)[number];

export interface Metric {
  key: string;
  title: string;
  group: Group;
  unit?: string;
  /** The lowest the chart's ceiling may fall to. 60 for frames a second. */
  floor?: number;
  format?: (value: number) => string;
  /**
   * What the chart is, where its name does not say. Shown as a hint on the
   * title.
   *
   * A key rather than the prose, because this table is module scope: a
   * translated string here would be resolved once, at import, under whichever
   * language was on then (§3.14). The per-type charts have none — their title
   * is a PixiJS class name and there is nothing to explain about it.
   */
  aboutKey?: MessageKey;
  /** Which field of a recording carries it, where one does. */
  recorded?: string;
  /**
   * Read once a second rather than ten times, so a tick without a fresh value
   * repeats the last one — see `align.ts`. Every chart still shares one clock.
   */
  slow?: boolean;
}

export const oneDecimal = (value: number): string => value.toFixed(1);
export const whole = (value: number): string => String(Math.round(value));

/** The fixed charts. The per-type ones are worked out from the scene. */
export const METRICS: Metric[] = [
  {
    key: 'fps',
    aboutKey: 'stats.about.fps',
    title: 'FPS',
    group: 'Rendering',
    floor: 60,
    format: oneDecimal,
    recorded: 'fps',
  },
  {
    key: 'frameMs',
    aboutKey: 'stats.about.frameMs',
    title: 'Frame time',
    group: 'Rendering',
    unit: 'ms',
    format: oneDecimal,
    recorded: 'frameMs',
  },
  {
    key: 'renderMs',
    aboutKey: 'stats.about.renderMs',
    title: 'Render time',
    group: 'Rendering',
    unit: 'ms',
    format: oneDecimal,
    recorded: 'renderMs',
  },
  {
    key: 'worstFrameMs',
    aboutKey: 'stats.about.worstFrameMs',
    title: 'Worst frame',
    group: 'Rendering',
    unit: 'ms',
    format: oneDecimal,
    recorded: 'worstFrameMs',
  },
  {
    key: 'filters',
    aboutKey: 'stats.about.filters',
    title: 'Filters',
    group: 'Rendering',
    format: whole,
    slow: true,
  },
  {
    key: 'masks',
    aboutKey: 'stats.about.masks',
    title: 'Masks',
    group: 'Rendering',
    format: whole,
    slow: true,
  },
  {
    key: 'drawCalls',
    aboutKey: 'stats.about.drawCalls',
    title: 'Draw calls',
    group: 'Rendering',
    format: whole,
    recorded: 'drawCalls',
  },
  {
    key: 'heapMB',
    aboutKey: 'stats.about.heapMB',
    title: 'JS memory',
    group: 'Memory',
    unit: 'MB',
    format: oneDecimal,
    recorded: 'heapMB',
  },
  {
    key: 'gpuMB',
    aboutKey: 'stats.about.gpuMB',
    title: 'GPU memory',
    group: 'Memory',
    unit: 'MB',
    format: oneDecimal,
    recorded: 'gpuMB',
    slow: true,
  },
  {
    key: 'textures',
    aboutKey: 'stats.about.textures',
    title: 'Total textures',
    group: 'Memory',
    format: whole,
    recorded: 'textures',
    slow: true,
  },
  {
    key: 'texturesOnGpu',
    aboutKey: 'stats.about.texturesOnGpu',
    title: 'Textures on GPU',
    group: 'Memory',
    format: whole,
    recorded: 'texturesOnGpu',
    slow: true,
  },
  {
    key: 'nodes',
    aboutKey: 'stats.about.nodes',
    title: 'Total nodes',
    group: 'Scene nodes',
    format: whole,
    slow: true,
  },
];

/** The key a node type's chart is filed under. */
export const typeKey = (type: string): string => `type:${type}`;

/** A chart for one node type, built from a type the scene has shown. */
export function metricForType(type: string): Metric {
  return {
    key: typeKey(type),
    title: type,
    group: 'Scene nodes',
    format: whole,
    slow: true,
  };
}

/**
 * Every chart the tab could draw right now, fixed ones first.
 *
 * @param types node types the scene has shown, already in the order they
 * should appear.
 */
export function allMetrics(types: readonly string[]): Metric[] {
  return [...METRICS, ...types.map(metricForType)];
}
