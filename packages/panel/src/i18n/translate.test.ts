import { describe, expect, it } from 'vitest';

import { fill, translator } from './translate.js';

/**
 * Interpolation, which is the whole of the runtime here — there is no plural
 * machinery, because nothing translated in this panel counts a noun (§3.14).
 *
 * What is worth holding still is what happens when a template and its values
 * disagree, because that is the case nobody writes a screen for.
 */

describe('fill', () => {
  it('puts a value where the slot is', () => {
    expect(fill('Delete “{name}”?', { name: 'hero' })).toBe('Delete “hero”?');
  });

  it('fills the same slot everywhere it appears', () => {
    expect(fill('{a} then {a}', { a: 'x' })).toBe('x then x');
  });

  it('fills several slots, in whatever order the sentence wants them', () => {
    expect(fill('{b} before {a}', { a: 'one', b: 'two' })).toBe('two before one');
  });

  it('leaves a slot it was given nothing for', () => {
    // Visible `{name}` is a bug somebody reports. A gap is a mystery nobody
    // can describe.
    expect(fill('Delete “{name}”?', {})).toBe('Delete “{name}”?');
  });

  it('does not expand what it just substituted', () => {
    // A node really called `{name}` must not reach back into the template.
    expect(fill('{a}', { a: '{a}' })).toBe('{a}');
    expect(fill('{a} and {b}', { a: '{b}', b: 'two' })).toBe('{b} and two');
  });

  it('takes numbers as well as strings', () => {
    expect(fill('{n} left', { n: 3 })).toBe('3 left');
  });
});

describe('translator', () => {
  it('answers in the language it was asked for', () => {
    expect(translator('en')('settings.language')).toBe('Language');
    expect(translator('uk')('settings.language')).toBe('Мова');
  });

  /**
   * The dependency contract: `t` goes into `useMemo` lists all over the panel,
   * so its identity has to change when the language does and never otherwise.
   */
  it('is the same object every time it is asked for one language', () => {
    expect(translator('uk')).toBe(translator('uk'));
    expect(translator('uk')).not.toBe(translator('en'));
  });

  it('fills a slot in whichever language it holds', () => {
    expect(translator('uk').fill('settings.language', {})).toBe('Мова');
  });
});
