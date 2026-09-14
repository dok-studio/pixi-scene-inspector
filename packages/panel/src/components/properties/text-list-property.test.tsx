// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetClassesLayout } from './classesLayout.js';
import type { PropertyPanelData } from './propertyTypes.js';
import { TextListProperty } from './text-list-property.js';

/**
 * A list the application keeps in one spaced string.
 *
 * Two things are worth rendering to check: that the switch is one switch for
 * the whole panel rather than one per row — the rows are keyed on the node, so
 * a choice living in the component would not survive clicking through a tree —
 * and that the field writes nothing at all.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe('TextListProperty', () => {
  let container: HTMLElement;
  let root: Root;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onChange = vi.fn();
    resetClassesLayout();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetClassesLayout();
  });

  const dataFor = (value: unknown): PropertyPanelData =>
    ({
      value,
      prop: 'classesList',
      entry: { type: 'textList', onChange },
      readOnly: true,
    }) as unknown as PropertyPanelData;

  /** Either control: which one it is is itself part of what is being checked. */
  const field = (): HTMLInputElement | HTMLTextAreaElement => {
    const found = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea',
    );
    if (found === null) throw new Error('no field');
    return found;
  };

  const show = (value: unknown): HTMLInputElement | HTMLTextAreaElement => {
    act(() => {
      root.render(<TextListProperty {...dataFor(value)} />);
    });

    return field();
  };

  const toggle = (): HTMLButtonElement => {
    const found = container.querySelector<HTMLButtonElement>('button[aria-label="One item per line"]');
    if (found === null) throw new Error('no switch');
    return found;
  };

  it('opens on the compact form, as the string was written', () => {
    expect(show('button large primary').value).toBe('button large primary');
  });

  it('is not upset by the spacing it was given', () => {
    expect(show('  button   large\tprimary ').value).toBe('button large primary');
  });

  it('draws nothing for a node that carries no list', () => {
    expect(show(undefined).value).toBe('');
  });

  it('reads as a column once asked to', () => {
    show('button large primary');

    act(() => {
      toggle().click();
    });

    expect(field().value).toBe('button\nlarge\nprimary');
  });

  it('comes back to one line', () => {
    show('button large');

    act(() => {
      toggle().click();
    });
    act(() => {
      toggle().click();
    });

    expect(field().value).toBe('button large');
  });

  /**
   * A box that scrolls sideways draws a scrollbar, and this panel's is 10px in
   * a row of 20 — a long list came out with a grey bar across the words. Each
   * form gets the control that suits it.
   */
  it('gives each form its own control, so the compact one cannot grow a scrollbar', () => {
    show('button large primary and-several-more-of-them');

    expect(field().tagName).toBe('INPUT');

    act(() => {
      toggle().click();
    });

    expect(field().tagName).toBe('TEXTAREA');
  });

  /**
   * The rows are keyed on the node, so this is what selecting the next caption
   * does. A choice held inside the component would be gone by now.
   */
  it('keeps the choice across a remount', () => {
    show('button large');

    act(() => {
      toggle().click();
    });

    expect(show('other classes').value).toBe('other\nclasses');
  });

  it('never writes: the framework owns these, and reads them back itself', () => {
    const area = show('button large');

    act(() => {
      area.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      area.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
      );
    });

    expect(area.readOnly).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
