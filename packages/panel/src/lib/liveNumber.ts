import { useRef } from 'react';

/**
 * The value a stepping control counts from.
 *
 * The number on screen is **polled**, a few times a second, while clicks and
 * key presses arrive as fast as a hand can produce them. Counting from the
 * polled value loses steps: three quick clicks on ▲ all read the same starting
 * point, and the value moves by one instead of three. Counting from a purely
 * local value is no better — the scene moves on its own, and the control would
 * keep stepping from a number that is no longer true.
 *
 * So it counts locally and gives way the moment a value arrives that is not the
 * echo of what it just sent.
 *
 * The state is plain data with functions over it, rather than a hook, so this
 * rule can be tested. `useLiveNumber` is the thin wrapper React uses.
 */

export interface LiveNumber {
  /** What the control should count from. */
  current: number;
  /** The last value sent out, so its echo can be recognised. */
  emitted: number;
  /**
   * Whether `emitted` means anything yet. A flag rather than a nullable
   * `emitted`, because `null` is a value that genuinely arrives — a property
   * the node does not carry — and it must not be mistaken for an echo.
   */
  hasEmitted: boolean;
  /** The last value received, so a change can be told from a re-render. */
  previous: number | null | undefined;
}

const asNumber = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function createLiveNumber(value: number | null | undefined): LiveNumber {
  return { current: asNumber(value), emitted: 0, hasEmitted: false, previous: value };
}

/** Call on every render with the latest polled value. */
export function syncLiveNumber(state: LiveNumber, value: number | null | undefined): void {
  // Nothing arrived — this is a re-render, not news.
  if (value === state.previous) return;
  state.previous = value;

  // The echo of a change this control made: already accounted for.
  if (state.hasEmitted && value === state.emitted) return;

  state.current = asNumber(value);
  state.hasEmitted = false;
}

/** Call whenever the control sends a value out. */
export function emitLiveNumber(state: LiveNumber, next: number): void {
  state.current = next;
  state.emitted = next;
  state.hasEmitted = true;
}

export interface LiveNumberHandle {
  /** The value to count from, right now. */
  get: () => number;
  emit: (next: number) => void;
}

export function useLiveNumber(value: number | null | undefined): LiveNumberHandle {
  const state = useRef<LiveNumber | null>(null);
  state.current ??= createLiveNumber(value);
  syncLiveNumber(state.current, value);

  const held = state.current;

  return {
    get: () => held.current,
    emit: (next) => {
      emitLiveNumber(held, next);
    },
  };
}
