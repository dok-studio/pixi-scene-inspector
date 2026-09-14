// @vitest-environment happy-dom
import { ApplicationInitHook, RendererInitHook, VERSION } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';

import type { WindowLike } from './detect.js';
import { detect } from './detect.js';
import { installInitHooks } from './hooks.js';

/**
 * The hooks against the real PixiJS.
 *
 * The fakes in `hooks.test.ts` prove the module does what it says once it is
 * called; nothing in them says PixiJS will ever call it. That half is a
 * contract with the library — two global names and the arguments they carry —
 * and it is the half that failed in the field: detection went out reading only
 * globals the application publishes, and a bundled build publishes none, so an
 * application that PixiJS was ready to hand over was reported as "not
 * detected".
 *
 * The hook classes are what `Application.init()` and every renderer run, so
 * driving them here is the same call the library makes. A rename or a changed
 * argument turns this red instead of turning the panel silent.
 */
const scope = globalThis as unknown as WindowLike;

afterEach(() => {
  delete scope['__PIXI_APP_INIT__'];
  delete scope['__PIXI_RENDERER_INIT__'];
});

describe('the init hooks, driven by PixiJS itself', () => {
  it('receives the application and the version from the application hook', () => {
    const hooks = installInitHooks(scope);
    const app = { stage: { children: [] }, renderer: {} };

    ApplicationInitHook.init.call(app);

    expect(hooks.captured()?.app).toBe(app);
    expect(hooks.captured()?.version).toBe(VERSION);
  });

  it('receives the renderer from the renderer hook', () => {
    const hooks = installInitHooks(scope);
    const renderer = { renderPipes: {} };

    new RendererInitHook(renderer as never).init();

    expect(hooks.captured()?.renderer).toBe(renderer);
    expect(hooks.captured()?.version).toBe(VERSION);
  });

  /**
   * The whole path, on a window that exposes nothing: this is the page the
   * playground never had and the panel could not see.
   */
  it('makes an application with no globals detectable', () => {
    const hooks = installInitHooks(scope);
    const stage = { children: [] };
    const app = { stage, renderer: { renderPipes: {} } };

    ApplicationInitHook.init.call(app);

    const detection = detect({}, hooks);

    expect(detection?.source).toBe('__PIXI_APP_INIT__');
    expect(detection?.stage).toBe(stage);
    expect(detection?.version).toBe(VERSION);
  });
});
