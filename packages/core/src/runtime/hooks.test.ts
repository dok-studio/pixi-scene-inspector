import { describe, expect, it } from 'vitest';

import type { WindowLike } from './detect.js';
import { installInitHooks } from './hooks.js';

type Hook = (value: unknown, version?: string) => void;

const hookOn = (scope: WindowLike, key: string): Hook => {
  const hook = scope[key];
  if (typeof hook !== 'function') throw new Error(`${key} was not installed`);
  return hook as Hook;
};

const app = { stage: { name: 'stage' }, renderer: { name: 'renderer' } };
const renderer = { name: 'renderer' };

describe('installInitHooks', () => {
  it('installs both of the hooks PixiJS calls', () => {
    const scope: WindowLike = {};
    installInitHooks(scope);

    expect(typeof scope['__PIXI_APP_INIT__']).toBe('function');
    expect(typeof scope['__PIXI_RENDERER_INIT__']).toBe('function');
  });

  it('has caught nothing until PixiJS calls a hook', () => {
    const scope: WindowLike = {};
    expect(installInitHooks(scope).captured()).toBeNull();
  });

  it('catches the application, with the version PixiJS passed along', () => {
    const scope: WindowLike = {};
    const hooks = installInitHooks(scope);

    hookOn(scope, '__PIXI_APP_INIT__')(app, '8.14.0');

    expect(hooks.captured()).toEqual({ app, version: '8.14.0' });
  });

  it('catches a renderer created without an application', () => {
    const scope: WindowLike = {};
    const hooks = installInitHooks(scope);

    hookOn(scope, '__PIXI_RENDERER_INIT__')(renderer, '8.14.0');

    expect(hooks.captured()).toEqual({ renderer, version: '8.14.0' });
  });

  /**
   * Both hooks fire for one application — the renderer is built inside
   * `app.init()`. Keeping the fields side by side means a later renderer cannot
   * erase the application that is still on the page.
   */
  it('keeps what each hook contributed', () => {
    const scope: WindowLike = {};
    const hooks = installInitHooks(scope);

    hookOn(scope, '__PIXI_RENDERER_INIT__')(renderer, '8.14.0');
    hookOn(scope, '__PIXI_APP_INIT__')(app, '8.14.0');

    expect(hooks.captured()).toEqual({ app, renderer, version: '8.14.0' });
  });

  it('takes the newest application when one replaces another', () => {
    const scope: WindowLike = {};
    const hooks = installInitHooks(scope);
    const second = { stage: {}, renderer: {} };

    hookOn(scope, '__PIXI_APP_INIT__')(app, '8.14.0');
    hookOn(scope, '__PIXI_APP_INIT__')(second, '8.14.0');

    expect(hooks.captured()?.app).toBe(second);
  });

  /**
   * Another Pixi tool may already own the hook — the previous project's
   * extension installs one, and so does any application that wired up devtools
   * itself. Replacing it silently would break whatever was there first, and
   * PixiJS offers exactly one slot per hook.
   */
  it('calls the hook that was there before it', () => {
    const seen: unknown[] = [];
    const scope: WindowLike = { __PIXI_APP_INIT__: (value: unknown) => seen.push(value) };
    const hooks = installInitHooks(scope);

    hookOn(scope, '__PIXI_APP_INIT__')(app, '8.14.0');

    expect(seen).toEqual([app]);
    expect(hooks.captured()?.app).toBe(app);
  });

  /**
   * The hook runs inside `Application.init()`. An exception from a foreign hook
   * would surface there — the inspector would have broken the application it
   * came to inspect.
   */
  it('does not let a foreign hook take the application down with it', () => {
    const scope: WindowLike = {
      __PIXI_RENDERER_INIT__: () => {
        throw new Error('the other tool is unhappy');
      },
    };
    const hooks = installInitHooks(scope);

    expect(() => hookOn(scope, '__PIXI_RENDERER_INIT__')(renderer, '8.14.0')).not.toThrow();
    expect(hooks.captured()?.renderer).toBe(renderer);
  });
});
