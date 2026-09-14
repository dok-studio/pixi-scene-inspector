// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_POLL_RATE,
  pollRate,
  resetPollRate,
  scaleInterval,
  setPollRate,
  usePollRate,
} from './pollRate.js';

/**
 * How hard the panel leans on the page.
 *
 * The arithmetic is the part worth holding still: every interval in the panel
 * goes through it, and one that came back at zero or at a rate nothing was
 * tuned for would be felt by the game rather than by the panel.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

afterEach(() => {
  // Tests share this module with everything else that imports it.
  resetPollRate();
  localStorage.clear();
});

/** The module as a panel finds it on load, with storage already written. */
async function loadedWith(saved: string | null): Promise<typeof import('./pollRate.js')> {
  if (saved === null) localStorage.removeItem('panel.pollRate');
  else localStorage.setItem('panel.pollRate', saved);

  vi.resetModules();
  return import('./pollRate.js');
}

describe('scaleInterval', () => {
  it('leaves the panel’s own numbers alone at Normal', () => {
    expect(scaleInterval(100, 'Normal')).toBe(100);
    expect(scaleInterval(500, 'Normal')).toBe(500);
  });

  it('keeps the intervals in proportion, whichever setting is on', () => {
    // A tree poll is five times an overlay poll at Normal, and stays five times
    // it at Min: the arguments behind each number are relative to the others.
    expect(scaleInterval(500, 'Min') / scaleInterval(100, 'Min')).toBe(5);
  });

  it('asks less at Min and more at Max', () => {
    expect(scaleInterval(500, 'Min')).toBeGreaterThan(500);
    expect(scaleInterval(500, 'Max')).toBeLessThan(500);
  });

  /**
   * Max halves everything, and without this the fast ones would run past what
   * they were written for — a scrubbing Spine at 50 Hz rather than 25.
   */
  it('will not drive anything faster than the panel already runs', () => {
    expect(scaleInterval(40, 'Max')).toBe(40);
    expect(scaleInterval(1, 'Max')).toBe(40);
  });
});

describe('the poll rate', () => {
  it('starts at Normal, which is what every interval was written as', () => {
    expect(pollRate()).toBe('Normal');
    expect(DEFAULT_POLL_RATE).toBe('Normal');
  });

  it('is remembered, so a reopened panel does not press harder than asked', async () => {
    setPollRate('Min');

    expect((await loadedWith(localStorage.getItem('panel.pollRate'))).pollRate()).toBe('Min');
  });

  it('ignores a stored value that names no setting', async () => {
    expect((await loadedWith('"Blistering"')).pollRate()).toBe('Normal');
    expect((await loadedWith('not json at all')).pollRate()).toBe('Normal');
  });
});

/**
 * The half that makes it a setting rather than a constant: every polling loop
 * in the panel is subscribed through this hook, and one that did not hear the
 * change would go on asking at the old rate until something else re-rendered it.
 */
describe('usePollRate', () => {
  let container: HTMLDivElement;
  let root: Root;
  let seen: string[] = [];

  function Probe() {
    seen.push(usePollRate());
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
  });

  it('hands the change to whoever is polling', () => {
    act(() => {
      root.render(<Probe />);
    });
    expect(seen.at(-1)).toBe('Normal');

    act(() => {
      setPollRate('Min');
    });

    expect(seen.at(-1)).toBe('Min');
  });

  /**
   * A poll loop restarts on this, so saying nothing happened matters as much as
   * saying something did.
   */
  it('says nothing when the setting is set to what it already is', () => {
    act(() => {
      root.render(<Probe />);
    });
    const before = seen.length;

    act(() => {
      setPollRate('Normal');
    });

    expect(seen.length).toBe(before);
  });
});
