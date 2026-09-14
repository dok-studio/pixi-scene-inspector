import { useEffect, useRef, useState } from 'react';

import { scaleInterval, usePollRate } from './pollRate.js';

export interface ResourceState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

export interface ResourceOptions {
  /**
   * How often to ask, at the panel's `Normal` poll rate. The setting scales it
   * — see `pollRate.ts` — so a caller states what the request is worth relative
   * to every other one and nothing here has to know about the setting.
   */
  intervalMs: number;
  /** A disabled resource is not polled at all, so a collapsed section costs nothing. */
  enabled?: boolean;
  /**
   * What the request is *about* — a node id, a set of keys. The loop restarts
   * when this changes.
   *
   * Without it, a resource whose parameters live in the callback would keep
   * asking the old question until the next tick, because the callback is held
   * in a ref precisely so that re-rendering does not restart the polling.
   */
  key?: string | number;
}

/** How many consecutive failures keep doubling the pause. */
const MAX_BACKOFF_STEPS = 3;

/**
 * Polling for a single command.
 *
 * All of the polling discipline lives here so that panels never hand-roll
 * `setInterval` and manual comparisons:
 *
 *  - **no overlap** — the next request is scheduled only after the previous
 *    one settles (`setTimeout`, not `setInterval`);
 *  - **paused on a hidden tab** — DevTools in the background has no business
 *    poking the inspected page;
 *  - **backoff on errors** — a page without an inspector is not polled several
 *    times a second;
 *  - **stale data survives a failure** — the UI does not flash empty because
 *    of one bad request.
 */
export function useResource<T>(load: () => Promise<T>, options: ResourceOptions): ResourceState<T> {
  const { enabled = true, key } = options;
  const intervalMs = scaleInterval(options.intervalMs, usePollRate());
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: null, loading: enabled });

  // The callback is kept in a ref so a fresh function on every render does not
  // restart the polling loop.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const nextDelay = (): number => intervalMs * 2 ** Math.min(failures, MAX_BACKOFF_STEPS);

    const schedule = (delay: number): void => {
      timer = setTimeout(() => void tick(), delay);
    };

    const tick = async (): Promise<void> => {
      if (cancelled) return;

      if (typeof document !== 'undefined' && document.hidden) {
        schedule(intervalMs);
        return;
      }

      try {
        const data = await loadRef.current();
        if (cancelled) return;
        failures = 0;
        // Returning the previous state object unchanged makes React skip the
        // re-render. That is what turns an `unchanged` reply into genuinely no
        // work — otherwise every poll would re-render the whole tree to say
        // nothing had happened.
        setState((previous) =>
          previous.data === data && previous.error === null && !previous.loading
            ? previous
            : { data, error: null, loading: false },
        );
      } catch (error) {
        if (cancelled) return;
        failures += 1;
        setState((previous) => ({
          data: previous.data,
          error: error instanceof Error ? error : new Error(String(error)),
          loading: false,
        }));
      }

      if (!cancelled) schedule(nextDelay());
    };

    void tick();

    // Back on the tab — do not sit out the rest of the pause.
    const onVisibilityChange = (): void => {
      if (cancelled || document.hidden) return;
      clearTimeout(timer);
      void tick();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, intervalMs, key]);

  return state;
}
