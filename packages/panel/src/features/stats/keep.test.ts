import { describe, expect, it } from 'vitest';

import { KEEP_OFF, keepFrom, today } from './keep.js';

describe('today', () => {
  it('spells a local calendar day', () => {
    expect(today(new Date(2026, 8, 4, 13, 30).getTime())).toBe('2026-09-04');
  });

  it('pads, so the strings compare as the dates do', () => {
    expect(today(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
  });

  /**
   * Local rather than UTC: "the next day" is the one the person had. Late in
   * the evening east of Greenwich those are already different days, and the
   * choice would be thrown away while its owner was still using it.
   */
  it('does not roll over before the local midnight', () => {
    const lateEvening = new Date(2026, 8, 4, 23, 30).getTime();

    expect(today(lateEvening)).toBe('2026-09-04');
  });
});

describe('keepFrom', () => {
  it('gives back what was chosen today', () => {
    expect(keepFrom({ minutes: 10, day: '2026-09-04' }, '2026-09-04')).toBe(10);
  });

  /**
   * The whole reason the day is stored: a window picked for yesterday's problem
   * goes on costing today, when nobody remembers switching it on.
   */
  it('is off again on the next day', () => {
    expect(keepFrom({ minutes: 20, day: '2026-09-03' }, '2026-09-04')).toBe(KEEP_OFF);
  });

  /**
   * The case in full, an hour apart across a local midnight: chosen at 23:00,
   * **the panel opened again** at 00:01. The comparison happens once, when the
   * panel opens — a session already running across midnight keeps what it had.
   */
  it('is off when the panel is opened at one minute past midnight', () => {
    const chosen = new Date(2026, 0, 1, 23, 0).getTime();
    const opened = new Date(2026, 0, 2, 0, 1).getTime();

    expect(keepFrom({ minutes: 5, day: today(chosen) }, today(opened))).toBe(KEEP_OFF);
  });

  it('is still there later the same evening it was chosen', () => {
    const chosen = new Date(2026, 0, 1, 23, 0).getTime();
    const opened = new Date(2026, 0, 1, 23, 59).getTime();

    expect(keepFrom({ minutes: 5, day: today(chosen) }, today(opened))).toBe(5);
  });

  it('is off when nothing was ever stored', () => {
    expect(keepFrom(null, '2026-09-04')).toBe(KEEP_OFF);
    expect(keepFrom(undefined, '2026-09-04')).toBe(KEEP_OFF);
  });

  it('is off for a value that is not one of the choices offered', () => {
    expect(keepFrom({ minutes: 7, day: '2026-09-04' }, '2026-09-04')).toBe(KEEP_OFF);
    expect(keepFrom({ minutes: 'ten', day: '2026-09-04' }, '2026-09-04')).toBe(KEEP_OFF);
  });

  it('is off for storage that is not the shape it should be', () => {
    expect(keepFrom('20', '2026-09-04')).toBe(KEEP_OFF);
    expect(keepFrom({ day: '2026-09-04' }, '2026-09-04')).toBe(KEEP_OFF);
  });
});
