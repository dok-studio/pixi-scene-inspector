// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  currentLanguage,
  DEFAULT_LANGUAGE,
  resetLanguage,
  setLanguage,
  useLanguage,
} from './language.js';

/**
 * Which language the panel speaks.
 *
 * Two things are worth holding still. The reading from storage, because the
 * tag ends up indexing both dictionaries and it comes out of `localStorage`,
 * which is editable. And the default, because every component test in this
 * package asserts on literal English text and not one of them says so out
 * loud — this is where that assumption is written down.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

afterEach(() => {
  // Tests share this module with everything else that imports it.
  resetLanguage();
  localStorage.clear();

  /*
   * And the registry too, which the other stores' tests do not have to do.
   *
   * `loadedWith` below resets the modules and imports a **fresh** `language.ts`,
   * which reads storage as it loads. Every module imported after that gets that
   * instance — including, in a whole-suite run, the components of other files,
   * whose `useT` would then be stuck on whatever this file last wrote. Resetting
   * again once storage is clean means the next instance to be built reads an
   * empty store and comes up English, which is what every component test in this
   * package assumes.
   */
  vi.resetModules();
});

/** The module as a panel finds it on load, with storage already written. */
async function loadedWith(saved: string | null): Promise<typeof import('./language.js')> {
  if (saved === null) localStorage.removeItem('panel.language');
  else localStorage.setItem('panel.language', saved);

  vi.resetModules();
  return import('./language.js');
}

describe('the language', () => {
  it('starts at English, which is what every other test assumes', () => {
    expect(currentLanguage()).toBe('en');
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it('is written down, so a reopened panel speaks the same one', async () => {
    setLanguage('uk');
    expect(localStorage.getItem('panel.language')).toBe('"uk"');

    expect((await loadedWith(localStorage.getItem('panel.language'))).currentLanguage()).toBe('uk');
  });

  it('goes back to English when reset', () => {
    setLanguage('uk');
    resetLanguage();

    expect(currentLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  it('ignores a stored value that names no language', async () => {
    expect((await loadedWith('"fr"')).currentLanguage()).toBe('en');
    expect((await loadedWith('7')).currentLanguage()).toBe('en');
    expect((await loadedWith('not json at all')).currentLanguage()).toBe('en');
  });
});

/**
 * The half that makes it a setting rather than a constant: every string in the
 * panel is read through this hook, and a component that did not hear the
 * change would go on speaking the old language until something else
 * re-rendered it.
 */
describe('useLanguage', () => {
  let container: HTMLDivElement;
  let root: Root;
  let seen: string[] = [];

  function Probe() {
    seen.push(useLanguage());
    return null;
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    seen = [];
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
    resetLanguage();
  });

  it('hands the change to whoever is drawing words', () => {
    act(() => {
      root.render(<Probe />);
    });
    expect(seen.at(-1)).toBe('en');

    act(() => {
      setLanguage('uk');
    });

    expect(seen.at(-1)).toBe('uk');
  });

  it('says nothing when the setting is set to what it already is', () => {
    act(() => {
      root.render(<Probe />);
    });
    const before = seen.length;

    act(() => {
      setLanguage('en');
    });

    expect(seen.length).toBe(before);
  });

  /**
   * The help page is a second document over the same storage, and it has a
   * language picker of its own. What a browser delivers from it is a `storage`
   * event and a store that has already changed underneath — never a call to
   * `setLanguage` here.
   */
  it('follows the setting when the other document is what changed it', () => {
    act(() => {
      root.render(<Probe />);
    });
    expect(seen.at(-1)).toBe('en');

    act(() => {
      localStorage.setItem('panel.language', JSON.stringify('uk'));
      window.dispatchEvent(new StorageEvent('storage', { key: 'panel.language' }));
    });

    expect(seen.at(-1)).toBe('uk');
    expect(currentLanguage()).toBe('uk');
  });

  it('sits still when the event is about somebody else’s key', () => {
    act(() => {
      root.render(<Probe />);
    });
    const before = seen.length;

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'panel.accentTheme' }));
    });

    expect(seen.length).toBe(before);
  });
});
