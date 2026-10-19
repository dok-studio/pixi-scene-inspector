// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NameTree } from './NameTree.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
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

const ENTRIES = [{ name: 'hero/win/loop', detail: 1 }, { name: 'hero/win/in' }, { name: 'idle' }];

describe('NameTree', () => {
  /** The row shows the last segment; what is chosen is the whole name. */
  it('picks the full name from a leaf under its folders', () => {
    const picked: string[] = [];

    act(() => {
      root.render(<NameTree entries={ENTRIES} onPick={(name) => picked.push(name)} />);
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="hero/win/loop"]')?.click();
    });

    expect(picked).toEqual(['hero/win/loop']);
  });

  it('marks the current choice in the tree', () => {
    act(() => {
      root.render(<NameTree entries={ENTRIES} selected="hero/win/in" onPick={() => undefined} />);
    });

    const chosen = container.querySelector('button[aria-label="hero/win/in"]');
    expect(chosen?.classList.contains('text-primary')).toBe(true);
  });

  /** In the picker, an animation that is also a folder still has to be choosable. */
  it('gives a folder that is also a name a row to pick it by', () => {
    const picked: string[] = [];

    act(() => {
      root.render(
        <NameTree
          entries={[{ name: 'run' }, { name: 'run/fast' }]}
          onPick={(name) => picked.push(name)}
        />,
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="run"]')?.click();
    });

    expect(picked).toEqual(['run']);
  });
});
