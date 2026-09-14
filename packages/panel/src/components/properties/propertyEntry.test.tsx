// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PropertyEntry } from './propertyEntry.js';

/**
 * The one thing a row does beyond drawing its editor: a double click on its
 * name copies the field as source. Everything else here is layout.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const SNIPPET = 'position: {\n    x: 0,\n    y: 0\n},';

describe('PropertyEntry', () => {
  let container: HTMLElement;
  let root: Root;
  const written: string[] = [];

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    written.length = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const show = (copy?: string): void => {
    act(() => {
      root.render(<PropertyEntry title="Position" input={<input />} copy={copy} isLast />);
    });
  };

  const name = (): HTMLElement => {
    const found = container.querySelector<HTMLElement>('div')?.firstElementChild;
    if (!(found instanceof HTMLElement)) throw new Error('no name');
    return found;
  };

  const doubleClick = (element: HTMLElement): void => {
    act(() => {
      element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
  };

  it('copies the field when its name is double-clicked', () => {
    show(SNIPPET);
    doubleClick(name());

    expect(written).toEqual([SNIPPET]);
  });

  it('lights the name up rather than replacing it, so the row does not move', () => {
    show(SNIPPET);
    doubleClick(name());

    expect(name().className).toContain('text-primary');
    expect(name().textContent).toBe('Position');
  });

  /**
    * The cursor is the whole hint: a tooltip on a name that is passed over on
    * the way to every field beside it was in the way of the value being read.
    */
  it('marks the name as copyable without a word about it', () => {
    show(SNIPPET);

    expect(name().className).toContain('cursor-copy');
    expect(name().title).toBe('');
  });

  it('leaves the name inert where the section offers no snippet', () => {
    show();
    doubleClick(name());

    expect(written).toEqual([]);
    expect(name().className).not.toContain('cursor-copy');
  });
});
