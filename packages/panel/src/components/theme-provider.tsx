import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Light/dark/system, ported from the previous project.
 *
 * The class goes on the document element because the theme tokens are declared
 * against `.dark` in `globals.css`, and `darkMode: 'class'` is what the Tailwind
 * config expects.
 */

type Theme = 'dark' | 'light' | 'system';

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: 'system',
  setTheme: () => null,
});

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'si-ui-theme',
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme | null) ?? defaultTheme,
  );

  /*
   * The theme is one setting shared by two documents — the panel and the help
   * page, which each run a provider of their own over the same key. `storage`
   * fires in the document that did *not* do the writing, so a theme toggled in
   * either window moves the other one with it. Nothing is written back here:
   * the value is already in storage, which is how it arrived.
   */
  useEffect(() => {
    const follow = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== storageKey) return;

      setTheme((localStorage.getItem(storageKey) as Theme | null) ?? defaultTheme);
    };

    window.addEventListener('storage', follow);
    return () => {
      window.removeEventListener('storage', follow);
    };
  }, [storageKey, defaultTheme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (next) => {
      localStorage.setItem(storageKey, next);
      setTheme(next);
    },
  };

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>;
}

export const useTheme = (): ThemeProviderState => useContext(ThemeProviderContext);
