import type { GradientFill, Json } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { FillMemory } from './fillMemory.js';
import { NO_FILL_MEMORY, swapKind } from './fillMemory.js';

/**
 * Crossing between a colour and a gradient, and what is kept on the far side.
 *
 * The point of the switch is to compare two looks of the same text, so the trip
 * has to be survivable in both directions. Here it is checked as arithmetic:
 * where the memory lives — and therefore when it ends — is `FillKind`'s business.
 */

const ramp = (from: string, to: string): GradientFill => ({
  kind: 'gradient',
  direction: 'vertical',
  stops: [
    { color: from, offset: 0 },
    { color: to, offset: 1 },
  ],
});

/** One crossing after another, the way clicking the control does it. */
function cross(start: Json, times: number): Json[] {
  let memory: FillMemory = NO_FILL_MEMORY;
  let value = start;
  const seen: Json[] = [];

  for (let i = 0; i < times; i += 1) {
    const swapped = swapKind(memory, value);
    memory = swapped.memory;
    value = swapped.write;
    seen.push(value);
  }

  return seen;
}

describe('swapKind', () => {
  describe('with nothing remembered yet', () => {
    it('builds a ramp of the colour it is leaving', () => {
      expect(swapKind(NO_FILL_MEMORY, '#ff0000').write).toEqual(ramp('#ff0000', '#ff0000'));
    });

    it('takes the first stop of the ramp it is leaving', () => {
      expect(swapKind(NO_FILL_MEMORY, ramp('#0000ff', '#00ff00')).write).toBe('#0000ff');
    });

    /** Nothing to build from either: a fill has to be something. */
    it('falls back to white where there is no colour at all', () => {
      expect(swapKind(NO_FILL_MEMORY, null).write).toEqual(ramp('#ffffff', '#ffffff'));
    });
  });

  /**
   * The whole reason for the memory: a colour set, a gradient made, and then the
   * two compared by going back and forth. Without it the first return gives the
   * ramp's first colour instead of the colour that was set, and the next gives a
   * ramp of that — so by the second crossing both sides are gone.
   */
  it('gives each kind back as it was left', () => {
    let memory: FillMemory = NO_FILL_MEMORY;

    // Red, then across to a gradient and aimed at blue → green.
    const toGradient = swapKind(memory, '#ff0000');
    memory = toGradient.memory;
    const aimed = ramp('#0000ff', '#00ff00');

    const back = swapKind(memory, aimed);
    memory = back.memory;
    expect(back.write).toBe('#ff0000');

    const again = swapKind(memory, back.write);
    memory = again.memory;
    expect(again.write).toEqual(aimed);

    // And once more, to show it is a memory rather than a single undo.
    expect(swapKind(memory, again.write).write).toBe('#ff0000');
  });

  /**
   * The snapshot is taken as the switch happens, not kept up to date — which is
   * exactly what makes an edit in between count. A colour changed after coming
   * back to it is the colour that goes across next time.
   */
  it('remembers what it is leaving, not what it once left', () => {
    let memory: FillMemory = NO_FILL_MEMORY;

    const toGradient = swapKind(memory, '#ff0000');
    memory = toGradient.memory;

    const toSolid = swapKind(memory, ramp('#0000ff', '#00ff00'));
    memory = toSolid.memory;
    expect(toSolid.write).toBe('#ff0000');

    // The user edits the colour before crossing again.
    const afterEdit = swapKind(memory, '#ffff00');
    memory = afterEdit.memory;

    expect(swapKind(memory, afterEdit.write).write).toBe('#ffff00');
  });

  /** Crossing repeatedly settles into the two values rather than drifting. */
  it('does not wander when crossed over and over', () => {
    const seen = cross('#ff0000', 5);

    expect(seen[0]).toEqual(ramp('#ff0000', '#ff0000'));
    expect(seen[1]).toBe('#ff0000');
    expect(seen[2]).toEqual(ramp('#ff0000', '#ff0000'));
    expect(seen[3]).toBe('#ff0000');
    expect(seen[4]).toEqual(ramp('#ff0000', '#ff0000'));
  });
});
