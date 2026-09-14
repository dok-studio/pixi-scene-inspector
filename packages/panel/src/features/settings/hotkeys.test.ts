// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_HOTKEYS,
  formatBinding,
  hotkeys,
  hotkeysEnabled,
  matchesBinding,
  resetHotkeys,
  setHotkey,
  setHotkeysEnabled,
} from './hotkeys.js';

/**
 * Which key toggles which switch, and that a corrupted store falls back to
 * the default one action at a time rather than losing every binding.
 */

afterEach(() => {
  // Tests share this module with everything else that imports it.
  resetHotkeys();
  localStorage.clear();
});

/** The module as a panel finds it on load, with storage already written. */
async function loadedWith(saved: string | null): Promise<typeof import('./hotkeys.js')> {
  if (saved === null) localStorage.removeItem('panel.hotkeys');
  else localStorage.setItem('panel.hotkeys', saved);

  vi.resetModules();
  return import('./hotkeys.js');
}

describe('setHotkey', () => {
  it('replaces one action without touching the rest', () => {
    setHotkey('highlight', { code: 'KeyG', alt: true, ctrl: false, shift: false });

    expect(hotkeys().highlight).toEqual({ code: 'KeyG', alt: true, ctrl: false, shift: false });
    expect(hotkeys().picker).toEqual(DEFAULT_HOTKEYS.picker);
  });

  it('goes back to every default when reset', () => {
    setHotkey('transform', { code: 'KeyZ', alt: false, ctrl: true, shift: true });
    resetHotkeys();

    expect(hotkeys()).toEqual(DEFAULT_HOTKEYS);
  });
});

describe('on load', () => {
  it('takes the stored bindings', async () => {
    const saved = { picker: { code: 'KeyQ', alt: true, ctrl: false, shift: false } };
    expect((await loadedWith(JSON.stringify(saved))).hotkeys().picker).toEqual(saved.picker);
  });

  it('starts at the defaults when nothing has been stored', async () => {
    expect((await loadedWith(null)).hotkeys()).toEqual(DEFAULT_HOTKEYS);
  });

  it('falls an unreadable store back to every default', async () => {
    expect((await loadedWith('not json')).hotkeys()).toEqual(DEFAULT_HOTKEYS);
  });

  it('falls one malformed action back to its own default, keeping the rest', async () => {
    const saved = { highlight: 'KeyH' };
    const loaded = (await loadedWith(JSON.stringify(saved))).hotkeys();

    expect(loaded.highlight).toEqual(DEFAULT_HOTKEYS.highlight);
    expect(loaded.picker).toEqual(DEFAULT_HOTKEYS.picker);
  });

  it('takes a stored false rather than the default true for enabled', async () => {
    localStorage.setItem('panel.hotkeysEnabled', 'false');
    vi.resetModules();

    expect((await import('./hotkeys.js')).hotkeysEnabled()).toBe(false);
  });
});

describe('matchesBinding', () => {
  it('matches the code and every modifier exactly', () => {
    const binding = { code: 'KeyS', alt: true, ctrl: false, shift: false };
    const event = new KeyboardEvent('keydown', { code: 'KeyS', altKey: true });

    expect(matchesBinding(event, binding)).toBe(true);
  });

  it('refuses a matching code held with an extra modifier', () => {
    const binding = { code: 'KeyS', alt: true, ctrl: false, shift: false };
    const event = new KeyboardEvent('keydown', { code: 'KeyS', altKey: true, ctrlKey: true });

    expect(matchesBinding(event, binding)).toBe(false);
  });
});

describe('setHotkeysEnabled', () => {
  it('starts enabled', () => {
    expect(hotkeysEnabled()).toBe(true);
  });

  it('turns off without touching any binding', () => {
    setHotkeysEnabled(false);

    expect(hotkeysEnabled()).toBe(false);
    expect(hotkeys()).toEqual(DEFAULT_HOTKEYS);
  });

  it('comes back on when every binding is reset', () => {
    setHotkeysEnabled(false);
    resetHotkeys();

    expect(hotkeysEnabled()).toBe(true);
  });
});

describe('formatBinding', () => {
  it('names the modifiers in a fixed order, then the bare key', () => {
    expect(formatBinding({ code: 'KeyS', alt: true, ctrl: false, shift: false })).toBe('Alt+S');
    expect(formatBinding({ code: 'KeyS', alt: true, ctrl: true, shift: true })).toBe('Ctrl+Alt+Shift+S');
  });

  it('drops the Key/Digit prefix', () => {
    expect(formatBinding({ code: 'Digit5', alt: false, ctrl: false, shift: false })).toBe('5');
  });
});
