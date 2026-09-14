import type { PixiMajor } from '@scene-inspector/protocol';

import type { PixiCandidate, VersionInfo } from './types.js';

/**
 * Version resolution is the one piece of version-aware logic allowed outside
 * the rest of the adapters (see eslint.config.js). It belongs here on purpose:
 * "which version is this" is adapter-domain knowledge, not the concern of
 * whoever scans the globals.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Version string straight from Pixi, when the application exposes it. */
function readVersionString(candidate: PixiCandidate): string | null {
  // What the init hook was told, first: it came with the very object being
  // inspected, whereas a `PIXI` global is whatever else the page happens to
  // have lying around.
  if (candidate.version !== undefined && candidate.version !== '') return candidate.version;

  const pixi = candidate.pixi;
  if (isObject(pixi) && typeof pixi['VERSION'] === 'string' && pixi['VERSION'] !== '') {
    return pixi['VERSION'];
  }
  return null;
}

/**
 * When `PIXI.VERSION` is unavailable — the norm for bundled applications that
 * do not put Pixi on a global — the version has to be inferred from the shape
 * of the objects.
 *
 * Each marker below is present in exactly one line:
 *  - `renderPipes` and `_updateFlags` arrived in v8;
 *  - `renderer.events` (EventSystem) exists in v7 and later, so after ruling
 *    out v8 it means v7;
 *  - `renderer.plugins.interaction` is the old event system, i.e. v6.
 */
function duckTypeMajor(candidate: PixiCandidate): PixiMajor | null {
  const { stage, renderer } = candidate;

  if (isObject(renderer) && isObject(renderer['renderPipes'])) return 8;
  if (isObject(stage) && Array.isArray(stage['effects']) && '_updateFlags' in stage) return 8;

  if (isObject(renderer)) {
    if (isObject(renderer['events'])) return 7;

    const plugins = renderer['plugins'];
    if (isObject(plugins) && isObject(plugins['interaction'])) return 6;
  }

  return null;
}

/**
 * @returns `null` when the version could not be resolved at all — which is
 * different from "resolved but unsupported" (that case returns `major: null`
 * alongside a filled-in `version`).
 */
export function detectVersion(candidate: PixiCandidate): VersionInfo | null {
  const version = readVersionString(candidate);

  if (version !== null) {
    const parsed = Number.parseInt(version, 10);
    const major = parsed === 6 || parsed === 7 || parsed === 8 ? parsed : null;
    return { major, version };
  }

  const major = duckTypeMajor(candidate);
  return major === null ? null : { major, version: null };
}
