import { describe, expect, it } from 'vitest';

import { createLiveNumber, emitLiveNumber, syncLiveNumber } from './liveNumber.js';

/**
 * The value a stepping control counts from.
 *
 * The problem it solves: the number on screen is **polled**, a few times a
 * second, while clicks and key presses arrive as fast as a hand can produce
 * them. Counting from the polled value means three quick clicks on ▲ all read
 * the same starting point and the value moves by one step instead of three.
 *
 * Counting from a purely local value is no better: the scene can move on its
 * own — a ticker, another editor, the application itself — and the control
 * would keep stepping from a number that is no longer true.
 *
 * So the rule is: keep counting locally, but give way the moment a value
 * arrives that is not the echo of what was just sent.
 */
describe('live number', () => {
  it('starts at the value it was given', () => {
    expect(createLiveNumber(5).current).toBe(5);
  });

  it('treats an absent value as zero', () => {
    expect(createLiveNumber(null).current).toBe(0);
  });

  /** The bug this exists for: three clicks before the first poll comes back. */
  it('keeps counting while the polled value has not caught up', () => {
    const live = createLiveNumber(0);

    emitLiveNumber(live, live.current + 1);
    syncLiveNumber(live, 0);
    emitLiveNumber(live, live.current + 1);
    syncLiveNumber(live, 0);
    emitLiveNumber(live, live.current + 1);

    expect(live.current).toBe(3);
  });

  it('accepts the echo of its own change without flinching', () => {
    const live = createLiveNumber(0);
    emitLiveNumber(live, 3);

    syncLiveNumber(live, 3);

    expect(live.current).toBe(3);
  });

  /** The scene moved on its own — a ticker, a drag, another editor. */
  it('gives way to a change it did not make', () => {
    const live = createLiveNumber(0);
    emitLiveNumber(live, 3);
    syncLiveNumber(live, 3);

    syncLiveNumber(live, 42);

    expect(live.current).toBe(42);
  });

  /**
   * An external change arriving before the echo has to win too, or the control
   * would spend the rest of the session counting from a stale number.
   */
  it('gives way even while its own change is still in flight', () => {
    const live = createLiveNumber(0);
    emitLiveNumber(live, 1);

    syncLiveNumber(live, 42);

    expect(live.current).toBe(42);
  });

  it('ignores a repeat of the value it already holds', () => {
    const live = createLiveNumber(7);

    syncLiveNumber(live, 7);
    syncLiveNumber(live, 7);

    expect(live.current).toBe(7);
  });

  it('follows a value that goes missing', () => {
    const live = createLiveNumber(7);

    syncLiveNumber(live, null);

    expect(live.current).toBe(0);
  });
});
