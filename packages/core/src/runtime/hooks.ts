import type { PixiCandidate } from '../adapters/types.js';
import type { WindowLike } from './detect.js';

/**
 * The hooks PixiJS 8.2+ calls on itself: `Application.init()` invokes
 * `__PIXI_APP_INIT__`, and every renderer invokes `__PIXI_RENDERER_INIT__`.
 * They are the library's own way in, and the only one that does not require the
 * application to expose anything.
 */
const APP_HOOK = '__PIXI_APP_INIT__';
const RENDERER_HOOK = '__PIXI_RENDERER_INIT__';

export interface InitHooks {
  /** What the hooks caught, or null while PixiJS has not called them. */
  captured(): PixiCandidate | null;
}

type Hook = (value: unknown, version?: unknown) => void;

/**
 * Puts the inspector in the way of PixiJS's own init hooks.
 *
 * **Why this exists.** Everything else in detection reads a global the
 * application chose to publish — `__PIXI_DEVTOOLS__`, `__PIXI_APP__` and the
 * rest. A production build usually publishes none of them, and then there is
 * nothing on the page to find: the application is a local variable inside a
 * bundle. Since 8.2 PixiJS calls these two hooks if they exist, which turns
 * detection around — instead of searching for the application, the inspector is
 * handed it.
 *
 * This is the one piece of state detection keeps (see the comment on `detect`),
 * and it has to be: the call happens once, at startup, long before the panel is
 * open to ask anything. A new application overwrites what the previous one left
 * here, and a destroyed one is filtered out downstream, where a destroyed stage
 * already counts as no stage.
 *
 * Must run before the application is created — in the extension that is
 * `run_at: "document_start"`.
 */
export function installInitHooks(scope: WindowLike): InitHooks {
  let caught: PixiCandidate | null = null;

  const install = (key: string, field: 'app' | 'renderer'): void => {
    // PixiJS has exactly one slot per hook, and another Pixi tool — or the
    // application itself — may already be in it. Chaining keeps them working;
    // a plain assignment would silently disable whatever was there first.
    const previous = scope[key];

    const hook: Hook = (value, version) => {
      caught = {
        ...caught,
        [field]: value,
        ...(typeof version === 'string' ? { version } : {}),
      };

      if (typeof previous !== 'function') return;

      try {
        (previous as Hook).call(scope, value, version);
      } catch {
        // The hook runs inside `Application.init()`. Someone else's failure is
        // not ours to propagate — doing so would break the application the
        // inspector came to look at.
      }
    };

    scope[key] = hook;
  };

  install(APP_HOOK, 'app');
  install(RENDERER_HOOK, 'renderer');

  return { captured: () => caught };
}
