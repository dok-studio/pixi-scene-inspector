import { describe, expect, it } from 'vitest';

import { pixiVersionLabel } from './version.js';

describe('pixiVersionLabel', () => {
  it('shows the version string when the page gave one', () => {
    expect(pixiVersionLabel('8.14.0', 8)).toBe('8.14.0');
  });

  /**
   * The old lines never call the init hooks — those arrived in 8.2 — and a
   * bundled v6/v7 application keeps no version on its application or renderer
   * either. The major is all detection can know, and saying so beats "unknown".
   */
  it('falls back to the major when there is no version string', () => {
    expect(pixiVersionLabel(null, 6)).toBe('6.x');
    expect(pixiVersionLabel(null, 7)).toBe('7.x');
  });

  it('says unknown when neither is known', () => {
    expect(pixiVersionLabel(null, null)).toBe('unknown');
  });

  it('treats absent props the same as null', () => {
    expect(pixiVersionLabel(undefined, undefined)).toBe('unknown');
    expect(pixiVersionLabel(undefined, 8)).toBe('8.x');
  });
});
