import { useSyncExternalStore } from 'react';

/**
 * How hard the panel leans on the page it is watching.
 *
 * Everything this panel shows is pulled: the overlay every 100 ms, the tree
 * every 500, a node's values every 250, a Spine skeleton's tracks every 40.
 * Each of those is a round trip through `eval` into the inspected page, and on
 * a game that is already spending its frame that is a cost the person watching
 * may not want to pay for a scene that is barely moving.
 *
 * So it is one setting rather than eight fields: nobody wants to tune a tree
 * poll against a property poll, they want the inspector to press harder or to
 * get out of the way.
 *
 * **A module rather than a prop**, which this codebase is otherwise short of —
 * and the reason is the shape of the thing. Every `useResource` in the panel
 * needs it, from a texture grid to a Spine event log, and threading a rate down
 * to a dozen unrelated components would put it in the signature of everything
 * it passes through. The gear that sets it is in the navbar, which is not above
 * all of them in any useful sense either.
 */

/**
 * The names are the values: there are three of them, they are shown as they are
 * stored, and a lower-case key that has to be mapped to a label for a set this
 * size is a table nobody needs.
 *
 * They are also not translated, which is why they read as a scale rather than
 * as words: `Max` and `Min` say which end of it a setting is at in any
 * language, and a panel in Ukrainian showing «Живо» beside `Normal` would be
 * spelling one scale two ways (§3.14).
 */
export const POLL_RATES = ['Max', 'Normal', 'Min'] as const;

export type PollRate = (typeof POLL_RATES)[number];

export const DEFAULT_POLL_RATE: PollRate = 'Normal';

/**
 * Normal is what every interval in the panel was written as, and each of those
 * numbers has an argument behind it where it stands. The other two multiply
 * them rather than replacing them, so those arguments still hold — a tree poll
 * stays five times the overlay's whichever setting is on.
 */
const FACTOR: Record<PollRate, number> = { Max: 0.5, Normal: 1, Min: 4 };

/**
 * The fastest the panel already runs at — a Spine skeleton's live tracks, at
 * 25 Hz.
 *
 * Max halves every interval, and without a floor it would drive the fast ones
 * past anything here was tuned for: a scrubbing Spine at 50 Hz asks the page
 * for a full set of tracks twice as often as the section that was written for
 * it ever meant to. Clamping to a rate the panel already sustains keeps Max a
 * setting rather than an experiment.
 */
const FLOOR_MS = 40;

export function scaleInterval(intervalMs: number, rate: PollRate): number {
  return Math.max(FLOOR_MS, Math.round(intervalMs * FACTOR[rate]));
}

const KEY = 'panel.pollRate';

function stored(): PollRate {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '""');
    return POLL_RATES.includes(saved as PollRate) ? (saved as PollRate) : DEFAULT_POLL_RATE;
  } catch {
    // Unreadable, not JSON, or no storage at all: treated as unset rather than
    // as a reason to fail to render.
    return DEFAULT_POLL_RATE;
  }
}

let rate: PollRate = stored();

const listeners = new Set<() => void>();

export function pollRate(): PollRate {
  return rate;
}

export function setPollRate(next: PollRate): void {
  if (next === rate) return;

  rate = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }

  for (const notify of [...listeners]) notify();
}

export function resetPollRate(): void {
  setPollRate(DEFAULT_POLL_RATE);
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

export function usePollRate(): PollRate {
  return useSyncExternalStore(subscribe, pollRate, pollRate);
}
