// @vitest-environment happy-dom
import type { SpineInfo } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InfoRows } from './InfoRows.js';

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

function info(names: string[]): SpineInfo {
  return {
    skins: [],
    animations: names.map((name) => ({ name, duration: 1 })),
    events: [],
    pending: false,
    skeletons: [],
    canChangeSkeleton: false,
  };
}

describe('InfoRows', () => {
  it('folds the animations under the folders their names spell out', () => {
    act(() => {
      root.render(<InfoRows info={info(['hero/run', 'hero/jump', 'idle'])} />);
    });

    const folder = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    expect(folder?.textContent).toBe('hero');
    expect(folder?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('run');

    act(() => {
      folder?.click();
    });

    expect(folder?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('run');
    expect(container.textContent).toContain('idle');
  });
});
