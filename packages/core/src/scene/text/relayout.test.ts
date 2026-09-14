import { describe, expect, it, vi } from 'vitest';

import type { Node } from '../../adapters/types.js';
import { isFittedText, relayoutFittedText } from './relayout.js';

/**
 * A game's own `TextStyle` adds `flexFont` and `wordWrapHeight`, and its
 * setters store the value without marking anything dirty. What fits the text to
 * its box is the class's `outputText`, and nothing calls it on its own.
 */

function fittedText(overrides: Record<string, unknown> = {}) {
  const node = {
    text: 'Level cleared',
    dirty: false,
    style: { update: vi.fn() },
    outputText: vi.fn(),
    ...overrides,
  };

  return node as unknown as Node & typeof node;
}

describe('relayoutFittedText', () => {
  it('measures the text again after a fitting setting is written', () => {
    const node = fittedText();

    expect(relayoutFittedText(node, 'style.flexFont')).toBe(true);
    expect(node.outputText).toHaveBeenCalledWith('Level cleared');
  });

  /** The settings it fits *against* count too, or the fit is left stale. */
  it.each(['text', 'style.wordWrapWidth', 'style.wordWrapHeight'])('answers to %s', (key) => {
    const node = fittedText();

    expect(relayoutFittedText(node, key)).toBe(true);
  });

  it('leaves every other property alone', () => {
    const node = fittedText();

    expect(relayoutFittedText(node, 'style.fontSize')).toBe(false);
    expect(node.outputText).not.toHaveBeenCalled();
  });

  /**
   * `outputText` ends by assigning the same string back, which both PixiJS
   * lines take as no change at all. Without these the picture would keep the
   * size it was drawn at.
   */
  it('says the picture is stale, in both lines’ terms', () => {
    const node = fittedText();

    relayoutFittedText(node, 'style.flexFont');

    expect(node.style.update).toHaveBeenCalled();
    expect(node.dirty).toBe(true);
  });

  /** A plain PixiJS Text has none of this, and needs none of it. */
  it('does nothing to a text that does not fit itself', () => {
    const node = { text: 'Level cleared' } as unknown as Node;

    expect(relayoutFittedText(node, 'style.flexFont')).toBe(false);
  });

  it('does nothing when the node has no text to measure', () => {
    const node = fittedText({ text: undefined });

    expect(relayoutFittedText(node, 'text')).toBe(false);
    expect(node.outputText).not.toHaveBeenCalled();
  });
});

/**
 * The two patched classes do the same job under the same name, but the PixiJS 6
 * one wraps it: its public `outputText` runs the string through the game's
 * localizator and remembers it as the text to localise again later. Calling that
 * from the inspector would quietly rewrite what the game thinks the caption says.
 */
describe('which of the two methods is called', () => {
  it('prefers the protected one, which only measures and fits', () => {
    const protectedOne = vi.fn();
    const node = fittedText({ _outputText: protectedOne });

    relayoutFittedText(node, 'text');

    expect(protectedOne).toHaveBeenCalledWith('Level cleared');
    expect(node.outputText).not.toHaveBeenCalled();
  });

  it('falls back to the public one where there is no other', () => {
    const node = fittedText();

    relayoutFittedText(node, 'text');

    expect(node.outputText).toHaveBeenCalledWith('Level cleared');
  });
});

describe('isFittedText', () => {
  /** The mark both patches share and neither PixiJS line has. */
  it('knows a patched text from one PixiJS built', () => {
    expect(isFittedText(fittedText())).toBe(true);
    expect(isFittedText({ text: 'plain', style: {} })).toBe(false);
  });
});
