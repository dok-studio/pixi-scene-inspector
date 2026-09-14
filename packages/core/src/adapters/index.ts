import { createV6Adapter, createV7Adapter } from './legacy.js';
import type { PixiAdapter, PixiCandidate } from './types.js';
import { createV8Adapter } from './v8.js';
import { detectVersion } from './version.js';

/**
 * The one place that maps a detected application onto an adapter.
 *
 * Everything downstream of here works through `PixiAdapter` alone, which is
 * what makes the "no version checks outside the adapters" rule enforceable
 * (docs/architecture.md §3.3): there is nothing else to branch on.
 *
 * @returns `null` when the version is unknown or unsupported, or when there is
 * no renderer to talk to. The caller reports "not supported" rather than
 * limping along with half an adapter.
 */
export function createAdapter(candidate: PixiCandidate): PixiAdapter | null {
  if (typeof candidate.renderer !== 'object' || candidate.renderer === null) return null;

  const major = detectVersion(candidate)?.major ?? null;

  switch (major) {
    case 8:
      return createV8Adapter(candidate);
    case 7:
      return createV7Adapter(candidate);
    case 6:
      return createV6Adapter(candidate);
    case null:
      return null;
  }
}

export { createV6Adapter, createV7Adapter } from './legacy.js';
export { nodeType } from './nodeType.js';
export { createV8Adapter } from './v8.js';
