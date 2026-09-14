import { beforeEach, describe, expect, it } from 'vitest';

import { noteExtreme, openStatsHistory, statsHistory } from './history.js';

let generation = 0;

beforeEach(() => {
  generation += 1;
  openStatsHistory(generation);
});

describe('noteExtreme', () => {
  it('remembers the first reading as both ends', () => {
    noteExtreme('fps', 60);

    expect(statsHistory().extremes.get('fps')).toEqual({ min: 60, max: 60 });
  });

  it('widens to whatever it is given', () => {
    for (const value of [60, 48, 59, 74]) noteExtreme('fps', value);

    expect(statsHistory().extremes.get('fps')).toEqual({ min: 48, max: 74 });
  });

  /**
   * A zero is almost never a measurement here: frames a second, frame time and
   * draw calls all read nought while the scene is not drawing — at start-up, on
   * a paused game, between screens — and a low of nought is what the chart then
   * reported for ever after. What is worth knowing is how bad it got while it
   * was running.
   */
  it('takes the smallest reading that is not nought as the low', () => {
    for (const value of [0, 60, 0, 48, 0]) noteExtreme('fps', value);

    expect(statsHistory().extremes.get('fps')?.min).toBe(48);
  });

  it('lets a real reading replace a nought that arrived first', () => {
    noteExtreme('fps', 0);
    noteExtreme('fps', 60);

    expect(statsHistory().extremes.get('fps')?.min).toBe(60);
  });

  it('keeps a nought where nothing else ever arrives', () => {
    noteExtreme('type:Sprite', 0);
    noteExtreme('type:Sprite', 0);

    expect(statsHistory().extremes.get('type:Sprite')).toEqual({ min: 0, max: 0 });
  });

  it('still lets a high be nought while the low is one too', () => {
    noteExtreme('type:Spine', 0);

    expect(statsHistory().extremes.get('type:Spine')?.max).toBe(0);
  });
});

describe('openStatsHistory', () => {
  it('throws the last page load away, and only then', () => {
    noteExtreme('fps', 60);
    statsHistory().seen.push('Sprite');

    openStatsHistory(generation);
    expect(statsHistory().extremes.get('fps')).toEqual({ min: 60, max: 60 });
    expect(statsHistory().seen).toEqual(['Sprite']);

    openStatsHistory(generation + 1);
    expect(statsHistory().extremes.size).toBe(0);
    expect(statsHistory().seen).toEqual([]);
  });
});
