import { describe, expect, it } from 'vitest';

import { hueOf, tintOf } from './groupTint.js';

/**
 * The colour of a group's heading, as arithmetic.
 *
 * What is worth holding still is not the colours themselves — they are a hash and
 * may be any hue — but the two properties that make them useful: the same name is
 * always the same colour, and the groups a text style actually has are far enough
 * apart to be told from one another.
 */

/** The five a Text declares, plus the one a tag collects unknown keys under. */
const GROUPS = ['Font', 'Fill', 'Stroke', 'Shadow', 'Layout', 'Other'];

describe('hueOf', () => {
  it('answers the same hue for the same name', () => {
    expect(hueOf('Stroke')).toBe(hueOf('Stroke'));
  });

  it('stays on the wheel', () => {
    for (const name of GROUPS) {
      expect(hueOf(name)).toBeGreaterThanOrEqual(0);
      expect(hueOf(name)).toBeLessThan(360);
    }
  });

  it('gives every group of a text style a hue of its own', () => {
    const hues = GROUPS.map(hueOf);

    expect(new Set(hues).size).toBe(GROUPS.length);
  });

  /**
   * The reason the short palette was abandoned: twelve slots put `Stroke` and
   * `Shadow` on one colour, and those two are read one above the other more often
   * than any other pair here.
   */
  it('keeps them far enough apart to be told apart', () => {
    const sorted = [...GROUPS.map(hueOf)].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((hue, index) => hue - (sorted[index] ?? 0));

    expect(Math.min(...gaps)).toBeGreaterThan(15);
  });
});

describe('tintOf', () => {
  /** The theme's own band is what is being tinted, so it has to be in there. */
  it('mixes the hue into the band the theme gives', () => {
    const tint = tintOf('Stroke') ?? '';

    expect(tint).toContain('hsl(var(--muted))');
    expect(tint).toContain(String(hueOf('Stroke')));
  });

  /** Lightness has to survive the mixing, or a dark theme grows blocks of colour. */
  it('mixes in a perceptual space', () => {
    expect(tintOf('Fill')).toContain('in oklab');
  });

  /**
   * Equal colourfulness per hue, or one group's band shouts while another
   * whispers — which is what `hsl` did, and the reason the tint is stated in
   * `oklch` at a fixed chroma.
   */
  it('states every hue at the same lightness and chroma', () => {
    const stated = GROUPS.map((name) => {
      const found = /oklch\(([^)]+)\)/.exec(tintOf(name) ?? '');
      const parts = (found?.[1] ?? '').split(' ');

      // Everything but the hue: the lightness and the chroma.
      return parts.slice(0, 2).join(' ');
    });

    expect(stated[0]).not.toBe('');
    expect(new Set(stated).size).toBe(1);
  });

  it('paints nothing where there is no heading to paint', () => {
    expect(tintOf(undefined)).toBeUndefined();
  });

  /** A faint band, not a state. A strip that shouts means something is wrong. */
  it('lets only a little of the hue through', () => {
    // The share the tint itself takes, which is the last percentage in the mix.
    const share = Number(/(\d+)%\)$/.exec(tintOf('Stroke') ?? '')?.[1]);

    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(35);
  });
});

/**
 * The hash deals a hue; a name may be given one instead.
 *
 * The list is allowed to be empty and is fallen through, which is what makes it
 * unlike the list of names this module argues against: nothing breaks when a name
 * is absent from it, and a group renamed in the schema quietly goes back to being
 * dealt a hue.
 */
describe('a name that was given a hue', () => {
  /** Rearranged by eye: the blue suits a fill, the green suits a layout. */
  it('keeps the one it was given', () => {
    expect(hueOf('Fill')).toBe(237);
    expect(hueOf('Stroke')).toBe(20);
    expect(hueOf('Layout')).toBe(168);
  });

  it('leaves the ones nobody had an opinion about to the hash', () => {
    expect(hueOf('Font')).toBe(304);
    expect(hueOf('Shadow')).toBe(81);
  });

  /**
   * The separation the hash gave for free has to survive being chosen by hand,
   * which is the one thing a person rearranging colours can quietly break.
   */
  it('still sits clear of every other group', () => {
    for (const name of ['Fill', 'Stroke', 'Layout']) {
      for (const other of GROUPS.filter((candidate) => candidate !== name)) {
        const apart = Math.abs(hueOf(name) - hueOf(other));

        expect(Math.min(apart, 360 - apart)).toBeGreaterThan(15);
      }
    }
  });
});
