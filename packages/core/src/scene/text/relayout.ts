import type { Node } from '../../adapters/types.js';

/**
 * Laying a patched text out again after one of its fitting settings is written.
 *
 * `flexFont` and `wordWrapHeight` belong to a game's own `TextStyle`, and they
 * are plain setters: they store the value and mark nothing dirty. The work is
 * done by the class's `outputText`, which measures the text against the wrap
 * box and picks a font size offset to fit it. Nothing calls that on its own,
 * so a field written from the panel would sit in the style with the caption on
 * screen unchanged until the game happened to lay it out again.
 *
 * The same holds for the two settings it fits *against* — the text itself and
 * the wrap width — which is why all four keys are here. The previous project
 * did the same thing in its `setProperty`, and then nudged `resolution` by a
 * ten-thousandth and back after a timeout to force the picture to regenerate.
 * That part is not carried over: it raced with itself, and there are two honest
 * ways to say "this is stale" — `style.update()` on PixiJS 8, where the texture
 * is cached by the style's own tick, and `dirty` on the older lines.
 *
 * Everything here is duck-typed and optional: a plain PixiJS `Text` has no
 * `outputText`, so nothing happens and nothing needs to know why. That absence
 * is also what tells the two apart everywhere else — see `isFittedText`.
 */

/** Writing one of these is what makes a fitted text need measuring again. */
const FITTING_KEYS = new Set([
  'text',
  'style.flexFont',
  'style.wordWrapWidth',
  'style.wordWrapHeight',
]);

interface FittedText {
  text?: unknown;
  outputText?: (text: string) => void;
  /**
   * The same work without the trimmings, on the PixiJS 6 patch. There the public
   * method runs the string through the game's localizator and remembers it as the
   * text to re-localise later, so calling it from here would quietly rewrite what
   * the game thinks the caption says. This one only measures and fits.
   */
  _outputText?: (text: string) => void;
  dirty?: boolean;
  style?: { update?: () => void };
}

/**
 * Whether this is a text the game patched rather than one PixiJS built.
 *
 * The mark is `outputText`: both patches have it, neither PixiJS line does. It
 * matters beyond re-laying out — the settings those classes add are only worth
 * offering on a node that has them (`properties/values.ts`), and offering
 * `flexFont` on a plain `Text` would be inventing a property.
 */
export function isFittedText(node: Node): boolean {
  return typeof (node as FittedText).outputText === 'function';
}

/**
 * @returns whether anything was done, so the caller knows to ask for a frame.
 */
export function relayoutFittedText(node: Node, key: string): boolean {
  if (!FITTING_KEYS.has(key)) return false;

  const text = node as FittedText;
  if (!isFittedText(node) || typeof text.text !== 'string') return false;

  // The protected one wins where there is one: see `_outputText` above.
  const layout = typeof text._outputText === 'function' ? text._outputText : text.outputText;
  layout?.call(text, text.text);

  // `outputText` ends by assigning the same string back, and both PixiJS lines
  // treat that as no change at all — so the picture would keep the size it was
  // drawn at. These are the two ways to say otherwise.
  text.style?.update?.();
  if (typeof text.dirty === 'boolean') text.dirty = true;

  return true;
}
