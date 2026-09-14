import type { Json } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { SwitchRow, SwitchSettings } from './switchMemory.js';
import { flipSwitch, NO_SWITCH_MEMORY } from './switchMemory.js';

/**
 * The memory behind a group switch, as arithmetic.
 *
 * Tested the way `fillMemory` is: as a series of crossings, because the whole
 * point of a memory is what the second and third crossing do. A single flip
 * proves nothing — the value was still on screen when it was taken.
 */

const rows = (values: Record<string, Json | undefined>): SwitchRow[] =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

const SHADOW = rows({ 'style.dropShadowBlur': 6, 'style.dropShadowDistance': 3 });

/** One crossing: the switch, and what it leaves behind. */
function cross(
  memory: SwitchSettings | null,
  on: boolean,
  settings: SwitchRow[],
): { write: Json; memory: SwitchSettings | null } {
  return flipSwitch(memory, on, settings);
}

describe('switching a group off', () => {
  it('writes false and remembers what the rows held', () => {
    const flipped = cross(NO_SWITCH_MEMORY, true, SHADOW);

    expect(flipped.write).toBe(false);
    expect(flipped.memory).toEqual({
      'style.dropShadowBlur': 6,
      'style.dropShadowDistance': 3,
    });
  });

  /**
   * A tag draws every field of its group, standing the default tag's value in
   * wherever it overrides nothing. Snapshotting those would hand them back as
   * the tag's own: a tag that overrode a stroke's width alone came back
   * overriding its colour and join as well, and the section is supposed to draw
   * only what a tag actually says.
   */
  it('remembers nothing about a row that is only showing what it inherits', () => {
    const flipped = cross(NO_SWITCH_MEMORY, true, [
      { key: 'strokeThickness', value: 4 },
      { key: 'stroke', value: '#ff0000', inherited: true },
      { key: 'lineJoin', value: 'round', inherited: true },
    ]);

    expect(flipped.memory).toEqual({ strokeThickness: 4 });
  });

  /**
   * `null` is the page saying the node does not carry the key, and `undefined` is
   * nothing having been read for it. Writing either back would invent a value
   * rather than restore one.
   */
  it('remembers nothing about a row with no value', () => {
    const flipped = cross(NO_SWITCH_MEMORY, true, rows({ a: null, b: undefined, c: 4 }));

    expect(flipped.memory).toEqual({ c: 4 });
  });

  /** A group with nothing readable must not overwrite what an earlier crossing
   *  did manage to take. */
  it('keeps an older memory rather than replacing it with an empty one', () => {
    const first = cross(NO_SWITCH_MEMORY, true, SHADOW);
    const second = cross(first.memory, true, rows({ a: null }));

    expect(second.memory).toEqual(first.memory);
  });
});

describe('switching a group back on', () => {
  it('writes true when there is nothing remembered', () => {
    expect(cross(NO_SWITCH_MEMORY, false, SHADOW).write).toBe(true);
  });

  it('writes back exactly what was remembered', () => {
    const off = cross(NO_SWITCH_MEMORY, true, SHADOW);
    const on = cross(off.memory, false, []);

    expect(on.write).toEqual({
      'style.dropShadowBlur': 6,
      'style.dropShadowDistance': 3,
    });
  });

  /** A snapshot of a side, not a message in transit: it is used, not consumed. */
  it('keeps the memory, so a second round trip restores again', () => {
    const off = cross(NO_SWITCH_MEMORY, true, SHADOW);
    const first = cross(off.memory, false, []);
    const second = cross(first.memory, false, []);

    expect(second.write).toEqual(first.write);
  });
});

/**
 * The snapshot is taken at the moment of the switch rather than kept up to date,
 * and this is what that buys: an edit made between two crossings is what comes
 * back the next time round.
 */
describe('across several crossings', () => {
  it('brings back the values as they were last left', () => {
    const off = cross(NO_SWITCH_MEMORY, true, SHADOW);
    const on = cross(off.memory, false, []);

    // Back on, and the blur is turned up — the page now reads 20 where it read 6.
    const edited = rows({ 'style.dropShadowBlur': 20, 'style.dropShadowDistance': 3 });

    const offAgain = cross(on.memory, true, edited);
    const onAgain = cross(offAgain.memory, false, []);

    expect(onAgain.write).toEqual({
      'style.dropShadowBlur': 20,
      'style.dropShadowDistance': 3,
    });
  });
});
