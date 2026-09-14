import { describe, expect, it } from 'vitest';

import { TYPE_FILTERS, shownBy, toggled, toneOf } from './filters.js';

describe('shownBy', () => {
  /**
   * Nothing pressed is the state the window opens in, and it has to mean
   * "everything" — a filter row that starts by hiding the list is one nobody
   * would press anything on.
   */
  it('shows every kind while nothing is pressed', () => {
    for (const type of ['Container', 'Sprite', 'Graphics', 'Spine', 'Text', 'Unknown']) {
      expect(shownBy([], type)).toBe(true);
    }
  });

  it('shows only the kinds that are pressed', () => {
    expect(shownBy(['sprite'], 'Sprite')).toBe(true);
    expect(shownBy(['sprite'], 'Container')).toBe(false);
  });

  it('takes more than one at a time', () => {
    expect(shownBy(['sprite', 'spine'], 'Spine')).toBe(true);
    expect(shownBy(['sprite', 'spine'], 'Text')).toBe(false);
  });

  /** A patched text and a plain one are the same thing to whoever is looking. */
  it('covers both spellings of a text under one button', () => {
    expect(shownBy(['text'], 'Text')).toBe(true);
    expect(shownBy(['text'], 'MultiStyleText')).toBe(true);
  });

  /** A kind with no button of its own is what pressing nothing is for. */
  it('hides a kind nothing names while any filter is pressed', () => {
    expect(shownBy(['container'], 'Mesh')).toBe(false);
    expect(shownBy([], 'Mesh')).toBe(true);
  });

  /** Storage is editable, and a key that no longer names anything is not a crash. */
  it('ignores a stored key that names no filter', () => {
    expect(shownBy(['gone'], 'Sprite')).toBe(false);
    expect(shownBy(['gone', 'sprite'], 'Sprite')).toBe(true);
  });
});

describe('toggled', () => {
  it('adds a key that is off and removes one that is on', () => {
    expect(toggled([], 'sprite')).toEqual(['sprite']);
    expect(toggled(['sprite', 'text'], 'sprite')).toEqual(['text']);
  });
});

describe('TYPE_FILTERS', () => {
  it('names the five kinds worth a button, and no others', () => {
    expect(TYPE_FILTERS.map((filter) => filter.label)).toEqual([
      'Container',
      'Sprite',
      'Graphics',
      'Spine',
      'Text',
    ]);
  });

  /**
   * The colouring is only worth anything if no two kinds wear the same one —
   * and if none of them is the panel's own primary, which is what a selected
   * row is washed in.
   */
  it('gives every kind a colour of its own', () => {
    const tones = TYPE_FILTERS.map((filter) => filter.tone);

    expect(new Set(tones).size).toBe(tones.length);
    expect(tones).not.toContain('text-primary');
  });

  it('wears the same colour on the button as in the brackets', () => {
    for (const filter of TYPE_FILTERS) {
      expect(filter.chip).toContain(filter.tone);
    }
  });
});

describe('toneOf', () => {
  it('answers with the colour of the kind that names the type', () => {
    expect(toneOf('Sprite')).toBe('text-emerald-500');
    expect(toneOf('Graphics')).toBe('text-rose-400');
  });

  /** Both spellings of a text share the button, so they share the colour. */
  it('spells a patched text the same as a plain one', () => {
    expect(toneOf('MultiStyleText')).toBe(toneOf('Text'));
  });

  /** Null, not a grey: what a row does with "no colour" is the row's business. */
  it('answers with nothing for a kind no button names', () => {
    expect(toneOf('Mesh')).toBeNull();
  });
});
