import type { DetectionSource } from '@scene-inspector/protocol';

import type { PixiCandidate } from '../adapters/types.js';
import type { InitHooks } from './hooks.js';

/**
 * The minimum of `window` that detection needs. Because of it the detector
 * runs under vitest against plain objects — no jsdom and no real Pixi.
 */
export interface WindowLike {
  frames?: ArrayLike<WindowLike>;
  [key: string]: unknown;
}

export interface Detection extends PixiCandidate {
  source: DetectionSource;
  /** Found in one of the iframes rather than the top-level window. */
  inFrame: boolean;
}

/**
 * The sources that are a global on the window. `__PIXI_APP_INIT__` is not one
 * of them — nothing is read under that key, it is the hook the inspector puts
 * there — so it is excluded rather than left to be handled by a branch that
 * cannot happen.
 */
type GlobalSource = Exclude<DetectionSource, '__PIXI_APP_INIT__'>;

/**
 * Order matters: an explicit setup by the application (`__PIXI_DEVTOOLS__`)
 * overrides auto-detection. After that, most specific first.
 */
const SOURCE_KEYS: readonly GlobalSource[] = [
  '__PIXI_DEVTOOLS__',
  '__PIXI_APP__',
  '__PIXI_STAGE__',
  '__PIXI_RENDERER__',
];

const PIXI_LIB_KEYS = ['PIXI', '__PIXI__'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface Hit {
  value: unknown;
  inFrame: boolean;
}

/**
 * Looks a key up in the window, then in its frames.
 *
 * Touching a foreign frame throws a SecurityError — that is a normal situation
 * (ads, third-party widgets), not a failure, so such a frame is simply skipped.
 */
function findKey(root: WindowLike, key: string): Hit | null {
  const own = root[key];
  if (own !== undefined && own !== null) return { value: own, inFrame: false };

  const frames = root.frames;
  if (!frames) return null;

  for (let i = 0; i < frames.length; i += 1) {
    try {
      const frame = frames[i];
      const value = frame?.[key];
      if (value !== undefined && value !== null) return { value, inFrame: true };
    } catch {
      // cross-origin frame — unreachable, and that is expected
    }
  }

  return null;
}

/** Unpacks the global that was found into the shape adapters understand. */
function toCandidate(source: GlobalSource, value: unknown): PixiCandidate {
  switch (source) {
    case '__PIXI_DEVTOOLS__': {
      if (!isObject(value)) return {};
      return {
        app: value['app'],
        stage: value['stage'],
        renderer: value['renderer'],
        pixi: value['pixi'],
      };
    }
    case '__PIXI_APP__':
      return { app: value };
    case '__PIXI_STAGE__':
      return { stage: value };
    case '__PIXI_RENDERER__':
      return { renderer: value };
  }
}

/**
 * Fills in what was not given directly: stage and renderer from the
 * application, the Pixi module from a global. Never overwrites — anything
 * passed explicitly wins.
 */
function fillGaps(root: WindowLike, candidate: PixiCandidate): PixiCandidate {
  const filled: PixiCandidate = { ...candidate };

  if (isObject(filled.app)) {
    filled.stage ??= filled.app['stage'];
    filled.renderer ??= filled.app['renderer'];
  }

  if (filled.pixi === undefined) {
    for (const key of PIXI_LIB_KEYS) {
      const hit = findKey(root, key);
      if (hit) {
        filled.pixi = hit.value;
        break;
      }
    }
  }

  return filled;
}

/**
 * The hooks carry more than an application: PixiJS passes its version string
 * alongside, and for a bundle that publishes no `PIXI` global that argument is
 * the only place the version exists on the page at all.
 *
 * A global decides *which* object is inspected — it says nothing about the
 * version — so the two are merged instead of the global winning outright.
 * Without this the version was readable only when no global was found, i.e. on
 * exactly the pages where it was least likely to be asked for.
 */
function withHookVersion(candidate: PixiCandidate, caught: PixiCandidate | null): PixiCandidate {
  if (candidate.version !== undefined || typeof caught?.version !== 'string') return candidate;
  return { ...candidate, version: caught.version };
}

/** An application is only found once one of these is in hand. */
function isFind(candidate: PixiCandidate): boolean {
  return (
    candidate.app !== undefined || candidate.stage !== undefined || candidate.renderer !== undefined
  );
}

/**
 * Detection is deliberately **not cached**: it is a handful of property reads
 * plus a walk over the frames, and it runs once per poll rather than once per
 * frame. A cache here would reintroduce the class of bugs where the panel
 * holds on to a destroyed renderer after a reload or an application swap —
 * the kind that has to be patched with manual `reset()` calls at every entry
 * point.
 *
 * The init hooks (`hooks.ts`) are the exception, and an unavoidable one: PixiJS
 * hands the application over once, at startup, and holding what it handed over
 * is the whole point. They come last as a *source of the object*, because a
 * global is what the application chose to publish and the hooks fire for
 * anything. Their version string is read regardless of who won — see
 * `withHookVersion`.
 */
export function detect(root: WindowLike, hooks?: InitHooks | null): Detection | null {
  const caught = hooks?.captured() ?? null;

  for (const source of SOURCE_KEYS) {
    const hit = findKey(root, source);
    if (!hit) continue;

    const candidate = fillGaps(root, toCandidate(source, hit.value));

    // The global may exist but be empty — e.g. `__PIXI_DEVTOOLS__ = {}` set
    // before the application is created. That is not a find yet.
    if (!isFind(candidate)) continue;

    return { ...withHookVersion(candidate, caught), source, inFrame: hit.inFrame };
  }

  if (caught !== null) {
    const candidate = fillGaps(root, caught);

    // `inFrame` is false because the hooks only ever see their own window, and
    // the inspector installs them where it runs.
    if (isFind(candidate)) return { ...candidate, source: '__PIXI_APP_INIT__', inFrame: false };
  }

  return null;
}
