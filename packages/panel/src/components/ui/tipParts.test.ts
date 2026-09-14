import { describe, expect, it } from 'vitest';

import { tipParts } from './tipParts.js';

/**
 * The one thing in a tip that is not prose, and the one rule translation can
 * break without anybody noticing.
 */

describe('tipParts', () => {
  it('leaves a tip with no clause as one piece of prose', () => {
    expect(tipParts('Reload the inspector')).toEqual([
      { kind: 'text', text: 'Reload the inspector' },
    ]);
  });

  it('splits a clause into the verb and the combination', () => {
    expect(tipParts('Draw the box. [[Toggle Alt+W]]')).toEqual([
      { kind: 'text', text: 'Draw the box. ' },
      { kind: 'hotkey', verb: 'Toggle', combo: 'Alt+W' },
    ]);
  });

  /**
   * The parser works on UTF-16 offsets, so Cyrillic is no different from Latin
   * — and this is the test that fails the day somebody writes a verb of two
   * words instead of one.
   */
  it('reads a Ukrainian clause the same way', () => {
    expect(tipParts('Малює рамку. [[Натисніть Alt+W]]')).toEqual([
      { kind: 'text', text: 'Малює рамку. ' },
      { kind: 'hotkey', verb: 'Натисніть', combo: 'Alt+W' },
    ]);
  });

  it('keeps prose that follows a clause', () => {
    expect(tipParts('[[Cycle Alt+A]] and then some')).toEqual([
      { kind: 'hotkey', verb: 'Cycle', combo: 'Alt+A' },
      { kind: 'text', text: ' and then some' },
    ]);
  });

  it('reads more than one clause', () => {
    expect(tipParts('[[Toggle Alt+A]][[Cycle Alt+B]]')).toEqual([
      { kind: 'hotkey', verb: 'Toggle', combo: 'Alt+A' },
      { kind: 'hotkey', verb: 'Cycle', combo: 'Alt+B' },
    ]);
  });
});
