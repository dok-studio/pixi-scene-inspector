// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_BOOKMARK_LIMIT,
  MAX_BOOKMARK_LIMIT,
  clampLimit,
  resetBookmarkLimit,
  setBookmarkLimit,
  bookmarkLimit,
} from './bookmarkLimit.js';

/**
 * The ceiling on what the panel remembers. What is worth holding still is that
 * it can never come back as something the store would not survive — a number
 * out of storage is whatever was last written there, and that is editable.
 */

afterEach(() => {
  // Tests share this module with everything else that imports it.
  resetBookmarkLimit();
  localStorage.clear();
});

/** The module as a panel finds it on load, with storage already written. */
async function loadedWith(saved: string | null): Promise<typeof import('./bookmarkLimit.js')> {
  if (saved === null) localStorage.removeItem('panel.bookmarkLimit');
  else localStorage.setItem('panel.bookmarkLimit', saved);

  vi.resetModules();
  return import('./bookmarkLimit.js');
}

describe('clampLimit', () => {
  it('keeps a sensible number as it is', () => {
    expect(clampLimit(12)).toBe(12);
  });

  it('never goes below one, or above the ceiling', () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
    expect(clampLimit(500)).toBe(MAX_BOOKMARK_LIMIT);
  });

  it('rounds, because a list cannot hold half a node', () => {
    expect(clampLimit(4.6)).toBe(5);
  });
});

describe('setBookmarkLimit', () => {
  it('clamps what it is given rather than refusing it', () => {
    setBookmarkLimit(1000);
    expect(bookmarkLimit()).toBe(MAX_BOOKMARK_LIMIT);
  });

  it('goes back to the default when reset', () => {
    setBookmarkLimit(7);
    resetBookmarkLimit();

    expect(bookmarkLimit()).toBe(DEFAULT_BOOKMARK_LIMIT);
  });
});

describe('on load', () => {
  it('takes the stored number', async () => {
    expect((await loadedWith('7')).bookmarkLimit()).toBe(7);
  });

  it('starts at the default when nothing has been stored', async () => {
    expect((await loadedWith(null)).bookmarkLimit()).toBe(DEFAULT_BOOKMARK_LIMIT);
  });

  it('brings a stored number that is out of range back inside it', async () => {
    expect((await loadedWith('900')).bookmarkLimit()).toBe(MAX_BOOKMARK_LIMIT);
    expect((await loadedWith('0')).bookmarkLimit()).toBe(1);
  });

  it('treats anything that is not a number as unset', async () => {
    expect((await loadedWith('"thirty"')).bookmarkLimit()).toBe(DEFAULT_BOOKMARK_LIMIT);
    expect((await loadedWith('not json')).bookmarkLimit()).toBe(DEFAULT_BOOKMARK_LIMIT);
  });
});
