/**
 * How far back the charts keep, and how long that choice lasts.
 *
 * **Off by default, and back to off the next day.** Recording costs the game a
 * wrapper on every draw and a few numbers a second — small, but not nothing,
 * and paid whether or not anybody is looking. A choice made on Tuesday to keep
 * twenty minutes is a choice about Tuesday's problem; left standing it goes on
 * costing on Wednesday, when nobody remembers turning it on and nobody would
 * think to turn it off.
 *
 * A day rather than a session, because a session here is however long DevTools
 * happens to stay open — reopening it in the same afternoon should not throw
 * away a window somebody deliberately picked ten minutes ago.
 */

/** Zero is off: the page records nothing and the charts are the live window. */
export const KEEP_CHOICES = [0, 5, 10, 15, 20] as const;

export const KEEP_OFF = 0;

export interface StoredKeep {
  minutes: number;
  /** The day it was chosen on, as `today` spells one. */
  day: string;
}

/**
 * The local calendar day, as a string that sorts and compares.
 *
 * Local rather than UTC: "the next day" is the one the person had, not the one
 * Greenwich had, and for somebody working in the evening those are different.
 */
export function today(now: number = Date.now()): string {
  const at = new Date(now);
  const two = (value: number): string => String(value).padStart(2, '0');

  return `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

/** What was stored, if it was stored today and is one of the choices offered. */
export function keepFrom(stored: unknown, day: string): number {
  if (typeof stored !== 'object' || stored === null) return KEEP_OFF;

  const { minutes, day: chosen } = stored as Partial<StoredKeep>;
  if (chosen !== day) return KEEP_OFF;
  if (typeof minutes !== 'number') return KEEP_OFF;

  return KEEP_CHOICES.includes(minutes as (typeof KEEP_CHOICES)[number])
    ? minutes
    : KEEP_OFF;
}
