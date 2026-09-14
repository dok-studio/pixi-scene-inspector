import { useSyncExternalStore } from 'react';

import { followStorage } from '../../lib/localStorage.js';

/**
 * Which language the panel speaks.
 *
 * Not `chrome.i18n` and not `navigator.language`: the browser's UI language is
 * not a choice anybody made about **this** panel, and the person most likely
 * to want the Ukrainian is running a Chrome that came in English. So it is an
 * ordinary panel setting — the same module singleton over `localStorage` as
 * the accent and the poll rate (§3.9) — and it sits in the same drawer, as its
 * first row, because it is the setting that decides how every other row reads.
 *
 * BCP 47 tags rather than names, unlike `ACCENT_THEMES` where the name is the
 * value: a tag is what a language is called in code. What it is called to a
 * reader is `LANGUAGE_LABELS` below.
 */
export const LANGUAGES = ['en', 'uk'] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * English, and it has to stay English: every component test in this package
 * asserts on literal English text, and a default that depended on the machine
 * would make those tests depend on it too.
 */
export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * A language is offered in its own words.
 *
 * The one table in the panel that is deliberately never translated: nobody
 * looks for their language under a name written in the one they are trying to
 * leave.
 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  uk: 'Українська',
};

const KEY = 'panel.language';

function stored(): Language {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '""');
    return LANGUAGES.includes(saved as Language) ? (saved as Language) : DEFAULT_LANGUAGE;
  } catch {
    // Unreadable, not JSON, or no storage at all: treated as unset rather than
    // as a reason to fail to render.
    return DEFAULT_LANGUAGE;
  }
}

let language: Language = stored();

const listeners = new Set<() => void>();

/**
 * Named rather than called `language()` like its siblings' getters: here the
 * value's own name is the one the getter would want.
 */
export function currentLanguage(): Language {
  return language;
}

export function setLanguage(next: Language): void {
  if (next === language) return;

  language = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }

  for (const notify of [...listeners]) notify();
}

export function resetLanguage(): void {
  setLanguage(DEFAULT_LANGUAGE);
}

/**
 * The help page has a language picker of its own, and it is a second document.
 * Picking there moves the panel beside it, and the gear in the panel moves the
 * help page — both without either knowing the other is open.
 */
followStorage(KEY, () => {
  const next = stored();
  if (next === language) return;

  language = next;
  for (const notify of [...listeners]) notify();
});

function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, currentLanguage, currentLanguage);
}
