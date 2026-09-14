import { useSyncExternalStore } from 'react';

/**
 * Whether the panel offers a Custom tab at all.
 *
 * **On by default**, which it was not at first. The argument for starting it
 * off was that three panels side by side is a shape for a DevTools window
 * opened on its own across a wide screen, and that a fourth tab nobody can use
 * is a tab that has to be clicked to find that out. The second half of that is
 * already answered by the width: the tab is simply absent below it, so nobody
 * in the drawer along the bottom of a browser ever sees one. What was left was
 * a feature that only announced itself to whoever went looking in the settings
 * for something they had no reason to believe was there.
 *
 * So the two questions have swapped which way they lean. The width still
 * decides whether the tab **can** appear; this now only decides whether someone
 * who has the room would rather not be offered it.
 *
 * **A module rather than a prop**, for the reason `pickDepth.ts` gives: the
 * gear in the navbar edits it and the shell reads it, and neither is above the
 * other in any useful sense.
 */

const KEY = 'panel.customTab';

const DEFAULT = true;

function stored(): boolean {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return typeof saved === 'boolean' ? saved : DEFAULT;
  } catch {
    // Unreadable, not JSON, or no storage at all: treated as unset rather than
    // as a reason to fail to render.
    return DEFAULT;
  }
}

let offered: boolean = stored();

const listeners = new Set<() => void>();

export function customTabOffered(): boolean {
  return offered;
}

export function setCustomTabOffered(next: boolean): void {
  if (next === offered) return;

  offered = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }

  for (const notify of [...listeners]) notify();
}

export function resetCustomTabOffered(): void {
  setCustomTabOffered(DEFAULT);
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

export function useCustomTabOffered(): boolean {
  return useSyncExternalStore(subscribe, customTabOffered, customTabOffered);
}
