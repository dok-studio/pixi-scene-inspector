import { useSyncExternalStore } from 'react';

import type { MessageKey } from '../../i18n/index.js';

/**
 * Which key presses toggle the tree's own toolbar — the picker and the
 * overlay's switches — without reaching for the mouse.
 *
 * `code` rather than `key`: a binding is about which physical key was pressed,
 * not what character the current keyboard layout says it produces, and `code`
 * is the one of the two that does not change under Alt.
 *
 * Alt is the default modifier because nothing else in the panel claims it —
 * `useGlobalAltState` only tracks it for the number-scrub cursor, it never
 * consumes the key — and because the tree underneath these buttons already
 * claims bare letters for its own jump-to-node search (`react-arborist`'s
 * `DefaultContainer`, on focus). A plain letter is still allowed here: this is
 * a setting, and someone who chooses one has decided that trade-off for
 * themselves, the same as in any keybinding editor.
 *
 * **A module rather than a prop**, for the same reason as `pollRate.ts`: it is
 * read deep in the Scene tab, by `useOverlayHotkeys`, and edited from the gear
 * in the navbar, and neither is above the other in any useful sense.
 */

export interface HotkeyBinding {
  code: string;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
}

export type HotkeyAction = 'picker' | 'highlight' | 'wrapBox' | 'axes' | 'transform' | 'counts';

const ACTIONS: readonly HotkeyAction[] = ['picker', 'highlight', 'wrapBox', 'axes', 'transform', 'counts'];

/**
 * Which message names each action, rather than the name itself.
 *
 * A module constant holding a translated string is a string resolved once, at
 * import, under whatever language was on then. Holding the key instead keeps
 * the table where it belongs — beside the actions it is exhaustive over — and
 * moves the one language-dependent step into the render (§3.14).
 */
export const HOTKEY_LABEL_KEYS: Record<HotkeyAction, MessageKey> = {
  picker: 'hotkey.picker',
  highlight: 'hotkey.highlight',
  wrapBox: 'hotkey.wrapBox',
  axes: 'hotkey.axes',
  transform: 'hotkey.transform',
  counts: 'hotkey.counts',
};

function binding(code: string): HotkeyBinding {
  return { code, alt: true, ctrl: false, shift: false };
}

export const DEFAULT_HOTKEYS: Record<HotkeyAction, HotkeyBinding> = {
  picker: binding('KeyS'),
  highlight: binding('KeyH'),
  wrapBox: binding('KeyW'),
  axes: binding('KeyX'),
  transform: binding('KeyT'),
  counts: binding('KeyC'),
};

const KEY = 'panel.hotkeys';

function isBinding(value: unknown): value is HotkeyBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HotkeyBinding).code === 'string' &&
    typeof (value as HotkeyBinding).alt === 'boolean' &&
    typeof (value as HotkeyBinding).ctrl === 'boolean' &&
    typeof (value as HotkeyBinding).shift === 'boolean'
  );
}

/**
 * A saved record, one action at a time: a stray or corrupted entry for one
 * action falls back to its own default rather than losing every binding.
 */
function stored(): Record<HotkeyAction, HotkeyBinding> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const record = typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {};

    return Object.fromEntries(
      ACTIONS.map((action) => [action, isBinding(record[action]) ? record[action] : DEFAULT_HOTKEYS[action]]),
    ) as Record<HotkeyAction, HotkeyBinding>;
  } catch {
    // Unreadable, not JSON, or no storage at all: treated as unset rather than
    // as a reason to fail to render.
    return { ...DEFAULT_HOTKEYS };
  }
}

let current: Record<HotkeyAction, HotkeyBinding> = stored();

const listeners = new Set<() => void>();

export function hotkeys(): Record<HotkeyAction, HotkeyBinding> {
  return current;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }

  for (const notify of [...listeners]) notify();
}

export function setHotkey(action: HotkeyAction, next: HotkeyBinding): void {
  current = { ...current, [action]: next };
  persist();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

export function useHotkeys(): Record<HotkeyAction, HotkeyBinding> {
  return useSyncExternalStore(subscribe, hotkeys, hotkeys);
}

/**
 * Whether any of the above fire at all — a way out for someone whose own game
 * happens to want Alt+one of these letters for itself, without having to
 * clear five bindings to get it.
 */
const ENABLED_KEY = 'panel.hotkeysEnabled';

function storedEnabled(): boolean {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ENABLED_KEY) ?? 'null');
    return typeof saved === 'boolean' ? saved : true;
  } catch {
    return true;
  }
}

let enabled: boolean = storedEnabled();

export function hotkeysEnabled(): boolean {
  return enabled;
}

export function setHotkeysEnabled(next: boolean): void {
  if (next === enabled) return;

  enabled = next;
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(enabled));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }

  for (const notify of [...listeners]) notify();
}

export function useHotkeysEnabled(): boolean {
  return useSyncExternalStore(subscribe, hotkeysEnabled, hotkeysEnabled);
}

/** Every binding, and whether they fire at all, back to what they started as. */
export function resetHotkeys(): void {
  current = { ...DEFAULT_HOTKEYS };
  enabled = true;
  persist();
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(true));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }
}

export function matchesBinding(event: KeyboardEvent, target: HotkeyBinding): boolean {
  return (
    event.code === target.code &&
    event.altKey === target.alt &&
    event.ctrlKey === target.ctrl &&
    event.shiftKey === target.shift
  );
}

/** The physical key alone, without its `Key`/`Digit` prefix. */
function keyLabel(code: string): string {
  const bare = code.replace(/^Key|^Digit/, '');
  return bare === '' ? code : bare;
}

/** "Alt+S" — for a tooltip, and for the row that lets someone change it. */
export function formatBinding(target: HotkeyBinding): string {
  const parts: string[] = [];
  if (target.ctrl) parts.push('Ctrl');
  if (target.alt) parts.push('Alt');
  if (target.shift) parts.push('Shift');
  parts.push(keyLabel(target.code));
  return parts.join('+');
}
