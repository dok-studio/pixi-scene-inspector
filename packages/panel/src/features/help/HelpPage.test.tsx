// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { en } from '../../i18n/en.js';
import { resetLanguage, setLanguage } from '../settings/language.js';
import { HelpPage } from './HelpPage.js';
import { en as english } from './content/en.js';
import { uk as ukrainian } from './content/uk.js';

/**
 * The page is a document, so most of it is words a test has no opinion about.
 * What is worth holding down is the part that is *not* words: that it follows
 * the panel's language, that the two generated blocks really are generated
 * rather than copied, and that the whole document is on the page rather than a
 * section quietly dropping out of the loop.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe('HelpPage', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    resetLanguage();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetLanguage();
  });

  const show = (version?: string): void => {
    act(() => {
      root.render(<HelpPage extensionVersion={version} />);
    });
  };

  it('draws every section, with a table of contents that reaches them', () => {
    show();

    for (const id of Object.keys(english.sections)) {
      expect(container.querySelector(`section#${id}`), id).not.toBeNull();
      expect(container.querySelector(`a[href="#${id}"]`), `link to ${id}`).not.toBeNull();
    }
  });

  it('speaks whatever language the panel is in', () => {
    show();
    expect(container.textContent).toContain(english.sections.worthKnowing.title);

    act(() => {
      setLanguage('uk');
    });
    expect(container.textContent).toContain(ukrainian.sections.worthKnowing.title);
    expect(container.textContent).not.toContain(english.sections.worthKnowing.title);
  });

  /**
   * The chart table is built from `metrics.ts` and the `stats.about.*`
   * dictionary rather than written into the document. If that ever quietly
   * became a copy, this is what would say so.
   */
  it('explains the charts in the panel’s own words', () => {
    show();

    const text = container.textContent ?? '';
    expect(text).toContain('Worst frame');
    expect(text).toContain(en['stats.about.worstFrameMs']);
  });

  /** Same for the keys: the reader's own binding, not the default it replaced. */
  it('prints the key bindings as they are bound now', () => {
    show();
    expect(container.textContent).toContain('Alt+S');
  });

  it('shows the extension version when it is given one', () => {
    show('1.2.3');
    expect(container.textContent).toContain('1.2.3');
  });

  /**
   * The panel opens this page at a heading as well as at a section, so every
   * heading the document writes down has to actually be on the page under that
   * name. A heading with no id is a link from the panel that lands at the top
   * and says nothing about having missed.
   */
  it('gives every heading the address the document says it has', () => {
    show();

    for (const [id, section] of Object.entries(english.sections)) {
      for (const block of section.blocks) {
        if (block.kind !== 'h') continue;

        expect(container.querySelector(`h3#${block.id}`), `${id} → #${block.id}`).not.toBeNull();
      }
    }
  });

  /** The sentences that point at another section have to land in this one. */
  it('draws an internal link as a link to somewhere on the page', () => {
    show();

    const link = container.querySelector('a[href="#cost"]');
    expect(link).not.toBeNull();
    expect(container.querySelector('section#cost')).not.toBeNull();
  });
});
