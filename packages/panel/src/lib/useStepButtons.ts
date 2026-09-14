import { useEffect, useRef } from 'react';

import { useLiveNumber } from './liveNumber.js';
import { computeNextNumberValue } from './numberStep.js';

/**
 * The ▲▼ buttons beside a number field: one click is one step, holding starts
 * repeating after a pause. Ported unchanged — the 300ms delay and 80ms repeat
 * are what the control was tuned to.
 */

interface Params {
  value: number;
  onChange: (value: number) => void;

  step?: number;
  min?: number;
  max?: number;
  precision?: number;
}

const REPEAT_DELAY_MS = 300;
const REPEAT_INTERVAL_MS = 80;

export function useStepButtons({ value, onChange, step = 1, min, max, precision }: Params) {
  // Counts from its own running value rather than the polled one, so a burst of
  // clicks is a burst of steps — the poll is 250ms away and would otherwise
  // hand every click the same starting point. See `liveNumber`.
  const live = useLiveNumber(value);

  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const start = (direction: 1 | -1, event: React.MouseEvent): void => {
    event.preventDefault();

    let multiplier = 1;
    if (event.shiftKey) multiplier = 10;
    if (event.ctrlKey || event.metaKey) multiplier = 0.1;

    const apply = (): void => {
      const next = computeNextNumberValue(live.get(), direction, step * multiplier, {
        min,
        max,
        precision,
      });

      live.emit(next);
      onChange(next);
    };

    apply();

    timeoutRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(apply, REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  };

  const stop = (): void => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  /**
   * The repeat is wired to the pointer, which is not the only way a press can
   * end. Hold the button while the application destroys the node: the row is
   * unmounted from under the pointer, no mouse-up ever reaches it, and the
   * interval went on writing to a node that no longer exists for the rest of
   * the session.
   */
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(
    () => () => {
      stopRef.current();
    },
    [],
  );

  return {
    incProps: {
      onMouseDown: (event: React.MouseEvent) => {
        start(1, event);
      },
      onMouseUp: stop,
      onMouseLeave: stop,
    },
    decProps: {
      onMouseDown: (event: React.MouseEvent) => {
        start(-1, event);
      },
      onMouseUp: stop,
      onMouseLeave: stop,
    },
  };
}
