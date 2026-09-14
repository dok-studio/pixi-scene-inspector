// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Navbar } from './navbar.js';

/**
 * The bar's own buttons, and the one of them that is conditional.
 *
 * The help page belongs to the extension, so the panel package is handed a
 * callback rather than a URL — and where there is no page to open, as in the
 * playground, there must be no button offering to open one.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe('Navbar', () => {
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

  const show = (onOpenHelp?: () => void): void => {
    act(() => {
      root.render(<Navbar version="8.0.0" major={8} onOpenHelp={onOpenHelp} />);
    });
  };

  /** The buttons carry no text, so they are counted rather than named. */
  const buttons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];

  it('offers no help where there is no page to open', () => {
    show();
    const withoutHelp = buttons().length;

    show(() => undefined);
    expect(buttons().length).toBe(withoutHelp + 1);
  });

  it('opens the help page when the button is pressed', () => {
    let opened = 0;
    show(() => {
      opened += 1;
    });

    // The reload button comes first in the group, then the theme, then help.
    const help = buttons().at(-1);
    act(() => {
      help?.click();
    });

    expect(opened).toBe(1);
  });
});
