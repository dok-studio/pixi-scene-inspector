import { useSyncExternalStore } from 'react';

import { followStorage } from '../../lib/localStorage.js';

/**
 * The panel's own accent colour — not the overlay's, see `overlayStyle.ts`
 * for that one. Four names, stored as the values themselves for the same
 * reason as `pollRate.ts`: a set this size needs no separate label table.
 */
export const ACCENT_THEMES = ['Blue', 'Yellow', 'Red', 'Green'] as const;

export type AccentTheme = (typeof ACCENT_THEMES)[number];

export const DEFAULT_ACCENT_THEME: AccentTheme = 'Blue';

/**
 * The swatches shown in Settings, in the same hue each name resolves to in
 * `globals.css` — kept here rather than read back from the stylesheet
 * because all four have to be shown **at once**, not just the active one.
 */
export const ACCENT_SWATCH_COLOR: Record<AccentTheme, string> = {
  Blue: 'hsl(206 72% 43%)',
  Yellow: 'hsl(40 100% 42%)',
  Red: 'hsl(340 70% 44%)',
  Green: 'hsl(142 55% 38%)',
};

const KEY = 'panel.accentTheme';

function stored(): AccentTheme {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '""');
    return ACCENT_THEMES.includes(saved as AccentTheme) ? (saved as AccentTheme) : DEFAULT_ACCENT_THEME;
  } catch {
    // Unreadable, not JSON, or no storage at all: treated as unset rather than
    // as a reason to fail to render.
    return DEFAULT_ACCENT_THEME;
  }
}

let accent: AccentTheme = stored();

const listeners = new Set<() => void>();

export function accentTheme(): AccentTheme {
  return accent;
}

export function setAccentTheme(next: AccentTheme): void {
  if (next === accent) return;

  accent = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }

  for (const notify of [...listeners]) notify();
}

export function resetAccentTheme(): void {
  setAccentTheme(DEFAULT_ACCENT_THEME);
}

/**
 * The accent is set in the panel and read by the help page, which is a document
 * of its own. Without this it would follow the panel only as far as its next
 * load — see `followStorage`.
 */
followStorage(KEY, () => {
  const next = stored();
  if (next === accent) return;

  accent = next;
  for (const notify of [...listeners]) notify();
});

function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

export function useAccentTheme(): AccentTheme {
  return useSyncExternalStore(subscribe, accentTheme, accentTheme);
}
