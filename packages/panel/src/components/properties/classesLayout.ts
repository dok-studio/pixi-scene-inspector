import { useSyncExternalStore } from 'react';

/**
 * How a list held in one string is drawn: as it is written, or one item per
 * line.
 *
 * **Not per component, and not stored.** Not per component because the rows are
 * keyed on the node — selecting another caption remounts them — and a choice
 * that reset on every click through a list would not be a choice at all. Not
 * stored because it is a way of looking at something rather than a setting: the
 * column is for the moment when the classes matter, and the panel should open
 * on the compact form the next time it is opened at all.
 *
 * So it lives here, for exactly as long as the panel's own script does. That is
 * what "one session" means, and it is also why this is a module of its own
 * rather than a `useLocalStorage`, which is what everything that *should*
 * outlive the drawer uses.
 */

export type ClassesLayout = 'line' | 'column';

/** As written, until someone asks otherwise. */
const INITIAL: ClassesLayout = 'line';

let layout: ClassesLayout = INITIAL;

const listeners = new Set<() => void>();

export function classesLayout(): ClassesLayout {
  return layout;
}

export function setClassesLayout(next: ClassesLayout): void {
  if (next === layout) return;

  layout = next;
  for (const notify of [...listeners]) notify();
}

/** Every row showing a list moves together: it is one way of looking, not one
 *  per field. */
function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

export function useClassesLayout(): ClassesLayout {
  return useSyncExternalStore(subscribe, classesLayout, classesLayout);
}

/** Tests share this module with everything else that imports it. */
export function resetClassesLayout(): void {
  setClassesLayout(INITIAL);
}
