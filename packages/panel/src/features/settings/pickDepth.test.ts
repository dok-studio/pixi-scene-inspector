// @vitest-environment happy-dom
import { DEFAULT_PICK_DEPTH, MAX_PICK_DEPTH } from '@scene-inspector/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clampDepth, pickDepth, resetPickDepth, setPickDepth } from './pickDepth.js';

/**
 * How far a click digs. What is worth holding still is the ceiling: the number
 * ends up driving a loop inside the inspected page's own click handler, and it
 * comes out of storage, which is editable.
 */

afterEach(() => {
  // Tests share this module with everything else that imports it.
  resetPickDepth();
  localStorage.clear();
});

/** The module as a panel finds it on load, with storage already written. */
async function loadedWith(saved: string | null): Promise<typeof import('./pickDepth.js')> {
  if (saved === null) localStorage.removeItem('panel.pickDepth');
  else localStorage.setItem('panel.pickDepth', saved);

  vi.resetModules();
  return import('./pickDepth.js');
}

describe('clampDepth', () => {
  it('keeps a sensible number as it is', () => {
    expect(clampDepth(64)).toBe(64);
  });

  it('never goes below one, or above the ceiling', () => {
    expect(clampDepth(0)).toBe(1);
    expect(clampDepth(-5)).toBe(1);
    expect(clampDepth(1e9)).toBe(MAX_PICK_DEPTH);
  });

  it('rounds, because half a question cannot be asked', () => {
    expect(clampDepth(4.6)).toBe(5);
  });
});

describe('setPickDepth', () => {
  it('clamps what it is given rather than refusing it', () => {
    setPickDepth(1e9);
    expect(pickDepth()).toBe(MAX_PICK_DEPTH);
  });

  it('goes back to the default when reset', () => {
    setPickDepth(8);
    resetPickDepth();

    expect(pickDepth()).toBe(DEFAULT_PICK_DEPTH);
  });
});

describe('on load', () => {
  it('takes the stored number', async () => {
    expect((await loadedWith('40')).pickDepth()).toBe(40);
  });

  it('starts at the default when nothing has been stored', async () => {
    expect((await loadedWith(null)).pickDepth()).toBe(DEFAULT_PICK_DEPTH);
  });

  it('brings a stored number that is out of range back inside it', async () => {
    expect((await loadedWith('999999')).pickDepth()).toBe(MAX_PICK_DEPTH);
    expect((await loadedWith('0')).pickDepth()).toBe(1);
  });

  it('treats anything that is not a number as unset', async () => {
    expect((await loadedWith('"deep"')).pickDepth()).toBe(DEFAULT_PICK_DEPTH);
    expect((await loadedWith('not json')).pickDepth()).toBe(DEFAULT_PICK_DEPTH);
  });
});
