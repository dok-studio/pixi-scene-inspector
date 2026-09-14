import { describe, expect, it } from 'vitest';

import type { WindowLike } from './detect.js';
import { detect } from './detect.js';

const stage = { name: 'stage' };
const renderer = { name: 'renderer' };
const app = { stage, renderer };

describe('detect', () => {
  it('returns null when none of the globals are present', () => {
    expect(detect({})).toBeNull();
  });

  it('finds the application and pulls the stage and renderer out of it', () => {
    const result = detect({ __PIXI_APP__: app });

    expect(result).not.toBeNull();
    expect(result?.source).toBe('__PIXI_APP__');
    expect(result?.app).toBe(app);
    expect(result?.stage).toBe(stage);
    expect(result?.renderer).toBe(renderer);
    expect(result?.inFrame).toBe(false);
  });

  it('gives an explicit setup priority over auto-detection', () => {
    const explicitStage = { name: 'explicit' };
    const result = detect({
      __PIXI_DEVTOOLS__: { stage: explicitStage },
      __PIXI_APP__: app,
    });

    expect(result?.source).toBe('__PIXI_DEVTOOLS__');
    expect(result?.stage).toBe(explicitStage);
  });

  /**
   * Applications often call `initDevtools()` before the application exists,
   * leaving an empty object behind. An empty global is not a find: otherwise
   * the panel would report "connected" and then show nothing.
   */
  it('does not treat an empty __PIXI_DEVTOOLS__ as a find, and keeps looking', () => {
    const result = detect({ __PIXI_DEVTOOLS__: {}, __PIXI_APP__: app });

    expect(result?.source).toBe('__PIXI_APP__');
    expect(result?.app).toBe(app);
  });

  it('finds the application in an iframe and flags it', () => {
    const root: WindowLike = { frames: [{ __PIXI_APP__: app }] };
    const result = detect(root);

    expect(result?.source).toBe('__PIXI_APP__');
    expect(result?.app).toBe(app);
    expect(result?.inFrame).toBe(true);
  });

  /**
   * Touching a cross-origin frame throws a SecurityError. That is an everyday
   * occurrence on pages carrying ads — detection has to step over it and keep
   * looking rather than take the whole inspector down with it.
   */
  it('skips an unreachable cross-origin frame and carries on', () => {
    const hostileFrame = {} as WindowLike;
    Object.defineProperty(hostileFrame, '__PIXI_APP__', {
      get() {
        throw new Error('SecurityError: Blocked a frame from accessing a cross-origin frame.');
      },
    });

    const root: WindowLike = { frames: [hostileFrame, { __PIXI_APP__: app }] };

    expect(() => detect(root)).not.toThrow();
    expect(detect(root)?.app).toBe(app);
  });

  it('picks up the Pixi module from a global', () => {
    const pixi = { VERSION: '8.14.0' };
    expect(detect({ __PIXI_APP__: app, PIXI: pixi })?.pixi).toBe(pixi);
    expect(detect({ __PIXI_APP__: app, __PIXI__: pixi })?.pixi).toBe(pixi);
  });

  it('works when only a renderer is exposed', () => {
    const result = detect({ __PIXI_RENDERER__: renderer });

    expect(result?.source).toBe('__PIXI_RENDERER__');
    expect(result?.renderer).toBe(renderer);
    expect(result?.stage).toBeUndefined();
  });

  /**
   * The case every global-based search misses: a bundled application that puts
   * nothing on the window. PixiJS 8.2+ calls the init hooks regardless, and
   * what they caught is the only trace of it on the page.
   */
  describe('with the init hooks', () => {
    it('finds an application that exposes no global at all', () => {
      const result = detect({}, { captured: () => ({ app, version: '8.14.0' }) });

      expect(result?.source).toBe('__PIXI_APP_INIT__');
      expect(result?.app).toBe(app);
      expect(result?.stage).toBe(stage);
      expect(result?.renderer).toBe(renderer);
      expect(result?.version).toBe('8.14.0');
      expect(result?.inFrame).toBe(false);
    });

    it('is null while the hooks have caught nothing', () => {
      expect(detect({}, { captured: () => null })).toBeNull();
    });

    /**
     * A global is what the application chose to expose; the hooks fire for
     * anything. When both are there the application's own wiring wins, exactly
     * as it does among the globals themselves.
     */
    it('lets a global win over what the hooks caught', () => {
      const hooked = { stage: { name: 'hooked' } };
      const result = detect({ __PIXI_APP__: app }, { captured: () => ({ app: hooked }) });

      expect(result?.source).toBe('__PIXI_APP__');
      expect(result?.app).toBe(app);
    });

    /**
     * The version is the exception to the line above. A bundled application
     * publishes no `PIXI` global, so the argument PixiJS passes to the init
     * hook is the only place the version string exists — and it exists there
     * whether or not the application also published `__PIXI_APP__`. Losing it
     * for the applications that did publish one left the version readable on
     * exactly the pages that needed detection least.
     */
    it('keeps the version from the hooks when a global decided the object', () => {
      const result = detect({ __PIXI_APP__: app }, { captured: () => ({ app, version: '8.14.0' }) });

      expect(result?.source).toBe('__PIXI_APP__');
      expect(result?.app).toBe(app);
      expect(result?.version).toBe('8.14.0');
    });

    it('leaves the version alone when the hooks caught none', () => {
      const result = detect({ __PIXI_APP__: app }, { captured: () => ({ app }) });

      expect(result?.version).toBeUndefined();
    });
  });
});
