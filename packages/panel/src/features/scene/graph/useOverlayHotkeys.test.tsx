// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetHotkeys, setHotkey, setHotkeysEnabled } from '../../settings/hotkeys.js';
import type { OverlayControls } from './useOverlay.js';
import { useOverlayHotkeys } from './useOverlayHotkeys.js';

/**
 * That each binding presses the switch it names, that a field editing text
 * keeps its own letters, and that changing a binding in storage is what the
 * next press answers to — not the one it was mounted with.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function fakeOverlay(overrides: Partial<OverlayControls> = {}): OverlayControls {
  return {
    highlight: true,
    picker: false,
    wrapBox: true,
    axes: 'arrows',
    transform: false,
    setHighlight: vi.fn(),
    setPicker: vi.fn(),
    setWrapBox: vi.fn(),
    setAxes: vi.fn(),
    setTransform: vi.fn(),
    setHovered: vi.fn(),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function Probe({ overlay, onCounts }: { overlay: OverlayControls; onCounts: () => void }) {
  useOverlayHotkeys(overlay, onCounts);
  return null;
}

async function mount(overlay: OverlayControls, onCounts = vi.fn()): Promise<void> {
  await act(async () => {
    root.render(<Probe overlay={overlay} onCounts={onCounts} />);
  });
}

function press(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
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

describe('useOverlayHotkeys', () => {
  it('toggles the picker on the default binding', async () => {
    const overlay = fakeOverlay({ picker: false });
    await mount(overlay);

    press(window, { code: 'KeyS', altKey: true });

    expect(overlay.setPicker).toHaveBeenCalledWith(true);
  });

  it('toggles highlight, wrap box and transform on their own defaults', async () => {
    const overlay = fakeOverlay({ highlight: true, wrapBox: true, transform: false });
    await mount(overlay);

    press(window, { code: 'KeyH', altKey: true });
    press(window, { code: 'KeyW', altKey: true });
    press(window, { code: 'KeyT', altKey: true });

    expect(overlay.setHighlight).toHaveBeenCalledWith(false);
    expect(overlay.setWrapBox).toHaveBeenCalledWith(false);
    expect(overlay.setTransform).toHaveBeenCalledWith(true);
  });

  it('cycles axes the same way the button does', async () => {
    const overlay = fakeOverlay({ axes: 'arrows' });
    await mount(overlay);

    press(window, { code: 'KeyX', altKey: true });

    expect(overlay.setAxes).toHaveBeenCalledWith('origin');
  });

  it('ignores the same key without its modifier', async () => {
    const overlay = fakeOverlay();
    await mount(overlay);

    press(window, { code: 'KeyS' });

    expect(overlay.setPicker).not.toHaveBeenCalled();
  });

  it('leaves a field editing text to its own letters', async () => {
    const overlay = fakeOverlay();
    await mount(overlay);

    const input = document.createElement('input');
    container.append(input);

    press(input, { code: 'KeyS', altKey: true });

    expect(overlay.setPicker).not.toHaveBeenCalled();
  });

  it('fires nothing at all once the master switch is off', async () => {
    const overlay = fakeOverlay({ picker: false });
    setHotkeysEnabled(false);
    await mount(overlay);

    press(window, { code: 'KeyS', altKey: true });

    expect(overlay.setPicker).not.toHaveBeenCalled();
  });

  it('answers the next press to whatever the binding was last changed to', async () => {
    const overlay = fakeOverlay({ highlight: true });
    await mount(overlay);

    setHotkey('highlight', { code: 'KeyG', alt: true, ctrl: false, shift: false });

    press(window, { code: 'KeyH', altKey: true });
    expect(overlay.setHighlight).not.toHaveBeenCalled();

    press(window, { code: 'KeyG', altKey: true });
    expect(overlay.setHighlight).toHaveBeenCalledWith(false);
  });
});
