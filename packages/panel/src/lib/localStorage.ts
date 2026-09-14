import { useEffect, useState } from 'react';

/**
 * The same setting, changed by **another document of this origin**.
 *
 * The panel and the help page are two documents sharing one `localStorage`, so
 * a setting changed in either is already written down for the other — but
 * writing it down is not telling anybody. Without this, a language picked on
 * the help page reaches the panel beside it only on the panel's next reload,
 * and the two windows sit there disagreeing.
 *
 * The handler re-reads the store rather than trusting `newValue`: the event
 * says only that something moved, and the store knows how to read itself. A
 * `key` of `null` is the whole store being cleared, which is every key at once.
 *
 * `storage` never fires in the document that did the writing, so this cannot
 * loop back on itself.
 */
export function followStorage(key: string, reread: () => void): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === key) reread();
  });
}

/**
 * State that outlives the panel being closed — the active tab, the theme, which
 * sections are folded. DevTools panels are torn down and rebuilt constantly, so
 * without this the interface resets every time the drawer is reopened.
 */
export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? defaultValue : (JSON.parse(saved) as T);
    } catch {
      // Unreadable or not JSON — treat it as absent rather than failing to render.
      return defaultValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
