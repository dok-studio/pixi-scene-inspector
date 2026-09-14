// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BookmarkControls } from './useBookmarks.js';
import { useBookmarks } from './useBookmarks.js';

/**
 * What this file is really about is identity, not storage.
 *
 * These controls are held in the shell and threaded down to the Scene tab,
 * where the tree's row renderer is memoized on the callbacks built from them.
 * A renderer rebuilt is a **new component type**, and React answers a new type
 * by throwing the old rows away and mounting new ones — which drops the hover
 * on a row's buttons and swallows a click that had already begun.
 *
 * The shell re-renders on every status poll, so an object rebuilt per render
 * meant that happening once or twice a second, for as long as the panel was
 * open. Hence: the same object out, until something about it actually changes.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
let root: Root;
let seen: BookmarkControls[];

function Probe() {
  seen.push(useBookmarks());
  return null;
}

beforeEach(() => {
  localStorage.clear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  seen = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  localStorage.clear();
});

/** Render again the way a status poll makes the shell render again. */
function render(): void {
  act(() => {
    root.render(<Probe />);
  });
}

describe('useBookmarks', () => {
  it('hands back the same controls while nothing about them has changed', () => {
    render();
    render();
    render();

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
  });

  it('keeps every callback on it stable too', () => {
    render();
    render();

    expect(seen[1]?.bookmark).toBe(seen[0]?.bookmark);
    expect(seen[1]?.restate).toBe(seen[0]?.restate);
    expect(seen[1]?.clear).toBe(seen[0]?.clear);
    expect(seen[1]?.list).toBe(seen[0]?.list);
  });

  /** And it does have to change when the list does, or nothing would redraw. */
  it('hands back something new once a bookmark is put on', () => {
    render();
    const before = seen[seen.length - 1];

    act(() => {
      before?.bookmark([{ name: 'hero', type: 'Sprite', index: 0, siblings: 1 }], true);
    });

    const after = seen[seen.length - 1];
    expect(after).not.toBe(before);
    expect(after?.list).toHaveLength(1);
  });
});
