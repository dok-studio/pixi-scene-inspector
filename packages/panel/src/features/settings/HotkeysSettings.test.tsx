// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HotkeysSettings } from './HotkeysSettings.js';
import { DEFAULT_HOTKEYS, hotkeys, hotkeysEnabled, resetHotkeys } from './hotkeys.js';

/**
 * The one thing this tab does beyond drawing the store: turning the next
 * keystroke into a binding, and letting Escape back out without one.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLElement | null {
  for (const el of container.querySelectorAll<HTMLElement>('button')) {
    if (el.textContent === label) return el;
  }
  return null;
}

function masterSwitch(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="switch"]');
}

async function click(element: HTMLElement | null): Promise<void> {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function press(init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

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
  localStorage.clear();
  resetHotkeys();
});

async function mount(): Promise<void> {
  await act(async () => {
    root.render(<HotkeysSettings />);
  });
}

describe('HotkeysSettings', () => {
  it('shows every action next to its default binding', async () => {
    await mount();

    expect(button('Alt+S')).not.toBeNull();
    expect(button('Alt+H')).not.toBeNull();
  });

  it('records the next key pressed after Change is clicked', async () => {
    await mount();
    await click(button('Alt+S'));
    expect(button('Press a key…')).not.toBeNull();

    await press({ code: 'KeyQ', altKey: true });

    expect(hotkeys().picker).toEqual({ code: 'KeyQ', alt: true, ctrl: false, shift: false });
    expect(button('Alt+Q')).not.toBeNull();
  });

  it('ignores a bare modifier and keeps waiting', async () => {
    await mount();
    await click(button('Alt+S'));

    await press({ code: 'AltLeft', altKey: true });
    expect(button('Press a key…')).not.toBeNull();

    await press({ code: 'KeyQ', altKey: true });
    expect(hotkeys().picker.code).toBe('KeyQ');
  });

  it('leaves the binding untouched when Escape cancels the recording', async () => {
    await mount();
    await click(button('Alt+S'));

    await press({ key: 'Escape', code: 'Escape' });

    expect(hotkeys().picker).toEqual(DEFAULT_HOTKEYS.picker);
    expect(button('Alt+S')).not.toBeNull();
  });

  it('starts with the master switch on', async () => {
    await mount();

    expect(masterSwitch()?.getAttribute('aria-checked')).toBe('true');
  });

  it('turns every hotkey off without clearing any binding', async () => {
    await mount();
    await click(masterSwitch());

    expect(hotkeysEnabled()).toBe(false);
    expect(masterSwitch()?.getAttribute('aria-checked')).toBe('false');
    // Still there to look at, and still there to change.
    expect(button('Alt+S')).not.toBeNull();
  });
});
