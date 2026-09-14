import { describe, expect, it } from 'vitest';

import { detectVersion } from './version.js';

describe('detectVersion', () => {
  it('reads the version from PIXI.VERSION', () => {
    expect(detectVersion({ pixi: { VERSION: '8.14.0' } })).toEqual({ major: 8, version: '8.14.0' });
    expect(detectVersion({ pixi: { VERSION: '7.4.2' } })).toEqual({ major: 7, version: '7.4.2' });
    expect(detectVersion({ pixi: { VERSION: '6.3.0' } })).toEqual({ major: 6, version: '6.3.0' });
  });

  /**
   * An unsupported version is not the same as no version. The panel should be
   * able to say "found 9.0.0, unsupported" rather than a blank "PixiJS not
   * detected", otherwise people go looking for the problem in the wrong place.
   */
  it('still reports the version when the major is outside the supported range', () => {
    expect(detectVersion({ pixi: { VERSION: '9.0.0' } })).toEqual({ major: null, version: '9.0.0' });
    expect(detectVersion({ pixi: { VERSION: '5.3.12' } })).toEqual({ major: null, version: '5.3.12' });
  });

  it('identifies v8 by the renderer render pipes', () => {
    expect(detectVersion({ renderer: { renderPipes: {} } })).toEqual({ major: 8, version: null });
  });

  it('identifies v8 by the stage shape when there is no renderer', () => {
    const stage = { effects: [], _updateFlags: 0 };
    expect(detectVersion({ stage })).toEqual({ major: 8, version: null });
  });

  it('identifies v7 by the renderer event system', () => {
    expect(detectVersion({ renderer: { events: {} } })).toEqual({ major: 7, version: null });
  });

  it('identifies v6 by the legacy interaction plugin', () => {
    const renderer = { plugins: { interaction: {} } };
    expect(detectVersion({ renderer })).toEqual({ major: 6, version: null });
  });

  it('returns null when there is nothing to go on', () => {
    expect(detectVersion({})).toBeNull();
    expect(detectVersion({ renderer: {}, stage: {} })).toBeNull();
    expect(detectVersion({ pixi: { VERSION: '' } })).toBeNull();
  });

  it('prefers the reported version string over duck-typing', () => {
    // The shape says v8, but Pixi itself says 7.4.2 — believe Pixi.
    const candidate = { pixi: { VERSION: '7.4.2' }, renderer: { renderPipes: {} } };
    expect(detectVersion(candidate)).toEqual({ major: 7, version: '7.4.2' });
  });
});
