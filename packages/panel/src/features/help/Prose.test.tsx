// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Prose } from './Prose.js';

/**
 * The four marks the document is written with, and what happens to a fifth.
 *
 * Worth its own file because `Prose` is the one piece of the help that the
 * panel borrows: the screens with no scene on them draw their message through
 * it, so a mark that stopped working would go wrong in two places at once.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe('Prose', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const show = (text: string): void => {
    act(() => {
      root.render(<Prose text={text} />);
    });
  };

  it('quotes the panel in a code span', () => {
    show('Set `Poll rate` to `Min`.');

    expect([...container.querySelectorAll('code')].map((el) => el.textContent)).toEqual([
      'Poll rate',
      'Min',
    ]);
  });

  it('emphasises what is written between stars', () => {
    show('It is stored as a **path**.');

    expect(container.querySelector('strong')?.textContent).toBe('path');
  });

  it('draws a glyph where a token names one', () => {
    show('{{eye}} toggles `visible`.');

    expect(container.querySelector('svg')).not.toBeNull();
  });

  /**
   * The failure that used to be invisible: a token naming no glyph rendered an
   * empty `<strong>`, so a typo left a hole in the sentence rather than a typo
   * in it. Nothing on the page said so, and nothing could be reported.
   */
  it('writes a token it has no glyph for out as it stands', () => {
    show('{{eyes}} toggles it.');

    expect(container.textContent).toBe('{{eyes}} toggles it.');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('links inside the page without sending the reader out of it', () => {
    show('See [what it costs](#cost).');

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('#cost');
    expect(link?.getAttribute('target')).toBeNull();
  });

  it('opens an outside link in a tab of its own', () => {
    show('[the tracker](https://github.com/dok-studio/pixi-scene-inspector)');

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/dok-studio/pixi-scene-inspector');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noreferrer');
  });

  /** Only the two shapes the document uses are a link; the rest is text. */
  it('leaves an address it does not recognise as the characters it is written with', () => {
    show('[a page](javascript:alert(1))');

    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('[a page](javascript:alert(1))');
  });
});
